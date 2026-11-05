/*
 * FontInfo: a font file's family, weight, style, and embedding permission (P4-03, D-033).
 *
 * TrueType and OpenType files (sfnt) are read directly: the name table (OpenType spec, 'name': IDs 16 and 17, else
 * 1 and 2) and the OS/2 table (usWeightClass, fsType, fsSelection). WOFF and WOFF2 compress their tables, so their
 * details are guessed from the file name and confirmed by the author. Nothing here trusts the file: every offset is
 * checked against its length, and a damaged font gives the guess.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.FontInfo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MEDIA = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };
    const WEIGHTS = [['thin', 100], ['hairline', 100], ['extralight', 200], ['ultralight', 200], ['light', 300], ['regular', 400], ['book', 400], ['normal', 400],
        ['medium', 500], ['semibold', 600], ['demibold', 600], ['extrabold', 800], ['ultrabold', 800], ['bold', 700], ['black', 900], ['heavy', 900]];

    const ext = (name) => String(name || '').split('.').pop().toLowerCase();
    const mediaTypeFor = (name) => MEDIA[ext(name)] || null;

    // A guess from a name such as "EBGaramond-SemiBoldItalic.ttf": family "EB Garamond", weight 600, italic.
    // In a lower-case name such as "eb-garamond-latin-400-normal", the family ends at the first weight, style,
    // number, or subset word.
    const STOP = /^(\d+|latin|ext|cyrillic|greek|vietnamese|subset|regular|normal|italic|oblique|variable|vf|wght)$/;

    function guess(fileName) {
        const stem = String(fileName || 'Font').split('/').pop().replace(/\.[^.]+$/, '');
        if (stem === stem.toLowerCase()) {
            const words = stem.split(/[-_ ]+/).filter(Boolean);
            const at = words.findIndex((w) => STOP.test(w) || WEIGHTS.some(([k]) => k === w));
            const fam = (at === -1 ? words : words.slice(0, at)).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Font';
            const rest = at === -1 ? [] : words.slice(at);
            const num = rest.find((w) => /^[1-9]00$/.test(w));
            const named = WEIGHTS.find(([k]) => rest.indexOf(k) !== -1);
            return { family: fam, weight: num ? Number(num) : (named ? named[1] : 400), italic: rest.some((w) => w === 'italic' || w === 'oblique') };
        }
        const parts = stem.split(/[-_ ]+/);
        const style = parts.length > 1 ? parts.slice(1).join('').toLowerCase() : '';
        const family = (parts[0] || 'Font').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim() || 'Font';
        const w = WEIGHTS.find(([k]) => style.indexOf(k) !== -1);
        return { family: family, weight: w ? w[1] : 400, italic: /italic|oblique/.test(style) };
    }

    function u16(b, o) { return o + 2 <= b.length ? (b[o] << 8) | b[o + 1] : null; }
    function u32(b, o) { return o + 4 <= b.length ? ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3] : null; }
    const tag = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

    function tables(b) {
        const count = u16(b, 4), out = {};
        if (count == null || 12 + count * 16 > b.length) return null;
        for (let i = 0; i < count; i++) {
            const at = 12 + i * 16, offset = u32(b, at + 8), length = u32(b, at + 12);
            if (offset != null && length != null && offset + length <= b.length) out[tag(b, at)] = { offset: offset, length: length };
        }
        return out;
    }

    // Name table strings by ID, preferring Windows Unicode (platform 3, UTF-16BE) over Macintosh Roman.
    function names(b, t) {
        const base = t.offset, count = u16(b, base + 2), strings = base + u16(b, base + 4);
        const out = {}, rank = {};
        for (let i = 0; i < (count || 0); i++) {
            const r = base + 6 + i * 12;
            const platform = u16(b, r), encoding = u16(b, r + 2), id = u16(b, r + 6), len = u16(b, r + 8), off = u16(b, r + 10);
            if (platform == null || off == null || strings + off + len > base + t.length) continue;
            const score = platform === 3 && (encoding === 1 || encoding === 10) ? 2 : (platform === 1 && encoding === 0 ? 1 : 0);
            if (!score || (rank[id] || 0) >= score) continue;
            let s = '';
            if (score === 2) for (let k = 0; k + 1 < len; k += 2) s += String.fromCharCode((b[strings + off + k] << 8) | b[strings + off + k + 1]);
            else for (let k = 0; k < len; k++) s += String.fromCharCode(b[strings + off + k]);
            out[id] = s.trim();
            rank[id] = score;
        }
        return out;
    }

    // { format, mediaType, family, weight, italic, fsType, restricted, fromFile }.
    function read(bytes, fileName) {
        const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
        const format = ext(fileName);
        const g = guess(fileName);
        const out = { format: format, mediaType: mediaTypeFor(fileName), family: g.family, weight: g.weight, italic: g.italic, fsType: null, restricted: false, fromFile: false };
        const sig = b.length >= 4 ? tag(b, 0) : '';
        const sfnt = sig === 'OTTO' || sig === 'true' || (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0);
        if (!sfnt) return out;
        const t = tables(b);
        if (!t) return out;
        if (t.name) {
            const n = names(b, t.name);
            if (n[16] || n[1]) { out.family = n[16] || n[1]; out.fromFile = true; }
            const sub = (n[17] || n[2] || '').toLowerCase();
            if (sub) out.italic = /italic|oblique/.test(sub);
        }
        const os2 = t['OS/2'];
        if (os2 && os2.length >= 64) {
            const weight = u16(b, os2.offset + 4), fsType = u16(b, os2.offset + 8), sel = u16(b, os2.offset + 62);
            if (weight >= 1 && weight <= 1000) out.weight = Math.round(weight / 100) * 100 || 100;
            out.fsType = fsType;
            // OpenType OS/2 fsType: bit 1 alone is Restricted License embedding; bits 2 and 3 allow it.
            out.restricted = (fsType & 0x000E) === 0x0002;
            if (sel != null) out.italic = out.italic || !!(sel & 0x0001);
            out.fromFile = true;
        }
        return out;
    }

    return { MEDIA: MEDIA, mediaTypeFor: mediaTypeFor, guess: guess, read: read };
});
