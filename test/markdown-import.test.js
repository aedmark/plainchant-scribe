const mdBook = () => ExampleBook.create({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 4) }).files;
const mdX = (md, smart) => MarkdownImport.toXhtml(md, { smart: !!smart });
const mdClean = (f, assets) => {
    assert.deepEqual(Book.read(f, { assets: assets || [] }).problems.map((p) => p.severity + ' ' + p.code), []);
    assert.deepEqual(Nav.read(f, Book.read(f, { assets: assets || [] }).model).problems.map((p) => p.code), []);
    Object.keys(f).filter((p) => /\.xhtml$/.test(p)).forEach((p) => assert.deepEqual(Xhtml.check(f[p], { path: p }).problems, [], p));
};

test('markdown-import: block structure follows the CommonMark core (P5-03)', () => {
    assert.equal(mdX('## Two\n\nText *em* **strong** ***both*** `a <b>`\nnext  \nbreak'), '<h2>Two</h2>\n<p>Text <em>em</em> <strong>strong</strong> <strong><em>both</em></strong> <code>a &lt;b&gt;</code> next<br/>break</p>');
    assert.equal(mdX('Title\n=====\n\nSub\n---\n\n***'), '<h1>Title</h1>\n<h2>Sub</h2>\n<hr/>');
    assert.equal(mdX('> One\nlazy\n>\n> > Inner'), '<blockquote>\n  <p>One lazy</p>\n  <blockquote>\n    <p>Inner</p>\n  </blockquote>\n</blockquote>');
    assert.equal(mdX('- a\n- b\n  - c\n\n3. x\n4. y'), '<ul>\n  <li>a</li>\n  <li>b\n    <ul>\n      <li>c</li>\n    </ul>\n  </li>\n</ul>\n<ol start="3">\n  <li>x</li>\n  <li>y</li>\n</ol>');
    assert.equal(mdX('- a\n\n- b'), '<ul>\n  <li>\n    <p>a</p>\n  </li>\n  <li>\n    <p>b</p>\n  </li>\n</ul>', 'a loose list keeps its paragraphs');
    assert.equal(mdX('```js\nif (a < b) {}\n```\n\n    indented <code>'), '<pre><code>if (a &lt; b) {}</code></pre>\n<pre><code>indented &lt;code&gt;</code></pre>');
    assert.equal(mdX('The year\n2020. was long'), '<p>The year 2020. was long</p>', 'only "1." interrupts a paragraph');
    assert.equal(mdX('#hashtag and snake_case_name, 2*3*4'), '<p>#hashtag and snake_case_name, 2<em>3</em>4</p>');
    assert.equal(mdX('foo_bar_ baz and _real_'), '<p>foo_bar_ baz and <em>real</em></p>', 'an underscore inside a word does not open emphasis');
});

test('markdown-import: raw HTML is text, and only safe links survive', () => {
    assert.equal(mdX('<script>alert(1)</script> <img src=x onerror=y>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt; &lt;img src=x onerror=y&gt;</p>');
    assert.equal(mdX('[a](https://x.org/A_(b) "T") [b](mailto:me@x.org) [c](#top) [d](javascript:alert(1)) [e](chapter-2.md) <https://y.org>'),
        '<p><a href="https://x.org/A_(b)" title="T">a</a> <a href="mailto:me@x.org">b</a> <a href="#top">c</a> d e <a href="https://y.org">https://y.org</a></p>');
    assert.equal(mdX('\\*not em\\* \\[x\\]'), '<p>*not em* [x]</p>');
});

test('markdown-import: smart punctuation outside code, across markup', () => {
    assert.equal(MarkdownImport.smart('"Hi," she said -- it\'s 1990--95... \'quoted\' --- yes'), '“Hi,” she said – it’s 1990–95… ‘quoted’ — yes');
    assert.equal(mdX('*"Em"* and "a *b*" `"code"`', true), '<p><em>“Em”</em> and “a <em>b</em>” <code>"code"</code></p>');
});

test('markdown-import: files become chapters at top-level headings, with notes and images', () => {
    const book = mdBook();
    const assets = ['OEBPS/images/Map.PNG'];
    const md = 'Opening words.\n\n# The First\n\nA note here[^a] and there[^b].\n\n![A map](images/map.png "Our town")\n\nInline ![tiny](map.png) and ![gone](nowhere.jpg).\n\n[^a]: First *note*.\n[^b]: Second "note".\n\n# The Second\n\n## Part\n\nMore[^a].\n';
    const r = MarkdownImport.importInto(book, [{ name: 'my_draft-notes.md', text: md }, { name: 'plain.txt', text: 'One\nline.\n\nTwo "quoted".' }], 'OEBPS/text/chapter-1.xhtml', { assets: assets });
    const titles = BookChapters.list(r.entries).map((c) => c.title);
    assert.deepEqual(titles, ['A Book Is a Folder of Files', 'My draft notes', 'The First', 'The Second', 'Plain', 'Chapters and Contents', 'A Page of Typical Elements']);
    assert.equal(r.added.length, 4);
    assert.deepEqual(r.missing, ['nowhere.jpg']);
    const first = r.entries[r.added[1]];
    assert.ok(first.indexOf('<figure class="figure">\n      <img src="../images/Map.PNG" alt="A map"/>\n      <figcaption>Our town</figcaption>\n    </figure>') !== -1, first);
    assert.ok(first.indexOf('Inline <img src="../images/Map.PNG" alt="tiny"/> and [gone].') !== -1);
    assert.ok(/A note here<a epub:type="noteref" class="noteref" href="#note-1" id="ref-1">1<\/a> and there<a [^>]*href="#note-2"[^>]*>2<\/a>\./.test(first), first);
    assert.ok(first.indexOf('<a href="#ref-1">1.</a> First note.</p></aside>') !== -1 && first.indexOf('Second “note”.') !== -1, 'notes are plain text, typeset');
    assert.ok(/<h2>Part<\/h2>\n {4}<p>More<a [^>]*>1<\/a>\.<\/p>/.test(r.entries[r.added[2]]), 'notes number per chapter');
    assert.ok(r.entries[r.added[3]].indexOf('<p>One line.</p>\n    <p>Two “quoted”.</p>') !== -1, r.entries[r.added[3]]);
    assert.ok(Book.read(r.entries, { assets: assets }).model.manifest.items.some((i) => i.path === 'OEBPS/images/Map.PNG'), 'the image is listed');
    mdClean(r.entries, assets);
});

test('markdown-import: plain text without blank lines is a paragraph per line; endnotes follow the book setting', () => {
    const r = MarkdownImport.importInto(mdBook(), [{ name: 'lines.txt', text: '﻿First line\r\nSecond <line> & *stars*\r\n' }], null, {});
    const t = r.entries[r.added[0]];
    assert.ok(t.indexOf('<h1 id="lines-title">Lines</h1>\n    <p>First line</p>\n    <p>Second &lt;line&gt; &amp; *stars*</p>\n  </section>') !== -1, t);
    const e = MarkdownImport.importInto(mdBook(), [{ name: 'n.md', text: 'Text[^1].\n\n[^1]: An endnote.' }], null, { notes: 'endnotes' });
    assert.ok(/Text<a epub:type="noteref" class="noteref" href="notes.xhtml#endnote-1" id="endref-1">1<\/a>\./.test(e.entries[e.added[0]]));
    assert.ok(e.entries['OEBPS/text/notes.xhtml'].indexOf('An endnote.') !== -1);
    mdClean(e.entries);
    const empty = MarkdownImport.importInto(mdBook(), [{ name: 'empty.md', text: '' }], null, {});
    assert.ok(empty.entries[empty.added[0]].indexOf('<p></p>') !== -1, 'an empty file is an empty chapter');
});
