const marksOf = (line) => line.runs.filter((r) => r.mark).map((r) => r.mark + ':' + r.text);
const kinds = (text, lang) => CodeShade.shade(text, lang);

test('CodeShade (Prism): nested CSS rules, data: URLs, and quoted semicolons colour correctly (D-034)', () => {
    const nested = kinds('@media (max-width:600px){\n  .a{\n    color:red;\n  }\n}', 'css');
    assert.ok(marksOf(nested[0]).includes('keyword:@media '), 'the at-rule is a keyword');
    assert.ok(marksOf(nested[1]).includes('selector:.a'), 'a rule inside @media still has a selector');
    assert.ok(marksOf(nested[2]).includes('prop:color'), 'and its property');
    const url = kinds('a{background:url(data:image/png;base64,AA==);content:"a;b"}', 'css')[0];
    assert.ok(marksOf(url).some((m) => m.indexOf('string:(data:image/png;base64,AA==)') === 0), 'the semicolon inside url() does not end the value');
    assert.ok(marksOf(url).includes('string:"a;b"'), 'a quoted semicolon stays inside the string');
});

test('CodeShade (Prism): multi-line tags, embedded <style> and <script>, and multi-line template literals (D-034)', () => {
    const tag = kinds('<a\n  href="x"\n  class="y">t</a>', 'html');
    assert.ok(marksOf(tag[1]).includes('attr:href') && marksOf(tag[2]).includes('attr:class'), 'attributes on later lines are still attributes');
    assert.ok(marksOf(tag[1]).includes('punct:='), 'the equals sign is punctuation');
    const embedded = kinds('<style>\na{color:red}\n</style>\n<script>\nconst a = 1;\n</script>', 'html');
    assert.ok(marksOf(embedded[1]).includes('selector:a') && marksOf(embedded[1]).includes('prop:color'), '<style> text is CSS');
    assert.ok(marksOf(embedded[4]).includes('keyword:const') && marksOf(embedded[4]).includes('number:1'), '<script> text is JavaScript');
    const tpl = kinds('const t = `a ${b}\n  c`; // x', 'js');
    assert.ok(marksOf(tpl[1]).some((m) => m.indexOf('string:  c`') === 0), 'the second line of a template literal is still a string');
    assert.ok(marksOf(tpl[1]).includes('comment:// x'), 'and the comment after it is a comment');
    assert.ok(marksOf(kinds('const r = /ab\\/c"/g;', 'js')[0]).includes('string:/ab\\/c"/g'), 'a regex with a quote is not a string start');
});

test('CodeShade (Prism): blank lines, unknown languages, and oversized files stay safe and lossless (D-034)', () => {
    assert.equal(kinds('a\n\n  \nb', 'js').map((l) => l.kind).join(','), 'js,blank,blank,js');
    const odd = kinds('plain words', 'markdown');
    assert.equal(odd[0].runs.map((r) => r.text).join(''), 'plain words');
    const big = 'x\n'.repeat(80000);
    const out = kinds(big, 'js');
    assert.equal(out.map((l) => l.runs.map((r) => r.text).join('')).join('\n'), big);
    assert.ok(out.every((l) => l.runs.every((r) => !r.mark)), 'a file over the size limit is shown uncoloured instead of slowing typing');
});
