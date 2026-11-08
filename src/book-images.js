/*
 * BookImages: what each image in a book is (format, size in pixels, colour model, animation, possible transparency),
 * read from its own header bytes, and the store limits it breaks (P7-02, D-051). The limits are the ones
 * docs/STORES.md records from the stores' help pages of 2026-11-06; each row names its store, and none blocks export,
 * since an author may not sell there.
 *
 * inspect(bytes) never decodes pixels: a format that can carry transparency says so (mayHaveAlpha) and the caller
 * decides whether any pixel is actually transparent. The parsers stop at the first malformed length rather than throw,
 * since the bytes are untrusted.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.BookImages = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MB = 1024 * 1024;
    // docs/STORES.md, 2026-11-06.
    const LIMITS = { applePixels: 5600000, googleSide: 3200, koboCoverBytes: 5 * MB, kdpCoverSide: 1200 };

    const be16 = (b, i) => (b[i] << 8) | b[i + 1];
    const be32 = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
    const le16 = (b, i) => b[i] | (b[i + 1] << 8);
    const le24 = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
    const ascii = (b, i, n) => String.fromCharCode.apply(null, Array.from(b.subarray(i, i + n)));

    function png(b) {
        const out = { format: 'png', width: be32(b, 16), height: be32(b, 20), animated: false, cmyk: false, mayHaveAlpha: b[25] === 4 || b[25] === 6 };
        // Chunks before the first IDAT: acTL marks an animated PNG, tRNS a transparent colour or palette entry.
        for (let i = 8; i + 8 <= b.length;) {
            const len = be32(b, i), type = ascii(b, i + 4, 4);
            if (type === 'IDAT' || type === 'IEND') break;
            if (type === 'acTL' && i + 12 <= b.length) out.animated = be32(b, i + 8) > 1;
            if (type === 'tRNS') out.mayHaveAlpha = true;
            i += 12 + len;
        }
        return out;
    }

    function jpeg(b) {
        // JPEG (ITU-T T.81 B.1.1.3): marker segments until a start-of-frame, which holds the size and component count.
        for (let i = 2; i + 4 <= b.length;) {
            if (b[i] !== 0xFF) return null;
            const m = b[i + 1];
            if (m === 0xFF) { i++; continue; }
            if (m === 0xD8 || (m >= 0xD0 && m <= 0xD7) || m === 0x01) { i += 2; continue; }
            const len = be16(b, i + 2);
            if (len < 2) return null;
            if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
                if (i + 10 > b.length) return null;
                return { format: 'jpeg', width: be16(b, i + 7), height: be16(b, i + 5), animated: false, cmyk: b[i + 9] === 4, mayHaveAlpha: false };
            }
            if (m === 0xDA) return null;
            i += 2 + len;
        }
        return null;
    }

    function gif(b) {
        const out = { format: 'gif', width: le16(b, 6), height: le16(b, 8), animated: false, cmyk: false, mayHaveAlpha: false };
        // GIF89a: blocks after the screen descriptor and its colour table; each 0x2C is a frame.
        const skipTable = (flags) => (flags & 0x80 ? 3 * (1 << ((flags & 7) + 1)) : 0);
        const skipSub = (i) => { while (i < b.length && b[i]) i += b[i] + 1; return i + 1; };
        let i = 13 + skipTable(b[10]), frames = 0;
        while (i < b.length) {
            if (b[i] === 0x3B) break;
            if (b[i] === 0x21) {
                if (b[i + 1] === 0xF9 && b[i + 3] & 1) out.mayHaveAlpha = true;
                i = skipSub(i + 2);
            } else if (b[i] === 0x2C) {
                // Every frame is walked: a later one may be the transparent one.
                if (++frames > 1) out.animated = true;
                i = skipSub(i + 11 + skipTable(b[i + 9]));
            } else break;
        }
        return out;
    }

    function webp(b) {
        const kind = ascii(b, 12, 4);
        if (b.length < (kind === 'VP8L' ? 25 : 30)) return null;
        if (kind === 'VP8X') return { format: 'webp', width: le24(b, 24) + 1, height: le24(b, 27) + 1, animated: Boolean(b[20] & 0x02), cmyk: false, mayHaveAlpha: Boolean(b[20] & 0x10) };
        if (kind === 'VP8L') {
            const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
            return { format: 'webp', width: (bits & 0x3FFF) + 1, height: ((bits >>> 14) & 0x3FFF) + 1, animated: false, cmyk: false, mayHaveAlpha: Boolean((bits >>> 28) & 1) };
        }
        if (kind === 'VP8 ') return { format: 'webp', width: le16(b, 26) & 0x3FFF, height: le16(b, 28) & 0x3FFF, animated: false, cmyk: false, mayHaveAlpha: false };
        return null;
    }

    // { format, width, height, animated, cmyk, mayHaveAlpha }, or null for SVG, other formats, or a broken header.
    function inspect(bytes) {
        const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
        if (b.length >= 26 && be32(b, 0) === 0x89504E47 && be32(b, 4) === 0x0D0A1A0A && ascii(b, 12, 4) === 'IHDR') return png(b);
        if (b.length >= 4 && b[0] === 0xFF && b[1] === 0xD8) return jpeg(b);
        if (b.length >= 13 && /^GIF8[79]a$/.test(ascii(b, 0, 6))) return gif(b);
        if (b.length >= 25 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return webp(b);
        return null;
    }

    // Problems rows for the book's manifest images. infos: { path: { size, transparent, ...inspect() } }; an image
    // with no info (SVG, not loaded yet) gets no rows.
    function rows(model, infos) {
        const out = [];
        if (!model) return out;
        const cover = model.cover && model.cover.path;
        const row = (path, code, message) => out.push({ file: path, start: 0, end: 0, line: 0, code: code, severity: 'warning', category: 'images', message: message });
        model.manifest.items.forEach((it) => {
            const info = it.path && /^image\//.test(it.mediaType || '') ? (infos || {})[it.path] : null;
            if (!info || !info.width || !info.height) return;
            const name = it.path.split('/').pop();
            const dims = info.width + ' × ' + info.height;
            const px = info.width * info.height;
            if (px > LIMITS.applePixels) row(it.path, 'image-pixels', 'Apple Books takes images of at most 5.6 million pixels; ' + name + ' is ' + dims + ' (' + (px / 1e6).toFixed(1) + ' million). Scale it down.');
            if (Math.max(info.width, info.height) > LIMITS.googleSide) row(it.path, 'image-side', 'Google Play Books takes images of at most 3200 pixels wide or tall; ' + name + ' is ' + dims + '.');
            if (info.cmyk) row(it.path, 'image-cmyk', 'Apple Books asks for RGB images; ' + name + ' is a CMYK JPEG. Save it as RGB, ideally sRGB.');
            if (info.transparent) row(it.path, 'image-transparent', 'Kindle shows transparent parts of an image as white (KDP); ' + name + ' has some. Flatten it onto the colour it should show.');
            if (info.animated) row(it.path, 'image-animated', 'KDP does not take animated images; ' + name + ' is animated. Use a still image.');
            if (info.format === 'gif' || info.format === 'webp') row(it.path, 'image-format', 'Apple Books asks for JPEG or PNG images inside the book; ' + name + ' is ' + info.format.toUpperCase() + '.');
            if (it.path !== cover) return;
            if (info.format !== 'jpeg' && info.format !== 'png') row(it.path, 'cover-format', 'Kobo and Apple Books want a JPEG or PNG cover; the cover is ' + info.format.toUpperCase() + '.');
            if (info.size > LIMITS.koboCoverBytes) row(it.path, 'cover-bytes', 'Kobo takes a cover image under 5 MB; the cover is ' + (info.size / MB).toFixed(1) + ' MB.');
            if (info.width >= info.height) row(it.path, 'cover-portrait', 'Kobo wants a portrait cover, taller than it is wide; the cover is ' + dims + '.');
            if (Math.max(info.width, info.height) < LIMITS.kdpCoverSide) row(it.path, 'cover-small', 'KDP wants the cover inside the book at least 1200 pixels wide or tall; the cover is ' + dims + '.');
        });
        return out;
    }

    return { LIMITS: LIMITS, inspect: inspect, rows: rows };
}));
