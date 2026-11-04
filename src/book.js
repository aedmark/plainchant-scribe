/*
 * Book: reads a book's package document into a model and reports package-level problems (P1-03, D-014).
 *
 * Book.read(files, options) takes the working copy's text files keyed by container path (and, in
 * options.assets, the paths of binary files) and returns { model, problems }. The model is a fresh read of
 * the OPF as it is on disk; its entries carry their XmlAst nodes so P1-04 can splice them, and it is never
 * written back (D-002). Problems are { severity, code, message, path, start, end, line }: errors are EPUB 3.3
 * MUSTs, warnings SHOULDs, info legacy notes. Cross-file content checks belong to P5-04.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'));
    else root.Book = factory(root.XmlAst);
})(typeof self !== 'undefined' ? self : this, function (XmlAst) {
    'use strict';

    const NS = {
        opf: 'http://www.idpf.org/2007/opf',
        dc: 'http://purl.org/dc/elements/1.1/',
        container: 'urn:oasis:names:tc:opendocument:xmlns:container'
    };
    const CONTAINER_PATH = 'META-INF/container.xml';
    const OPF_TYPE = 'application/oebps-package+xml';
    const CONTENT_TYPES = { 'application/xhtml+xml': true, 'image/svg+xml': true };
    const LANG_RE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;
    const MODIFIED_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
    const SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;

    const collapse = (s) => String(s || '').replace(/[ \t\n\r\f]+/g, ' ').trim();
    const tokens = (s) => collapse(s).split(' ').filter(Boolean);
    const dirOf = (path) => (path.lastIndexOf('/') === -1 ? '' : path.slice(0, path.lastIndexOf('/') + 1));

    // Resolves a path-relative URL against a container path (EPUB 3.3 §4.2.5, §5.2). Remote URLs give { remote }.
    function resolveHref(base, href) {
        const raw = String(href == null ? '' : href);
        if (SCHEME_RE.test(raw) || raw.startsWith('//')) return { remote: true, path: null, fragment: null };
        const hash = raw.indexOf('#');
        const fragment = hash === -1 ? null : raw.slice(hash + 1);
        const noFrag = (hash === -1 ? raw : raw.slice(0, hash)).split('?')[0];
        if (noFrag === '') return { path: base, fragment: fragment };
        const parts = noFrag.startsWith('/') ? [] : dirOf(base).split('/').filter(Boolean);
        const segs = noFrag.split('/');
        for (let i = 0; i < segs.length; i++) {
            let seg;
            try { seg = decodeURIComponent(segs[i]); } catch (e) { return { invalid: true, path: null, fragment: fragment }; }
            if (seg === '..') { if (!parts.length) return { outside: true, path: null, fragment: fragment }; parts.pop(); }
            else if (seg && seg !== '.') parts.push(seg);
        }
        return { path: parts.join('/'), fragment: fragment };
    }

    // A path-relative URL from one container path to another, percent-encoded per segment (EPUB 3.3 §4.2.5).
    function hrefFor(fromPath, path) {
        const from = fromPath.split('/').slice(0, -1), to = path.split('/');
        let i = 0;
        while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
        return from.slice(i).map(() => '..').concat(to.slice(i).map(encodeURIComponent)).join('/');
    }

    function read(files, options) {
        const f = files || {};
        const assets = new Set((options && options.assets) || []);
        const exists = (p) => Object.prototype.hasOwnProperty.call(f, p) || assets.has(p);
        const problems = [];
        let ast = null, path = CONTAINER_PATH;

        function report(severity, code, message, node) {
            const start = node ? node.start : 0;
            const end = node ? (node.openEnd || node.end) : 0;
            problems.push({ severity: severity, code: code, message: message, path: path, start: start, end: end, line: ast && node ? XmlAst.position(ast, start).line : 0 });
        }
        const err = (code, msg, node) => report('error', code, msg, node);

        function parseXml(p) {
            path = p;
            ast = XmlAst.parse(f[p]);
            ast.errors.forEach((e) => problems.push({ severity: 'error', code: 'xml-' + e.code, message: e.message, path: p, start: e.start, end: e.end, line: e.line }));
            return ast.wellFormed ? ast : null;
        }

        // EPUB 3.3 §4.2.6.3.1: META-INF/container.xml names the package document.
        if (!exists(CONTAINER_PATH) || typeof f[CONTAINER_PATH] !== 'string') {
            err('container-missing', 'META-INF/container.xml is missing; it is required and names the package document (EPUB 3.3 §4.2.6.3.1).');
            return { model: null, problems: problems };
        }
        const container = parseXml(CONTAINER_PATH);
        if (!container) return { model: null, problems: problems };
        const rootfile = XmlAst.findAll(container, 'rootfile', NS.container).find((r) => XmlAst.getAttr(r, 'media-type') === OPF_TYPE);
        const fullPath = rootfile && XmlAst.getAttr(rootfile, 'full-path');
        if (!fullPath) {
            err('rootfile-missing', 'container.xml has no rootfile with full-path and media-type "' + OPF_TYPE + '" (EPUB 3.3 §4.2.6.3.1.3).', rootfile || container.documentElement);
            return { model: null, problems: problems };
        }
        const opfRef = resolveHref('', fullPath);
        if (!opfRef.path || typeof f[opfRef.path] !== 'string') {
            err('package-missing', 'The package document "' + fullPath + '" named in container.xml is not in the book.', rootfile);
            return { model: null, problems: problems };
        }
        const opfPath = opfRef.path;
        const opf = parseXml(opfPath);
        if (!opf) return { model: null, problems: problems };

        const pkg = opf.documentElement;
        if (pkg.local !== 'package' || pkg.ns !== NS.opf) {
            err('package-root', 'The root element must be <package> in the OPF namespace (EPUB 3.3 §5.4).', pkg);
            return { model: null, problems: problems };
        }
        const attr = (el, name, ns) => XmlAst.getAttr(el, name, ns);
        const model = {
            opfPath: opfPath,
            package: {
                version: attr(pkg, 'version'), uniqueIdentifier: attr(pkg, 'unique-identifier'), prefix: attr(pkg, 'prefix'),
                lang: attr(pkg, 'lang', XmlAst.NS_XML), dir: attr(pkg, 'dir'), id: attr(pkg, 'id'), node: pkg
            },
            metadata: { identifiers: [], titles: [], languages: [], creators: [], contributors: [], dc: [], metas: [], links: [], uniqueIdentifier: null, title: null, language: null, modified: null },
            manifest: { items: [], byId: {}, node: null },
            spine: { itemrefs: [], node: null, pageProgressionDirection: null, toc: null },
            nav: null,
            cover: null,
            coverSource: null,
            legacy: { cover: null, guide: null, ncx: null, metas: [] }
        };
        Object.defineProperty(model, 'ast', { value: opf, enumerable: false });

        // EPUB 3.3 §5.4: version "3.0"; metadata, manifest, spine, in that order, first.
        if (model.package.version !== '3.0') err('package-version', 'The package version is "' + (model.package.version || '') + '"; an EPUB 3 book must say "3.0" (EPUB 3.3 §5.4).', pkg);
        const kids = XmlAst.elementChildren(pkg).filter((el) => el.ns === NS.opf);
        const section = (name) => kids.find((el) => el.local === name) || null;
        const metadata = section('metadata'), manifest = section('manifest'), spine = section('spine');
        [['metadata', metadata], ['manifest', manifest], ['spine', spine]].forEach(([name, el]) => {
            if (!el) err('missing-' + name, 'The package document has no <' + name + '> (EPUB 3.3 §5.4).', pkg);
        });
        const order = kids.map((el) => el.local).filter((n) => n === 'metadata' || n === 'manifest' || n === 'spine');
        if (metadata && manifest && spine && (order.join() !== 'metadata,manifest,spine' || kids.indexOf(spine) !== 2)) {
            err('package-order', '<metadata>, <manifest>, and <spine> must be the first three children, in that order (EPUB 3.3 §5.4).', pkg);
        }

        // XML 1.0 §3.3.1 (Validity constraint: ID): every id in the document is unique.
        const ids = {};
        opf.elements.forEach((el) => {
            const id = attr(el, 'id');
            if (id == null) return;
            if (ids[id]) err('duplicate-id', 'The id "' + id + '" is used more than once.', el);
            else ids[id] = el;
        });

        const entryFor = new Map();
        const lang = (el) => attr(el, 'lang', XmlAst.NS_XML);
        if (metadata) {
            const md = model.metadata;
            XmlAst.elementChildren(metadata).forEach((el) => {
                if (el.ns === NS.dc) {
                    const entry = { name: el.local, value: collapse(XmlAst.textContent(el)), id: attr(el, 'id'), lang: lang(el), dir: attr(el, 'dir'), node: el, refinements: [] };
                    // EPUB 3.3 §5.5.2: values are non-empty after white space is stripped.
                    if (!entry.value) err('empty-value', '<' + el.name + '> is empty (EPUB 3.3 §5.5.2).', el);
                    md.dc.push(entry);
                    entryFor.set(el, entry);
                    const list = { identifier: md.identifiers, title: md.titles, language: md.languages, creator: md.creators, contributor: md.contributors }[el.local];
                    if (list) list.push(entry);
                } else if (el.ns === NS.opf && el.local === 'meta') {
                    if (attr(el, 'property') == null) {
                        model.legacy.metas.push({ name: attr(el, 'name'), content: attr(el, 'content'), node: el });
                        return;
                    }
                    const entry = { property: collapse(attr(el, 'property')), value: collapse(XmlAst.textContent(el)), id: attr(el, 'id'), refines: attr(el, 'refines'), scheme: attr(el, 'scheme'), lang: lang(el), dir: attr(el, 'dir'), node: el, refinements: [] };
                    if (!entry.value) err('empty-value', '<meta property="' + entry.property + '"> is empty (EPUB 3.3 §5.5.2).', el);
                    md.metas.push(entry);
                    entryFor.set(el, entry);
                } else if (el.ns === NS.opf && el.local === 'link') {
                    const entry = { rel: tokens(attr(el, 'rel')), href: attr(el, 'href'), mediaType: attr(el, 'media-type'), properties: tokens(attr(el, 'properties')), refines: attr(el, 'refines'), id: attr(el, 'id'), hreflang: attr(el, 'hreflang'), node: el, refinements: [] };
                    md.links.push(entry);
                    entryFor.set(el, entry);
                }
            });
            // EPUB 3.3 §5.5.1 and §5.5.3.1: at least one identifier, title, and language.
            [['identifier', md.identifiers], ['title', md.titles], ['language', md.languages]].forEach(([name, list]) => {
                if (!list.length) err('missing-' + name, 'The metadata has no <dc:' + name + '> (EPUB 3.3 §5.5.1).', metadata);
            });
            if (md.titles.length > 1) report('warning', 'multiple-titles', 'There are ' + md.titles.length + ' titles; reading systems may show any of them, so use one where possible (EPUB 3.3 §5.5.3.1.2).', md.titles[1].node);
            md.languages.forEach((l) => {
                if (l.value && !LANG_RE.test(l.value)) err('language-tag', '"' + l.value + '" is not a well-formed language tag (EPUB 3.3 §5.5.3.1.3).', l.node);
            });
            md.title = md.titles.length ? md.titles[0].value : null;
            md.language = md.languages.length ? md.languages[0].value : null;
            // EPUB 3.3 §5.4, §5.5.3.1.1: unique-identifier names the dc:identifier that holds the unique identifier.
            const uid = model.package.uniqueIdentifier;
            if (!uid) err('unique-identifier-missing', '<package> has no unique-identifier attribute (EPUB 3.3 §5.4).', pkg);
            else {
                md.uniqueIdentifier = md.identifiers.find((i) => i.id === uid) || null;
                if (!md.uniqueIdentifier) err('unique-identifier-dangling', 'unique-identifier="' + uid + '" does not name a <dc:identifier> (EPUB 3.3 §5.5.3.1.1).', pkg);
            }
            // EPUB 3.3 §5.5.5: exactly one dcterms:modified with no refines, YYYY-MM-DDThh:mm:ssZ.
            const modified = md.metas.filter((m) => m.property === 'dcterms:modified' && !m.refines);
            if (!modified.length) err('modified-missing', 'There is no <meta property="dcterms:modified"> (EPUB 3.3 §5.5.5).', metadata);
            else {
                if (modified.length > 1) err('modified-repeated', 'There is more than one dcterms:modified for the book (EPUB 3.3 §5.5.5).', modified[1].node);
                md.modified = modified[0].value;
                if (!MODIFIED_RE.test(md.modified)) err('modified-format', 'dcterms:modified "' + md.modified + '" must look like 2026-11-03T12:00:00Z (EPUB 3.3 §5.5.5).', modified[0].node);
            }
        }

        if (manifest) {
            model.manifest.node = manifest;
            const seenPath = {};
            const items = XmlAst.elementChildren(manifest).filter((el) => el.ns === NS.opf && el.local === 'item');
            if (!items.length) err('manifest-empty', 'The manifest lists no items (EPUB 3.3 §5.6.1).', manifest);
            items.forEach((el) => {
                const item = {
                    id: attr(el, 'id'), href: attr(el, 'href'), path: null, remote: false, mediaType: attr(el, 'media-type'),
                    properties: tokens(attr(el, 'properties')), fallback: attr(el, 'fallback'), mediaOverlay: attr(el, 'media-overlay'), exists: false, node: el, refinements: []
                };
                // EPUB 3.3 §5.6.2: id, href, and media-type are required.
                ['id', 'href', 'media-type'].forEach((a) => { if (attr(el, a) == null) err('item-' + a + '-missing', '<item> has no ' + a + ' attribute (EPUB 3.3 §5.6.2).', el); });
                if (item.href != null) {
                    const r = resolveHref(opfPath, item.href);
                    if (r.remote) item.remote = true;
                    else if (r.outside || r.invalid) err('item-href-invalid', 'href="' + item.href + '" ' + (r.outside ? 'points outside the book.' : 'is not a valid URL.'), el);
                    else {
                        item.path = r.path;
                        item.exists = exists(r.path);
                        if (seenPath[r.path]) err('duplicate-href', '"' + r.path + '" is listed twice in the manifest (EPUB 3.3 §5.6.2).', el);
                        seenPath[r.path] = true;
                        if (r.path === opfPath) err('manifest-lists-package', 'The manifest must not list the package document itself (EPUB 3.3 §5.6.1).', el);
                        else if (r.path === 'mimetype' || r.path.startsWith('META-INF/')) err('manifest-lists-container-file', '"' + r.path + '" is not a publication resource and must not be listed (EPUB 3.3 §4.2.2).', el);
                        else if (!item.exists) err('item-file-missing', '"' + r.path + '" is listed in the manifest but is not in the book.', el);
                    }
                }
                model.manifest.items.push(item);
                if (item.id != null && !model.manifest.byId[item.id]) model.manifest.byId[item.id] = item;
                entryFor.set(el, item);
            });
            const byId = model.manifest.byId;
            model.manifest.items.forEach((item) => {
                if (item.fallback != null && !byId[item.fallback]) err('fallback-missing', 'fallback="' + item.fallback + '" does not name a manifest item (EPUB 3.3 §5.6.2).', item.node);
            });
            // EPUB 3.3 §7, D.6.3: exactly one item has the nav property, and it is XHTML.
            const navs = model.manifest.items.filter((i) => i.properties.indexOf('nav') !== -1);
            if (!navs.length) err('nav-missing', 'No manifest item has properties="nav"; an EPUB 3 book needs a navigation document (EPUB 3.3 §7).', manifest);
            if (navs.length > 1) err('nav-multiple', 'More than one manifest item has properties="nav" (EPUB 3.3 D.6.3).', navs[1].node);
            model.nav = navs[0] || null;
            if (model.nav && model.nav.mediaType !== 'application/xhtml+xml') err('nav-media-type', 'The navigation document must be application/xhtml+xml (EPUB 3.3 §7.2).', model.nav.node);
            // EPUB 3.3 D.6.1: cover-image applies to images, zero or one time.
            const covers = model.manifest.items.filter((i) => i.properties.indexOf('cover-image') !== -1);
            if (covers.length > 1) err('cover-multiple', 'More than one manifest item has properties="cover-image" (EPUB 3.3 D.6.1).', covers[1].node);
            covers.forEach((c) => { if (!/^image\//.test(c.mediaType || '')) err('cover-not-image', 'The cover-image item is "' + c.mediaType + '", not an image (EPUB 3.3 D.6.1).', c.node); });
            if (covers.length) { model.cover = covers[0]; model.coverSource = 'cover-image'; }
            // EPUB 3.3 §5.9.3: the OPF 2 <meta name="cover"> is legacy; used only when no item is marked cover-image.
            const oldCover = model.legacy.metas.find((m) => m.name === 'cover');
            if (oldCover) {
                model.legacy.cover = { content: oldCover.content, node: oldCover.node };
                if (!model.cover && byId[oldCover.content]) {
                    model.cover = byId[oldCover.content];
                    model.coverSource = 'legacy-meta';
                    report('info', 'legacy-cover', 'The cover is named only by the EPUB 2 <meta name="cover">; EPUB 3 marks it with properties="cover-image" (EPUB 3.3 §5.9.3).', oldCover.node);
                }
            }
        }

        if (spine) {
            const sp = model.spine;
            sp.node = spine;
            sp.pageProgressionDirection = attr(spine, 'page-progression-direction');
            sp.toc = attr(spine, 'toc');
            const byId = model.manifest.byId;
            if (sp.toc != null) {
                model.legacy.ncx = byId[sp.toc] || null;
                report('info', 'legacy-ncx', 'The spine names an EPUB 2 NCX table of contents (toc="' + sp.toc + '"); EPUB 3 uses the navigation document (EPUB 3.3 §5.9.5).', spine);
            }
            const used = {};
            const refs = XmlAst.elementChildren(spine).filter((el) => el.ns === NS.opf && el.local === 'itemref');
            if (!refs.length) err('spine-empty', 'The spine lists nothing to read (EPUB 3.3 §5.7.1).', spine);
            refs.forEach((el) => {
                const idref = attr(el, 'idref');
                const linear = attr(el, 'linear');
                const ref = { idref: idref, item: idref != null ? (byId[idref] || null) : null, linear: linear !== 'no', properties: tokens(attr(el, 'properties')), id: attr(el, 'id'), node: el };
                if (idref == null) err('itemref-idref-missing', '<itemref> has no idref (EPUB 3.3 §5.7.2).', el);
                else if (!ref.item) err('itemref-unknown', 'idref="' + idref + '" does not name a manifest item (EPUB 3.3 §5.7.2).', el);
                else {
                    if (used[idref]) err('itemref-repeated', '"' + idref + '" is in the spine more than once (EPUB 3.3 §5.7.2).', el);
                    used[idref] = true;
                    if (!reachesContent(ref.item, byId)) err('spine-not-content', '"' + idref + '" (' + ref.item.mediaType + ') is not a content document and has no fallback to one (EPUB 3.3 §5.7.2).', el);
                }
                if (linear != null && linear !== 'yes' && linear !== 'no') err('itemref-linear', 'linear="' + linear + '" must be "yes" or "no" (EPUB 3.3 §5.7.2).', el);
                sp.itemrefs.push(ref);
            });
        }

        const guide = section('guide');
        if (guide) {
            model.legacy.guide = XmlAst.elementChildren(guide).filter((el) => el.local === 'reference').map((el) => ({ type: attr(el, 'type'), title: attr(el, 'title'), href: attr(el, 'href'), node: el }));
            report('info', 'legacy-guide', 'The package has an EPUB 2 <guide>; EPUB 3 uses landmarks in the navigation document (EPUB 3.3 §5.9.4).', guide);
        }

        // EPUB 3.3 §5.3.6: refines names an element or resource by fragment, with no cycles or self-references.
        const subjectOf = (e) => {
            const r = resolveHref(opfPath, e.refines);
            if (r.remote || !r.fragment || (r.path && r.path !== opfPath)) return null;
            const el = ids[decodeURIComponent(r.fragment)];
            return el ? entryFor.get(el) || null : null;
        };
        model.metadata.metas.concat(model.metadata.links).forEach((e) => {
            if (e.refines == null) return;
            const subject = subjectOf(e);
            if (!subject) { err('refines-target-missing', 'refines="' + e.refines + '" does not point at an element in this package document (EPUB 3.3 §5.3.6).', e.node); return; }
            const seen = new Set([e]);
            for (let s = subject; s && s.refines != null; s = subjectOf(s)) {
                if (seen.has(s)) { err('refines-cycle', 'refines="' + e.refines + '" makes a circular chain (EPUB 3.3 §5.3.6).', e.node); return; }
                seen.add(s);
            }
            subject.refinements.push(e);
        });

        return { model: model, problems: problems };
    }

    // EPUB 3.3 §5.7.2: a spine item is a content document, or has one in its fallback chain.
    function reachesContent(item, byId) {
        const seen = new Set();
        for (let it = item; it && !seen.has(it); it = byId[it.fallback]) {
            if (CONTENT_TYPES[it.mediaType]) return true;
            seen.add(it);
        }
        return false;
    }

    // The value of the first refinement with the given property, such as 'role' or 'file-as'.
    function refinement(entry, property) {
        const r = entry && entry.refinements.find((x) => x.property === property);
        return r ? r.value : null;
    }

    return { NS: NS, CONTAINER_PATH: CONTAINER_PATH, read: read, resolveHref: resolveHref, hrefFor: hrefFor, refinement: refinement };
});
