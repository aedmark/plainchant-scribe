(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Preview = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function urls(info) {
        const tail = ':' + info.port + '/' + info.token + '/';
        return {
            local: 'http://127.0.0.1' + tail,
            lan: (info.addresses || []).map((a) => 'http://' + (a.indexOf(':') !== -1 ? '[' + a + ']' : a) + tail)
        };
    }

    function entryFor(activeHtml, entries) {
        const isPage = (p) => /\.html?$/i.test(p) && Object.prototype.hasOwnProperty.call(entries, p);
        if (activeHtml && isPage(activeHtml)) return activeHtml;
        if (isPage('index.html')) return 'index.html';
        return Object.keys(entries).filter(isPage).sort()[0] || '';
    }

    function assetSignature(assets) {
        return Object.keys(assets || {}).sort().map((p) => p + ':' + assets[p].size).join('|');
    }

    // Whether two byte arrays hold the same bytes (send to reader skips sending an unchanged .epub).
    function sameBytes(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
    }

    return { urls: urls, entryFor: entryFor, assetSignature: assetSignature, sameBytes: sameBytes };
});
