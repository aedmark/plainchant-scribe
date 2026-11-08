/*
 * ImageMagick as the image header oracle (P7-02, D-051): it writes real PNG, JPEG, GIF, and WebP files, and
 * BookImages.inspect must report the size, colour model, and animation that ImageMagick's identify reports. Runs only
 * when magick is on the PATH (or MAGICK names it); SCRIBE_SKIP_MAGICK=1 skips it.
 */
const imgFs = require('fs');
const imgPath = require('path');
const imgOs = require('os');
const imgChild = require('child_process');

function findMagick() {
    if (process.env.SCRIBE_SKIP_MAGICK === '1') return { reason: 'SCRIBE_SKIP_MAGICK=1' };
    const named = process.env.MAGICK;
    if (named) return imgFs.existsSync(named) ? { bin: named } : { reason: 'MAGICK does not exist' };
    try { return { bin: imgChild.execFileSync('which', ['magick'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }; } catch (e) { return { reason: 'magick is not on the PATH' }; }
}

const imgOracle = findMagick();

if (!imgOracle.bin) {
    console.log('  skip imagemagick: oracle not run (' + imgOracle.reason + ')');
} else {
    test('imagemagick: BookImages reads the size, colour model, animation, and alpha of real images as identify does (oracle)', () => {
        const dir = imgFs.mkdtempSync(imgPath.join(imgOs.tmpdir(), 'scribe-im-'));
        const run = (args) => imgChild.execFileSync(imgOracle.bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 });
        try {
            const cases = [
                ['rgb.png', ['-size', '1600x2560', 'xc:#336699']],
                ['rgba.png', ['-size', '33x17', 'xc:none', '-fill', 'red', '-draw', 'point 1,1']],
                ['palette.png', ['-size', '40x30', 'xc:none', '-fill', 'blue', '-draw', 'rectangle 0,0 9,9'], 'PNG8:'],
                ['grey.png', ['-size', '5x7', 'gradient:', '-colorspace', 'Gray']],
                ['rgb.jpg', ['-size', '3001x2003', 'plasma:', '-quality', '80']],
                ['progressive.jpg', ['-size', '640x480', 'xc:orange', '-interlace', 'JPEG']],
                ['cmyk.jpg', ['-size', '120x90', 'xc:green', '-colorspace', 'CMYK']],
                ['still.gif', ['-size', '300x200', 'xc:white']],
                ['animated.gif', ['-delay', '10', '-size', '64x48', 'xc:red', 'xc:blue', 'xc:none', '-loop', '0']],
                ['lossy.webp', ['-size', '641x481', 'xc:purple', '-quality', '75']],
                ['lossless.webp', ['-size', '100x50', 'xc:none', '-fill', 'red', '-draw', 'point 3,3', '-define', 'webp:lossless=true']],
                ['animated.webp', ['-delay', '10', '-size', '32x32', 'xc:red', 'xc:blue', '-loop', '0']]
            ];
            const seen = [];
            cases.forEach(([name, args, prefix]) => {
                const file = imgPath.join(dir, name);
                run(args.concat([(prefix || '') + file]));
                const frames = run(['identify', '-format', '%w %h %[colorspace] %A\n', file]).trim().split('\n');
                const [w, h, space] = frames[0].split(' ');
                const alpha = frames.some((l) => !/ (False|Undefined)$/.test(l));
                const info = BookImages.inspect(imgFs.readFileSync(file));
                assert.ok(info, name + ' was not read');
                assert.deepEqual([info.width, info.height], [Number(w), Number(h)], name + ' size');
                assert.equal(info.cmyk, space === 'CMYK', name + ' colour model (' + space + ')');
                assert.equal(info.animated, frames.length > 1, name + ' frames');
                if (alpha) assert.ok(info.mayHaveAlpha, name + ' has alpha, so it may be transparent');
                seen.push(name.split('.').pop());
            });
            assert.deepEqual([...new Set(seen)], ['png', 'jpg', 'gif', 'webp']);
        } finally {
            imgFs.rmSync(dir, { recursive: true, force: true });
        }
    });
}
