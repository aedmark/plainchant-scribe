const xhFs = require('fs');
const xhPath = require('path');

const xhFixture = (name) => xhFs.readFileSync(xhPath.join(__dirname, 'fixtures', 'xml', name), 'utf8');
const xhCodes = (text) => Xhtml.check(text, { path: 'OEBPS/text/c.xhtml' }).problems.map((p) => p.severity + ' ' + p.code);
const xhDoc = (body, head) => '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">\n' +
    (head == null ? '<head><title>T</title></head>' : head) + '\n' + (body == null ? '<body><p>Text</p></body>' : body) + '\n</html>\n';

// A minimal DOM-like tree, shaped like what the browser's DOMParser gives: el(name, attrs, ...children).
const xhEl = (name, attrs, ...kids) => ({
    nodeType: 1, localName: name,
    attributes: Object.keys(attrs || {}).map((k) => ({ name: k, value: attrs[k] })),
    childNodes: kids.map((k) => (typeof k === 'string' ? { nodeType: 3, data: k } : k))
});
const xhFrag = (...kids) => ({ nodeType: 11, childNodes: kids.map((k) => (typeof k === 'string' ? { nodeType: 3, data: k } : k)) });
const xhNorm = (...kids) => Xhtml.normalize(xhFrag(...kids)).xhtml;

test('xhtml: the template chapter and the fixture chapter check clean (P1-06)', () => {
    const t = BookTemplate.create().files['OEBPS/text/chapter-1.xhtml'];
    assert.deepEqual(xhCodes(t), []);
    assert.deepEqual(xhCodes(xhFixture('chapter.xhtml')), [], 'its own &thinsp; is declared in the DOCTYPE, so it is not an HTML-entity problem');
    assert.deepEqual(xhCodes(xhDoc()), []);
    const r = Xhtml.check(t, { path: 'OEBPS/text/chapter-1.xhtml' });
    assert.ok(r.ast.wellFormed);
});

test('xhtml: HTML entities are their own problem; the other checks still run', () => {
    const text = xhDoc('<body><p>a&nbsp;b&rsquo;c &foo; &amp;</p></body>', '<head><title>T</title></head>');
    const r = Xhtml.check(text, { path: 'c.xhtml' });
    assert.deepEqual(r.problems.map((p) => p.code), ['html-entity', 'html-entity', 'xml-undeclared-entity']);
    assert.ok(/&#160;/.test(r.problems[0].message) && /\u2019/.test(r.problems[1].message), 'the message says what Fix writes');
    assert.equal(text.slice(r.problems[0].start, r.problems[0].end), '&nbsp;');
    assert.equal(r.problems[0].line, 4);
    assert.deepEqual(xhCodes(xhDoc('<body><p>&nbsp;</p></body>', '<head></head>')), ['error html-entity', 'warning xhtml-title-missing']);
    const stopped = xhCodes(xhDoc('<body><p>&nbsp;<b></p></body>', '<head></head>'));
    assert.ok(stopped.length > 1 && stopped.every((c) => /^error (html-entity|xml-)/.test(c)), 'other XML errors stop the checks: ' + stopped);
    assert.equal(Object.keys(Xhtml.ENTITIES).length, 252, 'the HTML 4.01 sets');
});

test('xhtml: fixEntities writes characters, or numeric references for invisible ones, and skips what is not markup', () => {
    const fix = (s) => XmlAst.applyEdits(s, Xhtml.fixEntities(s));
    assert.equal(fix('<p title="&ldquo;q&rdquo;">caf&eacute;&nbsp;&mdash;&shy;&zwj;&thinsp;&euro; &amp;&lt;&quot;&apos;</p>'),
        '<p title="\u201Cq\u201D">caf\u00E9&#160;\u2014&#173;&#8205;&#8201;\u20AC &amp;&lt;&quot;&apos;</p>');
    assert.equal(fix('<!-- &nbsp; --><![CDATA[&nbsp;]]><?pi &nbsp;?><p>&nbsp;&unknown;&#160;</p>'), '<!-- &nbsp; --><![CDATA[&nbsp;]]><?pi &nbsp;?><p>&#160;&unknown;&#160;</p>');
    const declared = '<!DOCTYPE html [ <!ENTITY nbsp "&#160;"> ]>\n<p>&nbsp;&copy;</p>';
    assert.equal(fix(declared), '<!DOCTYPE html [ <!ENTITY nbsp "&#160;"> ]>\n<p>&nbsp;\u00A9</p>', 'a name the file declares is its own');
    const broken = '<p>&nbsp;<b></p>';
    assert.equal(fix(broken), '<p>&#160;<b></p>', 'works on files that are not well-formed');
    const many = '<p>' + '&nbsp;'.repeat(300) + '</p>';
    assert.equal(Xhtml.fixEntities(many).length, 300, 'not limited by the parser\'s error cap');
    const fixed = fix(xhDoc('<body><p>a&nbsp;b&rsquo;</p></body>'));
    assert.deepEqual(xhCodes(fixed), []);
});

test('xhtml: the document shape and EPUB rules each give their problem', () => {
    const cases = [
        [xhDoc().replace('encoding="UTF-8"', 'encoding="ISO-8859-1"'), ['error xhtml-encoding']],
        [xhDoc().replace('encoding="UTF-8"', 'encoding="utf-16"'), ['error xhtml-encoding']],
        [xhDoc().replace('encoding="UTF-8"', 'encoding="utf-8"'), []],
        [xhDoc().replace('<!DOCTYPE html>', '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">'), ['error doctype-external-id']],
        [xhDoc().replace('<!DOCTYPE html>', '<!DOCTYPE book>'), ['warning doctype-name']],
        [xhDoc().replace('<!DOCTYPE html>\n', ''), []],
        [xhDoc().replace('xmlns="http://www.w3.org/1999/xhtml" ', ''), ['error xhtml-root']],
        [xhDoc(null, ''), ['error xhtml-head-missing']],
        [xhDoc(''), ['error xhtml-body-missing']],
        [xhDoc('<head><title>T</title></head>', '<body><p>x</p></body>'), ['error xhtml-order']],
        [xhDoc(null, '<head></head>'), ['warning xhtml-title-missing']],
        [xhDoc(null, '<head><title> </title></head>'), ['error xhtml-title-empty']],
        [xhDoc(null, '<head><title>A</title><title>B</title></head>'), ['error xhtml-title-repeated']],
        [xhDoc('<body><xi:include xmlns:xi="http://www.w3.org/2001/XInclude" href="x.xml"/></body>'), ['error xinclude']],
        [xhDoc(null, '<head epub:type="x"><title>T</title></head>'), ['error epub-type-metadata']],
        [xhDoc(null, '<head><title epub:type="x">T</title><link epub:type="y" rel="stylesheet" href="a.css"/></head>'), ['error epub-type-metadata', 'error epub-type-metadata']],
        [xhDoc('<body epub:type="bodymatter"><section epub:type="chapter"><p>x</p></section></body>'), []],
        [xhDoc(null, '<head><title>T</title><base href="https://example.org/"/></head>'), ['warning base-element']],
        [xhDoc('<body><p><ruby>\u6F22<rp>(</rp><rt>kan</rt><rp>)</rp></ruby></p></body>'), ['warning rp-element', 'warning rp-element']]
    ];
    cases.forEach(([text, codes]) => assert.deepEqual(xhCodes(text), codes, text));
});

test('xhtml: normalize keeps meaning and drops presentation, scripts, and Word or Docs markup', () => {
    assert.equal(xhNorm(xhEl('p', { class: 'MsoNormal', style: 'margin:0' }, 'One ', xhEl('em', {}, 'two'), xhEl('o:p', {}, '\u00A0'))), '<p>One <em>two</em></p>');
    assert.equal(xhNorm(xhEl('p', {}, xhEl('font', { face: 'Arial' }, 'x'), xhEl('span', { lang: 'fr' }, ' y'))), '<p>x y</p>', 'font and span are unwrapped');
    assert.equal(xhNorm(xhEl('p', { lang: 'fr', dir: 'ltr', id: 'p1', 'aria-label': 'L', onclick: 'x()', 'data-x': '1' }, 'Bonjour')), '<p lang="fr" dir="ltr" id="p1" aria-label="L">Bonjour</p>');
    assert.equal(xhNorm(xhEl('h2', {}, 'Head'), xhEl('script', {}, 'evil()'), xhEl('style', {}, 'p{}'), xhEl('iframe', { src: 'x' }), xhEl('p', {}, 'Body')), '<h2>Head</h2>\n<p>Body</p>');
    const r = Xhtml.normalize(xhFrag(xhEl('p', {}, xhEl('a', { href: 'javascript:alert(1)' }, 'bad'), ' ', xhEl('a', { href: 'https://example.org/?a=1&b=2', target: '_blank' }, 'good')), xhEl('form', {}, xhEl('input', {}))));
    assert.equal(r.xhtml, '<p>bad <a href="https://example.org/?a=1&amp;b=2">good</a></p>');
    assert.deepEqual(r.dropped, { form: 1 });
    // Word's empty spacing paragraphs and empty inline elements go.
    assert.equal(xhNorm(xhEl('p', {}, 'A'), xhEl('p', {}, '\u00A0'), xhEl('p', {}, xhEl('b', {}, ' ')), xhEl('p', {}, 'B', xhEl('a', { id: 'note1' }))), '<p>A</p>\n<p>B<a id="note1"></a></p>');
    assert.equal(xhNorm(xhEl('p', {}, 'a\u00A0b\u00ADc <&> "q"')), '<p>a&#160;b&#173;c &lt;&amp;&gt; "q"</p>');
    // Word's own list numbers, a Docs trailing <br>, and a paragraph holding only a line break go.
    assert.equal(xhNorm(xhEl('p', { class: 'MsoListParagraph' }, xhEl('span', { style: 'mso-list:Ignore' }, '1.', xhEl('span', {}, '\u00A0\u00A0 ')), 'First point')), '<p>First point</p>');
    assert.equal(xhNorm(xhEl('p', {}, 'A'), xhEl('br', {}), xhEl('p', {}, xhEl('br', {}))), '<p>A</p>');
    const body = Xhtml.normalize(xhEl('body', { lang: 'en' }, xhEl('p', {}, 'In body')));
    assert.equal(body.xhtml, '<p>In body</p>');
    assert.deepEqual(body.dropped, {}, 'the container itself is not written or counted');
});

test('xhtml: inline bold and italic styles become b and i; Docs wrappers unwrap', () => {
    const docs = xhEl('b', { style: 'font-weight:normal;', id: 'docs-internal-guid-1234' },
        xhEl('p', { dir: 'ltr', style: 'line-height:1.38' },
            xhEl('span', { style: 'font-size:11pt;font-weight:700;' }, 'Bold'), xhEl('span', { style: 'font-weight:400' }, ' plain '),
            xhEl('span', { style: 'font-style:italic;font-weight:700' }, 'both'), xhEl('span', { style: 'font-weight: bold' }, xhEl('b', {}, 'nested'))));
    assert.equal(xhNorm(docs), '<p dir="ltr"><b>Bold</b> plain <b><i>both</i></b><b>nested</b></p>');
    assert.equal(xhNorm(xhEl('p', {}, xhEl('strong', {}, xhEl('span', { style: 'font-weight:800' }, 'x')), xhEl('i', { style: 'font-style:normal' }, ' y'))), '<p><strong>x</strong> y</p>', 'no b inside strong; an un-italic i unwraps');
    assert.equal(xhNorm(xhEl('p', {}, xhEl('span', { style: 'font-style:oblique' }, 'o'))), '<p><i>o</i></p>');
});

test('xhtml: blocks, lists, tables, and loose text are laid out one block per line', () => {
    assert.equal(xhNorm(xhEl('div', {}, 'Loose ', xhEl('b', {}, 'text')), xhEl('div', {}, xhEl('p', {}, 'A'), xhEl('p', {}, 'B'))), '<p>Loose <b>text</b></p>\n<p>A</p>\n<p>B</p>', 'an inline div becomes a paragraph; a block div is unwrapped');
    assert.equal(xhNorm('Before ', xhEl('h1', {}, 'T'), ' after'), '<p>Before</p>\n<h1>T</h1>\n<p>after</p>');
    assert.equal(xhNorm(xhEl('ul', {}, xhEl('li', {}, 'One'), xhEl('li', {}, 'Two', xhEl('ol', { start: '3', type: 'a' }, xhEl('li', {}, 'Three'))))),
        '<ul>\n  <li>One</li>\n  <li>\n    Two\n    <ol start="3">\n      <li>Three</li>\n    </ol>\n  </li>\n</ul>');
    assert.equal(xhNorm(xhEl('table', { border: '1' }, xhEl('tbody', {}, xhEl('tr', {}, xhEl('td', { colspan: '2', width: '50' }, 'A'), xhEl('td', {}))))),
        '<table>\n  <tbody>\n    <tr>\n      <td colspan="2">A</td>\n      <td></td>\n    </tr>\n  </tbody>\n</table>');
    assert.equal(xhNorm(xhEl('pre', {}, 'line 1\n  line 2'), xhEl('p', {}, 'a\n   b')), '<pre>line 1\n  line 2</pre>\n<p>a b</p>');
    assert.equal(xhNorm(xhEl('p', {}, 'x', xhEl('br', {}), 'y'), xhEl('hr', {})), '<p>x<br/>y</p>\n<hr/>');
    assert.equal(Xhtml.normalize(xhFrag(xhEl('ul', {}, xhEl('li', {}, 'a'))), { indent: '\t' }).xhtml, '<ul>\n\t<li>a</li>\n</ul>');
});

test('xhtml: pasted images are kept and reported; the result parses as an XHTML fragment', () => {
    const r = Xhtml.normalize(xhFrag(xhEl('p', {}, xhEl('img', { src: 'https://example.org/a.png', alt: 'A', width: '10', style: 'x' }), xhEl('img', { src: 'data:image/png;base64,AAAA' }), xhEl('img', { src: '../images/b.jpg', alt: '' }), xhEl('img', { alt: 'no src' }))));
    assert.equal(r.xhtml, '<p><img src="https://example.org/a.png" alt="A"/><img src="data:image/png;base64,AAAA"/><img src="../images/b.jpg" alt=""/></p>');
    assert.deepEqual(r.images, [
        { src: 'https://example.org/a.png', alt: 'A', remote: true, data: false },
        { src: 'data:image/png;base64,AAAA', alt: null, remote: false, data: true },
        { src: '../images/b.jpg', alt: '', remote: false, data: false }
    ]);
    assert.deepEqual(r.dropped, { img: 1 });
    assert.deepEqual(Xhtml.normalize(xhFrag(xhEl('h2', { id: 'a' }, 'x'), xhEl('p', { id: 'b' }, 'y'))).ids, ['a', 'b'], 'ids are returned so the caller can check for clashes');
    const all = Xhtml.normalize(xhFrag(xhEl('h1', {}, 'T & U'), xhEl('blockquote', { cite: 'https://x' }, xhEl('p', {}, 'Q')), xhEl('figure', {}, xhEl('img', { src: 'a.png', alt: 'a' }), xhEl('figcaption', {}, 'Cap'))));
    const ast = XmlAst.parse('<body xmlns="http://www.w3.org/1999/xhtml">\n' + all.xhtml + '\n</body>');
    assert.deepEqual(ast.errors, [], all.xhtml);
    assert.throws(() => Xhtml.fromHtml('<p>x</p>'), 'no DOMParser in Node');
});
