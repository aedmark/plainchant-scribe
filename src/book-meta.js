/*
 * BookMeta: the Book panel's fields, read from a Book model and written back as OpfEdit splices (P3-01, D-025).
 *
 * fields(model) gives plain values for the panel. Each change is a list of ops, functions (model) => edits, that
 * the caller applies one after another to fresh reads of content.opf and commits as one undo step. check*() return
 * an error message or ''. Rules cite EPUB 3.3 and the specifications it names.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./book.js'), require('./opf-edit.js'));
    else root.BookMeta = factory(root.Book, root.OpfEdit);
})(typeof self !== 'undefined' ? self : this, function (Book, OpfEdit) {
    'use strict';

    // The single-valued DC fields the panel edits, by DCMES name.
    const TEXT_FIELDS = ['title', 'language', 'publisher', 'date', 'description', 'rights'];
    // MARC relator codes (EPUB 3.3 §5.5.3.2.3 suggests the marc:relators scheme for role), most common first.
    const ROLES = [
        ['aut', 'Author'], ['edt', 'Editor'], ['ill', 'Illustrator'], ['trl', 'Translator'],
        ['nrt', 'Narrator'], ['pht', 'Photographer'], ['aui', 'Author of introduction'], ['cov', 'Cover designer']
    ];
    const LANG_RE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;
    // W3C Date and Time Formats (EPUB 3.3 §5.5.3.2.2 recommends it for dc:date): YYYY, YYYY-MM, YYYY-MM-DD, or a full
    // date and time with a time zone.
    const DATE_RE = /^\d{4}(?:-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01])(?:T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]([01]\d|2[0-3]):[0-5]\d))?)?)?$/;

    const isbnIdentifier = (model) => model.metadata.identifiers.find((i) => i !== model.metadata.uniqueIdentifier && /^urn:isbn:/i.test(i.value)) || null;

    function fields(model) {
        const md = model.metadata;
        const first = (name) => { const e = md.dc.find((x) => x.name === name); return e ? e.value : ''; };
        const out = {};
        TEXT_FIELDS.forEach((name) => { out[name] = first(name); });
        out.identifier = md.uniqueIdentifier ? md.uniqueIdentifier.value : '';
        const isbn = isbnIdentifier(model);
        out.isbn = isbn ? isbn.value.replace(/^urn:isbn:/i, '') : '';
        out.modified = md.modified || '';
        out.creators = md.creators.map((c, i) => ({ index: i, name: c.value, role: Book.refinement(c, 'role') || '', fileAs: Book.refinement(c, 'file-as') || '' }));
        return out;
    }

    // ISBN-10 or ISBN-13 with its check digit (ISO 2108); hyphens and spaces are allowed and dropped.
    function normaliseIsbn(text) {
        const s = String(text || '').replace(/[\s-]/g, '').toUpperCase();
        if (/^\d{9}[\dX]$/.test(s)) {
            const sum = s.split('').reduce((acc, ch, i) => acc + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0);
            return sum % 11 === 0 ? s : null;
        }
        if (/^\d{13}$/.test(s)) {
            const sum = s.split('').reduce((acc, ch, i) => acc + Number(ch) * (i % 2 ? 3 : 1), 0);
            return sum % 10 === 0 ? s : null;
        }
        return null;
    }

    function check(name, value) {
        const v = String(value == null ? '' : value).trim();
        if (name === 'title' && !v) return 'A book needs a title (EPUB 3.3 §5.5.3.1).';
        if (name === 'language' && !LANG_RE.test(v)) return '"' + v + '" is not a language tag such as en, fr, or pt-BR (EPUB 3.3 §5.5.3.1.3).';
        if (name === 'date' && v && !DATE_RE.test(v)) return 'Use a date such as 2026, 2026-11, or 2026-11-04 (EPUB 3.3 §5.5.3.2.2).';
        if (name === 'isbn' && v && !normaliseIsbn(v)) return '"' + v + '" is not a valid ISBN-10 or ISBN-13 (its check digit does not match).';
        if (name === 'creator' && !v) return 'Enter a name.';
        if (name === 'role' && v && !/^[a-z]{3}$/.test(v)) return 'A role is a three-letter MARC relator code such as aut or edt.';
        return '';
    }

    // Ops that set one of TEXT_FIELDS: an empty value removes the element (other than title and language).
    function setField(name, value) {
        const v = String(value == null ? '' : value).trim();
        return [(model) => {
            const entry = model.metadata.dc.find((e) => e.name === name);
            if (!v) return entry ? OpfEdit.removeMetadata(model, entry) : [];
            return entry ? OpfEdit.setValue(model, entry, v) : OpfEdit.addDc(model, name, v);
        }];
    }

    function setIsbn(value) {
        const isbn = normaliseIsbn(value);
        return [(model) => {
            const entry = isbnIdentifier(model);
            if (!String(value || '').trim()) return entry ? OpfEdit.removeMetadata(model, entry) : [];
            const urn = 'urn:isbn:' + isbn;
            return entry ? OpfEdit.setValue(model, entry, urn) : OpfEdit.addDc(model, 'identifier', urn, { id: freeId(model, 'isbn') });
        }];
    }

    function freeId(model, base) {
        const ids = new Set(model.ast.elements.map((el) => el.attrs.find((a) => a.local === 'id' && !a.ns)).filter(Boolean).map((a) => a.value));
        let id = base;
        for (let n = 2; ids.has(id); n++) id = base + '-' + n;
        return id;
    }

    // A refinement on the creator at index: set it, or remove it when value is empty.
    function refine(index, property, value, scheme) {
        const v = String(value == null ? '' : value).trim();
        return (model) => {
            const c = model.metadata.creators[index];
            if (!c) return [];
            const found = c.refinements.find((r) => r.property === property);
            if (!v) return found ? OpfEdit.removeMetadata(model, found) : [];
            return OpfEdit.setRefinement(model, c, property, v, scheme ? { scheme: scheme } : undefined);
        };
    }

    function setCreator(index, part, value) {
        if (part === 'name') return [(model) => { const c = model.metadata.creators[index]; return c ? OpfEdit.setValue(model, c, String(value).trim()) : []; }];
        if (part === 'role') return [refine(index, 'role', value, 'marc:relators')];
        if (part === 'fileAs') return [refine(index, 'file-as', value)];
        return [];
    }

    // A new creator goes after the others, with an id so refinements can point at it.
    function addCreator(name, role, fileAs) {
        let index = null;
        const ops = [(model) => {
            index = model.metadata.creators.length;
            return OpfEdit.addDc(model, 'creator', String(name).trim(), { id: freeId(model, 'creator') });
        }];
        if (role) ops.push((model) => refine(index, 'role', role, 'marc:relators')(model));
        if (fileAs) ops.push((model) => refine(index, 'file-as', fileAs)(model));
        return ops;
    }

    function removeCreator(index) {
        return [(model) => { const c = model.metadata.creators[index]; return c ? OpfEdit.removeMetadata(model, c) : []; }];
    }

    const touchModified = (now) => [(model) => OpfEdit.touchModified(model, now)];

    return {
        TEXT_FIELDS: TEXT_FIELDS, ROLES: ROLES, fields: fields, check: check, normaliseIsbn: normaliseIsbn,
        setField: setField, setIsbn: setIsbn, setCreator: setCreator, addCreator: addCreator, removeCreator: removeCreator, touchModified: touchModified
    };
});
