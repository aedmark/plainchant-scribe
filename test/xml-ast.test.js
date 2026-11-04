const xmlFs = require('fs');
const xmlPath = require('path');

const fixture = (name) => xmlFs.readFileSync(xmlPath.join(__dirname, 'fixtures', 'xml', name), 'utf8');
const NS = {
    opf: 'http://www.idpf.org/2007/opf',
    dc: 'http://purl.org/dc/elements/1.1/',
    xhtml: 'http://www.w3.org/1999/xhtml',
    epub: 'http://www.idpf.org/2007/ops',
    container: 'urn:oasis:names:tc:opendocument:xmlns:container'
};
const FIXTURES = ['content.opf', 'nav.xhtml', 'chapter.xhtml', 'container.xml'];

// Rebuilds the text from node ranges alone, so every character is accounted for exactly once.
function rebuild(ast, node) {
    if (node.type === 'document' || node.type === 'fragment') return node.children.map((c) => rebuild(ast, c)).join('');
    if (node.type !== 'element') return ast.text.slice(node.start, node.end);
    if (node.selfClosing) return ast.text.slice(node.start, node.end);
    return ast.text.slice(node.start, node.openEnd) + node.children.map((c) => rebuild(ast, c)).join('') + ast.text.slice(node.closeStart, node.closeEnd);
}

// The one splice an operation returns, as the text it removes and the text it adds.
function one(ast, edits) {
    assert.equal(edits.length, 1, 'one splice');
    return { removed: ast.text.slice(edits[0].start, edits[0].end), added: edits[0].text };
}

const edit = (ast, edits) => XmlAst.applyEdits(ast.text, edits);
const codes = (src, opts) => XmlAst.parse(src, opts).errors.map((e) => e.code);

test('xml-ast: every fixture parses well-formed and its node ranges rebuild the file exactly', () => {
    FIXTURES.forEach((name) => {
        const text = fixture(name);
        const ast = XmlAst.parse(text);
        assert.deepEqual(ast.errors, [], name + ' errors');
        assert.ok(ast.wellFormed, name + ' is well-formed');
        assert.equal(rebuild(ast, ast.root), text, name + ' rebuilds from its ranges');
        assert.equal(ast.text, text, name + ' text is untouched');
    });
});

test('xml-ast: CRLF line ends and a byte order mark survive the round trip, and values normalise line ends (XML 1.0 §2.11)', () => {
    const text = '﻿<?xml version="1.0"?>\r\n<root a="x\r\ny">one\r\ntwo<![CDATA[3\r\n4]]></root>\r\n';
    const ast = XmlAst.parse(text);
    assert.ok(ast.wellFormed, JSON.stringify(ast.errors));
    assert.ok(ast.xmlDecl, 'the XML declaration after the BOM is recognised');
    assert.equal(rebuild(ast, ast.root), text.slice(1));
    const root = ast.documentElement;
    assert.equal(XmlAst.getAttr(root, 'a'), 'x y', 'a CRLF in an attribute value is one space (§3.3.3)');
    assert.equal(XmlAst.textContent(root), 'one\ntwo3\n4');
    assert.equal(XmlAst.position(ast, text.indexOf('<root')).line, 1);
});

test('xml-ast: resolves namespaces on elements and attributes in an OPF', () => {
    const ast = XmlAst.parse(fixture('content.opf'));
    const pkg = ast.documentElement;
    assert.equal(pkg.local, 'package');
    assert.equal(pkg.ns, NS.opf);
    assert.equal(XmlAst.getAttr(pkg, 'unique-identifier'), 'pub-id', 'single-quoted value');
    assert.equal(XmlAst.getAttr(pkg, 'lang', XmlAst.NS_XML), 'en', 'xml: is bound without a declaration');
    const title = XmlAst.find(ast, 'title', NS.dc);
    assert.equal(title.name, 'dc:title');
    assert.equal(XmlAst.textContent(title), 'The Quiet Ledger & Other Stories');
    const creator = XmlAst.find(ast, 'creator', NS.dc);
    assert.equal(XmlAst.getAttr(creator, 'role', NS.opf), 'aut');
    assert.equal(XmlAst.getAttr(creator, 'role'), null, 'a prefixed attribute is not in no namespace');
    assert.deepEqual(XmlAst.findAll(ast, 'itemref', NS.opf).map((el) => XmlAst.getAttr(el, 'idref')), ['ch1', 'ch2']);
    assert.equal(XmlAst.lookupNamespace(title, 'dc'), NS.dc);
    assert.equal(XmlAst.lookupNamespace(pkg, 'dc'), null, 'dc is declared on <metadata>, not above it');
    assert.equal(XmlAst.find(ast, 'meta', null), null, 'no meta is in no namespace');
});

test('xml-ast: reads an XHTML chapter with a DOCTYPE, an internal entity, CDATA, a PI, and epub:type', () => {
    const ast = XmlAst.parse(fixture('chapter.xhtml'));
    assert.ok(ast.wellFormed, JSON.stringify(ast.errors));
    assert.equal(ast.doctype.name, 'html');
    assert.deepEqual(ast.doctype.entities, ['thinsp']);
    assert.ok(ast.doctype.internalSubset.end > ast.doctype.internalSubset.start);
    const h2 = XmlAst.find(ast, 'h2', NS.xhtml);
    assert.equal(XmlAst.textContent(h2), 'I.&thinsp;The Counting House', 'internal entities are noted, never expanded');
    const first = XmlAst.findAll(ast, 'p', NS.xhtml)[0];
    assert.includes(XmlAst.textContent(first), '‘March’');
    const style = XmlAst.find(ast, 'style', NS.xhtml);
    assert.includes(XmlAst.textContent(style), 'a > b');
    assert.ok(ast.elements.length > 10);
    const pi = XmlAst.find(ast, 'section', NS.xhtml).children.find((c) => c.type === 'pi');
    assert.equal(pi.target, 'page-break-hint');
    assert.equal(pi.value, 'after');
    const note = XmlAst.findAll(ast, 'a', NS.xhtml).find((a) => XmlAst.getAttr(a, 'type', NS.epub) === 'noteref');
    assert.ok(note, 'epub:type resolves to the OPS namespace');
    const img = XmlAst.find(ast, 'img', NS.xhtml);
    assert.ok(img.selfClosing);
    assert.equal(XmlAst.nodeAtOffset(ast, img.start + 3), img);
});

test('xml-ast: reports well-formedness errors with codes and positions, and never throws', () => {
    const cases = [
        ['<a><b></a>', ['unclosed-element']],
        ['<a></b></a>', ['unexpected-end-tag']],
        ['<a>', ['unclosed-element']],
        ['<a/><b/>', ['multiple-roots']],
        ['', ['no-root']],
        ['text<a/>', ['text-outside-root']],
        ['<a>&nbsp;</a>', ['undeclared-entity']],
        ['<a>Fish & chips</a>', ['bare-ampersand']],
        ['<a>&#0;</a>', ['invalid-char-ref']],
        ['<a>&#xZZ;</a>', ['invalid-char-ref']],
        ['<a>1 < 2</a>', ['invalid-lt']],
        ['<a>]]></a>', ['cdata-end-in-text']],
        ['<a x="1" x="2"/>', ['duplicate-attribute']],
        ['<a x=1/>', ['unquoted-attribute']],
        ['<a x/>', ['attribute-without-value']],
        ['<a x="<"/>', ['lt-in-attribute']],
        ['<a x="1"y="2"/>', ['missing-space']],
        ['<a><!-- a -- b --></a>', ['double-hyphen-in-comment']],
        ['<a><!-- a ---></a>', ['double-hyphen-in-comment']],
        ['<a><!-- open', ['unterminated-comment', 'unclosed-element']],
        ['<a><![CDATA[x', ['unterminated-cdata', 'unclosed-element']],
        ['<a/>\n<?xml version="1.0"?>', ['misplaced-xml-declaration']],
        ['<?xml version="2"?><a/>', ['invalid-xml-declaration']],
        ['<a/><!DOCTYPE a>', ['misplaced-doctype']],
        ['<!doctype html><a/>', ['invalid-doctype']],
        ['<a>\u0001</a>', ['invalid-char']],
        ['<a>\uD800</a>', ['invalid-char']],
        ['<a><?XML x?></a>', ['invalid-pi']],
        ['<a></a  x>', ['invalid-end-tag']]
    ];
    cases.forEach(([src, expected]) => {
        let ast;
        try { ast = XmlAst.parse(src); } catch (e) { assert.ok(false, JSON.stringify(src) + ' threw ' + e.message); }
        assert.deepEqual(ast.errors.map((e) => e.code), expected, JSON.stringify(src));
        assert.equal(ast.wellFormed, false, JSON.stringify(src) + ' is not well-formed');
    });
    const err = XmlAst.parse('<a>\n  <b>&nbsp;</b>\n</a>').errors[0];
    assert.deepEqual([err.line, err.column, err.start, err.end], [1, 5, 9, 15]);
    assert.includes(err.message, '&#160;', 'the message says how to fix an HTML entity');
    assert.equal(XmlAst.parse('<a>&#x1F600;&#169;</a>').documentElement.children[0].value, '\u{1F600}©', 'astral and decimal references decode');
});

test('xml-ast: recovers a best-effort tree after errors', () => {
    const ast = XmlAst.parse('<root><p>one<p>two</root>');
    assert.deepEqual(ast.errors.map((e) => e.code), ['unclosed-element', 'unclosed-element']);
    const ps = XmlAst.findAll(ast, 'p');
    assert.equal(ps.length, 2);
    assert.equal(ps[1].parentId, ps[0].id, 'the second <p> nests inside the unclosed first');
    assert.equal(ps[0].closed, false);
    assert.equal(ast.documentElement.closed, true);
    assert.equal(XmlAst.textContent(ast.documentElement), 'onetwo');
});

test('xml-ast: enforces the Namespaces in XML constraints', () => {
    assert.deepEqual(codes('<x:a/>'), ['unbound-prefix']);
    assert.deepEqual(codes('<a x:b="1"/>'), ['unbound-prefix']);
    assert.deepEqual(codes('<a xmlns:n1="u" xmlns:n2="u" n1:x="1" n2:x="2"/>'), ['duplicate-attribute'], 'same expanded name (§6.3)');
    assert.deepEqual(codes('<a xmlns:n1="u" xmlns="u" x="1" n1:x="2"/>'), [], 'the default namespace does not apply to attributes');
    assert.deepEqual(codes('<a xmlns:p=""/>'), ['empty-prefix-binding']);
    assert.deepEqual(codes('<a xmlns:xml="urn:other"/>'), ['reserved-prefix']);
    assert.deepEqual(codes('<a xmlns:xmlns="urn:x"/>'), ['reserved-prefix']);
    assert.deepEqual(codes('<a xmlns="http://www.w3.org/2000/xmlns/"/>'), ['reserved-namespace']);
    assert.deepEqual(codes('<xmlns:a/>'), ['reserved-prefix']);
    assert.deepEqual(codes('<a:b:c xmlns:a="u"/>'), ['invalid-qname']);
    const ast = XmlAst.parse('<a xmlns="u1"><b xmlns=""><c/></b><d/></a>');
    assert.deepEqual(ast.elements.map((e) => e.ns), ['u1', null, null, 'u1'], 'xmlns="" undeclares the default for its scope only');
});

test('xml-ast: security: no external or parameter entities, nothing expanded, limits stop hostile input', () => {
    const xxe = '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>';
    const ast = XmlAst.parse(xxe);
    assert.deepEqual(ast.errors.map((e) => e.code), ['external-entity', 'external-entity-reference']);
    assert.equal(XmlAst.textContent(ast.documentElement), '&x;', 'the reference is left as written');
    assert.deepEqual(codes('<!DOCTYPE a [<!ENTITY % p "x"> %p;]><a/>'), ['parameter-entity', 'parameter-entity']);
    const lol = ['<!DOCTYPE a [<!ENTITY l0 "lol">'];
    for (let i = 1; i < 10; i++) lol.push('<!ENTITY l' + i + ' "' + ('&l' + (i - 1) + ';').repeat(10) + '">');
    const laughs = XmlAst.parse(lol.join('') + ']><a>&l9;</a>');
    assert.ok(laughs.wellFormed, 'internal entities are legal');
    assert.equal(XmlAst.textContent(laughs.documentElement), '&l9;', 'and never expanded');
    assert.deepEqual(codes('<a><a><a><a/></a></a></a>', { maxDepth: 3 }), ['depth-limit']);
    assert.deepEqual(codes('<a>' + 'x'.repeat(50) + '</a>', { maxLength: 40 }), ['size-limit']);
    assert.deepEqual(codes('<a b="1" c="2" d="3"/>', { maxAttributes: 2 }), ['attribute-limit']);
    const many = codes('<a>' + '&'.repeat(500) + '</a>');
    assert.equal(many.length, XmlAst.LIMITS.maxErrors + 1);
    assert.equal(many[many.length - 1], 'too-many-errors');
    const deep = '<a>'.repeat(300) + '</a>'.repeat(300);
    assert.deepEqual(codes(deep), ['depth-limit'], 'the default depth limit is ' + XmlAst.LIMITS.maxDepth);
    assert.deepEqual(codes('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd"><html/>'), [], 'an external DTD is recorded, never fetched');
});

test('xml-ast: a fragment may hold several top-level nodes and resolve prefixes from a given scope', () => {
    const ast = XmlAst.parse('text <dc:title>A</dc:title><dc:creator>B</dc:creator>', { fragment: true, namespaces: { dc: NS.dc } });
    assert.ok(ast.wellFormed, JSON.stringify(ast.errors));
    assert.equal(ast.documentElement, null);
    assert.deepEqual(ast.elements.map((e) => e.ns), [NS.dc, NS.dc]);
    assert.deepEqual(codes('<?xml version="1.0"?><a/>', { fragment: true }), ['misplaced-xml-declaration']);
});

test('xml-ast: applyEdits splices non-overlapping ranges and rejects overlaps', () => {
    assert.equal(XmlAst.applyEdits('abcdef', [{ start: 4, end: 5, text: 'E' }, { start: 1, end: 2, text: 'B' }, { start: 6, end: 6, text: '!' }]), 'aBcdEf!');
    assert.equal(XmlAst.applyEdits('ab', [{ start: 1, end: 1, text: 'x' }, { start: 1, end: 1, text: 'y' }]), 'axyb', 'insertions at one offset keep their order');
    assert.throws(() => XmlAst.applyEdits('abcdef', [{ start: 1, end: 4, text: '' }, { start: 3, end: 5, text: '' }]));
    assert.throws(() => XmlAst.applyEdits('abc', [{ start: 2, end: 9, text: '' }]));
});

test('xml-ast: OPF splices change only their range and keep the package well-formed', () => {
    const opf = fixture('content.opf');
    let ast = XmlAst.parse(opf);
    const title = XmlAst.find(ast, 'title', NS.dc);
    let out = edit(ast, XmlAst.setText(ast, title, 'Ledgers <Two> & More'));
    assert.deepEqual(one(ast, XmlAst.setText(ast, title, 'Ledgers <Two> & More')), { removed: 'The Quiet Ledger &amp; Other Stories', added: 'Ledgers &lt;Two&gt; &amp; More' });
    assert.equal(XmlAst.textContent(XmlAst.find(XmlAst.parse(out), 'title', NS.dc)), 'Ledgers <Two> & More');

    const pkg = ast.documentElement;
    assert.deepEqual(one(ast, XmlAst.setAttr(ast, pkg, 'unique-identifier', "it's")), { removed: 'pub-id', added: 'it&apos;s' }, 'the existing single quote is kept');
    const creator = XmlAst.find(ast, 'creator', NS.dc);
    assert.deepEqual(one(ast, XmlAst.setAttr(ast, creator, 'opf:role', 'edt')), { removed: 'aut', added: 'edt' });
    const css = XmlAst.findAll(ast, 'item', NS.opf)[1];
    out = edit(ast, XmlAst.setAttr(ast, css, 'properties', 'a\nb'));
    assert.includes(out, 'media-type="text/css" properties="a&#10;b" />', 'a new attribute goes after the last one, before the spacing');
    assert.throws(() => XmlAst.setAttr(ast, css, 'x:y', '1'), 'an unbound prefix is refused');
    assert.deepEqual(one(ast, XmlAst.removeAttr(ast, pkg, 'prefix')), { removed: '\n         prefix="rendition: http://www.idpf.org/vocab/rendition/#"', added: '' });
    assert.deepEqual(XmlAst.removeAttr(ast, pkg, 'missing'), []);

    const spine = XmlAst.find(ast, 'spine', NS.opf);
    const [ch1, ch2] = XmlAst.elementChildren(spine);
    assert.deepEqual(one(ast, XmlAst.remove(ast, ch1)), { removed: '    <itemref idref="ch1"/>\n', added: '' }, 'the whole line goes');
    assert.deepEqual(one(ast, XmlAst.insert(ast, spine, 'append', '<itemref idref="ch3"/>')), { removed: '', added: '    <itemref idref="ch3"/>\n' }, 'appended with the siblings\' indent');
    assert.deepEqual(one(ast, XmlAst.insert(ast, ch1, 'before', '<itemref idref="ch0"/>')), { removed: '', added: '<itemref idref="ch0"/>\n    ' });

    // Reorder the spine: move ch1 after ch2 in one atomic set of edits.
    const moved = edit(ast, XmlAst.remove(ast, ch1).concat(XmlAst.insert(ast, ch2, 'after', ast.text.slice(ch1.start, ch1.end))));
    const again = XmlAst.parse(moved);
    assert.ok(again.wellFormed);
    assert.deepEqual(XmlAst.findAll(again, 'itemref', NS.opf).map((el) => XmlAst.getAttr(el, 'idref')), ['ch2', 'ch1']);
    assert.equal(moved.length, opf.length);

    const meta = XmlAst.find(ast, 'metadata', NS.opf);
    out = edit(ast, XmlAst.insert(ast, meta, 'append', '<dc:publisher>Plainchant</dc:publisher>'));
    ast = XmlAst.parse(out);
    assert.ok(ast.wellFormed);
    assert.equal(XmlAst.find(ast, 'publisher', NS.dc).ns, NS.dc, 'the prefix resolves in its new context');
});

test('xml-ast: nav and XHTML splices keep tabs, entities, and the rest of the file', () => {
    const nav = fixture('nav.xhtml');
    const ast = XmlAst.parse(nav);
    const ol = XmlAst.find(ast, 'ol', NS.xhtml);
    let out;
    assert.deepEqual(one(ast, XmlAst.insert(ast, ol, 'append', '<li><a href="text/chapter-3.xhtml">III. Ledger</a></li>')), { removed: '', added: '\t\t\t<li><a href="text/chapter-3.xhtml">III. Ledger</a></li>\n' });
    out = edit(ast, XmlAst.insert(ast, ol, 'prepend', '<li>\n<a href="front.xhtml">Front</a>\n</li>'));
    assert.includes(out, '<ol>\n\t\t\t<li>\n\t\t\t<a href="front.xhtml">Front</a>\n\t\t\t</li>\n\t\t\t<li><a href="text/chapter-1.xhtml">', 'continuation lines are indented to the target');
    const toc = XmlAst.find(ast, 'nav', NS.xhtml);
    assert.deepEqual(one(ast, XmlAst.setAttr(ast, toc, 'epub:type', 'toc landmarks')), { removed: 'toc', added: 'toc landmarks' });
    assert.throws(() => XmlAst.insert(ast, ol, 'append', '<li>unclosed'), 'markup that would break the file is refused');
    assert.throws(() => XmlAst.insert(ast, ol, 'append', '<li>&nbsp;</li>'), 'an HTML entity is refused');
    assert.throws(() => XmlAst.insert(ast, ast.documentElement, 'after', '<x/>'));
    assert.throws(() => XmlAst.remove(ast, ast.documentElement));

    const ch = fixture('chapter.xhtml');
    const cAst = XmlAst.parse(ch);
    const img = XmlAst.find(cAst, 'img', NS.xhtml);
    assert.deepEqual(one(cAst, XmlAst.setAttr(cAst, img, 'alt', 'A ledger, open at "March"')), { removed: 'An open ledger', added: 'A ledger, open at &quot;March&quot;' });
    out = edit(cAst, XmlAst.setText(cAst, img, 'x'));
    assert.includes(out, '<img src="../images/ledger.jpg" alt="An open ledger">x</img>', 'setText on an empty-element tag opens it');
    const pi = XmlAst.find(cAst, 'section', NS.xhtml).children.find((c) => c.type === 'pi');
    assert.deepEqual(one(cAst, XmlAst.remove(cAst, pi)), { removed: '    <?page-break-hint after?>\n', added: '' });
    const em = XmlAst.find(cAst, 'em', NS.xhtml);
    assert.deepEqual(one(cAst, XmlAst.insert(cAst, em, 'after', '<strong>!</strong>')), { removed: '', added: '<strong>!</strong>' }, 'inline content gets no new white space');
    [ch, out].forEach((t) => assert.ok(XmlAst.parse(t).wellFormed));
});

test('xml-ast: edits use the file\'s line ends, expand an empty element, and refuse a broken file', () => {
    const crlf = '<package>\r\n  <spine/>\r\n</package>\r\n';
    const ast = XmlAst.parse(crlf);
    const spine = XmlAst.find(ast, 'spine');
    const out = edit(ast, XmlAst.insert(ast, spine, 'append', '<itemref idref="a"/>'));
    assert.equal(out, '<package>\r\n  <spine>\r\n    <itemref idref="a"/>\r\n  </spine>\r\n</package>\r\n');
    const empty = XmlAst.parse('<a>\n  <b></b>\n</a>');
    assert.equal(edit(empty, XmlAst.insert(empty, XmlAst.find(empty, 'b'), 'prepend', '<c/>')), '<a>\n  <b>\n    <c/>\n  </b>\n</a>');
    const broken = XmlAst.parse('<a><b></a>');
    let threw = null;
    try { XmlAst.setAttr(broken, broken.elements[1], 'x', '1'); } catch (e) { threw = e.code; }
    assert.equal(threw, 'not-well-formed');
    const other = XmlAst.parse('<a/>');
    threw = null;
    try { XmlAst.setAttr(ast, other.documentElement, 'x', '1'); } catch (e) { threw = e.code; }
    assert.equal(threw, 'unknown-node', 'an element from another parse is refused');
});
