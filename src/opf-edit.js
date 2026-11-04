/*
 * OpfEdit: edits to the package document as splices (P1-04, D-015).
 *
 * Every operation takes a fresh model from Book.read and returns XmlAst edits [{ start, end, text }] for the OPF
 * text the model was read from. The caller applies them with XmlAst.applyEdits and reads the book again before the
 * next operation; edits from two operations on one model are not meant to be combined. Only the ranges an edit
 * names change (D-002). Operations throw an Error with a .code when the result would break the package's structure
 * (a bad or repeated id, an unknown idref, a bad media type, markup that is not well-formed). Edits that only leave
 * a package rule unmet, such as removing the last title, are allowed; Book.read reports those.
 * dcterms:modified changes only through touchModified.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'));
    else root.OpfEdit = factory(root.XmlAst, root.Book);
})(typeof self !== 'undefined' ? self : this, function (XmlAst, Book) {
    'use strict';

    const NS = Book.NS;
    // EPUB 3.3 §5.5.3: the metadata may hold any of the fifteen DCMES elements.
    const DCMES = ['contributor', 'coverage', 'creator', 'date', 'description', 'format', 'identifier', 'language', 'publisher', 'relation', 'rights', 'source', 'subject', 'title', 'type'];
    // RFC 6838 §4.2: type "/" subtype, each a restricted name; parameters may follow.
    const MEDIA_RE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}(?:[ \t]*;.*)?$/;
    // EPUB 3.3 §5.3.4 property data type: an optional prefix (an NCName) and a reference with no white space.
    const PROPERTY_RE = /^[^\s:]+(?::[^\s]+)?$/;

    function fail(code, message) {
        const e = new Error(message);
        e.code = code;
        return e;
    }

    // XML 1.0 §3.3.1 and Namespaces in XML 1.0 §3: an id is a name with no colon.
    const isNcName = (s) => typeof s === 'string' && s !== '' && XmlAst.splitQName('x:' + s).ok && XmlAst.splitQName('x:' + s).local === s;
    const tokens = (v) => (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[ \t\r\n]+/)).map(String).filter(Boolean);

    function astOf(model) {
        if (!model || !model.ast || !model.ast.wellFormed) throw fail('not-well-formed', 'There is no well-formed package document to edit; read the book with Book.read first.');
        return model.ast;
    }

    function owned(model, entry) {
        const ast = astOf(model);
        if (!entry || !entry.node || ast.byId[entry.node.id] !== entry.node) throw fail('unknown-entry', 'The entry does not belong to this reading of the package document.');
        return ast;
    }

    function sectionNode(model, name) {
        const node = XmlAst.elementChildren(model.package.node).find((el) => el.ns === NS.opf && el.local === name);
        if (!node) throw fail('missing-section', 'The package document has no <' + name + '> to edit (EPUB 3.3 §5.4).');
        return node;
    }

    function allIds(model) {
        const ids = new Set();
        model.ast.elements.forEach((el) => { const id = XmlAst.getAttr(el, 'id'); if (id != null) ids.add(id); });
        return ids;
    }

    function checkNewId(model, id) {
        if (!isNcName(id)) throw fail('invalid-id', '"' + id + '" is not a valid id: it must be an XML name with no colon (XML 1.0 §3.3.1).');
        if (allIds(model).has(id)) throw fail('duplicate-id', 'The id "' + id + '" is already used in the package document (XML 1.0 §3.3.1).');
    }

    function uniqueId(model, base) {
        const ids = allIds(model);
        const stem = isNcName(base) ? base : 'meta';
        let id = stem;
        for (let n = 2; ids.has(id); n++) id = stem + '-' + n;
        return id;
    }

    // The qualified name to write for a new element in ns, and a namespace declaration if no prefix is bound.
    function nameFor(scopeEl, ns, local, prefer) {
        const sc = scopeEl.nsScope;
        if (sc[''] === ns) return { name: local, decl: '' };
        for (const k in sc) if (k !== '' && sc[k] === ns) return { name: k + ':' + local, decl: '' };
        if (prefer && sc[prefer] === undefined) return { name: prefer + ':' + local, decl: ' xmlns:' + prefer + '="' + ns + '"' };
        return { name: local, decl: ' xmlns="' + ns + '"' };
    }

    function markup(scopeEl, ns, local, attrs, text, prefer) {
        const q = nameFor(scopeEl, ns, local, prefer);
        const a = attrs.filter((p) => p[1] != null && p[1] !== '').map((p) => ' ' + p[0] + '="' + XmlAst.escapeAttr(p[1], '"') + '"').join('');
        return '<' + q.name + q.decl + a + (text == null ? '/>' : '>' + XmlAst.escapeText(text) + '</' + q.name + '>');
    }

    // An entry and every entry that refines it, directly or through a chain.
    function withRefinements(entry) {
        const out = [], seen = new Set();
        (function walk(e) {
            if (seen.has(e)) return;
            seen.add(e);
            out.push(e);
            (e.refinements || []).forEach(walk);
        })(entry);
        return out;
    }

    // The last node of an entry's block (itself or a refinement), so a new sibling goes after its refinements.
    const blockEnd = (entry) => withRefinements(entry).map((e) => e.node).reduce((a, b) => (b.end > a.end ? b : a));

    const removeAll = (ast, nodes) => nodes.reduce((edits, n) => edits.concat(XmlAst.remove(ast, n)), []);

    /* ---------- metadata ---------- */

    function setValue(model, entry, value) {
        return XmlAst.setText(owned(model, entry), entry.node, value);
    }

    function addDc(model, name, value, options) {
        const ast = astOf(model);
        const o = options || {};
        if (DCMES.indexOf(name) === -1) throw fail('invalid-name', '"' + name + '" is not a Dublin Core element (EPUB 3.3 §5.5.3).');
        if (o.id != null) checkNewId(model, o.id);
        const metadata = sectionNode(model, 'metadata');
        const el = markup(metadata, NS.dc, name, [['id', o.id], ['xml:lang', o.lang], ['dir', o.dir]], value, 'dc');
        const dc = model.metadata.dc;
        const same = dc.filter((e) => e.name === name);
        const anchor = same.length ? same[same.length - 1] : dc[dc.length - 1];
        return anchor ? XmlAst.insert(ast, blockEnd(anchor), 'after', el) : XmlAst.insert(ast, metadata, 'prepend', el);
    }

    function setFirstDc(model, name, value) {
        const list = model.metadata.dc.filter((e) => e.name === name);
        return list.length ? setValue(model, list[0], value) : addDc(model, name, value);
    }

    // Removes a metadata entry (dc element, meta, or link) and everything that refines it.
    function removeMetadata(model, entry) {
        const ast = owned(model, entry);
        return removeAll(ast, withRefinements(entry).map((e) => e.node));
    }

    function checkProperty(property) {
        if (typeof property !== 'string' || !PROPERTY_RE.test(property)) throw fail('invalid-name', '"' + property + '" is not a valid property (EPUB 3.3 §5.3.4).');
    }

    // Sets the book-level <meta property> (no refines), adding it at the end of the metadata if absent.
    function setMeta(model, property, value, options) {
        const ast = astOf(model);
        checkProperty(property);
        const found = model.metadata.metas.find((m) => m.property === property && m.refines == null);
        if (found) return setValue(model, found, value);
        const o = options || {};
        if (o.id != null) checkNewId(model, o.id);
        const metadata = sectionNode(model, 'metadata');
        return XmlAst.insert(ast, metadata, 'append', markup(metadata, NS.opf, 'meta', [['property', property], ['scheme', o.scheme], ['id', o.id]], value));
    }

    function removeMeta(model, property) {
        const ast = astOf(model);
        const found = model.metadata.metas.filter((m) => m.property === property && m.refines == null);
        return removeAll(ast, [].concat.apply([], found.map((m) => withRefinements(m).map((e) => e.node))));
    }

    // Sets a refinement such as file-as or role on a metadata entry or manifest item, giving it an id if it has none.
    function setRefinement(model, entry, property, value, options) {
        const ast = owned(model, entry);
        checkProperty(property);
        const found = (entry.refinements || []).find((r) => r.property === property);
        if (found) return setValue(model, found, value);
        const o = options || {};
        const edits = [];
        let id = entry.id;
        if (id == null) {
            id = uniqueId(model, entry.name || 'item');
            edits.push.apply(edits, XmlAst.setAttr(ast, entry.node, 'id', id));
        }
        const metadata = sectionNode(model, 'metadata');
        // EPUB 3.3 §5.3.6: refines is a URL whose fragment names the subject's id.
        const el = markup(metadata, NS.opf, 'meta', [['refines', '#' + id], ['property', property], ['scheme', o.scheme]], value);
        const inMetadata = entry.node.parentId === metadata.id;
        return edits.concat(inMetadata ? XmlAst.insert(ast, blockEnd(entry), 'after', el) : XmlAst.insert(ast, metadata, 'append', el));
    }

    // EPUB 3.3 §5.5.5: dcterms:modified is UTC, YYYY-MM-DDThh:mm:ssZ.
    function modifiedStamp(now) {
        const d = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
        if (isNaN(d.getTime())) throw fail('invalid-date', 'Invalid modification date.');
        return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
    }

    const touchModified = (model, now) => setMeta(model, 'dcterms:modified', modifiedStamp(now));

    /* ---------- manifest ---------- */

    function itemById(model, id) {
        astOf(model);
        const item = model.manifest.byId[id];
        if (!item) throw fail('unknown-item', 'No manifest item has the id "' + id + '".');
        return item;
    }

    const hrefFor = (opfPath, path) => Book.hrefFor(opfPath, path);

    function checkPath(model, path, except) {
        if (typeof path !== 'string' || path === '' || path.startsWith('/') || path.indexOf('\\') !== -1 || !path.split('/').every((s) => s && s !== '.' && s !== '..')) {
            throw fail('invalid-path', '"' + path + '" is not a path inside the book.');
        }
        // EPUB 3.3 §4.2.2 and §5.6.1: the mimetype file, META-INF, and the package document are not listed.
        if (path === model.opfPath || path === 'mimetype' || path.startsWith('META-INF/')) throw fail('reserved-path', '"' + path + '" cannot be a manifest item (EPUB 3.3 §4.2.2, §5.6.1).');
        if (model.manifest.items.some((i) => i !== except && i.path === path)) throw fail('duplicate-href', '"' + path + '" is already in the manifest (EPUB 3.3 §5.6.2).');
        const href = hrefFor(model.opfPath, path);
        if (Book.resolveHref(model.opfPath, href).path !== path) throw fail('invalid-path', '"' + path + '" cannot be written as a URL relative to the package document.');
        return href;
    }

    function checkMediaType(mediaType) {
        if (typeof mediaType !== 'string' || !MEDIA_RE.test(mediaType)) throw fail('invalid-media-type', '"' + mediaType + '" is not a media type (RFC 6838 §4.2).');
    }

    function checkIdref(model, idref, what) {
        if (idref != null && !model.manifest.byId[idref]) throw fail('unknown-idref', what + ' "' + idref + '" does not name a manifest item (EPUB 3.3 §5.6.2).');
    }

    // item: { id, path, mediaType, properties, fallback, mediaOverlay }. Added at the end of the manifest.
    function addItem(model, item) {
        const ast = astOf(model);
        const it = item || {};
        const manifest = sectionNode(model, 'manifest');
        checkNewId(model, it.id);
        const href = checkPath(model, it.path, null);
        checkMediaType(it.mediaType);
        checkIdref(model, it.fallback, 'fallback');
        checkIdref(model, it.mediaOverlay, 'media-overlay');
        const props = tokens(it.properties).join(' ');
        const el = markup(manifest, NS.opf, 'item', [['id', it.id], ['href', href], ['media-type', it.mediaType], ['fallback', it.fallback], ['media-overlay', it.mediaOverlay], ['properties', props]], null);
        return XmlAst.insert(ast, manifest, 'append', el);
    }

    // Removes an item with its itemrefs and refinements, the spine's NCX toc attribute, and the EPUB 2 cover meta
    // that name it. Refuses the nav document and an item another item uses as a fallback or media overlay.
    function removeItem(model, id) {
        const item = itemById(model, id);
        const ast = model.ast;
        if (item.properties.indexOf('nav') !== -1) throw fail('item-is-nav', '"' + id + '" is the navigation document, which an EPUB 3 book needs (EPUB 3.3 §7).');
        const users = model.manifest.items.filter((i) => i !== item && (i.fallback === id || i.mediaOverlay === id));
        if (users.length) {
            const e = fail('item-in-use', '"' + id + '" is the fallback or media overlay of ' + users.map((u) => '"' + u.id + '"').join(', ') + '.');
            e.users = users.map((u) => u.id);
            throw e;
        }
        let nodes = withRefinements(item).map((e) => e.node);
        nodes = nodes.concat(model.spine.itemrefs.filter((r) => r.idref === id).map((r) => r.node));
        if (model.legacy.cover && model.legacy.cover.content === id) nodes.push(model.legacy.cover.node);
        let edits = removeAll(ast, nodes);
        if (model.spine.toc === id) edits = edits.concat(XmlAst.removeAttr(ast, model.spine.node, 'toc'));
        return edits;
    }

    // Changes an item's id and every reference to it in the package document. Links in content documents are
    // not touched: they use hrefs, not ids.
    function renameItem(model, oldId, newId) {
        const item = itemById(model, oldId);
        const ast = model.ast;
        if (newId === oldId) return [];
        checkNewId(model, newId);
        const set = (el, attr) => XmlAst.setAttr(ast, el, attr, newId);
        let edits = set(item.node, 'id');
        model.spine.itemrefs.filter((r) => r.idref === oldId).forEach((r) => { edits = edits.concat(set(r.node, 'idref')); });
        model.manifest.items.forEach((i) => {
            if (i.fallback === oldId) edits = edits.concat(set(i.node, 'fallback'));
            if (i.mediaOverlay === oldId) edits = edits.concat(set(i.node, 'media-overlay'));
        });
        if (model.spine.toc === oldId) edits = edits.concat(set(model.spine.node, 'toc'));
        if (model.legacy.cover && model.legacy.cover.content === oldId) edits = edits.concat(set(model.legacy.cover.node, 'content'));
        item.refinements.forEach((r) => {
            edits = edits.concat(XmlAst.setAttr(ast, r.node, 'refines', r.refines.slice(0, r.refines.indexOf('#') + 1) + newId));
        });
        return edits;
    }

    // Points an item at another container path. The file itself, and links to it, are not moved here.
    function setItemPath(model, id, path) {
        const item = itemById(model, id);
        return XmlAst.setAttr(model.ast, item.node, 'href', checkPath(model, path, item));
    }

    function setItemMediaType(model, id, mediaType) {
        const item = itemById(model, id);
        checkMediaType(mediaType);
        return XmlAst.setAttr(model.ast, item.node, 'media-type', mediaType);
    }

    function setItemProperties(model, id, properties) {
        const item = itemById(model, id);
        const list = tokens(properties);
        return list.length ? XmlAst.setAttr(model.ast, item.node, 'properties', list.join(' ')) : XmlAst.removeAttr(model.ast, item.node, 'properties');
    }

    /* ---------- spine ---------- */

    // Adds an itemref at index (default: the end). EPUB 3.3 §5.7.2: an item is in the spine at most once.
    function addItemref(model, idref, options) {
        const ast = astOf(model);
        const o = options || {};
        const spine = sectionNode(model, 'spine');
        checkIdref(model, idref, 'idref');
        if (idref == null) throw fail('unknown-idref', 'An itemref needs an idref (EPUB 3.3 §5.7.2).');
        const refs = model.spine.itemrefs;
        if (refs.some((r) => r.idref === idref)) throw fail('itemref-repeated', '"' + idref + '" is already in the spine (EPUB 3.3 §5.7.2).');
        const index = o.index == null ? refs.length : o.index;
        if (!Number.isInteger(index) || index < 0 || index > refs.length) throw fail('invalid-index', 'Spine position ' + index + ' is outside 0 to ' + refs.length + '.');
        const el = markup(spine, NS.opf, 'itemref', [['idref', idref], ['linear', o.linear === false ? 'no' : null]], null);
        if (index < refs.length) return XmlAst.insert(ast, refs[index].node, 'before', el);
        return refs.length ? XmlAst.insert(ast, refs[refs.length - 1].node, 'after', el) : XmlAst.insert(ast, spine, 'append', el);
    }

    function removeItemref(model, idref) {
        const ast = astOf(model);
        const refs = model.spine.itemrefs.filter((r) => r.idref === idref);
        if (!refs.length) throw fail('not-in-spine', '"' + idref + '" is not in the spine.');
        return removeAll(ast, refs.map((r) => r.node));
    }

    function setItemrefLinear(model, idref, linear) {
        const ast = astOf(model);
        const ref = model.spine.itemrefs.find((r) => r.idref === idref);
        if (!ref) throw fail('not-in-spine', '"' + idref + '" is not in the spine.');
        if (linear === false) return XmlAst.setAttr(ast, ref.node, 'linear', 'no');
        return XmlAst.getAttr(ref.node, 'linear') == null ? [] : XmlAst.setAttr(ast, ref.node, 'linear', 'yes');
    }

    // Each itemref moves as a chunk: the text after the previous itemref up to its own end, so comments and
    // spacing before an itemref travel with it. One edit replaces the itemref run; the text around it stays.
    function reorder(model, order) {
        const ast = astOf(model);
        const refs = model.spine.itemrefs;
        if (!refs.length || order.every((r, i) => r === refs[i])) return [];
        const text = ast.text;
        const chunk = new Map(refs.map((r, i) => [r, text.slice(i ? refs[i - 1].node.end : model.spine.node.openEnd, r.node.end)]));
        return [{ start: model.spine.node.openEnd, end: refs[refs.length - 1].node.end, text: order.map((r) => chunk.get(r)).join('') }];
    }

    function setSpineOrder(model, idrefs) {
        astOf(model);
        const queues = {};
        model.spine.itemrefs.forEach((r) => { (queues[r.idref] = queues[r.idref] || []).push(r); });
        const list = Array.isArray(idrefs) ? idrefs : [];
        const order = list.map((id) => (queues[id] && queues[id].length ? queues[id].shift() : null));
        if (list.length !== model.spine.itemrefs.length || order.indexOf(null) !== -1) {
            throw fail('spine-order-mismatch', 'The new order must list exactly the itemrefs already in the spine.');
        }
        return reorder(model, order);
    }

    function moveItemref(model, idref, toIndex) {
        astOf(model);
        const refs = model.spine.itemrefs.slice();
        const from = refs.findIndex((r) => r.idref === idref);
        if (from === -1) throw fail('not-in-spine', '"' + idref + '" is not in the spine.');
        if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= refs.length) throw fail('invalid-index', 'Spine position ' + toIndex + ' is outside 0 to ' + (refs.length - 1) + '.');
        const moved = refs.splice(from, 1)[0];
        refs.splice(toIndex, 0, moved);
        return reorder(model, refs);
    }

    return {
        DCMES: DCMES,
        hrefFor: hrefFor,
        modifiedStamp: modifiedStamp,
        setValue: setValue,
        addDc: addDc,
        setTitle: (model, value) => setFirstDc(model, 'title', value),
        setLanguage: (model, value) => setFirstDc(model, 'language', value),
        removeMetadata: removeMetadata,
        setMeta: setMeta,
        removeMeta: removeMeta,
        setRefinement: setRefinement,
        touchModified: touchModified,
        addItem: addItem,
        removeItem: removeItem,
        renameItem: renameItem,
        setItemPath: setItemPath,
        setItemMediaType: setItemMediaType,
        setItemProperties: setItemProperties,
        addItemref: addItemref,
        removeItemref: removeItemref,
        setItemrefLinear: setItemrefLinear,
        setSpineOrder: setSpineOrder,
        moveItemref: moveItemref
    };
});
