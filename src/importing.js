(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Importing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const ALLOWED = /\.(html?|css|js|json|txt)$/i;

    function accept(filename) {
        return ALLOWED.test(String(filename || '').trim());
    }

    function kindOf(filename) {
        const name = String(filename || '').trim().toLowerCase();
        if (name.endsWith('.css')) return 'css';
        if (name.endsWith('.js')) return 'js';
        return 'html';
    }

    function decode(bytes) {
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
        let text = '';
        if (typeof TextDecoder === 'function') {
            if (u8[0] === 0xFF && u8[1] === 0xFE) text = new TextDecoder('utf-16le').decode(u8.subarray(2));
            else if (u8[0] === 0xFE && u8[1] === 0xFF) text = new TextDecoder('utf-16be').decode(u8.subarray(2));
            else if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) text = new TextDecoder('utf-8').decode(u8.subarray(3));
            else text = new TextDecoder('utf-8').decode(u8);
        } else {
            for (let i = 0; i < u8.length; i++) text += String.fromCharCode(u8[i]);
        }
        return text.replace(/\r\n?/g, '\n');
    }

    return { accept: accept, kindOf: kindOf, decode: decode };
});
