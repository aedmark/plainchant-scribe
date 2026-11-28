test('css-ast: parses rules, declarations, and matches elements by tag, class, and id', () => {
    const css = [
        '/* Header styles */',
        '.hero {',
        '  padding: 2rem;',
        '  background-color: #0f172a;',
        '}',
        '#ctaBtn {',
        '  color: #ffffff;',
        '}'
    ].join('\n');

    const ast = CssAst.parse(css);
    assert.equal(ast.rules.length, 2);
    assert.equal(ast.rules[0].selector, '.hero');
    assert.deepEqual(CssAst.getDeclarations(ast, '.hero'), {
        'padding': '2rem',
        'background-color': '#0f172a'
    });

    const htmlAst = HtmlAst.parse('<section class="hero"><button id="ctaBtn">Click</button></section>');
    const btn = htmlAst.elements.find((e) => e.tag === 'button');
    const matched = CssAst.findRulesForElement(ast, btn);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].selector, '#ctaBtn');
});

test('css-ast: setProperty surgically updates existing declarations, appends new ones, removes empty ones, and adds new rules', () => {
    const css = '/* comment */\n.card {\n  padding: 1rem;\n  color: #111111;\n}\n';
    const updated = CssAst.setProperty(css, '.card', 'padding', '2.5rem');
    assert.includes(updated, '/* comment */');
    assert.includes(updated, 'padding: 2.5rem;');
    assert.includes(updated, 'color: #111111;');

    const addedProp = CssAst.setProperty(updated, '.card', 'border-radius', '8px');
    assert.includes(addedProp, 'border-radius: 8px;');

    const removedProp = CssAst.setProperty(addedProp, '.card', 'color', '');
    assert.ok(!removedProp.includes('color: #111111;'), 'color property removed');

    const newRule = CssAst.setProperty(removedProp, '.badge', 'display', 'inline-block');
    assert.includes(newRule, '.badge {\n  display: inline-block;\n}');
});

test('css-ast: parseInlineStyle and formatInlineStyle round-trip inline style attributes', () => {
    const map = CssAst.parseInlineStyle('display: flex; gap: 1rem; align-items: center;');
    assert.deepEqual(map, { display: 'flex', gap: '1rem', 'align-items': 'center' });
    map.gap = '2rem';
    assert.equal(CssAst.formatInlineStyle(map), 'display: flex; gap: 2rem; align-items: center');
});

test('css-ast: findRuleBySelector returns byte offsets and line number for exact or grouped selector', () => {
    const css = 'body {\n  margin: 0;\n}\n\n.card, .panel {\n  padding: 1rem;\n}\n';
    const rule = CssAst.findRuleBySelector(css, '.panel');
    assert.ok(rule, 'found grouped rule');
    assert.equal(rule.line, 4);
    assert.includes(css.slice(rule.start, rule.end), 'padding: 1rem;');
});

test('css: media-scoped lookups only see rules in the matching @media block', () => {
    const css = '.a { color: red; }\n@media (max-width: 768px) {\n  .a { color: blue; padding: 4px; }\n}\n@media screen and (max-width: 375px) { .a { color: green; } }\n';
    assert.deepEqual(CssAst.getDeclarations(css, '.a'), { color: 'red' }, 'no media argument reads the base rule only');
    assert.deepEqual(CssAst.getDeclarations(css, '.a', ''), { color: 'red' });
    assert.deepEqual(CssAst.getDeclarations(css, '.a', '(max-width: 768px)'), { color: 'blue', padding: '4px' });
    assert.deepEqual(CssAst.getDeclarations(css, '.a', '@media (MAX-WIDTH:768px)'), { color: 'blue', padding: '4px' }, 'queries compare by normalised text');
    assert.deepEqual(CssAst.getDeclarations(css, '.a', '(max-width: 375px)'), {}, 'a different query is not a match');
    assert.equal(CssAst.findRuleBySelector(css, '.a', '(max-width: 768px)').declarations.length, 2);
    assert.equal(CssAst.findRuleBySelector(css, '.a', '(max-width: 375px)'), null);
    assert.equal(CssAst.findRuleBySelector(css, '.a', '').declarations[0].value, 'red');
    assert.equal(CssAst.parse(css).blocks.length, 2);
});

test('css: setProperty edits an existing media rule in place and keeps its indentation', () => {
    const css = '.a { color: red; }\n@media (max-width: 768px) {\n  .a {\n    color: blue;\n  }\n}\n';
    const changed = CssAst.setProperty(css, '.a', 'color', 'teal', '(max-width: 768px)');
    assert.equal(changed, css.replace('blue', 'teal'));
    const added = CssAst.setProperty(css, '.a', 'padding', '8px', '(max-width: 768px)');
    assert.equal(added, '.a { color: red; }\n@media (max-width: 768px) {\n  .a {\n    color: blue;\n    padding: 8px;\n  }\n}\n');
    assert.equal(CssAst.setProperty(css, '.a', 'color', 'pink'), css.replace('red', 'pink'), 'the base rule is untouched by media edits and vice versa');
    const removed = CssAst.setProperty(css, '.a', 'color', '', '(max-width: 768px)');
    assert.ok(!removed.includes('blue') && removed.includes('@media (max-width: 768px)'));
});

test('css: setProperty creates media blocks and rules in cascade order', () => {
    const base = '.a { color: red; }\n';
    const tablet = CssAst.setProperty(base, '.b', 'padding', '4px', '(max-width: 768px)');
    assert.equal(tablet, '.a { color: red; }\n\n@media (max-width: 768px) {\n  .b {\n    padding: 4px;\n  }\n}\n');

    const both = CssAst.setProperty(tablet, '.b', 'padding', '2px', '(max-width: 375px)');
    assert.ok(both.indexOf('(max-width: 768px)') < both.indexOf('(max-width: 375px)'), 'a narrower query is appended after a wider one');

    const mobileFirst = CssAst.setProperty(base, '.b', 'padding', '2px', '(max-width: 375px)');
    const tabletLater = CssAst.setProperty(mobileFirst, '.b', 'padding', '4px', '(max-width: 768px)');
    assert.ok(tabletLater.indexOf('(max-width: 768px)') < tabletLater.indexOf('(max-width: 375px)'), 'a wider query is inserted before a narrower one so the narrow rules still win');
    assert.equal(CssAst.parse(tabletLater).blocks.length, 2);

    const second = CssAst.setProperty(tablet, '.c', 'margin', '0', '(max-width: 768px)');
    assert.equal(CssAst.parse(second).blocks.length, 1, 'a second rule joins the existing block');
    assert.equal(CssAst.getDeclarations(second, '.c', '(max-width: 768px)').margin, '0');

    const baseAfter = CssAst.setProperty(tablet, '.d', 'color', 'green');
    assert.ok(baseAfter.indexOf('.d {') < baseAfter.indexOf('@media'), 'a new base rule goes before the first media block so it cannot override it');
    assert.equal(CssAst.setProperty(base, '.b', 'padding', '', '(max-width: 768px)'), base, 'clearing a value that was never set creates nothing');
});

test('css-ast: handles inline comments, escaped backslashes, @import/@keyframes, empty media, combinators, :not(), and [attr] selectors', () => {
    const withComment = '.a { color: /* ; */ red; }';
    assert.equal(CssAst.getDeclarations(withComment, '.a').color, 'red');
    assert.equal(CssAst.setProperty(withComment, '.a', 'color', 'blue'), '.a { color: blue; }');

    const withEsc = '.a { content: "\\\\"; color: red; } .b { margin: 0; }';
    const escAst = CssAst.parse(withEsc);
    assert.equal(escAst.rules.length, 2);
    assert.equal(CssAst.getDeclarations(escAst, '.b').margin, '0');

    const withAt = '@import "a.css";\n.a /* { */ { color: red; }\n@keyframes spin { from { opacity: 0; } to { opacity: 1; } }\n.btn { padding: 4px; }';
    const atAst = CssAst.parse(withAt);
    assert.deepEqual(atAst.rules.map((r) => r.selector), ['.a', '.btn']);
    assert.equal(atAst.blocks.length, 0, '@keyframes is not treated as a @media block');

    const emptyMedia = CssAst.setProperty('@media (max-width: 768px) {}', '.a', 'color', 'red', '(max-width: 768px)');
    assert.equal((emptyMedia.match(/@media/g) || []).length, 1, 'reuses empty @media block without duplicating it');

    const emptyVal = CssAst.setProperty('.a { color:   }', '.a', 'color', 'red');
    assert.equal(emptyVal, '.a { color: red}');

    const pEl = { type: 'element', tag: 'p', attrs: {} };
    const btnEl = { type: 'element', tag: 'button', attrs: { class: 'btn' } };
    assert.equal(CssAst.findRulesForElement('h1+p { color: red; }', pEl).length, 1);
    assert.equal(CssAst.findRulesForElement('.btn:not(.disabled) { color: red; }', btnEl).length, 1);

    const sel = CssAst.listSelectors('a[href="https://example.com"] { color: red; }', null);
    assert.ok(!sel.classes.includes('com'), 'attribute URLs do not create fake CSS classes');
});
