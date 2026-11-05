// Builds a minimal sfnt (TrueType) file with a name table and an OS/2 table, enough for FontInfo to read.
function fiFont(opts) {
    const o = Object.assign({ family: 'Test Serif', sub: 'Regular', weight: 400, fsType: 0, italicBit: false, typo: null, mac: false }, opts);
    const utf16 = (s) => { const out = []; for (const ch of s) { const c = ch.charCodeAt(0); out.push(c >> 8, c & 255); } return out; };
    const recs = [[1, o.family], [2, o.sub]].concat(o.typo ? [[16, o.typo]] : []);
    const strings = [], records = [];
    recs.forEach(([id, text]) => {
        const bytes = o.mac ? Array.from(text, (c) => c.charCodeAt(0)) : utf16(text);
        records.push([o.mac ? 1 : 3, o.mac ? 0 : 1, o.mac ? 0 : 0x409, id, bytes.length, strings.length]);
        strings.push.apply(strings, bytes);
    });
    const u16 = (v) => [(v >> 8) & 255, v & 255];
    const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    const name = [].concat(u16(0), u16(records.length), u16(6 + records.length * 12), ...records.map((r) => [].concat(...r.map(u16))), strings);
    const os2 = new Array(96).fill(0);
    os2.splice(4, 2, ...u16(o.weight));
    os2.splice(8, 2, ...u16(o.fsType));
    os2.splice(62, 2, ...u16(o.italicBit ? 1 : 0));
    const tables = [['OS/2', os2], ['name', name]];
    const head = [].concat(u32(0x00010000), u16(tables.length), u16(0), u16(0), u16(0));
    let offset = 12 + tables.length * 16;
    const dir = [], body = [];
    tables.forEach(([tag, data]) => {
        dir.push(...Array.from(tag, (c) => c.charCodeAt(0)), ...u32(0), ...u32(offset), ...u32(data.length));
        body.push(...data);
        offset += data.length;
    });
    return Uint8Array.from(head.concat(dir, body));
}

test('font-info: family, weight, italic, and the embedding flag are read from a TrueType file (P4-03)', () => {
    const r = FontInfo.read(fiFont({ family: 'Lora', sub: 'Bold Italic', weight: 700 }), 'whatever.ttf');
    assert.deepEqual([r.format, r.mediaType, r.family, r.weight, r.italic, r.fsType, r.restricted, r.fromFile], ['ttf', 'font/ttf', 'Lora', 700, true, 0, false, true]);
    assert.equal(FontInfo.read(fiFont({ family: 'Lora', typo: 'Lora Display' }), 'a.ttf').family, 'Lora Display', 'the typographic family (name ID 16) wins');
    assert.equal(FontInfo.read(fiFont({ sub: 'Regular', italicBit: true }), 'a.ttf').italic, true, 'fsSelection italic');
    assert.equal(FontInfo.read(fiFont({ family: 'Mac Name', mac: true }), 'a.ttf').family, 'Mac Name', 'Macintosh Roman names');
    assert.equal(FontInfo.read(fiFont({ weight: 350 }), 'a.ttf').weight, 400, 'weights round to the nearest hundred');
});

test('font-info: the OpenType fsType flag marks fonts whose licence forbids embedding', () => {
    assert.equal(FontInfo.read(fiFont({ fsType: 0x0002 }), 'a.ttf').restricted, true, 'Restricted License embedding');
    [0x0000, 0x0004, 0x0008, 0x0100].forEach((f) => assert.equal(FontInfo.read(fiFont({ fsType: f }), 'a.ttf').restricted, false, 'fsType ' + f));
    // When several embedding bits are set, the least restrictive one wins (OpenType OS/2 fsType).
    [0x0006, 0x000A].forEach((f) => assert.equal(FontInfo.read(fiFont({ fsType: f }), 'a.ttf').restricted, false, 'fsType ' + f));
    assert.equal(FontInfo.read(fiFont({ fsType: 0x0302 }), 'a.ttf').restricted, true, 'subsetting and bitmap bits do not lift a restriction');
});

test('font-info: compressed or damaged files fall back to a guess from the file name', () => {
    assert.deepEqual(FontInfo.guess('EBGaramond-SemiBoldItalic.ttf'), { family: 'EB Garamond', weight: 600, italic: true });
    assert.deepEqual(FontInfo.guess('eb-garamond-latin-600-normal.woff2'), { family: 'Eb Garamond', weight: 600, italic: false });
    assert.deepEqual(FontInfo.guess('courier-prime-latin-700-italic.woff2'), { family: 'Courier Prime', weight: 700, italic: true });
    assert.deepEqual(FontInfo.guess('PTSerif-Regular.ttf'), { family: 'PT Serif', weight: 400, italic: false });
    const woff2 = FontInfo.read(require('fs').readFileSync(require('path').join(__dirname, '..', 'fonts', 'eb-garamond-latin-400-italic.woff2')), 'eb-garamond-latin-400-italic.woff2');
    assert.deepEqual([woff2.mediaType, woff2.family, woff2.italic, woff2.fromFile], ['font/woff2', 'Eb Garamond', true, false]);
    const truncated = fiFont({ family: 'Lora' }).slice(0, 40);
    assert.equal(FontInfo.read(truncated, 'Lora-Bold.ttf').family, 'Lora', 'a damaged table directory gives the guess');
    assert.equal(FontInfo.read(new Uint8Array(0), 'x.otf').mediaType, 'font/otf');
    assert.equal(FontInfo.mediaTypeFor('a.woff'), 'font/woff');
    assert.equal(FontInfo.mediaTypeFor('a.eot'), null);
});
