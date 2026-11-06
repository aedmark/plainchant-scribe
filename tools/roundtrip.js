#!/usr/bin/env node
/*
 * Round-trip evidence (P5-06, D-042): imports each book in test/corpus.json with the app's own Epub.read, exports it
 * with BookExport.pack after setting dcterms:modified as the Export button does, and compares the two archives.
 * A book passes when every file is byte-identical except that one dcterms:modified value, nothing is left out, and
 * EPUBCheck gives the same messages before and after. When Calibre's ebook-convert is on the PATH, each export is
 * also converted to AZW3, the route a legacy Kindle gets (D-010).
 *
 * The books are not committed: put them in .tools/corpus/ (git-ignored), checked against the SHA-256 in the
 * manifest. Usage: npm run roundtrip [-- file.epub ...] [--no-calibre]. Exports go to .tools/corpus/out/.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');
const child = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
global.XmlAst = require(path.join(SRC, 'xml-ast.js'));
const Zip = require(path.join(SRC, 'zip.js'));
const Book = require(path.join(SRC, 'book.js'));
const OpfEdit = require(path.join(SRC, 'opf-edit.js'));
const Epub = require(path.join(SRC, 'epub.js'));
const BookExport = require(path.join(SRC, 'book-export.js'));
const BookCheck = require(path.join(SRC, 'book-check.js'));
const CssLint = require(path.join(SRC, 'css-lint.js'));

const CORPUS_DIR = path.join(ROOT, '.tools', 'corpus');
const MANIFEST = path.join(ROOT, 'test', 'corpus.json');

// The stored bytes of each entry, by name, in archive order. Only for archives Epub.read has already accepted.
function readRaw(bytes) {
    const b = Buffer.from(bytes);
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('no end of central directory');
    const count = b.readUInt16LE(eocd + 10);
    let at = b.readUInt32LE(eocd + 16);
    const out = new Map();
    for (let n = 0; n < count; n++) {
        if (b.readUInt32LE(at) !== 0x02014b50) throw new Error('bad central directory');
        const method = b.readUInt16LE(at + 10);
        const compressed = b.readUInt32LE(at + 20), size = b.readUInt32LE(at + 24);
        const nameLen = b.readUInt16LE(at + 28), extraLen = b.readUInt16LE(at + 30), commentLen = b.readUInt16LE(at + 32);
        const local = b.readUInt32LE(at + 42);
        const name = b.toString('utf8', at + 46, at + 46 + nameLen);
        const dataAt = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
        const stored = b.subarray(dataAt, dataAt + compressed);
        out.set(name, { method: method, data: method === 8 ? zlib.inflateRawSync(stored) : Buffer.from(stored.subarray(0, size)) });
        at += 46 + nameLen + extraLen + commentLen;
    }
    return out;
}

const MODIFIED = /(<meta\b[^>]*\bproperty\s*=\s*["']dcterms:modified["'][^>]*>)[^<]*(<\/meta>)/;

// The package document with its dcterms:modified value emptied, so the one change Export makes compares equal.
const withoutModified = (text) => text.replace(MODIFIED, '$1$2');

// Compares two archives' files. opfPath: the package document, where a changed dcterms:modified is allowed.
function compareArchives(before, after, opfPath) {
    const a = readRaw(before), b = readRaw(after);
    const changed = [], missing = [], added = [];
    let folders = 0;
    a.forEach((v, name) => {
        // Folder entries hold nothing; import skips them and export does not write them.
        if (name.endsWith('/') && v.data.length === 0) { folders++; return; }
        if (!b.has(name)) { missing.push(name); return; }
        const w = b.get(name).data;
        if (Buffer.compare(v.data, w) === 0) return;
        if (name === opfPath && withoutModified(v.data.toString('utf8')) === withoutModified(w.toString('utf8'))) return;
        changed.push(name);
    });
    b.forEach((v, name) => { if (!a.has(name)) added.push(name); });
    const names = Array.from(b.keys());
    return {
        files: a.size - folders, folders: folders, changed: changed, missing: missing, added: added,
        mimetypeFirst: names[0] === 'mimetype' && b.get('mimetype').method === 0
    };
}

function findEpubcheck() {
    let jar = process.env.EPUBCHECK_JAR || null;
    if (!jar) {
        const tools = path.join(ROOT, '.tools');
        const dirs = fs.existsSync(tools) ? fs.readdirSync(tools).filter((d) => /^epubcheck-[\d.]+$/.test(d)).sort((x, y) => x.localeCompare(y, 'en', { numeric: true })) : [];
        const found = dirs.map((d) => path.join(tools, d, 'epubcheck.jar')).filter((p) => fs.existsSync(p));
        jar = found.length ? found[found.length - 1] : null;
    }
    if (!jar || !fs.existsSync(jar)) return null;
    try { child.execFileSync('java', ['-version'], { stdio: 'ignore' }); } catch (e) { return null; }
    return jar;
}

// EPUBCheck's messages on a file, as sorted "SEVERITY ID path:line" lines.
function epubcheck(jar, file) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scribe-roundtrip-'));
    try {
        const report = path.join(dir, 'report.json');
        try { child.execFileSync('java', ['-jar', jar, file, '--json', report], { stdio: 'ignore' }); } catch (e) { /* non-zero when the book has errors */ }
        const r = JSON.parse(fs.readFileSync(report, 'utf8'));
        const lines = [];
        r.messages.forEach((m) => (m.locations.length ? m.locations : [{ path: '', line: -1 }]).forEach((l) => lines.push(m.severity + ' ' + m.ID + ' ' + l.path + ':' + l.line)));
        return { version: r.checker.checkerVersion, messages: lines.sort() };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function hasCommand(cmd) {
    try { child.execFileSync(cmd, ['--version'], { stdio: 'ignore' }); return true; } catch (e) { return false; }
}

// Imports, checks, and exports one book. Returns everything the report needs; `exported` is the export's bytes.
async function roundTrip(bytes, when) {
    const book = await Epub.read(new Uint8Array(bytes));
    const assets = Object.keys(book.binaries);
    const heads = {};
    assets.forEach((p) => { heads[p] = book.binaries[p].subarray(0, 16); });
    const problems = BookCheck.check(book.entries, { assets: assets, heads: heads }).problems.concat(CssLint.createChecker().check(book.entries).problems);
    const model = Book.read(book.entries, { assets: assets }).model;
    if (!model) throw new Error('content.opf could not be read after import');
    const entries = Object.assign({}, book.entries, { [model.opfPath]: XmlAst.applyEdits(book.entries[model.opfPath], OpfEdit.touchModified(model, when)) });
    const res = await BookExport.pack(entries, book.binaries, { when: new Date(when) });
    return {
        title: book.title, opfPath: model.opfPath, warnings: book.warnings, skipped: book.skipped,
        importErrors: book.problems.filter((p) => p.severity === 'error').length,
        problems: problems, left: res.left, missingOnExport: res.missing, exported: res.bytes,
        compare: compareArchives(bytes, res.bytes, model.opfPath)
    };
}

function tally(problems) {
    const out = {};
    problems.forEach((p) => { const k = p.severity + ' ' + p.code; out[k] = (out[k] || 0) + 1; });
    return out;
}

async function main(argv) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    const only = argv.filter((a) => !a.startsWith('--')).map((a) => path.basename(a));
    const calibre = !argv.includes('--no-calibre') && hasCommand('ebook-convert');
    const jar = findEpubcheck();
    const outDir = path.join(CORPUS_DIR, 'out');
    fs.mkdirSync(outDir, { recursive: true });
    console.log('EPUBCheck: ' + (jar ? jar : 'not run (no jar in .tools/ or EPUBCHECK_JAR, or no java)'));
    console.log('Calibre ebook-convert: ' + (calibre ? 'found' : 'not run' + (argv.includes('--no-calibre') ? ' (--no-calibre)' : ' (not on the PATH)')));
    const results = [];
    let failed = 0;
    for (const entry of manifest.books.filter((b) => !only.length || only.includes(b.file))) {
        const file = path.join(CORPUS_DIR, entry.file);
        const r = { file: entry.file, title: entry.title, producer: entry.producer };
        results.push(r);
        if (!fs.existsSync(file)) { r.status = 'not run (missing; download ' + entry.url + ')'; console.log('\n' + entry.file + ': ' + r.status); continue; }
        const bytes = fs.readFileSync(file);
        const sha = crypto.createHash('sha256').update(bytes).digest('hex');
        r.sameEdition = sha === entry.sha256;
        const fails = [];
        let trip;
        try { trip = await roundTrip(bytes, Date.UTC(2026, 10, 6)); } catch (e) { fails.push('import or export failed: ' + (e.code ? e.code + ': ' : '') + e.message); }
        if (trip) {
            const out = path.join(outDir, entry.file);
            fs.writeFileSync(out, trip.exported);
            const c = trip.compare;
            r.files = c.files;
            r.bookCheck = tally(trip.problems);
            if (trip.importErrors) r.importErrors = trip.importErrors;
            if (c.changed.length) fails.push('changed: ' + c.changed.join(', '));
            if (c.missing.length) fails.push('left out: ' + c.missing.join(', '));
            if (c.added.length) fails.push('added: ' + c.added.join(', '));
            if (!c.mimetypeFirst) fails.push('mimetype is not first and stored');
            if (jar) {
                const before = epubcheck(jar, file), after = epubcheck(jar, out);
                r.epubcheck = { version: before.version, before: before.messages, after: after.messages };
                if (before.messages.join('\n') !== after.messages.join('\n')) fails.push('EPUBCheck differs after the round trip');
            }
            if (calibre) {
                const azw3 = out.replace(/\.epub$/, '.azw3');
                try { child.execFileSync('ebook-convert', [out, azw3], { stdio: 'ignore', timeout: 300000 }); r.calibre = 'converted to AZW3 (' + Math.round(fs.statSync(azw3).size / 1024) + ' KB)'; } catch (e) { r.calibre = 'ebook-convert failed'; fails.push(r.calibre); }
            }
        }
        r.status = fails.length ? 'FAIL' : 'pass';
        r.fails = fails;
        if (fails.length) failed++;
        console.log('\n' + entry.file + ' (' + entry.title + ', ' + entry.producer + ')' + (r.sameEdition ? '' : ' [not the manifest\'s edition: SHA-256 differs]'));
        console.log('  ' + r.status + (r.files ? ', ' + r.files + ' files' : '') + (fails.length ? ': ' + fails.join('; ') : ''));
        if (r.bookCheck) console.log('  Scribe: ' + (Object.keys(r.bookCheck).map((k) => k + ' x' + r.bookCheck[k]).join(', ') || 'no problems'));
        if (r.epubcheck) console.log('  EPUBCheck ' + r.epubcheck.version + ' before and after: ' + (r.epubcheck.before.length ? r.epubcheck.before.join('; ') : 'no messages'));
        if (r.calibre) console.log('  Calibre: ' + r.calibre);
    }
    fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 1) + '\n');
    console.log('\n' + results.filter((r) => r.status === 'pass').length + ' passed, ' + failed + ' failed, ' + results.filter((r) => /^not run/.test(r.status)).length + ' not run. Details: .tools/corpus/out/results.json');
    return failed ? 1 : 0;
}

if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(e); process.exitCode = 2; });

module.exports = { readRaw: readRaw, compareArchives: compareArchives, withoutModified: withoutModified, roundTrip: roundTrip };
