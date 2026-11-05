/*
 * BookExport: a book's files packed as one .epub (P5-01, D-037).
 *
 * The container follows OCF 3.3 (EPUB 3.3 §4.2): the first entry is mimetype, holding exactly
 * "application/epub+zip", stored, unencrypted, with no extra field; META-INF/container.xml and the rest of META-INF
 * follow, then the package document, then the manifest's files in manifest order. Text files are deflated, which
 * OCF allows for every entry but mimetype; images, fonts, and media are already compressed and are stored. Files
 * the manifest does not list are left out and reported, and so are listed files that are missing.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./zip.js'), require('./book.js'));
    else root.BookExport = factory(root.Zip, root.Book);
})(typeof self !== 'undefined' ? self : this, function (Zip, Book) {
    'use strict';

    const MIMETYPE = 'application/epub+zip';
    const TEXT = /\.(xhtml|html|htm|css|opf|ncx|xml|svg|smil|js|txt|json)$/i;

    function fail(code, message) {
        const e = new Error(message);
        e.code = code;
        return e;
    }

    const shouldDeflate = (path) => TEXT.test(path);
    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

    // The paths to pack, in order, and what is left out. assets: binary paths in the book.
    function plan(entries, assets) {
        const binaries = assets || [];
        const r = Book.read(entries, { assets: binaries });
        if (!r.model) throw fail('unreadable', 'content.opf cannot be read, so the book cannot be exported. Fix it in the code editor.');
        const model = r.model;
        const exists = (p) => has(entries, p) || binaries.indexOf(p) !== -1;
        const order = ['mimetype'];
        const add = (p) => { if (order.indexOf(p) === -1) order.push(p); };
        add('META-INF/container.xml');
        Object.keys(entries).concat(binaries).filter((p) => /^META-INF\//.test(p)).sort().forEach(add);
        add(model.opfPath);
        const missing = [];
        model.manifest.items.forEach((item) => {
            if (item.remote || !item.path) return;
            if (exists(item.path)) add(item.path); else if (missing.indexOf(item.path) === -1) missing.push(item.path);
        });
        const left = Array.from(new Set(Object.keys(entries).concat(binaries))).filter((p) => order.indexOf(p) === -1).sort();
        return { order: order, left: left, missing: missing, title: model.metadata.title || '' };
    }

    // Raw DEFLATE with the platform's CompressionStream (browsers and Node 18+), or null when there is none.
    async function deflateRaw(bytes) {
        if (typeof CompressionStream !== 'function') return null;
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    // Packs the book. binaries: { path: Uint8Array } for files not held as text. options: { when, deflate }, where
    // deflate(bytes) gives raw DEFLATE bytes (or null to store); the default uses CompressionStream.
    async function pack(entries, binaries, options) {
        const o = options || {};
        const bin = binaries || {};
        const p = plan(entries, Object.keys(bin));
        const deflate = o.deflate === undefined ? deflateRaw : o.deflate;
        const encoder = new TextEncoder();
        const files = [];
        for (const path of p.order) {
            if (path === 'mimetype') { files.push({ path: path, data: MIMETYPE }); continue; }
            const data = has(entries, path) && typeof entries[path] === 'string' ? encoder.encode(entries[path]) : (has(bin, path) ? bin[path] : entries[path]);
            if (!(data instanceof Uint8Array)) throw fail('missing', path + ' has no content to export.');
            let deflated = null;
            if (deflate && shouldDeflate(path) && data.length > 0) {
                const d = await deflate(data);
                // Kept only when it saves space.
                if (d instanceof Uint8Array && d.length < data.length) deflated = d;
            }
            files.push(deflated ? { path: path, data: data, deflated: deflated } : { path: path, data: data });
        }
        return { bytes: Zip.build(files, o.when || new Date()), order: p.order, left: p.left, missing: p.missing };
    }

    // A file name from the title: letters, digits, and hyphens, ending in .epub.
    function fileName(title) {
        const slug = String(title || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
        return (slug || 'book') + '.epub';
    }

    return { MIMETYPE: MIMETYPE, shouldDeflate: shouldDeflate, plan: plan, pack: pack, fileName: fileName };
});
