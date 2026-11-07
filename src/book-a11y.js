/*
 * BookA11y: a book's accessibility metadata (P6-01, D-044). Pure, no DOM.
 *
 * EPUB Accessibility 1.1 (W3C Recommendation, 17 October 2024) §2.2: every EPUB publication MUST carry schema.org
 * accessMode, accessibilityFeature, and accessibilityHazard metadata, and SHOULD carry accessibilitySummary and
 * accessModeSufficient. The values come from the Schema.org Accessibility Properties for Discoverability Vocabulary
 * 1.1 (W3C Community Group final report, 24 August 2026). A conformance claim (§3.5.2) is a dcterms:conformsTo of
 * exactly "EPUB Accessibility 1.1 - WCAG <version> Level <level>", and then MUST name its evaluator in an
 * a11y:certifiedBy (§3.5.3.1). The schema, a11y, and dcterms prefixes are reserved (EPUB 3.3 §D.1.3), so none is
 * declared.
 *
 * read(model) gives the metadata as the form shows it; suggest(entries, assets) proposes values from what the book
 * contains, with the reason for each, for the author to confirm; ops(state) turns a state into OpfEdit ops that add
 * and remove only the values that changed; check(model) gives Problems-tab rows; summary(state) drafts a summary.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./xml-ast.js'), require('./book.js'), require('./opf-edit.js'), require('./nav.js'));
    else root.BookA11y = factory(root.XmlAst, root.Book, root.OpfEdit, root.Nav);
}(typeof self !== 'undefined' ? self : this, function (XmlAst, Book, OpfEdit, Nav) {
    'use strict';

    const NS = { xhtml: 'http://www.w3.org/1999/xhtml', epub: 'http://www.idpf.org/2007/ops', mathml: 'http://www.w3.org/1998/Math/MathML', svg: 'http://www.w3.org/2000/svg' };
    const P = { mode: 'schema:accessMode', sufficient: 'schema:accessModeSufficient', feature: 'schema:accessibilityFeature', hazard: 'schema:accessibilityHazard', summary: 'schema:accessibilitySummary', conformsTo: 'dcterms:conformsTo', certifiedBy: 'a11y:certifiedBy', credential: 'a11y:certifierCredential' };

    // Vocabulary 1.1 §7.2 and §7.3 (accessMode), §8.2 (accessModeSufficient).
    const MODES = ['textual', 'visual', 'auditory', 'tactile'];
    const VISUAL_MODES = ['textOnVisual', 'chartOnVisual', 'chemOnVisual', 'diagramOnVisual', 'mathOnVisual', 'musicOnVisual', 'colorDependent'];
    // Vocabulary 1.1 §4.2, by group; none and unknown stand alone (§4.2.8, §4.2.9).
    const FEATURES = [
        ['Structure and navigation', ['tableOfContents', 'structuralNavigation', 'readingOrder', 'pageBreakMarkers', 'pageNavigation', 'index', 'ARIA', 'taggedPDF']],
        ['Adaptations', ['alternativeText', 'longDescription', 'describedMath', 'transcript', 'audioDescription', 'closedCaptions', 'openCaptions', 'signLanguage']],
        ['Rendering control', ['displayTransformability', 'synchronizedAudioText', 'timingControl', 'unlocked']],
        ['Specialized markup', ['MathML', 'MathML-chemistry', 'ChemML', 'latex', 'latex-chemistry', 'ttsMarkup']],
        ['Clarity', ['highContrastAudio', 'highContrastDisplay', 'largePrint']],
        ['Tactile', ['braille', 'tactileGraphic', 'tactileObject']],
        ['Languages and writing', ['rubyAnnotations', 'fullRubyAnnotations', 'horizontalWriting', 'verticalWriting', 'withAdditionalWordSegmentation', 'withoutAdditionalWordSegmentation']]
    ];
    const FEATURE_LIST = [].concat.apply([], FEATURES.map((g) => g[1]));
    // §4.2.1.1, §4.2.1.3, §4.2.2.3; printPageNumbers is a synonym of pageBreakMarkers (§4.2.1.5).
    const DEPRECATED = { annotations: '', bookmarks: '', captions: 'closedCaptions or openCaptions', printPageNumbers: 'pageBreakMarkers' };
    // §5.2: each hazard is present, absent, or unknown; none and unknown cover all three.
    const HAZARDS = ['flashing', 'motionSimulation', 'sound'];
    const hazardTerm = (h, state) => state === 'yes' ? h : (state === 'no' ? 'no' : 'unknown') + h[0].toUpperCase() + h.slice(1) + 'Hazard';
    const WCAG = { versions: ['2.0', '2.1', '2.2'], levels: ['A', 'AA', 'AAA'] };
    const CONFORMANCE = /^EPUB Accessibility (\d+\.\d+) - WCAG (\d+\.\d+) Level (A{1,3})$/;

    const metasOf = (model, property) => model.metadata.metas.filter((m) => m.property === property && m.refines == null);
    const unique = (list) => Array.from(new Set(list));
    const splitSet = (value) => unique(String(value).split(',').map((s) => s.trim()).filter(Boolean));

    // Hazards as { flashing: 'yes' | 'no' | 'unknown' | '' } from the terms, '' meaning not stated.
    function hazardStates(terms) {
        const out = {};
        HAZARDS.forEach((h) => {
            const cap = h[0].toUpperCase() + h.slice(1);
            out[h] = terms.indexOf(h) !== -1 ? 'yes' : terms.indexOf('no' + cap + 'Hazard') !== -1 || terms.indexOf('none') !== -1 ? 'no'
                : terms.indexOf('unknown' + cap + 'Hazard') !== -1 || terms.indexOf('unknown') !== -1 ? 'unknown' : '';
        });
        return out;
    }

    // The terms to write for the hazard states: none when all are absent and unknown when all are unknown (§5.2.2.1, §5.2.3.1).
    function hazardTerms(states) {
        const s = HAZARDS.map((h) => states[h] || '');
        if (s.every((v) => v === 'no')) return ['none'];
        if (s.every((v) => v === 'unknown')) return ['unknown'];
        return HAZARDS.filter((h) => states[h]).map((h) => hazardTerm(h, states[h]));
    }

    function read(model) {
        const values = (p) => unique(metasOf(model, p).map((m) => m.value).filter(Boolean));
        const conf = metasOf(model, P.conformsTo).find((m) => /^EPUB Accessibility /.test(m.value));
        const ref = (entry, p) => { const r = entry && (entry.refinements || []).find((x) => x.property === p); return r ? r.value : ''; };
        // a11y:certifiedBy refines the claim (§3.5.3.1 examples) or stands at book level.
        const certifier = (conf && (conf.refinements || []).find((x) => x.property === P.certifiedBy)) || metasOf(model, P.certifiedBy)[0];
        const m = conf ? CONFORMANCE.exec(conf.value) : null;
        const hazards = values(P.hazard);
        return {
            modes: values(P.mode),
            sufficient: metasOf(model, P.sufficient).map((e) => splitSet(e.value).join(',')).filter(Boolean),
            features: values(P.feature),
            hazards: hazardStates(hazards),
            hazardTerms: hazards,
            summary: (metasOf(model, P.summary)[0] || {}).value || '',
            conformance: conf ? {
                value: conf.value, wcag: m ? m[2] : '', level: m ? m[3] : '',
                certifiedBy: certifier ? certifier.value : '',
                credential: certifier ? ref(certifier, P.credential) : ''
            } : null
        };
    }

    // What the content documents hold, for suggest().
    function scan(entries, model) {
        const found = { text: false, images: 0, imagesWithAlt: 0, audio: 0, video: 0, math: 0, mathDescribed: 0, pageBreaks: 0, index: false, scripts: 0, headings: 0 };
        const docs = model.manifest.items.filter((i) => i.mediaType === 'application/xhtml+xml' && i.path && typeof entries[i.path] === 'string' && i.properties.indexOf('nav') === -1);
        docs.forEach((item) => {
            const ast = XmlAst.parse(entries[item.path]);
            const attr = (el, local, ns) => { const a = el.attrs.find((x) => x.local === local && x.ns === (ns || null)); return a ? a.value : null; };
            ast.elements.forEach((el) => {
                const types = String(attr(el, 'type', NS.epub) || '').split(/\s+/);
                const role = String(attr(el, 'role') || '').split(/\s+/);
                if (el.ns === NS.xhtml) {
                    if (el.local === 'img') { found.images++; if (attr(el, 'alt') != null) found.imagesWithAlt++; }
                    if (el.local === 'audio') found.audio++;
                    if (el.local === 'video') found.video++;
                    if (el.local === 'script') found.scripts++;
                    if (/^h[1-6]$/.test(el.local)) found.headings++;
                    if ((el.local === 'p' || /^h[1-6]$/.test(el.local) || el.local === 'li' || el.local === 'td') && XmlAst.textContent(el).trim()) found.text = true;
                }
                if (el.ns === NS.svg && el.local === 'svg' && !ast.elements.some((p) => p.id === el.parentId && p.ns === NS.svg)) {
                    found.images++;
                    if (attr(el, 'aria-label') || ast.elements.some((c) => c.parentId === el.id && c.ns === NS.svg && c.local === 'title' && XmlAst.textContent(c).trim())) found.imagesWithAlt++;
                }
                if (el.ns === NS.mathml && el.local === 'math') { found.math++; if (attr(el, 'alttext') || attr(el, 'aria-label')) found.mathDescribed++; }
                if (types.indexOf('pagebreak') !== -1 || role.indexOf('doc-pagebreak') !== -1) found.pageBreaks++;
                if (types.indexOf('index') !== -1 || role.indexOf('doc-index') !== -1) found.index = true;
            });
        });
        found.overlays = model.manifest.items.some((i) => i.mediaOverlay);
        return found;
    }

    // Proposed values and why. Never written by itself: the metadata is the publisher's claim (D-044).
    function suggest(entries, assets) {
        const model = Book.read(entries, { assets: assets || [] }).model;
        if (!model) return null;
        const s = scan(entries, model);
        const nav = Nav.read(entries, model).nav;
        const reasons = {};
        const modes = [];
        if (s.text) { modes.push('textual'); reasons.textual = 'The chapters have text.'; }
        if (s.images) { modes.push('visual'); reasons.visual = s.images + (s.images === 1 ? ' image' : ' images') + ' in the chapters.'; }
        if (s.audio || s.video) { modes.push('auditory'); reasons.auditory = (s.audio + s.video) + ' audio or video ' + (s.audio + s.video === 1 ? 'element' : 'elements') + '.'; }
        if (s.video) { if (modes.indexOf('visual') === -1) modes.push('visual'); reasons.visual = (reasons.visual ? reasons.visual + ' ' : '') + 'Video is visual.'; }
        const features = [];
        const add = (f, why) => { features.push(f); reasons[f] = why; };
        if (nav && nav.toc && nav.toc.entries && nav.toc.entries.length) add('tableOfContents', 'The contents list ' + nav.toc.entries.length + (nav.toc.entries.length === 1 ? ' entry.' : ' entries.'));
        if (s.headings) add('structuralNavigation', s.headings + ' headings. Check that they follow the book\'s outline (the Problems tab flags skipped levels).');
        if (s.images && s.imagesWithAlt === s.images) add('alternativeText', 'All ' + s.images + ' images have alt text (or alt="" as decoration).');
        if (s.math) add('MathML', s.math + ' MathML ' + (s.math === 1 ? 'formula.' : 'formulas.'));
        if (s.math && s.mathDescribed === s.math) add('describedMath', 'Every formula has alttext or aria-label.');
        if (s.pageBreaks) add('pageBreakMarkers', s.pageBreaks + ' page-break markers.');
        if (nav && nav.pageList && nav.pageList.entries && nav.pageList.entries.length) add('pageNavigation', 'The navigation document has a page list.');
        if (s.index) add('index', 'The book has an index.');
        if (s.overlays) add('synchronizedAudioText', 'Chapters have media overlays.');
        const sufficient = [];
        if (modes.length) sufficient.push(modes.join(','));
        // Text alone suffices when every image is described and there is no audio or video (Vocabulary 1.1 §8.1).
        if (modes.indexOf('textual') !== -1 && modes.length > 1 && !s.audio && !s.video && s.images === s.imagesWithAlt) { sufficient.push('textual'); reasons.sufficientText = 'Every image has alt text, so the text alone carries the book.'; }
        // Hazards cannot be seen in the files; none is proposed only when nothing could carry one.
        const quiet = !s.audio && !s.video && !s.scripts && !(assets || []).some((p) => /\.gif$/i.test(p));
        const hazards = { flashing: quiet ? 'no' : 'unknown', motionSimulation: quiet ? 'no' : 'unknown', sound: s.audio || s.video ? 'unknown' : 'no' };
        reasons.hazards = quiet ? 'The book has no audio, video, scripts, or GIF images. Make sure no image flashes or simulates motion.' : 'The book has audio, video, scripts, or GIF images: say which hazards they present.';
        const state = { modes: modes, sufficient: sufficient, features: features, hazards: hazards, summary: '', conformance: null };
        state.summary = summary(state);
        return { state: state, reasons: reasons, found: s };
    }

    const FEATURE_WORDS = {
        tableOfContents: 'a table of contents', structuralNavigation: 'headings for navigation', alternativeText: 'alternative text for its images',
        MathML: 'mathematics in MathML', describedMath: 'descriptions of its mathematics', pageBreakMarkers: 'page-break markers', pageNavigation: 'a page list',
        index: 'an index', synchronizedAudioText: 'synchronized audio and text', displayTransformability: 'text that readers can restyle', readingOrder: 'a reading order that matches the layout',
        longDescription: 'long descriptions of complex images', transcript: 'transcripts'
    };

    // A plain-language draft of the summary from the state. The author edits it; it should add what the terms cannot say.
    function summary(state) {
        const parts = [];
        const f = (state.features || []).filter((x) => FEATURE_WORDS[x]).map((x) => FEATURE_WORDS[x]);
        if (f.length) parts.push('This book has ' + (f.length === 1 ? f[0] : f.slice(0, -1).join(', ') + ' and ' + f[f.length - 1]) + '.');
        if ((state.sufficient || []).indexOf('textual') !== -1) parts.push('It can be read in text alone, for example with text-to-speech or braille.');
        else if ((state.modes || []).indexOf('visual') !== -1) parts.push('Some images are not described in text.');
        const h = state.hazards || {};
        if (HAZARDS.every((x) => h[x] === 'no')) parts.push('It has no flashing, motion, or sound hazards.');
        else {
            const yes = HAZARDS.filter((x) => h[x] === 'yes');
            if (yes.length) parts.push('Caution: it contains ' + yes.map((x) => ({ flashing: 'flashing content', motionSimulation: 'motion simulation', sound: 'sound' }[x])).join(' and ') + '.');
        }
        return parts.join(' ');
    }

    // The values Scribe offers for a property; values outside it (a newer vocabulary, a typo) are never removed by a save.
    function offered(property, value) {
        if (property === P.sufficient) return splitSet(value).every((v) => MODES.indexOf(v) !== -1);
        if (property === P.mode) return MODES.concat(VISUAL_MODES).indexOf(value) !== -1;
        if (property === P.feature) return FEATURE_LIST.concat(['none', 'unknown']).indexOf(value) !== -1;
        return HAZARDS.concat(['none', 'unknown'], HAZARDS.map((h) => hazardTerm(h, 'no')), HAZARDS.map((h) => hazardTerm(h, 'unknown'))).indexOf(value) !== -1;
    }

    // Removes the book-level metas of a property whose offered values are not wanted (and repeats), and appends the missing ones.
    function syncValues(property, wanted) {
        return [(model) => {
            const have = metasOf(model, property);
            const keep = new Set();
            const remove = have.filter((m) => {
                const v = property === P.sufficient ? splitSet(m.value).join(',') : m.value;
                if (keep.has(v)) return true;
                keep.add(v);
                return wanted.indexOf(v) === -1 && offered(property, m.value);
            });
            return [].concat.apply([], remove.map((m) => OpfEdit.removeMetadata(model, m)));
        }].concat(wanted.map((v) => (model) => {
            const have = metasOf(model, property).map((m) => property === P.sufficient ? splitSet(m.value).join(',') : m.value);
            return have.indexOf(v) === -1 ? OpfEdit.insertMeta(model, property, v) : [];
        }));
    }

    function conformanceValue(c) {
        return 'EPUB Accessibility 1.1 - WCAG ' + c.wcag + ' Level ' + c.level;
    }

    // OpfEdit ops that make content.opf say state. Values already there stay where they are; other conformsTo
    // statements (other standards) are left alone (§3.5.2.1).
    function ops(state) {
        const out = [];
        out.push.apply(out, syncValues(P.mode, unique(state.modes || [])));
        out.push.apply(out, syncValues(P.sufficient, unique((state.sufficient || []).map((s) => splitSet(s).join(',')).filter(Boolean))));
        out.push.apply(out, syncValues(P.feature, unique(state.features || [])));
        out.push.apply(out, syncValues(P.hazard, hazardTerms(state.hazards || {})));
        const text = String(state.summary || '').replace(/\s+/g, ' ').trim();
        out.push((model) => {
            const found = metasOf(model, P.summary);
            if (!text) return [].concat.apply([], found.map((m) => OpfEdit.removeMetadata(model, m)));
            return found.length ? OpfEdit.setValue(model, found[0], text) : OpfEdit.insertMeta(model, P.summary, text);
        });
        const c = state.conformance;
        const claim = (model) => metasOf(model, P.conformsTo).find((m) => /^EPUB Accessibility /.test(m.value));
        out.push((model) => {
            const found = claim(model);
            if (!c) return found ? OpfEdit.removeMetadata(model, found) : [];
            if (WCAG.versions.indexOf(c.wcag) === -1 || WCAG.levels.indexOf(c.level) === -1) throw Object.assign(new Error('Choose a WCAG version and level.'), { code: 'invalid-conformance' });
            if (!String(c.certifiedBy || '').trim()) throw Object.assign(new Error('A conformance claim must name who evaluated the book (EPUB Accessibility 1.1 §3.5.3.1).'), { code: 'certifier-missing' });
            const value = conformanceValue(c);
            if (found) return OpfEdit.setValue(model, found, value);
            return OpfEdit.insertMeta(model, P.conformsTo, value, { id: freeId(model, 'conf') });
        });
        // The evaluator refines the claim, as in the specification's examples; the credential refines the evaluator.
        out.push((model) => {
            const found = claim(model);
            if (!found) return [].concat.apply([], metasOf(model, P.certifiedBy).map((m) => OpfEdit.removeMetadata(model, m)));
            return OpfEdit.setRefinement(model, found, P.certifiedBy, String(c.certifiedBy).trim());
        });
        const credential = String((c && c.credential) || '').trim();
        const certOf = (model) => { const found = claim(model); return found && found.refinements.find((r) => r.property === P.certifiedBy); };
        // The credential needs the evaluator to have an id; give it a readable one first.
        out.push((model) => {
            const cert = certOf(model);
            return cert && credential && cert.id == null ? XmlAst.setAttr(model.ast, cert.node, 'id', freeId(model, 'certifier')) : [];
        });
        out.push((model) => {
            const cert = certOf(model);
            if (!cert) return [];
            const v = credential;
            const had = (cert.refinements || []).find((r) => r.property === P.credential);
            if (!v) return had ? OpfEdit.removeMetadata(model, had) : [];
            return OpfEdit.setRefinement(model, cert, P.credential, v);
        });
        return out;
    }

    function freeId(model, base) {
        const ids = new Set(model.ast.elements.map((el) => el.attrs.find((a) => a.local === 'id' && !a.ns)).filter(Boolean).map((a) => a.value));
        let id = base;
        for (let n = 2; ids.has(id); n++) id = base + '-' + n;
        return id;
    }

    // Problems-tab rows ({ code, severity, message, node }) for content.opf; category 'accessibility'.
    function check(model) {
        const problems = [];
        const at = (severity, code, message, node) => problems.push({ severity: severity, code: code, message: message, node: node || null, category: 'accessibility' });
        const metadataNode = model.ast.elements.find((el) => el.local === 'metadata') || null;
        const missing = [[P.mode, 'access modes'], [P.feature, 'accessibility features'], [P.hazard, 'hazards']].filter(([p]) => !metasOf(model, p).length);
        if (missing.length) at('warning', 'a11y-metadata-missing', 'The book does not say its ' + missing.map((m) => m[1]).join(', ') + ', which EPUB Accessibility 1.1 §2.2 requires of every book. Fill in Accessibility in the Book tab.', metadataNode);
        if (!missing.length && !metasOf(model, P.summary).length) at('info', 'a11y-summary-missing', 'The book has no accessibility summary; EPUB Accessibility 1.1 §2.2 recommends one (Book tab, Accessibility).', metadataNode);
        const known = { [P.mode]: MODES.concat(VISUAL_MODES), [P.feature]: FEATURE_LIST.concat(['none', 'unknown', 'printPageNumbers']), [P.hazard]: HAZARDS.concat(['none', 'unknown'], HAZARDS.map((h) => hazardTerm(h, 'no')), HAZARDS.map((h) => hazardTerm(h, 'unknown'))) };
        Object.keys(known).forEach((p) => metasOf(model, p).forEach((m) => {
            if (DEPRECATED[m.value] !== undefined && p === P.feature) at('warning', 'a11y-deprecated', '"' + m.value + '" is deprecated' + (DEPRECATED[m.value] ? '; use ' + DEPRECATED[m.value] : '') + ' (Accessibility Vocabulary 1.1 §4.2).', m.node);
            else if (known[p].indexOf(m.value) === -1) at('warning', 'a11y-unknown-value', '"' + m.value + '" is not a ' + p + ' value in the Accessibility Vocabulary 1.1.', m.node);
        }));
        metasOf(model, P.sufficient).forEach((m) => splitSet(m.value).forEach((v) => { if (MODES.indexOf(v) === -1) at('warning', 'a11y-unknown-value', '"' + v + '" is not a sufficient access mode; use textual, visual, auditory, or tactile (Accessibility Vocabulary 1.1 §8.2).', m.node); }));
        const features = metasOf(model, P.feature);
        ['none', 'unknown'].forEach((v) => { const e = features.find((m) => m.value === v); if (e && features.length > 1) at('warning', 'a11y-feature-alone', 'accessibilityFeature "' + v + '" must not be set with any other feature (Accessibility Vocabulary 1.1 §4.2.' + (v === 'none' ? 8 : 9) + ').', e.node); });
        const hz = metasOf(model, P.hazard);
        const hv = hz.map((m) => m.value);
        ['none', 'unknown'].forEach((v) => {
            const e = hz.find((m) => m.value === v);
            if (e && (HAZARDS.some((h) => hv.indexOf(h) !== -1) || hv.indexOf(v === 'none' ? 'unknown' : 'none') !== -1)) at('warning', 'a11y-hazard-conflict', 'accessibilityHazard "' + v + '" must not be set with a known hazard or with "' + (v === 'none' ? 'unknown' : 'none') + '" (Accessibility Vocabulary 1.1 §5.2).', e.node);
        });
        HAZARDS.forEach((h) => {
            const states = [h, hazardTerm(h, 'no'), hazardTerm(h, 'unknown')].filter((t) => hv.indexOf(t) !== -1);
            if (states.length > 1) at('warning', 'a11y-hazard-conflict', 'The book says both ' + states.join(' and ') + '.', hz.find((m) => m.value === states[1]).node);
        });
        metasOf(model, P.conformsTo).filter((m) => /^EPUB Accessibility/.test(m.value)).forEach((m) => {
            if (!CONFORMANCE.exec(m.value)) at('warning', 'a11y-conformance-format', '"' + m.value + '" does not match "EPUB Accessibility 1.1 - WCAG 2.2 Level AA" exactly, so reading systems will not see a claim (EPUB Accessibility 1.1 §3.5.2).', m.node);
            const certified = (m.refinements || []).some((r) => r.property === P.certifiedBy) || metasOf(model, P.certifiedBy).length;
            if (!certified) at('warning', 'a11y-certifier-missing', 'The book claims conformance but does not say who evaluated it; add a11y:certifiedBy (EPUB Accessibility 1.1 §3.5.3.1).', m.node);
        });
        return problems;
    }

    // check() as Problems-tab rows on content.opf: { file, start, end, line, code, severity, category, message }.
    function rows(model) {
        const text = model.ast.text || '';
        return check(model).map((p) => {
            const start = p.node ? p.node.start : 0, end = p.node ? (p.node.openEnd || p.node.end) : 0;
            return { file: model.opfPath, start: start, end: end, line: text.slice(0, start).split('\n').length, code: p.code, severity: p.severity, category: p.category, message: p.message };
        });
    }

    return { rows: rows, P: P, MODES: MODES, VISUAL_MODES: VISUAL_MODES, FEATURES: FEATURES, DEPRECATED: DEPRECATED, HAZARDS: HAZARDS, WCAG: WCAG, read: read, suggest: suggest, summary: summary, ops: ops, check: check, hazardTerms: hazardTerms, conformanceValue: conformanceValue };
}));
