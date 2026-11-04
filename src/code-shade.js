(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/prism/prism.js'));
    else root.CodeShade = factory(root.Prism);
})(typeof self !== 'undefined' ? self : this, function (Prism) {
    'use strict';

    const MAX_SHADED_CHARS = 150000;
    const LANGUAGES = { html: 'markup', css: 'css', js: 'javascript', javascript: 'javascript' };

    // Prism token type (or alias) -> the marks the editor colours. null leaves the text plain; unknown types inherit.
    const MARKS = {
        tag: 'tag', doctype: 'tag', 'attr-name': 'attr', 'attr-value': 'string', 'attr-equals': 'punct',
        comment: 'comment', prolog: 'comment', cdata: 'comment', entity: 'number',
        string: 'string', char: 'string', 'template-string': 'string', regex: 'string', url: 'string',
        keyword: 'keyword', boolean: 'keyword', atrule: 'keyword', important: 'keyword',
        number: 'number', hexcode: 'number', unit: 'number',
        property: 'prop', variable: 'prop', selector: 'selector',
        punctuation: 'punct', 'interpolation-punctuation': 'punct',
        function: null, 'class-name': null, operator: null, script: null, style: null, interpolation: null, 'language-javascript': null, 'language-css': null
    };

    function markFor(token, inherited) {
        if (token.type === 'punctuation' && [].concat(token.alias || []).indexOf('attr-equals') !== -1) return 'punct';
        const names = [token.type].concat(token.alias || []);
        for (let i = 0; i < names.length; i++) {
            if (!Object.prototype.hasOwnProperty.call(MARKS, names[i])) continue;
            const mark = MARKS[names[i]];
            if (token.type === 'punctuation' && names[i] === 'punctuation' && (inherited === 'tag' || inherited === 'string')) return inherited;
            return mark;
        }
        return inherited;
    }

    function flatten(tokens, inherited, out) {
        tokens.forEach((token) => {
            if (typeof token === 'string') { out.push({ text: token, mark: inherited }); return; }
            const mark = markFor(token, inherited);
            const content = Array.isArray(token.content) ? token.content : [token.content];
            flatten(content, mark, out);
        });
        return out;
    }

    function pushRun(runs, text, mark) {
        if (!text) return;
        const prev = runs[runs.length - 1];
        if (prev && (prev.mark || null) === (mark || null)) prev.text += text;
        else runs.push(mark ? { text: text, mark: mark } : { text: text });
    }

    function plainLines(text, kind) {
        return text.split('\n').map((line) => (line.trim() ? { kind: kind, runs: [{ text: line }] } : { kind: 'blank', runs: [{ text: line }] }));
    }

    function shade(text, lang) {
        const s = String(text || '');
        const mode = String(lang || 'html').toLowerCase();
        const kind = LANGUAGES[mode] === 'javascript' ? 'js' : (LANGUAGES[mode] ? mode : 'html');
        const grammar = Prism && Prism.languages[LANGUAGES[mode] || 'markup'];
        if (!grammar || s.length > MAX_SHADED_CHARS) return plainLines(s, kind);
        let pieces;
        try {
            pieces = flatten(Prism.tokenize(s, grammar), null, []);
        } catch (e) {
            return plainLines(s, kind);
        }
        const lines = [[]];
        pieces.forEach((piece) => {
            piece.text.split('\n').forEach((part, i) => {
                if (i) lines.push([]);
                pushRun(lines[lines.length - 1], part, piece.mark);
            });
        });
        const result = lines.map((runs) => {
            const text = runs.map((r) => r.text).join('');
            return text.trim() ? { kind: kind, runs: runs } : { kind: 'blank', runs: [{ text: text }] };
        });
        // The coloured copy must contain exactly the editor's characters, or its wrapping drifts from the textarea.
        return result.map((l) => l.runs.map((r) => r.text).join('')).join('\n') === s ? result : plainLines(s, kind);
    }

    return { shade: shade };
});
