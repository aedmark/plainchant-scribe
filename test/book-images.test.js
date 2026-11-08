// BookImages (P7-02, D-051): headers built by hand here; test/images-oracle.test.js holds them to ImageMagick.
const imBytes = (...parts) => Uint8Array.from([].concat(...parts.map((p) => typeof p === 'string' ? Array.from(p, (c) => c.charCodeAt(0)) : Array.from(p))));
const imBe32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const imLe = (n, k) => Array.from({ length: k }, (_, i) => (n >>> (8 * i)) & 255);
const imChunk = (type, data) => imBytes(imBe32(data.length), type, data, [0, 0, 0, 0]);
const imPng = (w, h, colorType, extra) => imBytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], imChunk('IHDR', [].concat(imBe32(w), imBe32(h), [8, colorType, 0, 0, 0])), ...(extra || []), imChunk('IDAT', [0]), imChunk('IEND', []));
// A Huffman table (0xC4) sits before the frame, as in many encoders' output; its marker is in the SOF range.
const imJpeg = (w, h, comps, sof) => imBytes([0xFF, 0xD8], [0xFF, 0xE0, 0, 6], 'JFIF', [0xFF, 0xE1, 0, 4, 1, 2], [0xFF, 0xC4, 0, 9, 0, 0x7F, 0x7F, 0x7F, 0x7F, 3, 3], [0xFF, sof || 0xC0, 0, 8 + 3 * comps, 8, h >> 8, h & 255, w >> 8, w & 255, comps], new Array(3 * comps).fill(1), [0xFF, 0xDA, 0, 2]);
const imGif = (w, h, frames, transparent, version) => {
    // Every frame has a graphic control extension; only its low bit says a colour is transparent.
    const frame = [].concat([0x21, 0xF9, 4, transparent ? 1 : 0, 0, 0, 0, 0], [0x2C, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0, 2, 2, 0x4C, 0x01, 0]);
    return imBytes(version || 'GIF89a', [w & 255, w >> 8, h & 255, h >> 8, 0x80, 0, 0], new Array(6).fill(0), [0x21, 0xFF, 3, 1, 2, 3, 0], ...new Array(frames).fill(frame), [0x3B]);
};
const imRiff = (kind, data) => imBytes('RIFF', imLe(4 + 8 + data.length, 4), 'WEBP', kind, imLe(data.length, 4), data);

test('book-images: inspect reads size, colour model, animation, and possible transparency from PNG, JPEG, GIF, and WebP headers (P7-02)', () => {
    const pick = (i) => i && [i.format, i.width, i.height, i.cmyk, i.animated, i.mayHaveAlpha];
    assert.deepEqual(pick(BookImages.inspect(imPng(1600, 2560, 2))), ['png', 1600, 2560, false, false, false]);
    assert.deepEqual(pick(BookImages.inspect(imPng(10, 20, 6))), ['png', 10, 20, false, false, true], 'RGBA');
    assert.deepEqual(pick(BookImages.inspect(imPng(10, 20, 4))), ['png', 10, 20, false, false, true], 'grey with alpha');
    assert.deepEqual(pick(BookImages.inspect(imPng(10, 20, 3, [imChunk('PLTE', [0, 0, 0]), imChunk('tRNS', [0])]))), ['png', 10, 20, false, false, true], 'a transparent palette entry');
    assert.deepEqual(pick(BookImages.inspect(imPng(10, 20, 2, [imChunk('acTL', [].concat(imBe32(3), imBe32(0)))]))), ['png', 10, 20, false, true, false], 'APNG');
    assert.equal(BookImages.inspect(imPng(10, 20, 2, [imChunk('acTL', [].concat(imBe32(1), imBe32(0)))])).animated, false, 'one frame is still');
    assert.deepEqual(pick(BookImages.inspect(imJpeg(3000, 2000, 3))), ['jpeg', 3000, 2000, false, false, false], 'after APP0 and APP1');
    assert.deepEqual(pick(BookImages.inspect(imJpeg(640, 480, 4, 0xC2))), ['jpeg', 640, 480, true, false, false], 'progressive CMYK');
    assert.deepEqual(pick(BookImages.inspect(imJpeg(8, 8, 1))), ['jpeg', 8, 8, false, false, false], 'greyscale');
    assert.deepEqual(pick(BookImages.inspect(imGif(300, 200, 1, false))), ['gif', 300, 200, false, false, false]);
    assert.deepEqual(pick(BookImages.inspect(imGif(300, 200, 2, true))), ['gif', 300, 200, false, true, true]);
    assert.deepEqual(pick(BookImages.inspect(imGif(30, 20, 1, false, 'GIF87a'))), ['gif', 30, 20, false, false, false], 'GIF87a');
    assert.deepEqual(pick(BookImages.inspect(imRiff('VP8X', [].concat([0x10, 0, 0, 0], imLe(3999, 3), imLe(1999, 3))))), ['webp', 4000, 2000, false, false, true], 'VP8X alpha');
    assert.deepEqual(pick(BookImages.inspect(imRiff('VP8X', [].concat([0x02, 0, 0, 0], imLe(9, 3), imLe(9, 3))))), ['webp', 10, 10, false, true, false], 'VP8X animation');
    const l = ((99) | (49 << 14) | (1 << 28)) >>> 0;
    assert.deepEqual(pick(BookImages.inspect(imRiff('VP8L', [0x2F].concat(imLe(l, 4))))), ['webp', 100, 50, false, false, true], 'lossless with alpha');
    assert.deepEqual(pick(BookImages.inspect(imRiff('VP8 ', [0, 0, 0, 0x9D, 0x01, 0x2A].concat(imLe(0x4000 | 640, 2), imLe(0xC000 | 480, 2))))), ['webp', 640, 480, false, false, false], 'lossy, the top two bits are the scale');
    assert.equal(BookImages.inspect(imBytes('<svg xmlns="http://www.w3.org/2000/svg"/>')), null, 'SVG has no pixel size');
    assert.equal(BookImages.inspect(null), null);
});

test('book-images: inspect never throws on truncated, corrupt, or random bytes', () => {
    const samples = [imPng(10, 20, 6, [imChunk('acTL', [].concat(imBe32(3), imBe32(0)))]), imJpeg(3000, 2000, 4), imGif(30, 20, 3, true), imRiff('VP8X', new Array(10).fill(0x12))];
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed >>> 16; };
    samples.forEach((s) => {
        for (let n = 0; n <= s.length; n++) BookImages.inspect(s.subarray(0, n));
        for (let k = 0; k < 300; k++) { const c = Uint8Array.from(s); c[rnd() % c.length] = rnd() & 255; c[rnd() % c.length] = 0xFF; BookImages.inspect(c); }
    });
    for (let k = 0; k < 300; k++) BookImages.inspect(Uint8Array.from({ length: rnd() % 64 }, () => rnd() & 255));
    // A segment length below 2 is not JPEG.
    assert.equal(BookImages.inspect(imBytes([0xFF, 0xD8, 0xFF, 0xE0, 0, 0])), null);
});

test('book-images: rows name the store whose limit an image breaks, and the cover gets the cover rules (P7-02)', () => {
    const f = BookCover.set(ExampleBook.create({ uuid: '0f3c2a1e-6b7d-4e2a-9c1b-8a5d4f3e2b10', now: Date.UTC(2026, 10, 4) }).files, 'OEBPS/images/cover.gif', ['OEBPS/images/cover.gif']).entries;
    const assets = ['OEBPS/images/cover.gif', 'OEBPS/images/big.jpg', 'OEBPS/images/ok.png', 'OEBPS/images/fig.svg', 'OEBPS/images/loose.png'];
    let e = f;
    ['OEBPS/images/big.jpg', 'OEBPS/images/ok.png', 'OEBPS/images/fig.svg'].forEach((p) => { e = BookBlocks.listImage(e, p, assets); });
    const model = Book.read(e, { assets: assets }).model;
    const info = (format, width, height, more) => Object.assign({ format: format, width: width, height: height, size: 1000, cmyk: false, animated: false, transparent: false }, more);
    const infos = {
        'OEBPS/images/cover.gif': info('gif', 900, 800, { size: 6 * 1024 * 1024, animated: true, transparent: true }),
        'OEBPS/images/big.jpg': info('jpeg', 4000, 1500, { cmyk: true }),
        'OEBPS/images/ok.png': info('png', 1600, 2560),
        'OEBPS/images/loose.png': info('png', 9000, 9000)
    };
    const got = BookImages.rows(model, infos).map((r) => [r.file.split('/').pop(), r.code, r.severity, r.category].join(' '));
    assert.deepEqual(got, [
        'cover.gif image-transparent warning images', 'cover.gif image-animated warning images', 'cover.gif image-format warning images',
        'cover.gif cover-format warning images', 'cover.gif cover-bytes warning images', 'cover.gif cover-portrait warning images', 'cover.gif cover-small warning images',
        'big.jpg image-pixels warning images', 'big.jpg image-side warning images', 'big.jpg image-cmyk warning images'
    ], 'ok.png is within every limit, fig.svg has no info, and loose.png is not in the manifest (BookCheck reports it)');
    const msg = BookImages.rows(model, infos).map((r) => r.message).join('\n');
    ['Apple Books', 'Google Play Books', 'Kindle', 'KDP', 'Kobo'].forEach((store) => assert.includes(msg, store));
    assert.includes(msg, '4000 × 1500 (6.0 million)');
    assert.deepEqual(BookImages.rows(model, { 'OEBPS/images/ok.png': info('webp', 10, 10) }).map((r) => r.code), ['image-format'], 'WebP, like GIF, is not JPEG or PNG');
    assert.deepEqual(BookImages.rows(model, { 'OEBPS/images/cover.gif': info('png', 1600, 1600) }).map((r) => r.code), ['cover-portrait'], 'a square cover is not portrait');
    assert.deepEqual(BookImages.rows(model, { 'OEBPS/images/cover.gif': info('png', 1000, 1300) }), [], '1300 pixels tall is enough for KDP');
    assert.deepEqual(BookImages.rows(model, { 'OEBPS/css/book.css': info('gif', 9000, 9000), 'OEBPS/images/cover.gif': { format: 'gif', size: 9e6 } }), [], 'only images with a size in pixels');
    const edge = { 'OEBPS/images/ok.png': info('png', 2000, 2800) };
    assert.deepEqual(BookImages.rows(model, edge), [], '5.6 million pixels exactly is allowed');
    assert.deepEqual(BookImages.rows(model, { 'OEBPS/images/ok.png': info('png', 3200, 1750) }), [], '3200 pixels exactly is allowed');
    assert.deepEqual(BookImages.rows(null, infos), []);
});
