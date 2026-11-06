/*
 * EpubcheckReport (P5-05, D-041): turns EPUBCheck's JSON report (`--json`) into Problems-tab rows. Pure, no DOM.
 * EPUBCheck counts lines and columns from 1, and for markup its column is just past the tag it complains about, so
 * the row selects that tag. A message with no location belongs to the whole book (file ''). Every location of a
 * message becomes a row, up to LOCATION_LIMIT per message.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.EpubcheckReport = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const LOCATION_LIMIT = 20;
    const SEVERITY = { FATAL: 'error', ERROR: 'error', WARNING: 'warning', USAGE: 'info', INFO: 'info' };

    // The character range EPUBCheck's line and column point at in text: the tag ending there, else the rest of the line.
    function rangeAt(text, line, column) {
        if (typeof text !== 'string' || !(line >= 1)) return { start: 0, end: 0 };
        let lineStart = 0;
        for (let n = 1; n < line; n++) {
            const next = text.indexOf('\n', lineStart);
            if (next < 0) return { start: 0, end: 0 };
            lineStart = next + 1;
        }
        let lineEnd = text.indexOf('\n', lineStart);
        if (lineEnd < 0) lineEnd = text.length;
        if (!(column >= 1)) return { start: lineStart, end: lineEnd };
        const pos = Math.min(lineStart + column - 1, lineEnd);
        if (text[pos - 1] === '>') {
            const open = text.lastIndexOf('<', pos - 1);
            if (open >= 0) return { start: open, end: pos };
        }
        return { start: pos, end: Math.max(pos, lineEnd) };
    }

    function read(report, entries) {
        const files = entries || {};
        const problems = [];
        const messages = report && Array.isArray(report.messages) ? report.messages : [];
        messages.forEach((m) => {
            const severity = SEVERITY[m.severity] || 'warning';
            const text = String(m.ID || '') + ': ' + String(m.message || '').trim() + (m.suggestion ? ' ' + String(m.suggestion).trim() : '');
            const locations = Array.isArray(m.locations) && m.locations.length ? m.locations.slice(0, LOCATION_LIMIT) : [{}];
            locations.forEach((loc) => {
                const file = typeof loc.path === 'string' ? loc.path : '';
                const line = loc.line >= 1 ? loc.line : 0;
                const range = rangeAt(files[file], line, loc.column);
                problems.push({ file: file, start: range.start, end: range.end, line: line, code: String(m.ID || ''), severity: severity, category: 'epubcheck', message: text, source: 'epubcheck' });
            });
        });
        const checker = report && report.checker || {};
        return {
            problems: problems,
            version: typeof checker.checkerVersion === 'string' ? checker.checkerVersion : '',
            fatal: checker.nFatal || 0,
            errors: problems.filter((p) => p.severity === 'error').length
        };
    }

    return { read: read, rangeAt: rangeAt, LOCATION_LIMIT: LOCATION_LIMIT };
}));
