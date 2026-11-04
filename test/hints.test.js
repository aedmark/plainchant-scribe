// uses the global Hints set by test/run.js
const messages = (html, filter) => Hints.checkHtml(html).filter((p) => !filter || p.category === filter).map((p) => p.severity + ':' + p.message);
const doc = (body) => '<!DOCTYPE html>\n<html lang="en"><head><title>T</title></head><body>' + body + '</body></html>';

test('hints: a clean page produces nothing', () => {
    const page = doc('<h1>Hi</h1><h2>Sub</h2><p>Text<p>More</p><img src="a.png" alt=""><img src="b.png" alt="B"><a href="x.html">Go</a><button>Ok</button>' +
        '<label for="n">Name</label><input id="n"><label>Mail <input type="email"></label><input type="submit" value="Send"><ul><li>a<li>b</ul><br><script>if (1 < 2) { document.write("<div>"); }</script>');
    assert.deepEqual(Hints.checkHtml(page), []);
});

test('hints: missing alt, empty names, labels, frames, tabindex, lang and title', () => {
    const all = messages(doc('<img src="a.png"><input type="image" src="b.png"><a href="x.html"></a><a href="y.html"><img src="i.png" alt="Home"></a><button></button><button aria-label="Close"></button>' +
        '<input name="q"><textarea></textarea><select></select><iframe src="f.html"></iframe><div tabindex="3"></div><div tabindex="0"></div><h2></h2>'), 'accessibility');
    assert.equal(all.filter((m) => /no alt attribute/.test(m)).length, 1);
    assert.equal(all.filter((m) => /Image button/.test(m)).length, 1);
    assert.equal(all.filter((m) => /Link has no text/.test(m)).length, 1, 'only the empty link, not the one holding an image with alt');
    assert.equal(all.filter((m) => /^warning:Button has no text/.test(m)).length, 1);
    assert.equal(all.filter((m) => /Form field has no label/.test(m)).length, 3);
    assert.equal(all.filter((m) => /Frame has no title/.test(m)).length, 1);
    assert.equal(all.filter((m) => /tabindex="3"/.test(m)).length, 1);
    assert.equal(all.filter((m) => /Empty <h2>/.test(m)).length, 1);
    const bare = messages('<html><head></head><body></body></html>');
    assert.ok(bare.some((m) => /no lang attribute/.test(m)) && bare.some((m) => /no <title>/.test(m)));
    assert.deepEqual(messages('<p>A fragment, not a page</p>'), [], 'fragments are not asked for lang or title');
});

test('hints: heading order only complains when a level is skipped', () => {
    const skipped = messages(doc('<h1>A</h1><h3>B</h3><h2>C</h2><h4>D</h4>'), 'accessibility');
    assert.deepEqual(skipped, ['warning:Heading jumps from h1 to h3 (skips h2).', 'warning:Heading jumps from h2 to h4 (skips h3).']);
    assert.deepEqual(messages(doc('<h2>A</h2><h3>B</h3><h1>C</h1><h2>D</h2>'), 'accessibility'), [], 'going down or starting low is fine');
});

test('hints: duplicate ids, obsolete tags, and dangling label targets', () => {
    const found = messages(doc('<div id="a"></div><p id="b"></p><span id="a"></span><center>x</center><label for="missing">L</label>'), 'markup');
    assert.ok(found.includes('error:Duplicate id "a" (first used on line 2).'));
    assert.ok(found.some((m) => /<center> is obsolete/.test(m)));
    assert.ok(found.some((m) => /id "missing", which does not exist/.test(m)));
    const dup = Hints.checkHtml('<div id="x"></div>\n<div id="x"></div>').find((p) => /Duplicate/.test(p.message));
    assert.equal(dup.line, 2);
    assert.equal('<div id="x"></div>\n<div id="x"></div>'.slice(dup.start, dup.end), 'id="x"', 'the problem points at the attribute');
});

test('hints: unclosed, stray, and crossed tags are reported at the right tag', () => {
    const html = '<div>\n<span>text\n</div>\n<b><i>x</b></i>\n</section>\n<p>ok<ul><li>one<li>two</ul>';
    const out = Hints.checkHtml(html).filter((p) => p.category === 'markup').map((p) => p.severity + ':' + p.line + ':' + p.message);
    assert.deepEqual(out, [
        'error:2:<span> (line 2) is not closed before </div>.',
        'error:4:<i> (line 4) is not closed before </b>.',
        'error:4:Stray </i> has no matching <i>.',
        'error:5:Stray </section> has no matching <section>.'
    ]);
    const never = Hints.checkHtml('<main>\n<div>\n</main>').map((p) => p.message);
    assert.deepEqual(never, ['<div> (line 2) is not closed before </main>.']);
    assert.deepEqual(Hints.checkHtml('<section><div>').map((p) => p.message), ['<section> is never closed.', '<div> is never closed.']);
    assert.deepEqual(Hints.checkHtml('<!-- <div> --><style>a > b { }</style><svg><path d="M0"/></svg><textarea aria-label="x"></textarea>').map((p) => p.message), [], 'comments, raw text, void and self-closing tags are ignored');
});

test('hints: the checker covers only .html files, sorts by file then position, and caches by text', () => {
    const checker = Hints.createChecker();
    const entries = { 'b.css': 'a {', 'a.html': '<img src="x.png"><div>', 'c.html': '<h1>x</h1>' };
    const first = checker.check(entries);
    assert.deepEqual(first.problems.map((p) => p.file + ':' + p.kind), ['a.html:accessibility', 'a.html:markup']);
    assert.equal(first.warnings, 1);
    assert.equal(first.errors, 1);
    assert.deepEqual(checker.check(entries).problems, first.problems);
    assert.equal(checker.check({ 'a.html': '<img src="x.png" alt="">' }).problems.length, 0);
});
