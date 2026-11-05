/*
 * BookContents: the table of contents and landmarks generated from the chapters' headings (P3-04, D-028).
 *
 * plan(entries, depth) reads the linear spine chapters and returns the toc tree, the ids headings need for links,
 * and the landmarks, without changing anything, so the Studio can preview it. apply(entries, plan) writes it: ids
 * into the chapters, the toc's list replaced through Nav.replaceList, and the landmarks refreshed. Every other byte
 * of the files is kept (D-002).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'), require('./nav.js'));
    else root.BookContents = factory(root.XmlAst, root.Book, root.Nav);
})(typeof self !== 'undefined' ? self : this, function (XmlAst, Book, Nav) {
    'use strict';

    const XHTML = 'http://www.w3.org/1999/xhtml';
    const EPUB = 'http://www.idpf.org/2007/ops';
    // EPUB Structural Semantics Vocabulary 1.1 terms that make sense as landmarks, with labels for them.
    const LANDMARKS = {
        cover: 'Cover', titlepage: 'Title page', frontmatter: 'Front matter', bodymatter: 'Start of content', backmatter: 'Back matter',
        toc: 'Table of contents', loi: 'List of illustrations', lot: 'List of tables', preface: 'Preface', foreword: 'Foreword',
        prologue: 'Prologue', introduction: 'Introduction', acknowledgments: 'Acknowledgements', dedication: 'Dedication',
        epigraph: 'Epigraph', 'copyright-page': 'Copyright', appendix: 'Appendix', afterword: 'Afterword', epilogue: 'Epilogue',
        conclusion: 'Conclusion', glossary: 'Glossary', bibliography: 'Bibliography', index: 'Index'
    };
    const DEPTHS = [1, 2, 3];

    const text = (el) => XmlAst.textContent(el).replace(/\s+/g, ' ').trim();
    const tokens = (v) => String(v || '').split(/\s+/).filter(Boolean);

    function slug(s) {
        const v = String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
        return /^[a-z]/.test(v) ? v : 'h-' + (v || 'heading');
    }

    // The headings of one chapter's body as a tree. The first heading stands for the chapter (no fragment); headings
    // at its level or above that come later become top entries of their own; deeper levels nest, up to `depth`.
    function chapterEntries(path, ast, depth, idsWanted) {
        const body = ast.elements.find((e) => e.local === 'body' && e.ns === XHTML);
        const headings = body ? ast.elements.filter((e) => e.ns === XHTML && /^h[1-6]$/.test(e.local) && e.start > body.start && e.end <= body.end && text(e)) : [];
        const titleEl = ast.elements.find((e) => e.local === 'title' && e.ns === XHTML);
        if (!headings.length) return [{ label: (titleEl && text(titleEl)) || path.split('/').pop(), path: path, fragment: null, children: [] }];
        const top = Number(headings[0].local[1]);
        const deeper = Array.from(new Set(headings.slice(1).map((h) => Number(h.local[1])).filter((l) => l > top))).sort();
        const allowed = new Set(deeper.slice(0, depth - 1));
        const ids = new Set(ast.elements.map((e) => XmlAst.getAttr(e, 'id')).filter((v) => v != null));
        const idFor = (h) => {
            const own = XmlAst.getAttr(h, 'id');
            if (own != null) return own;
            let id = slug(text(h)), n = 2;
            while (ids.has(id)) id = slug(text(h)) + '-' + n++;
            ids.add(id);
            idsWanted.push({ path: path, start: h.start, id: id });
            return id;
        };
        const root = [{ label: text(headings[0]), path: path, fragment: null, children: [], level: top }];
        const stack = [root[0]];
        headings.slice(1).forEach((h) => {
            const level = Number(h.local[1]);
            if (level > top && !allowed.has(level)) return;
            const item = { label: text(h), path: path, fragment: idFor(h), children: [], level: level };
            if (level <= top) { root.push(item); stack.length = 0; stack.push(item); return; }
            while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
            stack[stack.length - 1].children.push(item);
            stack.push(item);
        });
        const strip = (items) => items.map((i) => ({ label: i.label, path: i.path, fragment: i.fragment, children: strip(i.children) }));
        return strip(root);
    }

    // The landmark types a chapter declares on its body or its first element inside the body.
    function chapterTypes(ast) {
        const body = ast.elements.find((e) => e.local === 'body' && e.ns === XHTML);
        if (!body) return [];
        const first = XmlAst.elementChildren(body)[0];
        return tokens(XmlAst.getAttr(body, 'type', EPUB)).concat(first ? tokens(XmlAst.getAttr(first, 'type', EPUB)) : []).filter((t) => Object.prototype.hasOwnProperty.call(LANDMARKS, t));
    }

    function plan(entries, depth) {
        const d = DEPTHS.indexOf(depth) !== -1 ? depth : 2;
        const r = Book.read(entries);
        if (!r.model) throw Object.assign(new Error('content.opf cannot be read; fix it in the code editor first.'), { code: 'unreadable' });
        const model = r.model;
        const navPath = model.nav ? model.nav.path : null;
        const ids = [], skipped = [], tree = [], landmarks = [];
        const seenType = new Set();
        const linear = model.spine.itemrefs.filter((ref) => ref.linear && ref.item && ref.item.mediaType === 'application/xhtml+xml' && ref.item.path && ref.item.path !== navPath);
        linear.forEach((ref) => {
            const path = ref.item.path;
            const ast = XmlAst.parse(entries[path] || '');
            if (!ast.wellFormed) { skipped.push(path); return; }
            const types = chapterTypes(ast);
            // A cover page is reached through its landmark, not listed in the contents (P3-05).
            if (types.indexOf('cover') === -1) tree.push.apply(tree, chapterEntries(path, ast, d, ids));
            types.forEach((type) => {
                if (seenType.has(type)) return;
                seenType.add(type);
                landmarks.push({ type: type, path: path, label: LANDMARKS[type] });
            });
        });
        if (!seenType.has('bodymatter') && linear.length && skipped.indexOf(linear[0].item.path) === -1) landmarks.unshift({ type: 'bodymatter', path: linear[0].item.path, label: LANDMARKS.bodymatter });
        // EPUB 3.3 §7.3 and EPUBCheck RSC-011: a toc landmark only when the nav document is in the spine.
        if (navPath && model.spine.itemrefs.some((x) => x.item && x.item.path === navPath)) landmarks.push({ type: 'toc', path: navPath, fragment: 'toc', label: LANDMARKS.toc });
        // Existing landmarks that point at files the plan did not consider stay.
        const nav = Nav.read(entries, model).nav;
        const considered = new Set(linear.map((x) => x.item.path).concat(navPath ? [navPath] : []));
        const kept = nav && nav.landmarks ? Nav.entries(nav.landmarks).filter((e) => e.kind === 'a' && e.target && !considered.has(e.target.path) && e.depth === 0) : [];
        return {
            depth: d, tree: tree, ids: ids, skipped: skipped,
            landmarks: kept.map((e) => ({ type: e.types[0], href: e.href, label: e.label, kept: true })).concat(landmarks)
        };
    }

    // Counts the entries in a plan's tree, for the preview.
    function count(tree) {
        return tree.reduce((n, i) => n + 1 + count(i.children), 0);
    }

    function apply(entries, p) {
        let next = Object.assign({}, entries);
        const byPath = {};
        p.ids.forEach((x) => { (byPath[x.path] = byPath[x.path] || []).push(x); });
        Object.keys(byPath).forEach((path) => {
            const ast = XmlAst.parse(next[path]);
            const edits = byPath[path].reduce((acc, x) => {
                const el = ast.elements.find((e) => e.start === x.start);
                return el ? acc.concat(XmlAst.setAttr(ast, el, 'id', x.id)) : acc;
            }, []);
            next[path] = XmlAst.applyEdits(next[path], edits);
        });
        const navEdit = (fn) => {
            const model = Book.read(next).model;
            const nav = model ? Nav.read(next, model).nav : null;
            if (!nav) return false;
            const edits = fn(nav);
            if (edits && edits.length) next = Object.assign({}, next, { [nav.path]: XmlAst.applyEdits(next[nav.path], edits) });
            return true;
        };
        if (!navEdit((nav) => (nav.toc && nav.toc.list ? Nav.replaceList(nav, nav.toc, p.tree) : []))) {
            throw Object.assign(new Error('The navigation document cannot be read; fix it in the code editor first.'), { code: 'no-nav' });
        }
        const items = p.landmarks.map((l) => ({ label: l.label, types: [l.type], href: l.href, path: l.href ? undefined : l.path, fragment: l.fragment, children: [] }));
        navEdit((nav) => {
            if (!items.length) return nav.landmarks ? Nav.removeNav(nav, nav.landmarks) : [];
            if (nav.landmarks && nav.landmarks.list) return Nav.replaceList(nav, nav.landmarks, items);
            return nav.landmarks ? [] : Nav.setLandmark(nav, items[0].types[0], items[0].href ? { href: items[0].href } : { path: items[0].path, fragment: items[0].fragment }, items[0].label);
        });
        if (items.length > 1) navEdit((nav) => (nav.landmarks && nav.landmarks.list ? Nav.replaceList(nav, nav.landmarks, items) : []));
        return next;
    }

    return { LANDMARKS: LANDMARKS, DEPTHS: DEPTHS, plan: plan, apply: apply, count: count };
});
