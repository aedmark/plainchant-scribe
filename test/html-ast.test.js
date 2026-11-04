test('html-ast: parses nested HTML5 elements with exact offsets and line numbers', () => {
    const html = [
        '<!DOCTYPE html>',
        '<html>',
        '<body>',
        '  <main id="hero" class="container wide">',
        '    <h1>Hello World</h1>',
        '    <img src="logo.png" alt="Logo">',
        '  </main>',
        '</body>',
        '</html>'
    ].join('\n');

    const ast = HtmlAst.parse(html);
    const main = ast.elements.find((e) => e.tag === 'main');
    assert.ok(main, 'found <main>');
    assert.equal(main.line, 3);
    assert.equal(main.attrs.id, 'hero');
    assert.equal(main.attrs.class, 'container wide');

    const img = ast.elements.find((e) => e.tag === 'img');
    assert.ok(img && img.selfClosing, 'void tag <img> is marked selfClosing');
    assert.equal(img.attrs.src, 'logo.png');

    const h1 = ast.elements.find((e) => e.tag === 'h1');
    assert.equal(HtmlAst.innerText(ast, h1.id), 'Hello World');
});

test('html-ast: stamps data-pc-id and data-line on body elements without touching head/script/style', () => {
    const html = '<html><head><title>Hi</title></head><body><div class="box"><p>Text</p></div></body></html>';
    const stamped = HtmlAst.stamp(html);
    assert.includes(stamped, '<div class="box" data-pc-id="');
    assert.includes(stamped, '<p data-pc-id="');
    assert.ok(!/<title[^>]*data-pc-id/.test(stamped), 'title is not stamped');
});

test('html-ast: setAttr surgically adds, updates, and removes attributes while keeping unrelated formatting', () => {
    const html = '<div   id="card"   class="old" >\n  <span>Keep me</span>\n</div>';
    const ast = HtmlAst.parse(html);
    const divId = ast.elements[0].id;

    const updated = HtmlAst.setAttr(html, divId, 'class', 'new-card active');
    assert.includes(updated, 'class="new-card active"');
    assert.includes(updated, 'id="card"');
    assert.includes(updated, '  <span>Keep me</span>');

    const added = HtmlAst.setAttr(updated, divId, 'data-role', 'banner');
    assert.includes(added, 'data-role="banner"');

    const removed = HtmlAst.setAttr(added, divId, 'id', null);
    assert.ok(!/id="card"/.test(removed), 'id attribute removed');
});

test('html-ast: setText, insertElement, wrapElement, and removeElement round-trip cleanly', () => {
    const html = '<body>\n  <section class="hero">\n    <h1>Old Title</h1>\n  </section>\n</body>';
    const ast1 = HtmlAst.parse(html);
    const h1 = ast1.elements.find((e) => e.tag === 'h1');

    const withNewText = HtmlAst.setText(html, h1.id, 'New & Improved');
    assert.includes(withNewText, '<h1>New &amp; Improved</h1>');

    const ast2 = HtmlAst.parse(withNewText);
    const sec = ast2.elements.find((e) => e.tag === 'section');
    const withButton = HtmlAst.insertElement(withNewText, sec.id, 'inside-end', '<button>Go</button>');
    assert.includes(withButton, '<button>Go</button>\n  </section>');

    const ast3 = HtmlAst.parse(withButton);
    const btn = ast3.elements.find((e) => e.tag === 'button');
    const wrapped = HtmlAst.wrapElement(withButton, btn.id, 'div', { class: 'actions' });
    assert.includes(wrapped, '<div class="actions"><button>Go</button></div>');

    const ast4 = HtmlAst.parse(wrapped);
    const wrapper = ast4.elements.find((e) => e.tag === 'div');
    const afterRemove = HtmlAst.removeElement(wrapped, wrapper.id);
    assert.ok(!afterRemove.includes('<div class="actions">'), 'wrapper removed');
});

test('html-ast: extractTitle and setTitle read and update <title>', () => {
    const html = '<!DOCTYPE html><html><head><title>First Title</title></head><body><h1>Heading</h1></body></html>';
    assert.equal(HtmlAst.extractTitle(html), 'First Title');
    const next = HtmlAst.setTitle(html, 'Second Title');
    assert.equal(HtmlAst.extractTitle(next), 'Second Title');
});

test('html-ast: duplicateElement and moveElement reorder and clone elements cleanly', () => {
    const html = '<body>\n  <div class="a">One</div>\n  <div class="b">Two</div>\n  <div class="c">Three</div>\n</body>';
    const ast1 = HtmlAst.parse(html);
    const bNode = ast1.elements.find((e) => e.attrs.class === 'b');

    const movedUp = HtmlAst.moveElement(html, bNode.id, 'up');
    assert.ok(movedUp.moved, 'moved up');
    assert.ok(movedUp.html.indexOf('class="b"') < movedUp.html.indexOf('class="a"'), 'b is now before a');

    const movedDown = HtmlAst.moveElement(movedUp.html, movedUp.newId, 'down');
    assert.ok(movedDown.moved, 'moved back down');
    assert.ok(movedDown.html.indexOf('class="a"') < movedDown.html.indexOf('class="b"'), 'a is before b again');

    const dup = HtmlAst.duplicateElement(movedDown.html, movedDown.newId);
    const matches = dup.html.match(/class="b"/g) || [];
    assert.equal(matches.length, 2, 'element duplicated');

    const ast2 = HtmlAst.parse(html);
    const aNode = ast2.elements.find((e) => e.attrs.class === 'a');
    const cNode = ast2.elements.find((e) => e.attrs.class === 'c');
    const dragDown = HtmlAst.moveElement(html, aNode.id, cNode.id, 'after');
    assert.ok(dragDown.moved, 'dragged a after c');
    assert.ok(dragDown.html.indexOf('class="c"') < dragDown.html.indexOf('class="a"'), 'a is now after c');

    const ast3 = HtmlAst.parse(dragDown.html);
    const aAfter = ast3.elements.find((e) => e.attrs.class === 'a');
    const bAfter = ast3.elements.find((e) => e.attrs.class === 'b');
    const dragUp = HtmlAst.moveElement(dragDown.html, aAfter.id, bAfter.id, 'before');
    assert.ok(dragUp.moved, 'dragged a back before b');
    assert.ok(dragUp.html.indexOf('class="a"') < dragUp.html.indexOf('class="b"'), 'a is before b again');
});

test('html-ast: insertElementAt reports where the snippet landed and which element it became', () => {
    const html = '<body>\n  <section>\n    <p>one</p>\n    <p>two</p>\n  </section>\n</body>';
    const ast = HtmlAst.parse(html);
    const p1 = ast.elements.find((e) => e.tag === 'p');
    const section = ast.elements.find((e) => e.tag === 'section');
    ['before', 'after', 'inside-start', 'inside-end'].forEach((pos) => {
        const res = HtmlAst.insertElementAt(html, p1.id, pos, '<h2>New</h2>');
        assert.equal(res.html, HtmlAst.insertElement(html, p1.id, pos, '<h2>New</h2>'), pos + ': insertElement is unchanged');
        assert.equal(res.html.slice(res.offset, res.offset + 12), '<h2>New</h2>', pos + ': offset points at the snippet');
        const node = HtmlAst.findById(HtmlAst.parse(res.html), res.id);
        assert.equal(node.tag, pos.startsWith('inside') ? node.tag : 'h2');
    });
    const before = HtmlAst.insertElementAt(html, p1.id, 'before', '<h2>New</h2>');
    assert.equal(HtmlAst.findById(HtmlAst.parse(before.html), before.id).tag, 'h2', 'the new element, not its neighbour, is reported');
    assert.equal(HtmlAst.parse(before.html).elements.find((e) => e.id === before.id).attrs.class, undefined);
    const inside = HtmlAst.insertElementAt(html, section.id, 'inside-end', '<div class="box">\n  <p>x</p>\n</div>');
    const innerNode = HtmlAst.findById(HtmlAst.parse(inside.html), inside.id);
    assert.equal(innerNode.tag, 'div');
    assert.equal(innerNode.attrs.class, 'box', 'a multi-line snippet resolves to its outer element');
    const prior = HtmlAst.insertElementAt('<body><p>a</p><p>b</p></body>', HtmlAst.parse('<body><p>a</p><p>b</p></body>').elements[1].id, 'after', '<p>new</p>');
    assert.equal(HtmlAst.findById(HtmlAst.parse(prior.html), prior.id).tag, 'p');
    assert.equal(prior.html, '<body><p>a</p>\n<p>new</p><p>b</p></body>', 'an element is inserted after the one it follows');
    assert.deepEqual(HtmlAst.insertElementAt(html, 'pc-1', 'after', '   '), { html: html, offset: -1, id: null }, 'an empty snippet changes nothing');
    const noBody = HtmlAst.insertElementAt('', null, null, '<p>x</p>');
    assert.equal(noBody.html, '<p>x</p>');
    assert.equal(noBody.offset, 0);
});

test('dom-outline: dropPlacement chooses before, after, or inside from the pointer position', () => {
    const div = { tag: 'div', selfClosing: false };
    const p = { tag: 'p', selfClosing: false };
    const img = { tag: 'img', selfClosing: true };
    assert.deepEqual(DomOutline.dropPlacement(div, 0.1), { zone: 'before', position: 'before' });
    assert.deepEqual(DomOutline.dropPlacement(div, 0.5), { zone: 'inside', position: 'inside-end' });
    assert.deepEqual(DomOutline.dropPlacement(div, 0.9), { zone: 'after', position: 'after' });
    assert.deepEqual(DomOutline.dropPlacement(p, 0.5).position, 'after', 'a paragraph cannot hold blocks, so it splits into before and after');
    assert.deepEqual(DomOutline.dropPlacement(p, 0.49).position, 'before');
    assert.deepEqual(DomOutline.dropPlacement(img, 0.2).position, 'before');
    assert.deepEqual(DomOutline.dropPlacement({ tag: 'ul', selfClosing: false }, 0.5).position, 'after', 'lists accept only items');
    assert.deepEqual(DomOutline.dropPlacement({ tag: 'body' }, 0.1), { zone: 'inside', position: 'inside-end' });
    assert.deepEqual(DomOutline.dropPlacement(null, 0.5), { zone: 'inside', position: 'inside-end' });
    assert.equal(DomOutline.dropPlacement(div, -3).zone, 'before');
    assert.equal(DomOutline.dropPlacement(div, 7).zone, 'after');
});
