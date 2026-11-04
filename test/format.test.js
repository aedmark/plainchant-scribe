const noSpace = (s) => s.replace(/\s+/g, '');

test('Format.formatCss: indents, spaces declarations, splits minified rules, keeps strings, urls, and comments (P7-14)', () => {
    assert.equal(Format.formatCss('a{color:red;margin:0 auto}b,i{x:y}'), 'a {\n    color: red;\n    margin: 0 auto;\n}\n\nb, i {\n    x: y;\n}\n');
    assert.equal(Format.formatCss('@media (max-width:600px){.a{x:y}}'), '@media (max-width:600px) {\n    .a {\n        x: y;\n    }\n}\n');
    assert.equal(Format.formatCss('a{content:"a;b{c}";background:url(data:image/png;base64,AA==)}'), 'a {\n    content: "a;b{c}";\n    background: url(data:image/png;base64,AA==);\n}\n');
    assert.equal(Format.formatCss('/* top */\na{x:y}\n\n\n\nb{x:y}\n', '\t'), '/* top */\na {\n\tx: y;\n}\n\nb {\n\tx: y;\n}\n');
    assert.equal(Format.formatCss('a{\n\n  x:y;\n\n  z:w\n}'), 'a {\n    x: y;\n\n    z: w;\n}\n');
    assert.equal(Format.formatCss('a:hover  >  b[href="x  y"]{x : y !important}'), 'a:hover > b[href="x  y"] {\n    x: y !important;\n}\n');
    assert.equal(Format.formatCss(''), '');
    const once = Format.formatCss('a{color:red}@media print{b{x:y}}/* c */');
    assert.equal(Format.formatCss(once), once);
    const rules = (css) => CssAst.parse(css).rules.map((r) => r.selector + '|' + Object.keys(CssAst.getDeclarations(css, r.selector) || {}).length);
    assert.deepEqual(rules(once), rules('a{color:red}@media print{b{x:y}}/* c */'));
});

test('Format.formatJs: re-indents by nesting and leaves strings, templates, regexes, and comments alone (P7-14)', () => {
    assert.equal(Format.formatJs('function f(a){\nif(a){\nreturn 1\n}else{\nreturn 2\n}\n}\n'), 'function f(a){\n    if(a){\n        return 1\n    }else{\n        return 2\n    }\n}\n');
    assert.equal(Format.formatJs('const o={\na:[1,\n2],\n};\n\n\n\nlet x;\n  \n'), 'const o={\n    a:[1,\n        2],\n};\n\nlet x;\n');
    const keep = 'f(`a\n   {b\n  ${c}`)\nvar s="x\\\n   {y";\nvar r=/[{]\\//;\nz();\n';
    assert.equal(Format.formatJs(keep), 'f(`a\n   {b\n  ${c}`)\nvar s="x\\\n   {y";\nvar r=/[{]\\//;\nz();\n');
    assert.equal(Format.formatJs('if(a){\n/* one\n * two\n   three */\n// } not a closer\nb()\n}\n'), 'if(a){\n    /* one\n     * two\n   three */\n    // } not a closer\n    b()\n}\n');
    assert.equal(Format.formatJs('x = a / b; y = `${ {a:1}.a }`;\nif (z) {\nq()\n}\n'), 'x = a / b; y = `${ {a:1}.a }`;\nif (z) {\n    q()\n}\n');
    const once = Format.formatJs('a(function(){\nb()\n})');
    assert.equal(Format.formatJs(once), once);
    assert.equal(Format.formatJs(''), '');
});

test('Format.formatHtml: block layout, inline runs, raw elements, optional end tags, and idempotence (P7-14)', () => {
    const src = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>T</title><style>a{color:red}</style></head>' +
        '<body><div class="a"><h1>Hi  <b>there</b></h1><ul><li>One<li>Two</ul><p>para\n text <a href="#">link</a></p><img src="a.png" alt="">' +
        '<pre>  keep\n   this</pre><textarea>\n  x</textarea><script>\nconst a={\nb:1};\n</script><script src="x.js"></script></div></body></html>';
    const out = Format.formatHtml(src);
    assert.equal(out, [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '    <head>',
        '        <meta charset="utf-8">',
        '        <title>T</title>',
        '        <style>',
        '            a {',
        '                color: red;',
        '            }',
        '        </style>',
        '    </head>',
        '    <body>',
        '        <div class="a">',
        '            <h1>Hi <b>there</b></h1>',
        '            <ul>',
        '                <li>One',
        '                <li>Two',
        '            </ul>',
        '            <p>para text <a href="#">link</a></p>',
        '            <img src="a.png" alt="">',
        '            <pre>  keep',
        '   this</pre>',
        '            <textarea>',
        '  x</textarea>',
        '            <script>',
        '                const a={',
        '                    b:1};',
        '            </script>',
        '            <script src="x.js"></script>',
        '        </div>',
        '    </body>',
        '</html>',
        ''
    ].join('\n'));
    assert.equal(Format.formatHtml(out), out);
});

test('Format.formatHtml only changes whitespace, and survives broken markup (P7-14)', () => {
    const samples = [
        '<div><section><h2>Title</h2><p>One <em>two</em> three</p></section></div>',
        '<table><tr><td>a<td>b<tr><td>c<td>d</table>',
        '<p>One<p>Two<div>Three</div>',
        '<nav><a href="/">Home</a> <a href="/about">About</a></nav><!-- note --><footer>(c) 2026</footer>',
        '<div><span>unclosed<div>stray</p></b></div>',
        '<form><label>Name <input name="n"></label><select><option>a<option>b</select><button>Go</button></form>',
        'plain text only',
        ''
    ];
    samples.forEach((src) => {
        const out = Format.formatHtml(src);
        assert.equal(noSpace(out), noSpace(src), 'content unchanged for ' + src);
        assert.equal(Format.formatHtml(out), out, 'idempotent for ' + src);
    });
    assert.equal(Format.formatHtml('<p>long</p>' + '<p>' + 'word '.repeat(40) + '</p>').split('\n')[1], '<p>');
});

test('Format.byPath picks the formatter by extension and detectIndent reads the file (P7-14)', () => {
    assert.equal(Format.byPath('a/b.css', 'a{x:y}').kind, 'css');
    assert.equal(Format.byPath('x.HTM', '<p>x</p>').kind, 'html');
    assert.equal(Format.byPath('s.mjs', 'a()').text, 'a()\n');
    assert.equal(Format.byPath('d.json', '{}'), null);
    assert.equal(Format.byPath('noext', ''), null);
    assert.equal(Format.byPath('a.css', 'a{x:y}', { indent: '\t' }).text, 'a {\n\tx: y;\n}\n');
    assert.equal(Format.detectIndent('a\n  b\n'), '  ');
    assert.equal(Format.detectIndent('a\n\tb\n'), '\t');
    assert.equal(Format.detectIndent('a\n        b\n'), '    ');
    assert.equal(Format.detectIndent('flat'), '    ');
});
