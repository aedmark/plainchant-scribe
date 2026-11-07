/*
 * Qr: a QR code for a short text, such as the send-to-reader link (P5-07, D-043). Pure, no DOM.
 *
 * Follows ISO/IEC 18004:2015: byte mode (UTF-8), error correction level M (about 15% of the symbol can be lost),
 * versions 1 to 10 (21 to 57 modules a side, up to 213 bytes), the mask chosen by the standard's four penalty rules.
 * encode(text) returns { version, size, modules }, where modules[y][x] is true for a dark module; svg(code) draws it
 * with the four-module quiet zone the standard requires.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Qr = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Level M, versions 1 to 10 (ISO/IEC 18004 Table 9): error correction codewords per block, and the blocks as
    // [count, data codewords] groups.
    const BLOCKS = [null,
        [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]],
        [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]];
    // Alignment pattern centres (Annex E).
    const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
    const MAX_VERSION = 10;
    const LEVEL_M = 0; // Format information bits for level M (Table C.1).

    function dataCodewords(version) {
        return BLOCKS[version][1].reduce((n, g) => n + g[0] * g[1], 0);
    }

    // The largest number of bytes version 10 holds at level M.
    const MAX_BYTES = Math.floor((dataCodewords(MAX_VERSION) * 8 - 4 - 16) / 8);

    // GF(256) with the primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D).
    function mul(x, y) {
        let z = 0;
        for (let i = 7; i >= 0; i--) {
            z = (z << 1) ^ ((z >>> 7) * 0x11d);
            z ^= ((y >>> i) & 1) * x;
        }
        return z;
    }

    function rsDivisor(degree) {
        const r = new Array(degree).fill(0);
        r[degree - 1] = 1;
        let rootValue = 1;
        for (let i = 0; i < degree; i++) {
            for (let j = 0; j < degree; j++) {
                r[j] = mul(r[j], rootValue);
                if (j + 1 < degree) r[j] ^= r[j + 1];
            }
            rootValue = mul(rootValue, 2);
        }
        return r;
    }

    function rsRemainder(data, divisor) {
        const r = divisor.map(() => 0);
        data.forEach((b) => {
            const factor = b ^ r.shift();
            r.push(0);
            divisor.forEach((c, i) => { r[i] ^= mul(c, factor); });
        });
        return r;
    }

    function utf8(text) {
        return Array.from(new TextEncoder().encode(String(text)));
    }

    function chooseVersion(length) {
        for (let v = 1; v <= MAX_VERSION; v++) {
            const countBits = v < 10 ? 8 : 16;
            if (4 + countBits + length * 8 <= dataCodewords(v) * 8) return v;
        }
        return 0;
    }

    // The data codewords: mode 0100 (byte), the count, the bytes, a terminator, then the pad bytes 0xEC 0x11 (§7.4).
    function dataBytes(bytes, version) {
        const capacity = dataCodewords(version) * 8;
        const bits = [];
        const put = (value, n) => { for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
        put(4, 4);
        put(bytes.length, version < 10 ? 8 : 16);
        bytes.forEach((b) => put(b, 8));
        put(0, Math.min(4, capacity - bits.length));
        put(0, (8 - bits.length % 8) % 8);
        const out = [];
        for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((n, b) => (n << 1) | b, 0));
        for (let pad = 0xec; out.length < capacity / 8; pad ^= 0xec ^ 0x11) out.push(pad);
        return out;
    }

    // Splits the data into blocks, adds each block's error correction, and interleaves them (§7.6).
    function codewords(data, version) {
        const ec = BLOCKS[version][0];
        const divisor = rsDivisor(ec);
        const blocks = [];
        let at = 0;
        BLOCKS[version][1].forEach(([count, size]) => {
            for (let i = 0; i < count; i++) {
                const d = data.slice(at, at + size);
                at += size;
                blocks.push({ data: d, ec: rsRemainder(d, divisor) });
            }
        });
        const out = [];
        const longest = Math.max(...blocks.map((b) => b.data.length));
        for (let i = 0; i < longest; i++) blocks.forEach((b) => { if (i < b.data.length) out.push(b.data[i]); });
        for (let i = 0; i < ec; i++) blocks.forEach((b) => out.push(b.ec[i]));
        return out;
    }

    function grid(size, value) {
        return Array.from({ length: size }, () => new Array(size).fill(value));
    }

    // Finder, separators, timing, alignment, and the dark module; returns the modules and which ones are fixed.
    function functionPatterns(version) {
        const size = version * 4 + 17;
        const m = grid(size, false), fixed = grid(size, false);
        const set = (x, y, dark) => { if (x >= 0 && y >= 0 && x < size && y < size) { m[y][x] = dark; fixed[y][x] = true; } };
        for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
        [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => {
            for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
                const d = Math.max(Math.abs(dx), Math.abs(dy));
                set(cx + dx, cy + dy, d !== 2 && d !== 4);
            }
        });
        const pos = ALIGN[version];
        pos.forEach((cy, i) => pos.forEach((cx, j) => {
            // Not over the three finder patterns.
            if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }));
        // Reserve the format and version areas; drawFormat and drawVersion fill them.
        // Index 6 is the timing pattern, which the format bits go around.
        for (let i = 0; i < 9; i++) if (i !== 6) { set(8, i, false); set(i, 8, false); }
        for (let i = 0; i < 8; i++) { set(size - 1 - i, 8, false); set(8, size - 1 - i, false); }
        if (version >= 7) for (let i = 0; i < 18; i++) { set(size - 11 + i % 3, Math.floor(i / 3), false); set(Math.floor(i / 3), size - 11 + i % 3, false); }
        set(8, size - 8, true);
        return { size: size, m: m, fixed: fixed };
    }

    // The 15 format bits: level and mask with a BCH(15,5) code, XOR 101010000010010 (§7.9).
    function drawFormat(m, size, mask) {
        const data = (LEVEL_M << 3) | mask;
        let rem = data;
        for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        const bits = ((data << 10) | rem) ^ 0x5412;
        const bit = (i) => ((bits >>> i) & 1) === 1;
        for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
        m[7][8] = bit(6);
        m[8][8] = bit(7);
        m[8][7] = bit(8);
        for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i);
        for (let i = 0; i < 8; i++) m[8][size - 1 - i] = bit(i);
        for (let i = 8; i < 15; i++) m[size - 15 + i][8] = bit(i);
        m[size - 8][8] = true;
    }

    // Versions 7 and up: 18 bits, the version with a BCH(18,6) code (§7.10).
    function drawVersion(m, size, version) {
        if (version < 7) return;
        let rem = version;
        for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
        const bits = (version << 12) | rem;
        for (let i = 0; i < 18; i++) {
            const dark = ((bits >>> i) & 1) === 1;
            const a = size - 11 + i % 3, b = Math.floor(i / 3);
            m[b][a] = dark;
            m[a][b] = dark;
        }
    }

    // Places the codewords in the two-module-wide zigzag from the bottom right, skipping the timing column (§7.7.3).
    function drawData(m, fixed, size, words) {
        let i = 0;
        const total = words.length * 8;
        for (let right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            const upward = ((right + 1) & 2) === 0;
            for (let vert = 0; vert < size; vert++) {
                const y = upward ? size - 1 - vert : vert;
                for (let j = 0; j < 2; j++) {
                    const x = right - j;
                    if (fixed[y][x]) continue;
                    // Remainder bits after the last codeword stay light.
                    m[y][x] = i < total && ((words[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
                    i++;
                }
            }
        }
    }

    const MASKS = [
        (x, y) => (x + y) % 2 === 0,
        (x, y) => y % 2 === 0,
        (x) => x % 3 === 0,
        (x, y) => (x + y) % 3 === 0,
        (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
        (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
        (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0,
        (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0
    ];

    function applyMask(m, fixed, size, mask) {
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && MASKS[mask](x, y)) m[y][x] = !m[y][x];
    }

    // The four penalty rules (§7.8.3): runs of five or more, 2x2 blocks, finder-like 1:1:3:1:1 runs, dark balance.
    function penalty(m, size) {
        let score = 0;
        const lines = [];
        for (let i = 0; i < size; i++) { lines.push(m[i]); lines.push(m.map((row) => row[i])); }
        const finder = [true, false, true, true, true, false, true];
        lines.forEach((line) => {
            let run = 1;
            for (let i = 1; i <= size; i++) {
                if (i < size && line[i] === line[i - 1]) { run++; continue; }
                if (run >= 5) score += 3 + run - 5;
                run = 1;
            }
            for (let i = 0; i + 7 <= size; i++) {
                if (!finder.every((d, k) => line[i + k] === d)) continue;
                const lightBefore = i >= 4 && [1, 2, 3, 4].every((k) => !line[i - k]);
                const lightAfter = i + 11 <= size && [7, 8, 9, 10].every((k) => !line[i + k]);
                if (lightBefore || lightAfter) score += 40;
            }
        });
        let dark = 0;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            if (m[y][x]) dark++;
            if (x + 1 < size && y + 1 < size && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
        }
        score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
        return score;
    }

    // options.mask (0 to 7) forces a mask instead of the lowest penalty; the tests use it to check every mask.
    function encode(text, options) {
        const forced = options && options.mask >= 0 && options.mask <= 7 ? options.mask : -1;
        const bytes = utf8(text);
        const version = chooseVersion(bytes.length);
        if (!version) {
            const e = new Error('The text is ' + bytes.length + ' bytes; a QR code here holds at most ' + MAX_BYTES + '.');
            e.code = 'too-long';
            throw e;
        }
        const words = codewords(dataBytes(bytes, version), version);
        let best = null;
        for (let mask = 0; mask < 8; mask++) {
            if (forced !== -1 && mask !== forced) continue;
            const f = functionPatterns(version);
            drawData(f.m, f.fixed, f.size, words);
            applyMask(f.m, f.fixed, f.size, mask);
            drawFormat(f.m, f.size, mask);
            drawVersion(f.m, f.size, version);
            const score = penalty(f.m, f.size);
            if (!best || score < best.score) best = { score: score, mask: mask, modules: f.m, size: f.size };
        }
        return { version: version, size: best.size, mask: best.mask, modules: best.modules };
    }

    // An SVG of the code, one unit per module, with a four-module quiet zone (§6.3.8). Dark modules as one path.
    function svg(code, label) {
        const quiet = 4, n = code.size + quiet * 2;
        let d = '';
        code.modules.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += 'M' + (x + quiet) + ' ' + (y + quiet) + 'h1v1h-1z'; }));
        const title = label ? '<title>' + String(label).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</title>' : '';
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges" role="img">' +
            title + '<rect width="' + n + '" height="' + n + '" fill="#fff"/><path fill="#000" d="' + d + '"/></svg>';
    }

    return { encode: encode, svg: svg, MAX_BYTES: MAX_BYTES, MAX_VERSION: MAX_VERSION };
}));
