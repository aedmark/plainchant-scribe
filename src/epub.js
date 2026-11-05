/*
 * Epub: reads an imported .epub archive into a book's files, treating every byte as untrusted (P5-02, D-038).
 *
 * The central directory is read with every offset and length checked against the archive, and nothing is inflated
 * until all of it passes: entry count, declared sizes (per file and in total), names, and methods. Names must be
 * relative paths without "." or ".." segments, backslashes, or control characters, and unique after Unicode
 * normalisation and case folding (EPUB 3.3 §4.2.3). Entries must be stored or deflated and not ZIP-encrypted
 * (§4.3.2). Deflated data is inflated in chunks and stopped the moment it passes its declared size, so a small
 * archive cannot expand without bound; every entry's size and CRC-32 must then match. A book is refused when
 * META-INF/encryption.xml encrypts anything other than fonts with the IDPF or Adobe obfuscation (§4.4.5), or when
 * Adobe or Apple DRM files are present. Harmless junk (folder entries, __MACOSX/, .DS_Store, Thumbs.db,
 * desktop.ini) is skipped. Any other problem refuses the whole archive with a message naming the entry.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./zip.js'), require('./xml-ast.js'), require('./book.js'));
    else root.Epub = factory(root.Zip, root.XmlAst, root.Book);
})(typeof self !== 'undefined' ? self : this, function (Zip, XmlAst, Book) {
    'use strict';

    const MiB = 1024 * 1024;
    const LIMITS = { file: 25 * MiB, total: 200 * MiB, entries: 10000 };
    const TEXT = /\.(xhtml|html|htm|css|opf|ncx|xml|svg|smil|js|txt|json)$/i;
    const JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/i;
    // Font obfuscation, which is not DRM: the IDPF algorithm (EPUB 3.3 §4.4) and Adobe's older one.
    const OBFUSCATION = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'];
    const DRM_FILES = { 'META-INF/rights.xml': 'Adobe DRM', 'META-INF/sinf.xml': 'Apple FairPlay DRM' };

    function fail(code, message, entry) {
        const e = new Error(message);
        e.code = code;
        e.epub = true;
        if (entry) e.entry = entry;
        return e;
    }

    function unsafeName(name) {
        if (!name || name.length > 65535) return 'its name is empty or too long';
        if (/[\u0000-\u001f\u007f]/.test(name)) return 'its name has control characters';
        if (name.indexOf('\\') !== -1) return 'its name uses a backslash';
        if (name[0] === '/' || /^[A-Za-z]:/.test(name)) return 'its path is absolute';
        if (name.split('/').some((s) => s === '..')) return 'its path leaves the book (..)';
        if (name.split('/').some((s, i, all) => s === '.' || (s === '' && i < all.length - 1))) return 'its path has an empty or "." segment';
        return null;
    }

    // The central directory, with every field bounds-checked: [{ name, method, flags, crc, compressed, size, local }].
    function directory(b, limits) {
        const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
        const u16 = (o) => { if (o < 0 || o + 2 > b.length) throw fail('damaged', 'The archive is damaged (a header runs past its end).'); return view.getUint16(o, true); };
        const u32 = (o) => { if (o < 0 || o + 4 > b.length) throw fail('damaged', 'The archive is damaged (a header runs past its end).'); return view.getUint32(o, true); };
        // The end-of-central-directory record is in the last 22 + 65535 bytes (a comment may follow it).
        let end = -1;
        for (let i = b.length - 22; i >= 0 && i >= b.length - 22 - 65535; i--) {
            if (b[i] === 0x50 && b[i + 1] === 0x4B && b[i + 2] === 0x05 && b[i + 3] === 0x06) { end = i; break; }
        }
        if (end === -1) throw fail('not-zip', 'This is not an .epub (zip) file.');
        const count = u16(end + 10), size = u32(end + 12), start = u32(end + 16);
        if (u16(end + 4) !== 0 || u16(end + 6) !== 0) throw fail('spanned', 'The archive is split across several files, which EPUB does not allow (EPUB 3.3 §4.3.2).');
        if (count === 0xFFFF || size === 0xFFFFFFFF || start === 0xFFFFFFFF) throw fail('too-many', 'The archive is too large to import (more than ' + limits.entries + ' files or ' + Math.round(limits.total / MiB) + ' MB).');
        if (count > limits.entries) throw fail('too-many', 'The book has ' + count + ' files; at most ' + limits.entries + ' can be imported.');
        if (start + size > end) throw fail('damaged', 'The archive is damaged (its directory is out of place).');
        const decoder = new TextDecoder('utf-8');
        const out = [];
        let at = start;
        for (let i = 0; i < count; i++) {
            if (at + 46 > start + size || u32(at) !== 0x02014B50) throw fail('damaged', 'The archive is damaged (its directory is cut short).');
            const flags = u16(at + 8), method = u16(at + 10), nameLength = u16(at + 28), extraLength = u16(at + 30), commentLength = u16(at + 32);
            if (at + 46 + nameLength > b.length) throw fail('damaged', 'The archive is damaged (a name runs past its end).');
            const entry = {
                name: decoder.decode(b.subarray(at + 46, at + 46 + nameLength)), flags: flags, method: method,
                crc: u32(at + 16), compressed: u32(at + 20), size: u32(at + 24), local: u32(at + 42)
            };
            // ZIP64 sizes in the extra field (APPNOTE 4.5.3), allowed by EPUB 3.3 §4.3.2.
            if (entry.size === 0xFFFFFFFF || entry.compressed === 0xFFFFFFFF || entry.local === 0xFFFFFFFF) {
                let x = at + 46 + nameLength;
                const xEnd = x + extraLength;
                while (x + 4 <= xEnd) {
                    const id = u16(x), len = u16(x + 2);
                    if (id === 0x0001) {
                        let p = x + 4;
                        const big = () => { const lo = u32(p), hi = u32(p + 4); p += 8; return hi ? Infinity : lo; };
                        if (entry.size === 0xFFFFFFFF) entry.size = big();
                        if (entry.compressed === 0xFFFFFFFF) entry.compressed = big();
                        if (entry.local === 0xFFFFFFFF) entry.local = big();
                    }
                    x += 4 + len;
                }
            }
            out.push(entry);
            at += 46 + nameLength + extraLength + commentLength;
        }
        return out;
    }

    // Inflates raw DEFLATE data, stopping as soon as the output passes `cap` bytes.
    async function inflateCapped(data, cap, name) {
        if (typeof DecompressionStream !== 'function') throw fail('no-inflate', 'This browser cannot decompress .epub files. Try a current version of Chrome, Edge, Firefox, or Safari.');
        const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
        const chunks = [];
        let total = 0;
        try {
            for (;;) {
                const step = await reader.read();
                if (step.done) break;
                total += step.value.length;
                if (total > cap) {
                    reader.cancel().catch(() => {});
                    throw fail('too-large', '"' + name + '" decompresses to more than its declared size; the archive is damaged or hostile.', name);
                }
                chunks.push(step.value);
            }
        } catch (e) {
            // A stream error has its own code (Z_DATA_ERROR in Node), so only this module's errors pass through.
            if (e.epub) throw e;
            throw fail('damaged', '"' + name + '" is damaged and cannot be decompressed.', name);
        }
        const out = new Uint8Array(total);
        let at = 0;
        chunks.forEach((c) => { out.set(c, at); at += c.length; });
        return out;
    }

    function decodeText(u8) {
        if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8.subarray(2));
        if (u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8.subarray(2));
        // EPUB text is UTF-8 or UTF-16; fatal decoding finds anything else.
        return new TextDecoder('utf-8', { fatal: true }).decode(u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF ? u8.subarray(3) : u8);
    }

    // Refuses DRM: encryption of anything but fonts with an obfuscation algorithm, or DRM rights files.
    function checkEncryption(names, text) {
        Object.keys(DRM_FILES).forEach((p) => { if (names.has(p)) throw fail('drm', 'This book is protected by ' + DRM_FILES[p] + ', so it cannot be opened or edited. Import a copy without DRM.'); });
        if (text == null) return;
        const ast = XmlAst.parse(text);
        if (!ast.wellFormed) throw fail('drm', 'META-INF/encryption.xml cannot be read, so Scribe cannot tell whether the book is DRM-protected.');
        ast.elements.filter((el) => el.local === 'EncryptionMethod').forEach((el) => {
            const algorithm = XmlAst.getAttr(el, 'Algorithm') || '';
            if (OBFUSCATION.indexOf(algorithm) === -1) throw fail('drm', 'This book is DRM-protected (META-INF/encryption.xml encrypts its content), so it cannot be opened or edited. Import a copy without DRM.');
        });
    }

    // Reads an .epub archive's bytes. Returns { entries: { path: text }, binaries: { path: Uint8Array }, skipped,
    // warnings, title }, or throws an Error with a code and a message for the author.
    async function read(bytes, options) {
        const limits = Object.assign({}, LIMITS, (options && options.limits) || {});
        const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
        const list = directory(b, limits);
        const skipped = [], warnings = [], keep = [], seen = new Map();
        let total = 0;
        list.forEach((e) => {
            if (e.name.endsWith('/') || JUNK.test(e.name)) { skipped.push(e.name); return; }
            const why = unsafeName(e.name);
            if (why) throw fail('unsafe-name', 'The book was not imported: "' + e.name + '" is unsafe, as ' + why + '.', e.name);
            const key = e.name.normalize('NFC').toLowerCase();
            if (seen.has(key)) throw fail('duplicate', 'The book was not imported: "' + e.name + '" and "' + seen.get(key) + '" are the same name (EPUB 3.3 §4.2.3).', e.name);
            seen.set(key, e.name);
            if (e.flags & 0x0001) throw fail('encrypted', 'The book was not imported: "' + e.name + '" is zip-encrypted, which EPUB does not allow.', e.name);
            if (e.method !== 0 && e.method !== 8) throw fail('method', 'The book was not imported: "' + e.name + '" uses a compression method EPUB does not allow.', e.name);
            if (e.size > limits.file) throw fail('too-large', 'The book was not imported: "' + e.name + '" is larger than ' + Math.round(limits.file / MiB) + ' MB.', e.name);
            if (e.method === 0 && e.compressed !== e.size) throw fail('damaged', 'The book was not imported: "' + e.name + '" is damaged (its sizes disagree).', e.name);
            total += e.size;
            if (total > limits.total) throw fail('too-large', 'The book was not imported: it is larger than ' + Math.round(limits.total / MiB) + ' MB once decompressed.');
            keep.push(e);
        });
        const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
        const raw = {};
        for (const e of keep) {
            if (!(e.local + 30 <= b.length) || view.getUint32(e.local, true) !== 0x04034B50) throw fail('damaged', 'The book was not imported: "' + e.name + '" is damaged (no local header).', e.name);
            const start = e.local + 30 + view.getUint16(e.local + 26, true) + view.getUint16(e.local + 28, true);
            if (start + e.compressed > b.length) throw fail('damaged', 'The book was not imported: "' + e.name + '" runs past the end of the archive.', e.name);
            const data = b.subarray(start, start + e.compressed);
            const out = e.method === 8 ? await inflateCapped(data, e.size, e.name) : data;
            if (out.length !== e.size || Zip.crc32(out) !== e.crc) throw fail('damaged', 'The book was not imported: "' + e.name + '" is damaged (its checksum does not match).', e.name);
            raw[e.name] = out;
        }
        const names = new Set(Object.keys(raw));
        checkEncryption(names, raw['META-INF/encryption.xml'] ? decodeText(raw['META-INF/encryption.xml']) : null);
        if (!raw['META-INF/container.xml']) throw fail('not-a-book', 'This is not an EPUB book: it has no META-INF/container.xml.');
        // The first entry in the archive is the one whose local header comes first.
        const first = list.reduce((a, e) => (!a || e.local < a.local ? e : a), null);
        const mime = raw.mimetype ? new TextDecoder().decode(raw.mimetype) : null;
        if (mime == null) warnings.push('The archive has no mimetype file; Scribe adds one on export.');
        else if (mime !== 'application/epub+zip') warnings.push('The mimetype file holds "' + mime.trim() + '"; export writes "application/epub+zip".');
        else if (!first || first.name !== 'mimetype') warnings.push('The mimetype file was not first in the archive; export puts it first.');
        const entries = {}, binaries = {};
        Object.keys(raw).forEach((name) => {
            if (name === 'mimetype') return;
            if (TEXT.test(name)) {
                try { entries[name] = decodeText(raw[name]); return; } catch (x) { warnings.push('"' + name + '" is not UTF-8 or UTF-16 text, so it is kept as a file you cannot edit.'); }
            }
            binaries[name] = raw[name];
        });
        entries.mimetype = 'application/epub+zip';
        const r = Book.read(entries, { assets: Object.keys(binaries) });
        if (!r.model) throw fail('not-a-book', 'This is not a readable EPUB book: ' + ((r.problems[0] && r.problems[0].message) || 'its package document cannot be found.'));
        return { entries: entries, binaries: binaries, skipped: skipped, warnings: warnings, title: r.model.metadata.title || '', problems: r.problems };
    }

    return { LIMITS: LIMITS, read: read };
});
