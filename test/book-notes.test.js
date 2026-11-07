const bnBook = () => ExampleBook.create({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 4) }).files;
const bnCh = (n) => 'OEBPS/text/chapter-' + n + '.xhtml';
// The start offset of the k-th <p> (0-based) in a document.
const bnP = (text, k) => XmlAst.parse(text).elements.filter((e) => e.local === 'p')[k].start;
const bnProblems = (e) => Book.read(e).problems.map((p) => p.severity + ' ' + p.code).concat(Nav.read(e, Book.read(e).model).problems.map((p) => p.severity + ' ' + p.code));
const bnRefs = (text) => Array.from(text.matchAll(/<a epub:type="noteref" role="doc-noteref" class="noteref" href="([^"]*)" id="([^"]*)">(\d+)<\/a>/g)).map((m) => m[2] + ' ' + m[1] + ' ' + m[3]);

test('book-notes: footnotes are numbered in reading order with links both ways (P4-04)', () => {
    let f = BookNotes.add(bnBook(), bnCh(1), bnP(bnBook()[bnCh(1)], 1), 'Second paragraph note.', 'footnotes').entries;
    // A note added earlier in the chapter takes number 1, and the other moves to 2.
    f = BookNotes.add(f, bnCh(1), bnP(f[bnCh(1)], 0), 'First <paragraph> note & more.', 'footnotes').entries;
    const t = f[bnCh(1)];
    assert.deepEqual(bnRefs(t), ['ref-1 #note-1 1', 'ref-2 #note-2 2']);
    const asides = Array.from(t.matchAll(/<aside epub:type="footnote" role="doc-footnote" class="footnote" id="(note-\d)"><p><a href="(#ref-\d)">(\d\.)<\/a> ([^<]*)<\/p><\/aside>/g)).map((m) => m.slice(1).join(' '));
    assert.deepEqual(asides, ['note-1 #ref-1 1. First &lt;paragraph&gt; note &amp; more.', 'note-2 #ref-2 2. Second paragraph note.'], 'notes are in number order, escaped');
    assert.ok(t.indexOf('</aside>\n  </section>') !== -1, 'footnotes go at the end of the chapter’s section');
    assert.ok(/What you see in the Explorer is the whole book\.<a epub:type="noteref"/.test(t), 'the reference ends the paragraph');
    assert.deepEqual(Xhtml.check(t, { path: bnCh(1) }).problems, []);
    assert.deepEqual(bnProblems(f), []);
    // Footnotes in another chapter start again at 1.
    const g = BookNotes.add(f, bnCh(2), bnP(f[bnCh(2)], 0), 'Elsewhere.', 'footnotes').entries;
    assert.deepEqual(bnRefs(g[bnCh(2)]), ['ref-1 #note-1 1']);
    assert.throws(() => BookNotes.add(bnBook(), bnCh(1), bnP(bnBook()[bnCh(1)], 0), '  ', 'footnotes'), /text/);
    const ul = XmlAst.parse(bnBook()[bnCh(1)]).elements.find((e) => e.local === 'ul').start;
    assert.throws(() => BookNotes.add(bnBook(), bnCh(1), ul, 'x', 'footnotes'), /Select a paragraph/);
});

test('book-notes: a note added inside inline markup goes at the end of its block', () => {
    const code = XmlAst.parse(bnBook()[bnCh(1)]).elements.find((e) => e.local === 'code').start;
    const t = BookNotes.add(bnBook(), bnCh(1), code, 'On mimetype.', 'footnotes').entries[bnCh(1)];
    assert.ok(t.indexOf('is an EPUB.<a epub:type="noteref" role="doc-noteref" class="noteref" href="#note-1" id="ref-1">1</a></li>') !== -1, t);
});

test('book-notes: endnotes go in a Notes chapter at the end, numbered across the book', () => {
    let f = BookNotes.add(bnBook(), bnCh(2), bnP(bnBook()[bnCh(2)], 0), 'From chapter two.', 'endnotes').entries;
    const notes = BookNotes.notesDoc(f);
    assert.equal(notes, 'OEBPS/text/notes.xhtml');
    f = BookNotes.add(f, bnCh(1), bnP(f[bnCh(1)], 0), 'From chapter one.', 'endnotes').entries;
    assert.deepEqual(bnRefs(f[bnCh(1)]), ['endref-1 notes.xhtml#endnote-1 1']);
    assert.deepEqual(bnRefs(f[bnCh(2)]), ['endref-2 notes.xhtml#endnote-2 2']);
    const lis = Array.from(f[notes].matchAll(/<li epub:type="endnote" class="endnote" id="(endnote-\d)"><p><a href="([^"]*)">(\d\.)<\/a> ([^<]*)<\/p><\/li>/g)).map((m) => m.slice(1).join(' '));
    assert.deepEqual(lis, ['endnote-1 chapter-1.xhtml#endref-1 1. From chapter one.', 'endnote-2 chapter-2.xhtml#endref-2 2. From chapter two.']);
    const model = Book.read(f).model;
    assert.equal(model.spine.itemrefs[model.spine.itemrefs.length - 1].item.path, notes, 'the Notes chapter is last in the spine');
    assert.ok(f['OEBPS/nav.xhtml'].indexOf('<a href="text/notes.xhtml">Notes</a>') !== -1, 'and in the contents');
    assert.ok(f[notes].indexOf('<link rel="stylesheet" type="text/css" href="../css/book.css"/>') !== -1, 'with the chapter’s stylesheet');
    assert.deepEqual(Xhtml.check(f[notes], { path: notes }).problems, []);
    assert.deepEqual(bnProblems(f), []);
    const again = BookNotes.add(f, bnCh(3), bnP(f[bnCh(3)], 0), 'Third.', 'endnotes').entries;
    assert.equal(Object.keys(again).filter((p) => /notes/.test(p)).length, 1, 'the Notes chapter is made once');
});

test('book-notes: endnote numbering leaves a chapter’s own footnotes alone', () => {
    let f = BookNotes.add(bnBook(), bnCh(1), bnP(bnBook()[bnCh(1)], 0), 'A footnote.', 'footnotes').entries;
    f = BookNotes.add(f, bnCh(1), bnP(f[bnCh(1)], 1), 'An endnote.', 'endnotes').entries;
    assert.deepEqual(bnRefs(f[bnCh(1)]), ['ref-1 #note-1 1', 'endref-1 notes.xhtml#endnote-1 1'], 'one numbering each, with distinct ids');
    assert.deepEqual(Xhtml.check(f[bnCh(1)], { path: bnCh(1) }).problems, []);
    assert.ok(/<aside epub:type="footnote" role="doc-footnote" class="footnote" id="note-1"><p><a href="#ref-1">1\.<\/a> A footnote\./.test(f[bnCh(1)]));
    // A footnote inside the Notes chapter is the Notes chapter's own, not an endnote.
    const n = 'OEBPS/text/notes.xhtml';
    f = BookNotes.add(f, n, bnP(f[n], 0), 'A note on a note.', 'footnotes').entries;
    f = BookNotes.add(f, bnCh(2), bnP(f[bnCh(2)], 0), 'Later.', 'endnotes').entries;
    assert.deepEqual(bnRefs(f[bnCh(2)]), ['endref-2 notes.xhtml#endnote-2 2']);
    assert.deepEqual(bnRefs(f[n]), ['ref-1 #note-1 1']);
});

test('book-notes: removing a note deletes its reference and note and renumbers the rest', () => {
    let f = bnBook();
    [0, 1].forEach((k) => { f = BookNotes.add(f, bnCh(1), bnP(f[bnCh(1)], k), 'Note ' + k + '.', 'footnotes').entries; });
    const first = XmlAst.parse(f[bnCh(1)]).elements.find((e) => e.local === 'a' && XmlAst.getAttr(e, 'id') === 'ref-1');
    const r = BookNotes.remove(f, bnCh(1), first.start, 'footnotes').entries;
    assert.deepEqual(bnRefs(r[bnCh(1)]), ['ref-1 #note-1 1']);
    assert.ok(/id="note-1"><p><a href="#ref-1">1\.<\/a> Note 1\./.test(r[bnCh(1)]) && r[bnCh(1)].indexOf('Note 0.') === -1);
    const last = XmlAst.parse(r[bnCh(1)]).elements.find((e) => e.local === 'a' && XmlAst.getAttr(e, 'id') === 'ref-1');
    assert.equal(BookNotes.remove(r, bnCh(1), last.start, 'footnotes').entries[bnCh(1)], bnBook()[bnCh(1)], 'removing every note gives the chapter back');
    assert.throws(() => BookNotes.remove(bnBook(), bnCh(1), bnP(bnBook()[bnCh(1)], 0), 'footnotes'), /note reference/);
    // An endnote's note goes from the Notes chapter.
    const e = BookNotes.add(bnBook(), bnCh(1), bnP(bnBook()[bnCh(1)], 0), 'End.', 'endnotes').entries;
    const ref = XmlAst.parse(e[bnCh(1)]).elements.find((x) => x.local === 'a' && XmlAst.getAttr(x, 'id') === 'endref-1');
    const gone = BookNotes.remove(e, bnCh(1), ref.start, 'endnotes').entries;
    assert.ok(gone['OEBPS/text/notes.xhtml'].indexOf('endnote') === gone['OEBPS/text/notes.xhtml'].indexOf('endnotes'), 'no endnote left');
    assert.equal(gone[bnCh(1)], bnBook()[bnCh(1)]);
});

test('book-notes: hand-made notes are renumbered without losing their markup', () => {
    const f = bnBook();
    f[bnCh(1)] = f[bnCh(1)].replace('the whole book.</p>', 'the whole book.<a epub:type="noteref" href="#fn-a" id="r-a">*</a></p>')
        .replace('  </section>', '    <aside epub:type="footnote" id="fn-a"><p><a href="#r-a">*</a> <em>Hand-made</em>.</p></aside>\n  </section>');
    const t = BookNotes.renumber(f, 'footnotes')[bnCh(1)];
    assert.ok(t.indexOf('<a epub:type="noteref" href="#note-1" id="ref-1">*</a>') !== -1, 'a symbol marker is kept');
    assert.ok(t.indexOf('<aside epub:type="footnote" id="note-1"><p><a href="#ref-1">*</a> <em>Hand-made</em>.</p></aside>') !== -1, t);
});

test('book-notes: insertAt puts a reference at an exact place in the text, and only there (P5-03)', () => {
    const f = bnBook(), t = f[bnCh(1)];
    const at = t.indexOf('Scribe keeps them') + 'Scribe keeps them'.length;
    const r = BookNotes.insertAt(f, bnCh(1), at, 'Mid-sentence.', 'footnotes').entries[bnCh(1)];
    assert.ok(r.indexOf('Scribe keeps them<a epub:type="noteref" role="doc-noteref" class="noteref" href="#note-1" id="ref-1">1</a> as they are.') !== -1, r);
    [t.indexOf('<p>') + 1, t.indexOf('</p>') + 2, t.indexOf('<title>') - 1, 0].forEach((bad) => assert.throws(() => BookNotes.insertAt(f, bnCh(1), bad, 'x', 'footnotes'), /text of a chapter/, 'offset ' + bad));
    const two = BookNotes.insertAt(BookNotes.insertAt(f, bnCh(1), at, 'A.', 'footnotes', { renumber: false }).entries, bnCh(1), at, 'B.', 'footnotes', { renumber: false }).entries;
    assert.equal(BookNotes.renumber(two, 'footnotes')[bnCh(1)].match(/id="note-\d"/g).join(' '), 'id="note-1" id="note-2"', 'notes added without renumbering get distinct ids, numbered later');
});
