(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Typography = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const FONT_PRESETS = [
        { label: 'System UI', value: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
        { label: 'Inter', value: "'Inter', system-ui, sans-serif" },
        { label: 'Arial / Helvetica', value: 'Arial, Helvetica, sans-serif' },
        { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
        { label: 'Georgia', value: "Georgia, 'Times New Roman', serif" },
        { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
        { label: 'Palatino', value: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
        { label: 'Courier Prime', value: "'Courier Prime', Courier, monospace" },
        { label: 'Monospace', value: "ui-monospace, 'Cascadia Code', Consolas, monospace" }
    ];

    const BOOK_FONT_PRESETS = [
        { label: 'Serif (book)', value: "Georgia, 'Times New Roman', serif" },
        { label: 'Sans-serif', value: "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif" },
        { label: 'Georgia', value: 'Georgia, serif' },
        { label: 'Palatino', value: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
        { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
        { label: 'Monospace', value: "'Courier New', Courier, monospace" }
    ];

    const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px', '48px', '0.875rem', '1rem', '1.25rem', '1.5rem', '2rem', '3rem'];
    const BOOK_FONT_SIZES = ['0.75em', '0.875em', '0.9375em', '1em', '1.125em', '1.25em', '1.5em', '1.75em', '2em', '2.5em', '3em', '85%', '100%', '120%', '150%'];
    const LINE_HEIGHTS = ['1', '1.15', '1.35', '1.5', '1.75', '2', 'normal'];
    const LETTER_SPACINGS = ['-0.03em', '-0.01em', 'normal', '0.03em', '0.08em', '0.15em'];

    function isBoldValue(val) {
        const s = String(val || '').trim().toLowerCase();
        if (!s) return false;
        if (s === 'bold' || s === 'bolder') return true;
        const n = parseFloat(s);
        return Number.isFinite(n) && n >= 600;
    }

    function toggleBold(declaredVal, computedVal) {
        const decl = String(declaredVal || '').trim();
        if (decl) return isBoldValue(decl) ? '' : '700';
        return isBoldValue(computedVal) ? '400' : '700';
    }

    function isItalicValue(val) {
        return /^(italic|oblique)\b/i.test(String(val || '').trim());
    }

    function toggleItalic(declaredVal, computedVal) {
        const decl = String(declaredVal || '').trim();
        if (decl) return isItalicValue(decl) ? '' : 'italic';
        return isItalicValue(computedVal) ? 'normal' : 'italic';
    }

    function decorationLines(val) {
        const tokens = String(val || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
        return {
            underline: tokens.indexOf('underline') !== -1,
            lineThrough: tokens.indexOf('line-through') !== -1
        };
    }

    function toggleDecoration(declaredVal, computedVal, lineName, tagName) {
        const decl = String(declaredVal || '').trim();
        const hasDecl = decl !== '';
        const state = hasDecl ? decorationLines(decl) : decorationLines(computedVal);
        if (lineName === 'underline') state.underline = !state.underline;
        else if (lineName === 'line-through') state.lineThrough = !state.lineThrough;
        const out = [];
        if (state.underline) out.push('underline');
        if (state.lineThrough) out.push('line-through');
        if (out.length) return out.join(' ');
        return (hasDecl && String(tagName || '').toLowerCase() !== 'a') ? '' : 'none';
    }

    function parseSize(val) {
        const m = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(px|rem|em|pt|%)\s*$/i.exec(String(val || ''));
        if (!m) return null;
        return { num: parseFloat(m[1]), unit: m[2].toLowerCase() };
    }

    // Steps font-size up or down. For reflowable EPUB books (options.preferRelative), an undeclared size steps in em
    // relative to rootPx (default 16) so stepping never emits px values that trigger CssLint's css-font-size warning.
    function stepFontSize(declaredVal, computedVal, delta, options) {
        const dir = delta < 0 ? -1 : 1;
        const opts = options || {};
        const declParsed = parseSize(declaredVal);
        if (!declParsed && opts.preferRelative) {
            const compParsed = parseSize(computedVal);
            const rootPx = Number.isFinite(opts.rootPx) && opts.rootPx > 0 ? opts.rootPx : 16;
            const baseEm = compParsed && compParsed.unit === 'px'
                ? Math.round((compParsed.num / rootPx) * 8) / 8
                : (compParsed && (compParsed.unit === 'em' || compParsed.unit === 'rem') ? compParsed.num : 1);
            const nextEm = Math.max(0.5, Math.round((baseEm + dir * 0.125) * 1000) / 1000);
            return nextEm + 'em';
        }
        const parsed = declParsed || parseSize(computedVal) || { num: 16, unit: 'px' };
        let next = parsed.num;
        if (parsed.unit === 'rem' || parsed.unit === 'em') {
            next = Math.max(0.5, Math.round((parsed.num + dir * 0.125) * 1000) / 1000);
        } else if (parsed.unit === '%') {
            next = Math.max(50, Math.round(parsed.num + dir * 10));
        } else {
            const step = (parsed.num < 12 || (parsed.num === 12 && dir < 0)) ? 1 : 2;
            next = Math.max(6, Math.round((parsed.num + dir * step) * 100) / 100);
        }
        return next + parsed.unit;
    }

    function normFontStr(val) {
        return String(val || '').toLowerCase().replace(/["']/g, '').replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ').trim();
    }

    function quoteFamily(name) {
        const clean = String(name || '').trim().replace(/^['"]+|['"]+$/g, '');
        if (!clean) return '';
        return /^[A-Za-z0-9_-]+$/.test(clean) ? clean : "'" + clean.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    }

    function mergeFontOptions(embeddedFamilies, basePresets) {
        const base = Array.isArray(basePresets) ? basePresets : FONT_PRESETS;
        const seen = new Set();
        const out = [];
        (embeddedFamilies || []).forEach((raw) => {
            const name = String(raw || '').trim();
            if (!name) return;
            const key = name.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ label: name + ' (embedded)', value: quoteFamily(name) + ', serif' });
        });
        base.forEach((p) => {
            const key = normFontStr(p.value);
            if (!seen.has(key)) {
                seen.add(key);
                out.push(p);
            }
        });
        return out;
    }

    function matchFontPreset(declaredVal, presets) {
        const norm = normFontStr(declaredVal);
        if (!norm) return '';
        const list = Array.isArray(presets) ? presets : FONT_PRESETS;
        const hit = list.find((p) => normFontStr(p.value) === norm);
        return hit ? hit.value : String(declaredVal || '').trim();
    }

    function normalizeAlign(val) {
        const s = String(val || '').trim().toLowerCase();
        if (s === 'start') return 'left';
        if (s === 'end') return 'right';
        if (s === 'left' || s === 'center' || s === 'right' || s === 'justify') return s;
        return '';
    }

    function toggleAlign(declaredVal, dir) {
        const cleanDir = normalizeAlign(dir);
        if (!cleanDir) return '';
        return normalizeAlign(declaredVal) === cleanDir ? '' : cleanDir;
    }

    return {
        FONT_PRESETS: FONT_PRESETS,
        BOOK_FONT_PRESETS: BOOK_FONT_PRESETS,
        FONT_SIZES: FONT_SIZES,
        BOOK_FONT_SIZES: BOOK_FONT_SIZES,
        LINE_HEIGHTS: LINE_HEIGHTS,
        LETTER_SPACINGS: LETTER_SPACINGS,
        isBoldValue: isBoldValue,
        toggleBold: toggleBold,
        isItalicValue: isItalicValue,
        toggleItalic: toggleItalic,
        decorationLines: decorationLines,
        toggleDecoration: toggleDecoration,
        stepFontSize: stepFontSize,
        mergeFontOptions: mergeFontOptions,
        matchFontPreset: matchFontPreset,
        normalizeAlign: normalizeAlign,
        toggleAlign: toggleAlign
    };
});
