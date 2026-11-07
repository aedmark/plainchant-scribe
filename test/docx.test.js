/* P7-03 (D-048): .docx import. Word documents are built here as zip archives of WordprocessingML parts. */

const DX_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const DX_PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
const DX_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const dxRejects = async (promise, pattern) => { try { await promise; } catch (e) { assert.ok(pattern.test(e.message), e.message); return; } assert.ok(false, 'expected ' + pattern); };

// A .docx's bytes from a body (w:body content) and optional parts.
function dxBuild(body, parts) {
    const p = parts || {};
    const rels = [['rStyles', 'styles', 'styles.xml'], ['rNum', 'numbering', 'numbering.xml'], ['rFoot', 'footnotes', 'footnotes.xml'], ['rEnd', 'endnotes', 'endnotes.xml']]
        .map((r) => '<Relationship Id="' + r[0] + '" Type="' + DX_REL + r[1] + '" Target="' + r[2] + '"/>').concat(p.rels || []);
    const files = {
        '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
        '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + DX_REL + 'officeDocument" Target="word/document.xml"/></Relationships>',
        'word/document.xml': '<?xml version="1.0" encoding="UTF-8"?><w:document ' + DX_W + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body>' + body + '<w:sectPr/></w:body></w:document>',
        'word/_rels/document.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.join('') + '</Relationships>',
        'word/styles.xml': '<?xml version="1.0"?><w:styles ' + DX_W + '><w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="' + (p.lang || 'en-GB') + '"/></w:rPr></w:rPrDefault></w:docDefaults>' +
            ['Heading1:heading 1', 'Heading2:heading 2', 'Title:Title', 'Subtitle:Subtitle', 'Quote:Quote', 'Caption:caption', 'Strong:Strong'].map((x) => { const [id, name] = x.split(':'); return '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name + '"/></w:style>'; }).join('') +
            '<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>' +
            '<w:style w:type="paragraph" w:styleId="Part"><w:name w:val="Part Title"/><w:basedOn w:val="Heading1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>' +
            '<w:style w:type="paragraph" w:styleId="Loop"><w:name w:val="Loop"/><w:basedOn w:val="Loop"/></w:style></w:styles>',
        'word/numbering.xml': '<?xml version="1.0"?><w:numbering ' + DX_W + '><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>' +
            '<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>',
        'word/footnotes.xml': '<?xml version="1.0"?><w:footnotes ' + DX_W + '><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:id="1"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> A footnote, </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>in italics.</w:t></w:r></w:p></w:footnote></w:footnotes>',
        'word/endnotes.xml': '<?xml version="1.0"?><w:endnotes ' + DX_W + '><w:endnote w:id="2"><w:p><w:r><w:t>An endnote.</w:t></w:r></w:p></w:endnote></w:endnotes>',
        'docProps/core.xml': '<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>' + (p.title == null ? 'The Docx Book' : p.title) + '</dc:title><dc:creator>A. Writer</dc:creator></cp:coreProperties>'
    };
    Object.assign(files, p.files || {});
    return Zip.build(Object.keys(files).filter((k) => files[k] != null).map((k) => ({ path: k, data: files[k] })));
}
const dxP = (text, style, extra) => '<w:p>' + (style || extra ? '<w:pPr>' + (style ? '<w:pStyle w:val="' + style + '"/>' : '') + (extra || '') + '</w:pPr>' : '') + '<w:r><w:t xml:space="preserve">' + text + '</w:t></w:r></w:p>';
const dxImage = (rid, descr, decorative) => '<w:r><w:drawing><wp:inline><wp:docPr id="1" name="Picture 1"' + (descr != null ? ' descr="' + descr + '"' : '') + '>' + (decorative ? '<a:extLst><a:ext uri="{C183D7F6}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>' : '') + '</wp:docPr><a:graphic><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="' + rid + '"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
const DX_IMG_RELS = ['<Relationship Id="rImg" Type="' + DX_REL + 'image" Target="media/image1.png"/>', '<Relationship Id="rEmf" Type="' + DX_REL + 'image" Target="media/image2.emf"/>',
    '<Relationship Id="rWeb" Type="' + DX_REL + 'hyperlink" Target="https://example.org/a?b=1&amp;c=2" TargetMode="External"/>', '<Relationship Id="rJs" Type="' + DX_REL + 'hyperlink" Target="javascript:alert(1)" TargetMode="External"/>',
    '<Relationship Id="rOut" Type="' + DX_REL + 'image" Target="../../../etc/passwd"/>', '<Relationship Id="rExt" Type="' + DX_REL + 'image" Target="https://example.org/pic.png" TargetMode="External"/>',
    '<Relationship Id="rCut" Type="' + DX_REL + 'image" Target="media/cut.png"/>'];

const dxSample = () => dxBuild([
    dxP('The Docx Book', 'Title'), dxP('A subtitle', 'Subtitle'),
    dxP('Before any heading.'),
    dxP('First Chapter', 'Heading1'),
    '<w:p><w:r><w:t xml:space="preserve">Plain, </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve"> still</w:t></w:r><w:r><w:t xml:space="preserve">, </w:t></w:r><w:r><w:rPr><w:i/><w:b w:val="0"/></w:rPr><w:t>italic</w:t></w:r><w:r><w:t xml:space="preserve">, </w:t></w:r><w:r><w:rPr><w:smallCaps/></w:rPr><w:t>caps</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2</w:t></w:r><w:r><w:rPr><w:rStyle w:val="Strong"/></w:rPr><w:t xml:space="preserve"> strong</w:t></w:r><w:r><w:t xml:space="preserve"> &amp; &lt;tags&gt;</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r><w:r><w:footnoteReference w:id="99"/></w:r><w:r><w:br w:type="page"/></w:r><w:r><w:br/><w:t>next line</w:t></w:r></w:p>',
    '<w:p><w:hyperlink r:id="rWeb"><w:r><w:t>a link</w:t></w:r></w:hyperlink><w:r><w:t xml:space="preserve"> and </w:t></w:r><w:hyperlink r:id="rJs"><w:r><w:t>no script</w:t></w:r></w:hyperlink><w:r><w:t xml:space="preserve"> and </w:t></w:r><w:hyperlink w:anchor="_Toc1"><w:r><w:t>an anchor</w:t></w:r></w:hyperlink><w:del><w:r><w:delText>gone</w:delText></w:r></w:del><w:ins><w:r><w:t xml:space="preserve"> added</w:t></w:r></w:ins><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>PAGE</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t xml:space="preserve"> 7</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:endnoteReference w:id="2"/></w:r></w:p>',
    dxP('A Section', 'Heading2'),
    dxP('* * *'),
    dxP('Quoted one.', 'Quote'), dxP('Quoted two.', 'Quote'),
    dxP('Bullet one', 'ListBullet'), dxP('Numbered inside', null, '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr>'), dxP('Bullet two', 'ListBullet'),
    dxP('Step one', null, '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'),
    dxP('   '),
    '<w:p>' + dxImage('rImg', 'A red dot') + '</w:p>', dxP('Figure 1. The dot.', 'Caption'),
    '<w:p>' + dxImage('rEmf', 'A metafile') + '</w:p>',
    '<w:p>' + dxImage('rOut', 'Outside') + '</w:p>', '<w:p>' + dxImage('rExt', 'On the web') + '</w:p>', '<w:p>' + dxImage('rCut', 'Cut short') + '</w:p>',
    '<w:p><w:r><w:t xml:space="preserve">Inline </w:t></w:r>' + dxImage('rImg', 'An ornament', true) + '<w:r><w:t xml:space="preserve"> image.</w:t></w:r></w:p>',
    '<w:tbl><w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Wide</w:t></w:r></w:p><w:p><w:r><w:t>Two lines</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    '<w:sdt><w:sdtContent>' + dxP('In a content control.') + '</w:sdtContent></w:sdt>',
    dxP('Second Chapter', 'Part'),
    dxP('Looped style is safe.', 'Loop')
].join(''), { rels: DX_IMG_RELS, files: { 'word/media/image1.png': DX_PNG, 'word/media/image2.emf': Uint8Array.from([1, 0, 0, 0, 0x20, 0x45, 0x4D, 0x46]), 'word/media/cut.png': Uint8Array.from([0x89, 0x50, 0x4E, 0x47]) } });

test('docx: Word structure is read into blocks, and looks, deletions, field codes, and unsafe links are dropped', async () => {
    const doc = await Docx.read(dxSample());
    assert.deepEqual([doc.title, doc.creator, doc.language], ['The Docx Book', 'A. Writer', 'en-GB']);
    const types = doc.blocks.map((b) => b.type + (b.level != null ? b.level : ''));
    assert.deepEqual(types, ['title', 'subtitle', 'para', 'heading1', 'para', 'para', 'heading2', 'break', 'quote', 'quote', 'item0', 'item1', 'item0', 'item0', 'figure', 'para', 'table', 'para', 'heading1', 'para']);
    const b = doc.blocks;
    assert.equal(b[4].html, 'Plain, <strong>bold still</strong>, <em>italic</em>, <span class="small-caps">caps</span><sup>2</sup><strong> strong</strong> &amp; &lt;tags&gt;' + Docx.NOTE_OPEN + 'footnote:1' + Docx.NOTE_CLOSE + '<br/>next line');
    assert.equal(b[5].html, '<a href="https://example.org/a?b=1&amp;c=2">a link</a> and no script and an anchor added 7' + Docx.NOTE_OPEN + 'endnote:2' + Docx.NOTE_CLOSE);
    assert.deepEqual([b[10].ordered, b[11].ordered, b[13].ordered], [false, true, true]);
    assert.deepEqual([b[14].image, b[14].alt, b[14].caption], ['word/media/image1.png', 'A red dot', 'Figure 1. The dot.']);
    assert.includes(b[15].html, '<img src="' + Docx.IMG_OPEN + 'word/media/image1.png' + Docx.IMG_CLOSE + '" alt=""/>', 'decorative: empty alt');
    assert.deepEqual(b[16].rows.map((r) => r.map((c) => (c.header ? 'th:' : 'td:') + c.colspan + ':' + c.html)), [['th:1:Name', 'th:1:Value'], ['td:2:<p>Wide</p><p>Two lines</p>']]);
    assert.equal(b[18].text, 'Second Chapter', 'an outline level through basedOn is a heading');
    assert.deepEqual(doc.notes.footnote, { 1: 'A footnote, in italics.' });
    assert.deepEqual(doc.notes.endnote, { 2: 'An endnote.' });
    assert.deepEqual(Object.keys(doc.images), ['word/media/image1.png']);
    assert.deepEqual(doc.skipped.sort(), ['a linked image (only images inside the document are imported)', 'cut.png (only PNG, JPEG, and GIF images are imported)', 'image2.emf (only PNG, JPEG, and GIF images are imported)'], 'the web image and the one outside the package are linked images; a PNG header alone is not a PNG');
});

test('docx: the archive and its parts are checked as untrusted input', async () => {
    await dxRejects(Docx.read(Uint8Array.from([1, 2, 3])), /not a \.docx \(zip\) file/);
    await dxRejects(Docx.read(Zip.build([{ path: 'hello.txt', data: 'hi' }])), /not a Word document: it has no word\/document\.xml/);
    // Zip.build refuses such a name, so the bytes are patched: "xx/" becomes "../" in both headers.
    const evil = Zip.build([{ path: 'xx/evil.xml', data: 'x' }]);
    for (let i = 0; i + 2 < evil.length; i++) if (evil[i] === 0x78 && evil[i + 1] === 0x78 && evil[i + 2] === 0x2F) { evil[i] = 0x2E; evil[i + 1] = 0x2E; }
    await dxRejects(Docx.read(evil), /The document was not imported: "\.\.\/evil\.xml" is unsafe/);
    await dxRejects(Docx.read(dxBuild('', { files: { 'word/document.xml': '<w:document ' + DX_W + '><w:body><w:p>' } })), /not well-formed/);
    await dxRejects(Docx.read(dxBuild('', { files: { 'word/document.xml': '<w:document ' + DX_W + '/>' } })), /no body/);
    // Entities are never expanded and nothing outside the archive is fetched (XmlAst reads no DTD).
    const bomb = '<?xml version="1.0"?><!DOCTYPE w:document [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;">]><w:document ' + DX_W + '><w:body><w:p><w:r><w:t>&b;</w:t></w:r></w:p></w:body></w:document>';
    const quiet = await Docx.read(dxBuild('', { files: { 'word/document.xml': bomb } }));
    assert.ok(JSON.stringify(quiet.blocks).indexOf('aaaa') === -1, JSON.stringify(quiet.blocks));
    const external = '<?xml version="1.0"?><!DOCTYPE w:document [<!ENTITY x SYSTEM "file:///etc/passwd">]><w:document ' + DX_W + '><w:body><w:p><w:r><w:t>&x;</w:t></w:r></w:p></w:body></w:document>';
    await dxRejects(Docx.read(dxBuild('', { files: { 'word/document.xml': external } })), /not well-formed/);
    // A document whose package relationship points elsewhere is followed; a missing styles part is no problem.
    const moved = dxBuild('', { files: { 'word/document.xml': null, 'word/styles.xml': null, 'word/main.xml': '<w:document ' + DX_W + '><w:body>' + dxP('Moved.') + '</w:body></w:document>', '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r" Type="' + DX_REL + 'officeDocument" Target="/word/main.xml"/></Relationships>' } });
    assert.deepEqual((await Docx.read(moved)).blocks.map((x) => x.html), ['Moved.']);
});

test('docx-import: chapters at each Heading 1, with notes, images, lists, tables, and figures in Scribe\'s markup', async () => {
    const doc = await Docx.read(dxSample());
    const e = ExampleBook.create().files;
    const r = DocxImport.importInto(e, doc, 'OEBPS/text/chapter-1.xhtml', { name: 'my-draft.docx', assets: [] });
    assert.deepEqual(r.added, ['OEBPS/text/my-draft.xhtml', 'OEBPS/text/first-chapter.xhtml', 'OEBPS/text/second-chapter.xhtml']);
    assert.deepEqual(Object.keys(r.binaries), ['OEBPS/images/image1.png']);
    assert.equal(r.binaries['OEBPS/images/image1.png'], doc.images['word/media/image1.png'].bytes);
    const ch = r.entries['OEBPS/text/first-chapter.xhtml'];
    assert.ok(XmlAst.parse(ch).wellFormed, ch);
    assert.includes(ch, '<h1 id="first-chapter-title">First Chapter</h1>\n    <p>Plain, <strong>bold still</strong>');
    assert.includes(ch, '&amp; &lt;tags&gt;<a epub:type="noteref" role="doc-noteref" class="noteref" href="#note-1" id="ref-1">1</a><br/>next line</p>');
    assert.includes(ch, 'added 7<a epub:type="noteref" role="doc-noteref" class="noteref" href="notes.xhtml#endnote-1" id="endref-1">1</a>');
    assert.includes(ch, 'A footnote, in italics.');
    assert.includes(ch, '<h2>A Section</h2>');
    assert.includes(ch, '<hr/>');
    assert.includes(ch, '<blockquote>\n      <p>Quoted one.</p>\n      <p>Quoted two.</p>\n    </blockquote>');
    assert.includes(ch, '<ul>\n      <li>Bullet one\n        <ol>\n          <li>Numbered inside\n          </li>\n        </ol>\n      </li>\n      <li>Bullet two\n      </li>\n    </ul>\n    <ol>\n      <li>Step one\n      </li>\n    </ol>');
    assert.includes(ch, '<figure class="figure">\n      <img src="../images/image1.png" alt="A red dot"/>\n      <figcaption>Figure 1. The dot.</figcaption>\n    </figure>');
    assert.includes(ch, '<p>Inline <img src="../images/image1.png" alt=""/> image.</p>');
    assert.includes(ch, '<table class="table">\n      <tr>\n        <th>Name</th>');
    assert.includes(ch, '<td colspan="2"><p>Wide</p><p>Two lines</p></td>');
    assert.ok(ch.indexOf('The Docx Book') === -1 && ch.indexOf('A subtitle') === -1, 'Title and Subtitle are not copied');
    assert.ok(!/[-]/.test(JSON.stringify(r.entries)), 'no token is left');
    const model = Book.read(r.entries, { assets: Object.keys(r.binaries) }).model;
    assert.ok(model.manifest.items.some((i) => i.path === 'OEBPS/images/image1.png' && i.mediaType === 'image/png'));
    const notesDoc = Object.keys(r.entries).find((p) => /notes\.xhtml$/.test(p));
    assert.ok(notesDoc && r.entries[notesDoc].indexOf('An endnote.') !== -1, 'the endnote is an endnote');
    assert.includes(r.entries['OEBPS/text/my-draft.xhtml'], '<p>Before any heading.</p>');
    // An image name already in the book gets a new one.
    const again = DocxImport.importInto(r.entries, doc, 'OEBPS/text/second-chapter.xhtml', { name: 'my-draft.docx', assets: Object.keys(r.binaries) });
    assert.deepEqual(Object.keys(again.binaries), ['OEBPS/images/image1-2.png']);
});

test('docx-import: a new book takes the document\'s title, author, and language, and its chapters replace the template\'s', async () => {
    const doc = await Docx.read(dxSample());
    const r = DocxImport.newBook(doc, { name: 'draft.docx', uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 7) });
    const model = Book.read(r.entries, { assets: Object.keys(r.binaries) }).model;
    assert.deepEqual([model.metadata.title, model.metadata.creators[0].value, model.metadata.language], ['The Docx Book', 'A. Writer', 'en-GB']);
    assert.ok(!r.entries['OEBPS/text/chapter-1.xhtml'], 'the template chapter is gone');
    assert.deepEqual(BookChapters.list(r.entries).map((c) => c.title).slice(0, 3), ['Draft', 'First Chapter', 'Second Chapter']);
    const nav = Nav.read(r.entries, model).nav;
    assert.deepEqual(Nav.entries(nav.landmarks).map((x) => x.types[0] + ' ' + x.target.path), ['bodymatter OEBPS/text/draft.xhtml']);
    assert.deepEqual(Nav.read(r.entries, model).problems.filter((p) => p.severity === 'error'), []);
    // No title in the properties: the Title paragraph, then the file name. A bad language tag falls back to en.
    const noTitle = await Docx.read(dxBuild(dxP('From the Title', 'Title') + dxP('Text.'), { title: '', lang: 'not a tag' }));
    const nb = DocxImport.newBook(noTitle, { name: 'x.docx' });
    assert.deepEqual([Book.read(nb.entries).model.metadata.title, Book.read(nb.entries).model.metadata.language], ['From the Title', 'en']);
    const titled = await Docx.read(dxBuild(dxP('T', 'Title') + dxP('S', 'Subtitle') + dxP('One', 'Heading1') + dxP('Text.'), { title: '' }));
    assert.deepEqual(BookChapters.list(DocxImport.newBook(titled, { name: 'x.docx' }).entries).map((c) => c.title), ['One'], 'no empty chapter before the first heading');
    const bare = await Docx.read(dxBuild(dxP('Only text.'), { title: '' }));
    assert.equal(Book.read(DocxImport.newBook(bare, { name: 'field-notes.docx' }).entries).model.metadata.title, 'Field notes');
    const empty = DocxImport.newBook(await Docx.read(dxBuild('', { title: '' })), { name: 'empty.docx' });
    assert.ok(empty.entries['OEBPS/text/chapter-1.xhtml'], 'an empty document keeps the template chapter');
});

// The EPUBCheck oracle (test/epubcheck.test.js) checks books made from this sample.
globalThis.dxSample = dxSample;
