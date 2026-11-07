/*
 * Qr: the send-to-reader QR code (P5-07, D-043). When zbarimg (the ZBar bar code reader) is on the PATH, it is the
 * oracle: every version and every mask must decode back to the text. Without it the oracle prints "not run".
 */
const qrFs = require('fs');
const qrPath = require('path');
const qrOs = require('os');
const qrChild = require('child_process');

// Reads the 15 format bits next to the top-left finder (ISO/IEC 18004 §7.9), XOR mask removed.
function qrFormat(code) {
    const m = code.modules;
    const cells = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
    let bits = 0;
    cells.forEach(([x, y], i) => { if (m[y][x]) bits |= 1 << i; });
    return (bits ^ 0x5412) >>> 10;
}

test('qr: sizes, fixed patterns, and format bits follow ISO/IEC 18004', () => {
    const url = 'http://192.168.1.23:54321/0123456789abcdef0123456789abcdef/';
    const c = Qr.encode(url);
    assert.equal(c.version, 4, 'a send-to-reader link fits version 4 at level M');
    assert.equal(c.size, 33);
    assert.equal(c.modules.length, 33);
    assert.ok(c.modules.every((row) => row.length === 33));
    // Finder: a 7x7 ring with a 3x3 centre, a light separator, top left.
    const ring = [0, 1, 2, 3, 4, 5, 6].map((i) => c.modules[0][i] && c.modules[6][i] && c.modules[i][0] && c.modules[i][6]);
    assert.ok(ring.every(Boolean));
    assert.ok(c.modules[3][3] && !c.modules[1][1] && !c.modules[7][3] && !c.modules[3][7]);
    // Timing: alternating along row 6 and column 6, dark on even indexes, including where the format bits go round it.
    for (let i = 8; i < c.size - 8; i++) { assert.equal(c.modules[6][i], i % 2 === 0); assert.equal(c.modules[i][6], i % 2 === 0); }
    assert.ok(c.modules[c.size - 8][8], 'the dark module');
    // Alignment pattern at (26, 26) for version 4: dark centre, light ring, dark edge.
    assert.ok(c.modules[26][26] && !c.modules[25][26] && c.modules[24][26]);
    assert.equal(qrFormat(c), c.mask, 'format bits: level M (00) and the chosen mask');
    // Both copies of the format bits, against ISO/IEC 18004 Table C.1's strings for level M, masks 0 to 7.
    const TABLE = ['101010000010010', '101000100100101', '101111001111100', '101101101001011', '100010111111001', '100000011001110', '100111110010111', '100101010100000'];
    for (let mask = 0; mask < 8; mask++) {
        const m = Qr.encode(url, { mask: mask }).modules, n = m.length;
        const first = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
        const second = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [n - 1 - i, 8]).concat([8, 9, 10, 11, 12, 13, 14].map((i) => [8, n - 15 + i]));
        [first, second].forEach((cells) => {
            const read = cells.map(([x, y]) => (m[y][x] ? '1' : '0')).reverse().join('');
            assert.equal(read, TABLE[mask], 'mask ' + mask);
        });
    }
    for (let mask = 0; mask < 8; mask++) assert.equal(qrFormat(Qr.encode(url, { mask: mask })), mask);
    assert.equal(Qr.encode('A').version, 1);
    assert.equal(Qr.encode('a'.repeat(Qr.MAX_BYTES)).version, 10);
    assert.equal(Qr.MAX_BYTES, 213);
});

test('qr: version 7 and up carry the version bits; too long a text is refused', () => {
    const c = Qr.encode('v'.repeat(110));
    assert.equal(c.version, 7);
    // The version block (§7.10) is 000111 110010 010100 for version 7, least significant bit first along each copy.
    const bits = 0x07c94;
    for (let i = 0; i < 18; i++) {
        const a = c.size - 11 + i % 3, b = Math.floor(i / 3), dark = ((bits >>> i) & 1) === 1;
        assert.equal(c.modules[b][a], dark);
        assert.equal(c.modules[a][b], dark);
    }
    assert.throws(() => Qr.encode('a'.repeat(Qr.MAX_BYTES + 1)), /at most 213/);
    assert.throws(() => Qr.encode('é'.repeat(107)), /214 bytes/, 'counts UTF-8 bytes, not characters');
});

test('qr: the SVG has a quiet zone and escapes its label', () => {
    const c = Qr.encode('A');
    const svg = Qr.svg(c, 'Link <to> "book" & more');
    assert.includes(svg, 'viewBox="0 0 29 29"');
    assert.includes(svg, '<title>Link &lt;to> "book" &amp; more</title>');
    assert.includes(svg, 'M4 4h1v1h-1z', 'the first dark module sits inside the four-module quiet zone');
    const dark = c.modules.reduce((n, row) => n + row.filter(Boolean).length, 0);
    assert.equal((svg.match(/h1v1h-1z/g) || []).length, dark);
});

function qrZbar() {
    try { qrChild.execFileSync('zbarimg', ['--version'], { stdio: 'ignore' }); return true; } catch (e) { return false; }
}

// A grey map (PGM) of the code, four pixels a module, with the quiet zone.
function qrPgm(code) {
    const q = 4, k = 4, s = (code.size + q * 2) * k;
    const rows = [];
    for (let y = 0; y < s; y++) {
        const row = [];
        for (let x = 0; x < s; x++) {
            const mx = Math.floor(x / k) - q, my = Math.floor(y / k) - q;
            row.push(mx >= 0 && my >= 0 && mx < code.size && my < code.size && code.modules[my][mx] ? 0 : 255);
        }
        rows.push(row.join(' '));
    }
    return 'P2\n' + s + ' ' + s + '\n255\n' + rows.join('\n') + '\n';
}

function qrHas(cmd) {
    try { qrChild.execFileSync(cmd, ['--version'], { stdio: 'ignore' }); return true; } catch (e) { return false; }
}

// zbarimg corrects errors, so a few wrong modules still read back. qrencode (libqrencode) is the exact oracle: for the
// same text, version, and mask, every module must match.
if (qrHas('qrencode')) {
    test('qr: every module matches qrencode for the same version and mask (oracle)', () => {
        const texts = ['A', 'http://192.168.1.23:54321/0123456789abcdef0123456789abcdef/', 'é✓ '.repeat(20)];
        [14, 26, 42, 62, 84, 106, 122, 152, 180, 213].forEach((n) => texts.push('q'.repeat(n - 1) + '!'));
        const seen = new Set();
        texts.forEach((text) => {
            const ascii = qrChild.execFileSync('qrencode', ['-8', '-l', 'M', '-m', '0', '-t', 'ASCII', '-o', '-', text], { encoding: 'utf8' });
            const theirs = ascii.split('\n').filter((l) => l.length).map((l) => Array.from({ length: l.length / 2 }, (_, i) => l[i * 2] === '#'));
            const mask = qrFormat({ modules: theirs });
            const ours = Qr.encode(text, { mask: mask });
            seen.add(ours.version);
            assert.equal(ours.size, theirs.length, text.slice(0, 20) + ': size');
            const diff = [];
            ours.modules.forEach((row, y) => row.forEach((dark, x) => { if (dark !== theirs[y][x]) diff.push(x + ',' + y); }));
            assert.deepEqual(diff.slice(0, 5), [], 'version ' + ours.version + ', mask ' + mask + ': ' + diff.length + ' modules differ');
        });
        assert.equal(seen.size, Qr.MAX_VERSION);
    });
} else {
    console.log('  skip qr: qrencode oracle not run (qrencode is not on the PATH)');
}

if (qrZbar()) {
    test('qr: zbarimg reads every version and every mask back to the text (oracle)', () => {
        const dir = qrFs.mkdtempSync(qrPath.join(qrOs.tmpdir(), 'scribe-qr-'));
        try {
            const texts = ['A', 'http://192.168.1.23:54321/0123456789abcdef0123456789abcdef/', 'http://[fe80::1]:65535/' + 'f'.repeat(32) + '/', 'é✓ '.repeat(20)];
            // The most bytes each version holds at level M (ISO/IEC 18004 Table 7), so each fills its symbol.
            [14, 26, 42, 62, 84, 106, 122, 152, 180, 213].forEach((n, i) => {
                texts.push('n'.repeat(n));
                assert.equal(Qr.encode('n'.repeat(n)).version, i + 1);
                if (i < 9) assert.equal(Qr.encode('n'.repeat(n + 1)).version, i + 2);
            });
            const seen = new Set();
            texts.forEach((text, n) => {
                for (let mask = 0; mask < 8; mask++) {
                    const code = Qr.encode(text, { mask: mask });
                    seen.add(code.version);
                    const file = qrPath.join(dir, n + '-' + mask + '.pgm');
                    qrFs.writeFileSync(file, qrPgm(code));
                    let out = '';
                    try { out = qrChild.execFileSync('zbarimg', ['-q', '--raw', file], { encoding: 'utf8' }); } catch (e) { out = ''; }
                    assert.equal(out.replace(/\n$/, ''), text, 'version ' + code.version + ', mask ' + mask);
                }
            });
            assert.equal(seen.size, Qr.MAX_VERSION, 'every version from 1 to 10 was read');
        } finally {
            qrFs.rmSync(dir, { recursive: true, force: true });
        }
    });
} else {
    console.log('  skip qr: zbarimg oracle not run (zbarimg is not on the PATH)');
}
