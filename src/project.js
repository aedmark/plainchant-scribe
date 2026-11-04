(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./html-ast.js'), require('./css-ast.js'));
    else root.Project = factory(root.HtmlAst, root.CssAst);
})(typeof self !== 'undefined' ? self : this, function (HtmlAst, CssAst) {
    'use strict';

    const DEFAULT_HTML = [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '  <meta charset="UTF-8">',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '  <title>Studio Landing Page</title>',
        '  <link rel="stylesheet" href="styles.css">',
        '</head>',
        '<body>',
        '  <header class="site-header">',
        '    <div class="brand">Polyphony Studio</div>',
        '    <nav class="site-nav">',
        '      <a href="#features" class="nav-link">Features</a>',
        '      <a href="#work" class="nav-link">Work</a>',
        '      <a href="#contact" class="nav-link">Contact</a>',
        '    </nav>',
        '  </header>',
        '  <main class="hero">',
        '    <span class="badge">HTML5 · CSS · JS</span>',
        '    <h1 class="hero-title">Design visually. Keep clean code.</h1>',
        '    <p class="hero-lead">Click any element on the stage to inspect its box model, tweak CSS rules, or double-click text to edit inline.</p>',
        '    <div class="hero-actions">',
        '      <button id="ctaBtn" class="btn-primary" type="button">Run Interactive Demo</button>',
        '      <a href="#features" class="btn-secondary">Explore Structure</a>',
        '    </div>',
        '  </main>',
        '  <section id="features" class="card-grid">',
        '    <article class="card">',
        '      <h2>True Source of Truth</h2>',
        '      <p>Every property change splices the exact byte range in your HTML and CSS files.</p>',
        '    </article>',
        '    <article class="card">',
        '      <h2>Live &amp; Design Modes</h2>',
        '      <p>Switch between visual layout inspection and live JavaScript execution at any time.</p>',
        '    </article>',
        '    <article class="card">',
        '      <h2>Tauri &amp; Web Ready</h2>',
        '      <p>Work in your browser with IndexedDB or open native project folders on desktop.</p>',
        '    </article>',
        '  </section>',
        '  <script src="script.js"></script>',
        '</body>',
        '</html>'
    ].join('\n');

    const DEFAULT_CSS = [
        ':root {',
        '  --surface: #0f172a;',
        '  --card: #1e293b;',
        '  --accent: #38bdf8;',
        '  --text: #f8fafc;',
        '  --muted: #94a3b8;',
        '}',
        '',
        'body {',
        '  margin: 0;',
        '  font-family: system-ui, -apple-system, sans-serif;',
        '  background-color: #f8fafc;',
        '  color: #0f172a;',
        '  line-height: 1.6;',
        '}',
        '',
        '.site-header {',
        '  display: flex;',
        '  justify-content: space-between;',
        '  align-items: center;',
        '  padding: 1.25rem 2.5rem;',
        '  background-color: #ffffff;',
        '  border-bottom: 1px solid #e2e8f0;',
        '}',
        '',
        '.brand {',
        '  font-weight: 700;',
        '  font-size: 1.125rem;',
        '  letter-spacing: -0.02em;',
        '}',
        '',
        '.site-nav {',
        '  display: flex;',
        '  gap: 1.5rem;',
        '}',
        '',
        '.nav-link {',
        '  color: #475569;',
        '  text-decoration: none;',
        '  font-weight: 500;',
        '}',
        '',
        '.hero {',
        '  max-width: 760px;',
        '  margin: 0 auto;',
        '  padding: 4rem 2rem 3rem;',
        '  text-align: center;',
        '}',
        '',
        '.badge {',
        '  display: inline-block;',
        '  padding: 0.25rem 0.75rem;',
        '  border-radius: 999px;',
        '  background-color: #e0f2fe;',
        '  color: #0369a1;',
        '  font-size: 0.75rem;',
        '  font-weight: 600;',
        '  letter-spacing: 0.05em;',
        '}',
        '',
        '.hero-title {',
        '  font-size: 2.5rem;',
        '  margin: 1rem 0 0.75rem;',
        '  letter-spacing: -0.03em;',
        '  color: #0f172a;',
        '}',
        '',
        '.hero-lead {',
        '  font-size: 1.125rem;',
        '  color: #475569;',
        '  margin: 0 0 2rem;',
        '}',
        '',
        '.hero-actions {',
        '  display: flex;',
        '  justify-content: center;',
        '  gap: 1rem;',
        '}',
        '',
        '.btn-primary {',
        '  padding: 0.75rem 1.5rem;',
        '  background-color: #0284c7;',
        '  color: #ffffff;',
        '  border: none;',
        '  border-radius: 0.5rem;',
        '  font-weight: 600;',
        '  cursor: pointer;',
        '}',
        '',
        '.btn-secondary {',
        '  padding: 0.75rem 1.5rem;',
        '  background-color: #e2e8f0;',
        '  color: #1e293b;',
        '  border-radius: 0.5rem;',
        '  text-decoration: none;',
        '  font-weight: 600;',
        '}',
        '',
        '.card-grid {',
        '  display: grid;',
        '  grid-template-columns: repeat(3, 1fr);',
        '  gap: 1.5rem;',
        '  max-width: 960px;',
        '  margin: 0 auto;',
        '  padding: 1rem 2rem 4rem;',
        '}',
        '',
        '.card {',
        '  background-color: #ffffff;',
        '  border: 1px solid #e2e8f0;',
        '  border-radius: 0.75rem;',
        '  padding: 1.5rem;',
        '}',
        '',
        '.card h2 {',
        '  font-size: 1.125rem;',
        '  margin: 0 0 0.5rem;',
        '}',
        '',
        '.card p {',
        '  margin: 0;',
        '  color: #475569;',
        '  font-size: 0.925rem;',
        '}'
    ].join('\n');

    const DEFAULT_JS = [
        '// Interactive script for Live Mode',
        'const ctaBtn = document.getElementById("ctaBtn");',
        'let clicks = 0;',
        '',
        'if (ctaBtn) {',
        '  ctaBtn.addEventListener("click", () => {',
        '    clicks += 1;',
        '    ctaBtn.textContent = "Clicked " + clicks + (clicks === 1 ? " time!" : " times!");',
        '  });',
        '}'
    ].join('\n');

    function resolveRelPath(baseFile, href) {
        const raw = String(href || '').trim().split('?')[0].split('#')[0];
        if (!raw || /^(?:https?:|data:|mailto:|tel:|\/\/)/i.test(raw)) return null;
        const clean = raw.replace(/^\.\//, '').replace(/^\//, '');
        if (!baseFile || baseFile.indexOf('/') === -1) return clean;
        const dirParts = baseFile.split('/').slice(0, -1);
        const relParts = raw.split('/');
        const stack = raw.startsWith('/') ? [] : dirParts;
        for (let i = 0; i < relParts.length; i++) {
            const seg = relParts[i];
            if (!seg || seg === '.') continue;
            if (seg === '..') stack.pop();
            else stack.push(seg);
        }
        return stack.join('/');
    }

    function resolveRelativePath(fromFile, rawHref) {
        let raw = String(rawHref == null ? '' : rawHref).trim().split('#')[0].split('?')[0];
        if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) return null;
        try { raw = decodeURIComponent(raw); } catch (e) { /* keep the raw text */ }
        const stack = raw.startsWith('/') ? [] : String(fromFile || '').split('/').slice(0, -1);
        const segments = raw.split('/');
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            if (!seg || seg === '.') continue;
            if (seg === '..') {
                if (!stack.length) return null;
                stack.pop();
            } else {
                stack.push(seg);
            }
        }
        if (raw.endsWith('/')) stack.push('index.html');
        return stack.length ? stack.join('/') : null;
    }

    const MIME = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
        svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp', woff: 'font/woff', woff2: 'font/woff2',
        ttf: 'font/ttf', otf: 'font/otf', mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
        mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', pdf: 'application/pdf'
    };

    function mimeFor(filePath) {
        const ext = String(filePath || '').split('.').pop().toLowerCase();
        return MIME[ext] || 'application/octet-stream';
    }

    function assetUrlFor(urls, fromFile, rawUrl) {
        const target = resolveRelativePath(fromFile, rawUrl);
        return target && Object.prototype.hasOwnProperty.call(urls, target) ? urls[target] : null;
    }

    function rewriteCssUrls(css, fromFile, urls) {
        return String(css).replace(/url\(\s*(['"]?)([^'")]*?)\1\s*\)/gi, (full, quote, raw) => {
            const hit = assetUrlFor(urls, fromFile, raw);
            return hit ? 'url("' + hit + '")' : full;
        });
    }

    function rewriteAssetUrls(html, fromFile, urls) {
        const attrRe = /(\s)(src|poster|srcset|href)(\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi;
        const withAttrs = String(html).replace(/<[a-z][^<>]*>/gi, (tag) => {
            const isLink = /^<link\b/i.test(tag);
            return tag.replace(attrRe, (full, space, name, eq, dq, sq) => {
                const attr = name.toLowerCase();
                if (attr === 'href' && !isLink) return full;
                const value = dq != null ? dq : sq;
                const next = attr === 'srcset'
                    ? value.split(',').map((candidate) => {
                        const parts = candidate.trim().split(/\s+/);
                        const hit = assetUrlFor(urls, fromFile, parts[0]);
                        return hit ? [hit].concat(parts.slice(1)).join(' ') : candidate.trim();
                    }).join(', ')
                    : (assetUrlFor(urls, fromFile, value) || value);
                return space + name + eq + '"' + next + '"';
            });
        });
        return rewriteCssUrls(withAttrs, fromFile, urls);
    }

    function relativePath(fromFile, target) {
        const from = String(fromFile || '').split('/').slice(0, -1);
        const to = String(target || '').split('/');
        let i = 0;
        while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
        return from.slice(i).map(() => '..').concat(to.slice(i)).join('/');
    }

    function normalizeFilePath(raw) {
        return String(raw == null ? '' : raw).trim().replace(/\\/g, '/').replace(/^(?:\.?\/)+/, '').replace(/\/{2,}/g, '/');
    }

    function validateFilePath(entries, candidate, current) {
        const path = normalizeFilePath(candidate);
        if (!path) return { ok: false, error: 'Enter a file name.' };
        if (path.length > 200) return { ok: false, error: 'That path is too long.' };
        if (path.endsWith('/')) return { ok: false, error: 'A file name cannot end with a slash.' };
        const segments = path.split('/');
        if (segments.some((s) => s === '.' || s === '..')) return { ok: false, error: 'Use a path inside the project, without . or .. parts.' };
        if (segments.some((s) => /[<>:"|?*\u0000-\u001f]/.test(s))) return { ok: false, error: 'File names cannot contain < > : " | ? * or control characters.' };
        const clash = Object.keys(entries).find((k) => k !== current && k.toLowerCase() === path.toLowerCase());
        if (clash) return { ok: false, error: clash + ' already exists (file names are compared without regard to case).' };
        return { ok: true, path: path };
    }

    function mapRefs(text, visit) {
        const attrRe = /(\s)(src|poster|href)(\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi;
        const out = String(text).replace(/<[a-z][^<>]*>/gi, (tag) => tag.replace(attrRe, (full, sp, name, eq, dq, sq) => {
            const next = visit(dq != null ? dq : sq);
            return next == null ? full : sp + name + eq + (dq != null ? '"' + next + '"' : "'" + next + "'");
        })).replace(/(<!--\s*pc:part\s+src=)(?:"([^"]*)"|'([^']*)')/g, (full, head, dq, sq) => {
            const next = visit(dq != null ? dq : sq);
            return next == null ? full : head + (dq != null ? '"' + next + '"' : "'" + next + "'");
        });
        return out.replace(/url\(\s*(['"]?)([^'")]*?)\1\s*\)/gi, (full, quote, raw) => {
            const next = visit(raw);
            return next == null ? full : 'url("' + next + '")';
        });
    }

    function retarget(entries, from, target, known) {
        const next = {};
        let refsUpdated = 0;
        Object.keys(entries).forEach((oldPath) => {
            const newPath = oldPath === from ? target : oldPath;
            let text = entries[oldPath];
            if (/\.(html?|css)$/i.test(oldPath)) {
                const updated = mapRefs(text, (raw) => {
                    const m = /^([^?#]*)(.*)$/.exec(String(raw).trim());
                    const was = resolveRelativePath(oldPath, m[1]);
                    if (!was) return null;
                    const points = was === from;
                    if (!points && (oldPath === newPath || !known.has(was))) return null;
                    const now = points ? target : was;
                    if (resolveRelativePath(newPath, m[1]) === now) return null;
                    const rel = m[1].charAt(0) === '/' ? '/' + now : relativePath(newPath, now);
                    return rel.replace(/ /g, '%20') + m[2];
                });
                if (updated !== text) { refsUpdated++; text = updated; }
            }
            next[newPath] = text;
        });
        return { error: null, entries: next, path: target, refsUpdated: refsUpdated };
    }

    function renameFile(entries, from, to, options) {
        if (!Object.prototype.hasOwnProperty.call(entries, from)) return { error: from + ' was not found.' };
        const check = validateFilePath(entries, to, from);
        if (!check.ok) return { error: check.error };
        const target = check.path;
        if (target === from) return { error: null, entries: entries, path: from, refsUpdated: 0 };
        return retarget(entries, from, target, new Set(Object.keys(entries).concat((options && options.known) || [])));
    }

    function renameAsset(entries, from, to, options) {
        const others = (options && options.known) || [];
        const taken = Object.assign({}, entries);
        others.forEach((k) => { if (!Object.prototype.hasOwnProperty.call(taken, k)) taken[k] = ''; });
        taken[from] = '';
        const check = validateFilePath(taken, to, from);
        if (!check.ok) return { error: check.error };
        if (check.path === from) return { error: null, entries: entries, path: from, refsUpdated: 0 };
        const oldExt = (/\.[^./]+$/.exec(from) || [''])[0].toLowerCase();
        const newExt = (/\.[^./]+$/.exec(check.path) || [''])[0].toLowerCase();
        if (oldExt !== newExt) return { error: 'Keep the ' + (oldExt || 'original') + ' extension so the image type stays the same.' };
        return retarget(entries, from, check.path, new Set(Object.keys(entries).concat(others, [from])));
    }

    function uniqueCopyPath(entries, path) {
        const dot = path.lastIndexOf('.');
        const slash = path.lastIndexOf('/');
        const stem = dot > slash + 1 ? path.slice(0, dot) : path;
        const ext = dot > slash + 1 ? path.slice(dot) : '';
        const taken = new Set(Object.keys(entries).map((k) => k.toLowerCase()));
        let candidate = stem + '-copy' + ext;
        for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = stem + '-copy-' + n + ext;
        return candidate;
    }

    function duplicateFile(entries, path) {
        if (!Object.prototype.hasOwnProperty.call(entries, path)) return { error: path + ' was not found.' };
        const copy = uniqueCopyPath(entries, path);
        const next = {};
        Object.keys(entries).forEach((k) => {
            next[k] = entries[k];
            if (k === path) next[copy] = entries[path];
        });
        return { error: null, entries: next, path: copy };
    }

    function deleteFile(entries, path) {
        if (!Object.prototype.hasOwnProperty.call(entries, path)) return { error: path + ' was not found.' };
        if (/\.html?$/i.test(path) && Object.keys(entries).filter((k) => /\.html?$/i.test(k)).length <= 1) {
            return { error: 'A project needs at least one .html file, so ' + path + ' cannot be deleted.' };
        }
        const next = Object.assign({}, entries);
        delete next[path];
        return { error: null, entries: next };
    }

    function treeAfter(tree, op) {
        if (!Array.isArray(tree)) return tree;
        let next = tree.map((item) => Object.assign({}, item));
        if (op.type === 'delete') return next.filter((item) => item.path !== op.path);
        const sorted = (list) => list.sort((a, b) => (a.path < b.path ? -1 : (a.path > b.path ? 1 : 0)));
        const ensureDirs = (path) => {
            const parts = path.split('/');
            for (let i = 1; i <= parts.length; i++) {
                const dir = parts.slice(0, i).join('/');
                if (!next.some((item) => item.path === dir)) next.push({ path: dir, kind: 'dir', is_text: false });
            }
        };
        if (op.type === 'mkdir') {
            ensureDirs(op.path);
            return sorted(next);
        }
        if (op.type === 'moveDir') {
            next = next.map((item) => {
                if (item.path === op.from) return Object.assign(item, { path: op.to });
                if (item.path.indexOf(op.from + '/') === 0) return Object.assign(item, { path: op.to + item.path.slice(op.from.length) });
                return item;
            });
            ensureDirs(op.to);
            return sorted(next);
        }
        if (op.type === 'add') {
            if (next.some((item) => item.path === op.path)) return next;
            const parts = op.path.split('/');
            for (let i = 1; i < parts.length; i++) {
                const dir = parts.slice(0, i).join('/');
                if (!next.some((item) => item.path === dir)) next.push({ path: dir, kind: 'dir', is_text: false });
            }
            next.push({ path: op.path, kind: 'file', is_text: op.is_text !== false });
            return next.sort((a, b) => (a.path < b.path ? -1 : (a.path > b.path ? 1 : 0)));
        }
        const add = (path, source) => {
            const parts = path.split('/');
            for (let i = 1; i < parts.length; i++) {
                const dir = parts.slice(0, i).join('/');
                if (!next.some((item) => item.path === dir)) next.push({ path: dir, kind: 'dir', is_text: false });
            }
            next.push({ path: path, kind: 'file', is_text: source ? source.is_text !== false : true });
        };
        if (op.type === 'rename') {
            const old = next.find((item) => item.path === op.from);
            next = next.filter((item) => item.path !== op.from);
            add(op.to, old);
        } else if (op.type === 'duplicate') {
            add(op.to, next.find((item) => item.path === op.from));
        }
        return next.sort((a, b) => (a.path < b.path ? -1 : (a.path > b.path ? 1 : 0)));
    }

    function deriveTree(entries, tree, extraFiles) {
        if (Array.isArray(tree) && tree.length) return tree.map((item) => Object.assign({}, item));
        let next = [];
        Object.keys(entries || {}).forEach((path) => { next = treeAfter(next, { type: 'add', path: path }); });
        (extraFiles || []).forEach((path) => { next = treeAfter(next, { type: 'add', path: path, is_text: false }); });
        return next;
    }

    function pathsUnder(paths, dir) {
        return paths.filter((p) => p.indexOf(dir + '/') === 0);
    }

    function moveFolder(entries, from, to, options) {
        const src = normalizeFilePath(from);
        const known = (options && options.known) || [];
        const all = Array.from(new Set(Object.keys(entries).concat(known)));
        const inside = pathsUnder(all, src);
        const outside = all.filter((p) => inside.indexOf(p) === -1);
        const probe = {};
        outside.forEach((p) => { probe[p] = ''; });
        const check = validateFilePath(probe, String(to || '').trim().replace(/\/+$/, ''), '');
        if (!check.ok) return { error: check.error };
        const dest = check.path;
        if (dest === src) return { error: null, entries: entries, path: src, moves: [], refsUpdated: 0 };
        if (dest.indexOf(src + '/') === 0) return { error: 'A folder cannot be moved into itself.' };
        const parts = dest.split('/');
        for (let i = 1; i < parts.length; i++) {
            const prefix = parts.slice(0, i).join('/');
            if (outside.some((p) => p.toLowerCase() === prefix.toLowerCase())) return { error: prefix + ' is a file, so it cannot hold a folder.' };
        }
        const taken = new Set(outside.map((p) => p.toLowerCase()));
        for (let i = 0; i < inside.length; i++) {
            const target = dest + inside[i].slice(src.length);
            if (taken.has(target.toLowerCase())) return { error: target + ' already exists (file names are compared without regard to case).' };
        }
        let current = entries;
        const knownSet = new Set(all);
        const moves = [];
        inside.forEach((old) => {
            const target = dest + old.slice(src.length);
            current = retarget(current, old, target, knownSet).entries;
            knownSet.delete(old);
            knownSet.add(target);
            moves.push({ from: old, to: target });
        });
        const back = {};
        moves.forEach((m) => { back[m.to] = m.from; });
        const refsUpdated = Object.keys(current).filter((k) => entries[back[k] || k] !== current[k]).length;
        return { error: null, entries: current, path: dest, moves: moves, refsUpdated: refsUpdated };
    }

    function validateFolderPath(files, dirs, candidate, current) {
        const probe = {};
        files.concat(dirs).forEach((p) => { probe[p] = ''; });
        const check = validateFilePath(probe, String(candidate || '').trim().replace(/\/+$/, ''), current);
        if (!check.ok) return check;
        const parts = check.path.split('/');
        for (let i = 1; i < parts.length; i++) {
            const prefix = parts.slice(0, i).join('/');
            if (files.some((p) => p.toLowerCase() === prefix.toLowerCase())) return { ok: false, error: prefix + ' is a file, so it cannot hold a folder.' };
        }
        return check;
    }

    function normalizeEntries(files) {
        const f = files || {};
        const entries = Object.assign({}, f.entries || {});
        if (typeof f.html === 'string' && !('index.html' in entries)) entries['index.html'] = f.html;
        if (typeof f.css === 'string' && !('styles.css' in entries) && !('style.css' in entries)) entries['styles.css'] = f.css;
        if (typeof f.js === 'string' && !('script.js' in entries)) entries['script.js'] = f.js;
        return entries;
    }

    function linkedStylesheets(html, entries, activeHtmlPath) {
        const text = String(html || '');
        const found = [];
        const linkRe = /<link\b([^>]*?)>/gi;
        let m;
        while ((m = linkRe.exec(text)) !== null) {
            const tagAttrs = m[1];
            if (!/\brel\s*=\s*["']?stylesheet["']?/i.test(tagAttrs)) continue;
            const hrefMatch = tagAttrs.match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
            if (!hrefMatch) continue;
            const rawHref = hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || '';
            const resolved = resolveRelPath(activeHtmlPath || 'index.html', rawHref);
            if (resolved) {
                found.push({ rawHref: rawHref, path: resolved, fullMatch: m[0] });
            }
        }
        return found;
    }

    function primaryCssFile(files, activeHtmlPath) {
        const entries = normalizeEntries(files);
        const htmlFile = activeHtmlPath || 'index.html';
        const html = entries[htmlFile] || (files && files.html) || '';
        const links = linkedStylesheets(html, entries, htmlFile);
        for (let i = 0; i < links.length; i++) {
            if (links[i].path in entries) return links[i].path;
        }
        if ('style.css' in entries && (!('styles.css' in entries) || (entries['style.css'] && !entries['styles.css']))) {
            return 'style.css';
        }
        if ('styles.css' in entries) return 'styles.css';
        const anyCss = Object.keys(entries).find((k) => k.toLowerCase().endsWith('.css'));
        return anyCss || (links[0] ? links[0].path : 'styles.css');
    }

    function starter() {
        return {
            html: DEFAULT_HTML,
            css: DEFAULT_CSS,
            js: DEFAULT_JS,
            entries: {
                'index.html': DEFAULT_HTML,
                'styles.css': DEFAULT_CSS,
                'script.js': DEFAULT_JS
            }
        };
    }

    function blank() {
        const h = [
            '<!DOCTYPE html>',
            '<html lang="en">',
            '<head>',
            '  <meta charset="UTF-8">',
            '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
            '  <title>Untitled Page</title>',
            '  <link rel="stylesheet" href="styles.css">',
            '</head>',
            '<body>',
            '  <main class="container">',
            '    <h1>Hello World</h1>',
            '    <p>Start typing HTML or insert elements from the toolbar.</p>',
            '  </main>',
            '  <script src="script.js"></script>',
            '</body>',
            '</html>'
        ].join('\n');
        const c = [
            'body {',
            '  margin: 0;',
            '  font-family: system-ui, -apple-system, sans-serif;',
            '  background-color: #ffffff;',
            '  color: #0f172a;',
            '  line-height: 1.6;',
            '}',
            '',
            '.container {',
            '  max-width: 760px;',
            '  margin: 0 auto;',
            '  padding: 3rem 1.5rem;',
            '}'
        ].join('\n');
        const j = '// Write your JavaScript here\n';
        return {
            html: h,
            css: c,
            js: j,
            entries: {
                'index.html': h,
                'styles.css': c,
                'script.js': j
            }
        };
    }

    function pack(files) {
        const f = files || {};
        const entries = normalizeEntries(f);
        if (typeof f.html === 'string') entries[f.activeHtml || 'index.html'] = f.html;
        if (typeof f.css === 'string') entries[f.activeCss || primaryCssFile(f, f.activeHtml)] = f.css;
        if (typeof f.js === 'string') entries[f.activeJs || 'script.js'] = f.js;
        return JSON.stringify({
            plainchantScribe: 1,
            html: String(f.html == null ? (entries['index.html'] || '') : f.html),
            css: String(f.css == null ? (entries[primaryCssFile({ entries: entries }, 'index.html')] || '') : f.css),
            js: String(f.js == null ? (entries['script.js'] || '') : f.js),
            entries: entries
        });
    }

    function unpack(raw) {
        const s = String(raw || '');
        if (!s.trim()) return blank();
        if (s.trim().startsWith('{')) {
            try {
                const parsed = JSON.parse(s);
                if (parsed && typeof parsed === 'object' && ('html' in parsed || 'plainchantScribe' in parsed || 'entries' in parsed)) {
                    const entries = Object.assign({}, parsed.entries || {});
                    const html = String(parsed.html != null ? parsed.html : (entries['index.html'] || ''));
                    if (!('index.html' in entries) && html) entries['index.html'] = html;
                    const cssFile = primaryCssFile({ entries: entries, html: html }, 'index.html');
                    const css = String(parsed.css != null ? parsed.css : (entries[cssFile] || ''));
                    if (!(cssFile in entries) && css) entries[cssFile] = css;
                    const js = String(parsed.js != null ? parsed.js : (entries['script.js'] || ''));
                    if (!('script.js' in entries) && js) entries['script.js'] = js;
                    return {
                        html: html,
                        css: css,
                        js: js,
                        entries: entries
                    };
                }
            } catch (e) {
            }
        }
        let html = s;
        let css = '';
        let js = '';
        const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
        if (styleMatch) css = styleMatch[1].trim();
        const scriptMatch = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/i);
        if (scriptMatch) js = scriptMatch[1].trim();
        return {
            html: html,
            css: css,
            js: js,
            entries: {
                'index.html': html,
                'styles.css': css,
                'script.js': js
            }
        };
    }

    function extractTitle(rawOrFiles) {
        const files = typeof rawOrFiles === 'string' ? unpack(rawOrFiles) : (rawOrFiles || {});
        const entries = normalizeEntries(files);
        const html = files.html || entries['index.html'] || Object.values(entries)[0] || '';
        return HtmlAst.extractTitle(html);
    }

    function setTitle(rawOrFiles, title) {
        const isStr = typeof rawOrFiles === 'string';
        const files = isStr ? unpack(rawOrFiles) : Object.assign({}, rawOrFiles);
        files.html = HtmlAst.setTitle(files.html || '', title);
        if (files.entries) files.entries['index.html'] = files.html;
        return isStr ? pack(files) : files;
    }

    function assemblePreview(files, options) {
        const f = typeof files === 'string' ? unpack(files) : (files || {});
        const opts = options || {};
        const entries = normalizeEntries(f);
        const activeHtmlPath = opts.activeHtml || f.activeHtml || 'index.html';
        const rawHtml = (opts.activeHtml && entries[opts.activeHtml] != null)
            ? entries[opts.activeHtml]
            : (f.html != null ? f.html : (entries['index.html'] || ''));

        const ast = opts.ast || HtmlAst.parse(rawHtml);
        let html = HtmlAst.stamp(rawHtml, ast);
        const assetUrls = opts.assetUrls && Object.keys(opts.assetUrls).length ? opts.assetUrls : null;
        if (assetUrls) html = rewriteAssetUrls(html, activeHtmlPath, assetUrls);

        const links = linkedStylesheets(html, entries, activeHtmlPath);
        const inlinedCssPaths = new Set();

        links.forEach((lnk) => {
            if (entries[lnk.path] != null) {
                inlinedCssPaths.add(lnk.path);
                html = html.replace(
                    lnk.fullMatch,
                    '<style id="pc-project-css" data-pc-href="' + lnk.path + '">\n' + (assetUrls ? rewriteCssUrls(entries[lnk.path], lnk.path, assetUrls) : entries[lnk.path]) + '\n</style>'
                );
            }
        });

        const fallbackCss = f.css != null ? f.css : (entries['styles.css'] || entries['style.css'] || '');
        const hasInjectedStyle = html.indexOf('id="pc-project-css"') !== -1;
        const styleBlock = !hasInjectedStyle
            ? '<style id="pc-project-css">\n' + (assetUrls ? rewriteCssUrls(fallbackCss, primaryCssFile(f, activeHtmlPath), assetUrls) : String(fallbackCss)) + '\n</style>'
            : '';

        // Scripts are never run in the Studio (D-004): every <script> is dropped from the preview.
        html = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');

        const baseTag = opts.baseUrl ? '<base href="' + opts.baseUrl + '">' : '';
        const bridgeBlock = opts.bridgeCss ? '<style id="pc-bridge-css">\n' + opts.bridgeCss + '\n</style>' : '';
        const headTop = baseTag;
        const headTopText = headTop ? headTop + '\n' : '';
        const headBottom = [styleBlock, bridgeBlock].filter(Boolean).join('\n');

        if (headTopText) {
            if (/<head[^>]*>/i.test(html)) {
                html = html.replace(/<head[^>]*>/i, (tag) => tag + '\n' + headTopText);
            } else {
                html = headTopText + html;
            }
        }

        if (headBottom) {
            if (/<\/head>/i.test(html)) {
                html = html.replace(/<\/head>/i, headBottom + '\n</head>');
            } else {
                html = headBottom + '\n' + html;
            }
        }

        const bridgeJsBlock = opts.bridgeScript
            ? '<script id="pc-bridge-script">\n' + opts.bridgeScript + '\n<\/script>'
            : '';
        const tailInsert = bridgeJsBlock;

        if (tailInsert) {
            if (/<\/body>/i.test(html)) {
                html = html.replace(/<\/body>/i, tailInsert + '\n</body>');
            } else {
                html = html + '\n' + tailInsert;
            }
        }
        return html;
    }

    function exportSingleHtml(files) {
        const f = typeof files === 'string' ? unpack(files) : (files || {});
        const entries = normalizeEntries(f);
        let html = String(f.html || entries['index.html'] || '');
        const cssFile = primaryCssFile(f, 'index.html');
        const css = String(f.css != null ? f.css : (entries[cssFile] || '')).trim();
        const js = String(f.js != null ? f.js : (entries['script.js'] || '')).trim();

        if (css) {
            const styleTag = '<style>\n' + css + '\n  </style>';
            const links = linkedStylesheets(html, entries, 'index.html');
            if (links.length) {
                html = html.replace(links[0].fullMatch, styleTag);
            } else if (/<\/head>/i.test(html)) {
                html = html.replace(/<\/head>/i, '  ' + styleTag + '\n</head>');
            } else {
                html = styleTag + '\n' + html;
            }
        }
        if (js) {
            const scriptTag = '<script>\n' + js + '\n  <\/script>';
            if (/<script\b[^>]*src=["'][^"']+["'][^>]*>\s*<\/script>/i.test(html)) {
                html = html.replace(/<script\b[^>]*src=["'][^"']+["'][^>]*>\s*<\/script>/i, scriptTag);
            } else if (/<\/body>/i.test(html)) {
                html = html.replace(/<\/body>/i, '  ' + scriptTag + '\n</body>');
            } else {
                html = html + '\n' + scriptTag;
            }
        }
        return html;
    }

    function stats(rawOrFiles) {
        const f = typeof rawOrFiles === 'string' ? unpack(rawOrFiles) : (rawOrFiles || {});
        const entries = normalizeEntries(f);
        const cssFile = primaryCssFile(f, 'index.html');
        const htmlText = f.html != null ? f.html : (entries['index.html'] || '');
        const cssText = f.css != null ? f.css : (entries[cssFile] || '');
        const jsText = f.js != null ? f.js : (entries['script.js'] || '');
        const htmlAst = HtmlAst.parse(htmlText);
        const cssAst = CssAst.parse(cssText);
        const jsLines = String(jsText).trim() ? String(jsText).split('\n').length : 0;
        const bodyElements = htmlAst.elements.filter((el) =>
            ['html', 'head', 'meta', 'title', 'link', 'style', 'script', 'body'].indexOf(el.tag) === -1
        );
        return {
            elements: bodyElements.length,
            rules: cssAst.rules.length,
            jsLines: jsLines,
            htmlLines: String(htmlText).split('\n').length,
            cssLines: String(cssText).split('\n').length,
            fileCount: Object.keys(entries).length
        };
    }

    return {
        DEFAULT_HTML: DEFAULT_HTML,
        DEFAULT_CSS: DEFAULT_CSS,
        DEFAULT_JS: DEFAULT_JS,
        resolveRelPath: resolveRelPath,
        resolveRelativePath: resolveRelativePath,
        relativePath: relativePath,
        normalizeFilePath: normalizeFilePath,
        validateFilePath: validateFilePath,
        renameFile: renameFile, renameAsset: renameAsset, moveFolder: moveFolder, deriveTree: deriveTree, pathsUnder: pathsUnder, validateFolderPath: validateFolderPath,
        duplicateFile: duplicateFile,
        deleteFile: deleteFile,
        treeAfter: treeAfter,
        mimeFor: mimeFor,
        rewriteAssetUrls: rewriteAssetUrls,
        rewriteCssUrls: rewriteCssUrls,
        normalizeEntries: normalizeEntries,
        linkedStylesheets: linkedStylesheets,
        primaryCssFile: primaryCssFile,
        starter: starter,
        blank: blank,
        pack: pack,
        unpack: unpack,
        extractTitle: extractTitle,
        setTitle: setTitle,
        assemblePreview: assemblePreview,
        exportSingleHtml: exportSingleHtml,
        stats: stats
    };
});
