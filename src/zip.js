(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Zip = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MAX_SIZE = 0xFFFFFFFF;
    const MAX_ENTRIES = 0xFFFF;
    let table = null;

    function crcTable() {
        if (table) return table;
        table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            table[n] = c >>> 0;
        }
        return table;
    }

    function crc32(bytes) {
        const t = crcTable();
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) crc = t[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function utf8(text) {
        return typeof TextEncoder === 'function' ? new TextEncoder().encode(text) : Uint8Array.from(unescape(encodeURIComponent(text)), (c) => c.charCodeAt(0));
    }

    function dosStamp(date) {
        const d = date instanceof Date && !isNaN(date) ? date : new Date();
        const year = Math.max(1980, d.getFullYear());
        return {
            time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
            date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
        };
    }

    function cleanPath(raw) {
        const path = String(raw == null ? '' : raw).replace(/\\/g, '/').replace(/^\/+/, '');
        if (!path || path.endsWith('/') || path.split('/').some((s) => !s || s === '.' || s === '..')) {
            throw new Error('Cannot put "' + raw + '" in a zip file.');
        }
        return path;
    }

    function build(files, when) {
        if (files.length > MAX_ENTRIES) throw new Error('A zip file holds at most ' + MAX_ENTRIES + ' files.');
        const stamp = dosStamp(when);
        const seen = new Set();
        const chunks = [];
        const central = [];
        let offset = 0;
        const u16 = (v) => [v & 0xFF, (v >>> 8) & 0xFF];
        const u32 = (v) => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
        files.forEach((file) => {
            const path = cleanPath(file.path);
            if (seen.has(path)) throw new Error('"' + path + '" appears twice.');
            seen.add(path);
            const name = utf8(path);
            const data = typeof file.data === 'string' ? utf8(file.data) : file.data;
            if (data.length > MAX_SIZE || offset > MAX_SIZE) throw new Error('"' + path + '" is too large for a zip file.');
            const crc = crc32(data);
            const fields = [].concat(u16(20), u16(0x0800), u16(0), u16(stamp.time), u16(stamp.date), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
            chunks.push(Uint8Array.from([0x50, 0x4B, 0x03, 0x04].concat(fields)), name, data);
            central.push(Uint8Array.from([0x50, 0x4B, 0x01, 0x02].concat(u16((3 << 8) | 20), fields.slice(0, 26), u16(0), u16(0), u16(0), u32((0o100644 << 16) >>> 0), u32(offset))), name);
            offset += 30 + name.length + data.length;
        });
        const centralSize = central.reduce((n, c) => n + c.length, 0);
        const end = Uint8Array.from([0x50, 0x4B, 0x05, 0x06].concat(u16(0), u16(0), u16(files.length), u16(files.length), u32(centralSize), u32(offset), u16(0)));
        const all = chunks.concat(central, [end]);
        const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
        let at = 0;
        all.forEach((c) => { out.set(c, at); at += c.length; });
        return out;
    }

    function list(bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let end = bytes.length - 22;
        while (end >= 0 && view.getUint32(end, true) !== 0x06054B50) end--;
        if (end < 0) throw new Error('Not a zip file.');
        const count = view.getUint16(end + 10, true);
        let at = view.getUint32(end + 16, true);
        const decoder = new TextDecoder();
        const out = [];
        for (let i = 0; i < count; i++) {
            if (view.getUint32(at, true) !== 0x02014B50) throw new Error('Damaged zip directory.');
            const method = view.getUint16(at + 10, true);
            const crc = view.getUint32(at + 16, true);
            const size = view.getUint32(at + 24, true);
            const nameLength = view.getUint16(at + 28, true);
            const extraLength = view.getUint16(at + 30, true);
            const commentLength = view.getUint16(at + 32, true);
            const local = view.getUint32(at + 42, true);
            const path = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
            if (method !== 0) throw new Error('Only stored entries can be read.');
            const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
            out.push({ path: path, size: size, crc: crc, data: bytes.subarray(dataStart, dataStart + size) });
            at += 46 + nameLength + extraLength + commentLength;
        }
        return out;
    }

    return { build: build, list: list, crc32: crc32 };
});
