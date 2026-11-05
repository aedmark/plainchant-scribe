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

    // The series: a book-level belongs-to-collection typed "series", else the first untyped one (EPUB 3.3 §5.5.6 and
    // the D.3 vocabulary: collection-type, group-position).
    function seriesEntry(model) {
        const all = model.metadata.metas.filter((m) => m.property === 'belongs-to-collection' && m.refines == null);
        return all.find((m) => Book.refinement(m, 'collection-type') === 'series') || all.find((m) => !Book.refinement(m, 'collection-type')) || null;
    }

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
        const person = (c, i) => ({ index: i, name: c.value, role: Book.refinement(c, 'role') || '', fileAs: Book.refinement(c, 'file-as') || '' });
        out.creators = md.creators.map(person);
        out.contributors = md.contributors.map(person);
        const series = seriesEntry(model);
        out.series = series ? series.value : '';
        out.seriesPosition = series ? Book.refinement(series, 'group-position') || '' : '';
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
        if (name === 'seriesPosition' && v && !/^\d+(\.\d+)?$/.test(v)) return 'The number in the series is a number such as 2 or 2.5.';
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

    const peopleOf = (model, kind) => (kind === 'contributor' ? model.metadata.contributors : model.metadata.creators);

    // A refinement on the person at index: set it, or remove it when value is empty.
    function refine(index, property, value, scheme, kind) {
        const v = String(value == null ? '' : value).trim();
        return (model) => {
            const c = peopleOf(model, kind)[index];
            if (!c) return [];
            const found = c.refinements.find((r) => r.property === property);
            if (!v) return found ? OpfEdit.removeMetadata(model, found) : [];
            return OpfEdit.setRefinement(model, c, property, v, scheme ? { scheme: scheme } : undefined);
        };
    }

    // kind is 'creator' (the default) or 'contributor' (P3-06): the same name, role, and sort name.
    function setPerson(kind, index, part, value) {
        if (part === 'name') return [(model) => { const c = peopleOf(model, kind)[index]; return c ? OpfEdit.setValue(model, c, String(value).trim()) : []; }];
        if (part === 'role') return [refine(index, 'role', value, 'marc:relators', kind)];
        if (part === 'fileAs') return [refine(index, 'file-as', value, null, kind)];
        return [];
    }

    // A new person goes after the others of their kind, with an id so refinements can point at it.
    function addPerson(kind, name, role, fileAs) {
        const k = kind === 'contributor' ? 'contributor' : 'creator';
        let index = null;
        const ops = [(model) => {
            index = peopleOf(model, k).length;
            return OpfEdit.addDc(model, k, String(name).trim(), { id: freeId(model, k) });
        }];
        if (role) ops.push((model) => refine(index, 'role', role, 'marc:relators', k)(model));
        if (fileAs) ops.push((model) => refine(index, 'file-as', fileAs, null, k)(model));
        return ops;
    }

    function removePerson(kind, index) {
        return [(model) => { const c = peopleOf(model, kind)[index]; return c ? OpfEdit.removeMetadata(model, c) : []; }];
    }

    // Moves the person at index up (dir -1) or down (dir 1) within their kind.
    function movePerson(kind, index, dir) {
        return [(model) => {
            const list = peopleOf(model, kind), a = list[index], b = list[index + dir];
            return a && b ? OpfEdit.moveMetadata(model, a, b, dir) : [];
        }];
    }

    const setCreator = (index, part, value) => setPerson('creator', index, part, value);
    const addCreator = (name, role, fileAs) => addPerson('creator', name, role, fileAs);
    const removeCreator = (index) => removePerson('creator', index);

    // Sets the series name and number, or removes the series when the name is empty; Calibre's calibre:series and
    // calibre:series_index follow, since Calibre and its Kindle conversion read them (D-030).
    function setSeries(name, position) {
        const n = String(name == null ? '' : name).trim(), pos = String(position == null ? '' : position).trim();
        if (!n) {
            return [(model) => { const e = seriesEntry(model); return e ? OpfEdit.removeMetadata(model, e) : []; },
                (model) => OpfEdit.removeLegacyMeta(model, 'calibre:series'), (model) => OpfEdit.removeLegacyMeta(model, 'calibre:series_index')];
        }
        const refineSeries = (property, value) => (model) => {
            const e = seriesEntry(model);
            if (!e) return [];
            const found = e.refinements.find((r) => r.property === property);
            if (!value) return found ? OpfEdit.removeMetadata(model, found) : [];
            return OpfEdit.setRefinement(model, e, property, value);
        };
        return [
            (model) => {
                const e = seriesEntry(model);
                if (e) return OpfEdit.setValue(model, e, n);
                const id = freeId(model, 'series');
                return OpfEdit.insertMeta(model, 'belongs-to-collection', n, { id: id });
            },
            refineSeries('collection-type', 'series'),
            refineSeries('group-position', pos),
            (model) => OpfEdit.setLegacyMeta(model, 'calibre:series', n),
            (model) => (pos ? OpfEdit.setLegacyMeta(model, 'calibre:series_index', pos) : OpfEdit.removeLegacyMeta(model, 'calibre:series_index'))
        ];
    }

    const touchModified = (now) => [(model) => OpfEdit.touchModified(model, now)];

    return {
        TEXT_FIELDS: TEXT_FIELDS, ROLES: ROLES, fields: fields, check: check, normaliseIsbn: normaliseIsbn,
        setField: setField, setIsbn: setIsbn, setCreator: setCreator, addCreator: addCreator, removeCreator: removeCreator, touchModified: touchModified,
        setPerson: setPerson, addPerson: addPerson, removePerson: removePerson, movePerson: movePerson, setSeries: setSeries
    };
});
