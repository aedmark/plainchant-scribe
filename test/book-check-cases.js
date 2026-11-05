/*
 * Broken books for BookCheck (P5-04), shared by test/book-check.test.js and the EPUBCheck oracle test so both judge
 * the same files. Each case changes a new book from BookTemplate: `codes` are the BookCheck codes it should give
 * (besides cover-missing, which every new book has), and `epubcheck` the EPUBCheck 5.4.0 message IDs, observed
 * 2026-11-05; an empty list means EPUBCheck accepts the book and the rule is advice.
 */
const CHAPTER = 'OEBPS/text/chapter-1.xhtml';
const OPF = 'OEBPS/content.opf';
// A real 1x1 PNG.
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));

const inBody = (f, markup) => { f[CHAPTER] = f[CHAPTER].replace('<p>Begin', markup + '<p>Begin'); };
const listItem = (f, item) => { f[OPF] = f[OPF].replace('</manifest>', '  ' + item + '\n  </manifest>'); };
const withImage = (f, type, bytes) => { f['OEBPS/images/a.png'] = bytes || PNG; listItem(f, '<item id="a" href="images/a.png" media-type="' + (type || 'image/png') + '"/>'); };
const extra = (f) => { f['OEBPS/text/extra.xhtml'] = f[CHAPTER].replace(/chapter-1/g, 'extra'); };

const BOOK_CHECK_CASES = [
    { name: 'image without alt', change: (f) => { withImage(f); inBody(f, '<p><img src="../images/a.png"/></p>'); }, codes: ['img-alt-missing'], epubcheck: [] },
    { name: 'fragments that name no element', change: (f) => inBody(f, '<p><a href="#nope">x</a> <a href="chapter-1.xhtml#nope2">y</a></p>'), codes: ['fragment-missing'], epubcheck: ['RSC-012'] },
    { name: 'link to a chapter not in the spine', change: (f) => { extra(f); listItem(f, '<item id="extra" href="text/extra.xhtml" media-type="application/xhtml+xml"/>'); inBody(f, '<p><a href="extra.xhtml">x</a></p>'); }, codes: ['link-not-in-spine'], epubcheck: ['RSC-011'] },
    { name: 'link to a file not in the manifest', change: (f) => { extra(f); inBody(f, '<p><a href="extra.xhtml">x</a></p>'); }, codes: ['link-not-in-manifest', 'not-in-manifest'], epubcheck: ['RSC-008'] },
    { name: 'link to a missing file', change: (f) => inBody(f, '<p><a href="gone.xhtml">x</a></p>'), codes: ['link-missing'], epubcheck: ['RSC-007'] },
    { name: 'link to an image', change: (f) => { withImage(f); inBody(f, '<p><a href="../images/a.png">x</a></p>'); }, codes: ['link-not-content'], epubcheck: ['RSC-010'] },
    { name: 'link to a data: URL', change: (f) => inBody(f, '<p><a href="data:text/plain,x">x</a></p>'), codes: ['link-data-url'], epubcheck: ['RSC-010', 'RSC-029'] },
    { name: 'lang and xml:lang that disagree', change: (f) => { f[CHAPTER] = f[CHAPTER].replace('xml:lang="en" lang="en"', 'xml:lang="en" lang="fr"'); }, codes: ['lang-mismatch'], epubcheck: ['RSC-005'] },
    { name: 'lang and xml:lang that differ only in case', change: (f) => { f[CHAPTER] = f[CHAPTER].replace('xml:lang="en" lang="en"', 'xml:lang="en-gb" lang="en-GB"'); }, codes: [], epubcheck: [] },
    { name: 'xml:lang without lang', change: (f) => { f[CHAPTER] = f[CHAPTER].replace(' lang="en"', ''); }, codes: [], epubcheck: [] },
    { name: 'duplicate id', change: (f) => inBody(f, '<p id="chapter-1">x</p>'), codes: ['duplicate-id'], epubcheck: ['RSC-005'] },
    { name: 'EPUB 2 opf:role', change: (f) => { f[OPF] = f[OPF].replace('<package ', '<package xmlns:opf="http://www.idpf.org/2007/opf" ').replace('<dc:language>', '<dc:creator opf:role="aut">A</dc:creator>\n    <dc:language>'); }, codes: ['opf-attribute'], epubcheck: ['RSC-005'] },
    { name: 'custom attribute in a w3.org namespace', change: (f) => inBody(f, '<p xmlns:w="http://www.w3.org/foo" w:x="1">x</p>'), codes: ['reserved-namespace'], epubcheck: ['HTM-054'] },
    { name: 'custom attribute in an idpf.org namespace', change: (f) => inBody(f, '<p xmlns:w="http://www.idpf.org/foo" w:x="1">x</p>'), codes: ['reserved-namespace'], epubcheck: ['HTM-054'] },
    { name: 'custom attribute in another namespace', change: (f) => inBody(f, '<p xmlns:w="http://example.com/x" w:x="1">x</p>'), codes: [], epubcheck: [] },
    { name: 'remote image', change: (f) => inBody(f, '<p><img src="https://example.com/a.png" alt="a"/></p>'), codes: ['remote-resource'], epubcheck: ['OPF-014', 'RSC-006'] },
    { name: 'remote audio without remote-resources', change: (f) => inBody(f, '<p><audio src="https://example.com/a.mp3" controls="controls">x</audio></p>'), codes: ['remote-not-in-manifest', 'remote-resources-missing'], epubcheck: ['OPF-014', 'RSC-008'] },
    { name: 'remote audio, listed and declared', change: (f) => { listItem(f, '<item id="snd" href="https://example.com/a.mp3" media-type="audio/mpeg"/>'); f[OPF] = f[OPF].replace('href="text/chapter-1.xhtml" media-type="application/xhtml+xml"', 'href="text/chapter-1.xhtml" media-type="application/xhtml+xml" properties="remote-resources"'); inBody(f, '<p><audio src="https://example.com/a.mp3" controls="controls">x</audio></p>'); }, codes: [], epubcheck: [] },
    { name: 'skipped heading level', change: (f) => inBody(f, '<h3>Skip</h3>'), codes: ['heading-skip'], epubcheck: [] },
    { name: 'chapter without a language', change: (f) => { f[CHAPTER] = f[CHAPTER].replace(' xml:lang="en" lang="en"', ''); }, codes: ['lang-missing'], epubcheck: [] },
    { name: 'space in a file name', change: (f) => { f['OEBPS/text/a b.xhtml'] = f[CHAPTER].replace(/chapter-1/g, 'ab'); listItem(f, '<item id="ab" href="text/a%20b.xhtml" media-type="application/xhtml+xml"/>'); f[OPF] = f[OPF].replace('</spine>', '  <itemref idref="ab"/>\n  </spine>'); }, codes: ['file-name-space'], epubcheck: ['PKG-010'] },
    { name: 'stylesheet url() to a missing file', change: (f) => { f['OEBPS/css/book.css'] += '\nbody { background: url(../images/no.png); }\n'; }, codes: ['link-missing'], epubcheck: ['RSC-007'] },
    { name: 'PNG listed as JPEG', change: (f) => { withImage(f, 'image/jpeg'); inBody(f, '<p><img src="../images/a.png" alt="a"/></p>'); }, codes: ['media-type-mismatch'], epubcheck: ['OPF-029'] },
    { name: 'image that is not an image', change: (f) => { withImage(f, 'image/png', new TextEncoder().encode('not a picture')); inBody(f, '<p><img src="../images/a.png" alt="a"/></p>'); }, codes: ['image-unreadable'], epubcheck: ['OPF-029', 'PKG-021'] },
    { name: 'very long chapter', change: (f) => inBody(f, '<p>' + 'word '.repeat(70000) + '</p>'), codes: ['chapter-size'], epubcheck: [] },
    { name: 'file not in the manifest', change: (f) => { f['OEBPS/stray.txt'] = 'x'; }, codes: ['not-in-manifest'], epubcheck: [] }
];

if (typeof module === 'object') module.exports = { BOOK_CHECK_CASES: BOOK_CHECK_CASES, PNG: PNG };
