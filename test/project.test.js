test('project: pack, unpack, assemblePreview, and exportSingleHtml preserve multi-file structure', () => {
    const start = Project.starter();
    const packed = Project.pack(start);
    const unpacked = Project.unpack(packed);
    assert.equal(unpacked.html, start.html);
    assert.equal(unpacked.css, start.css);
    assert.equal(unpacked.js, start.js);

    const designDoc = Project.assemblePreview(start, { liveJs: false, bridgeScript: 'window.__BRIDGE = 1;' });
    assert.includes(designDoc, 'id="pc-project-css"');
    assert.includes(designDoc, 'data-pc-id="');
    assert.includes(designDoc, 'window.__BRIDGE = 1;');
    assert.ok(!designDoc.includes('id="pc-project-js"'), 'user JS disabled in Design mode');

    const liveDoc = Project.assemblePreview(start, { liveJs: true });
    assert.includes(liveDoc, 'id="pc-project-js"');

    const bundled = Project.exportSingleHtml(start);
    assert.includes(bundled, '<style>');
    assert.includes(bundled, '<script>');
    assert.ok(!bundled.includes('href="styles.css"'), 'external stylesheet link replaced by inline style');
});

test('project: resolves linked style.css, multi-file entries, and baseUrl for real folders like portfolio', () => {
    const portfolioWorkspace = {
        entries: {
            'index.html': '<!DOCTYPE html><html><head><link rel="stylesheet" href="style.css"></head><body><h1>Portfolio</h1></body></html>',
            'resume.html': '<!DOCTYPE html><html><head><link rel="stylesheet" href="style.css"></head><body><h1>Resume</h1></body></html>',
            'style.css': 'body { background: #123456; }',
            'styles.css': '',
            'script.js': 'console.log("loaded");'
        }
    };
    assert.equal(Project.primaryCssFile(portfolioWorkspace, 'index.html'), 'style.css');
    const preview = Project.assemblePreview(portfolioWorkspace, {
        activeHtml: 'resume.html',
        baseUrl: 'http://127.0.0.1:45678/',
        liveJs: false
    });
    assert.includes(preview, '<base href="http://127.0.0.1:45678/">');
    assert.includes(preview, 'background: #123456;');
    assert.includes(preview, '>Resume</h1>');
});

test('dom-outline: builds hierarchical DOM tree and ancestor breadcrumbs', () => {
    const html = '<html><body><main id="app"><section class="hero"><h1 class="title">Welcome</h1></section></main></body></html>';
    const ast = HtmlAst.parse(html);
    const h1 = ast.elements.find((e) => e.tag === 'h1');
    const crumbs = DomOutline.breadcrumbs(ast, h1.id);
    assert.deepEqual(crumbs.map((c) => c.label), ['body', 'main#app', 'section.hero', 'h1.title']);

    const tree = DomOutline.build(ast);
    assert.equal(tree.length, 3);
    assert.equal(tree[2].label, 'h1.title');
    assert.equal(tree[2].depth, 2);
});

test('editing & code-shade: expands HTML abbreviations on Tab, indents between tags on Enter, and shades HTML/CSS/JS', () => {
    const exp = Editing.expandAbbrev('  section#intro.hero', 20, 'html');
    assert.ok(exp, 'expanded section#intro.hero');
    assert.equal(exp.insert, '<section id="intro" class="hero"></section>');

    const ent = Editing.enter('  <div></div>', 7, 7, 'html');
    assert.ok(ent, 'smart enter between opening and closing tags');
    assert.equal(ent.insert, '\n    \n  ');

    const shadedHtml = CodeShade.shade('<div class="box">Hello</div>', 'html');
    assert.equal(shadedHtml.length, 1);
    assert.equal(shadedHtml[0].kind, 'html');
    assert.ok(shadedHtml[0].runs.some((r) => r.mark === 'tag'), 'shaded tag');
    assert.ok(shadedHtml[0].runs.some((r) => r.mark === 'attr'), 'shaded attr');
    assert.ok(shadedHtml[0].runs.some((r) => r.mark === 'string'), 'shaded string');
});

test('project: Live JS preview injects the console bridge first and maps error lines to project files', () => {
    const files = {
        entries: {
            'index.html': '<html>\n<head></head>\n<body>\n  <script src="app.js"></script>\n</body></html>',
            'app.js': 'var a = 1;\nconsole.log(a);\nthrow new Error("boom");'
        }
    };
    const live = Project.assemblePreview(files, { liveJs: true });
    assert.ok(live.indexOf('id="pc-console-bridge"') < live.indexOf('id="pc-project-js"'), 'bridge runs before user JS');
    assert.excludes(live, 'pc-runtime-error');
    const map = JSON.parse(live.match(/\)\((\[\{.*?\}\])\);/)[1]);
    assert.equal(map.length, 1);
    assert.equal(map[0].file, 'app.js');
    assert.equal(live.split('\n')[map[0].first - 1], 'var a = 1;', 'first mapped line is the first line of the file');
    assert.equal(map[0].lines, 3);

    const design = Project.assemblePreview(files, { liveJs: false });
    assert.excludes(design, 'pc-console-bridge');
});

test('project: console bridge forwards console calls, errors with file lines, and rejections', () => {
    const vm = require('vm');
    const sent = [];
    const listeners = {};
    const logged = [];
    const win = {
        console: { log: (x) => logged.push(x), info() {}, warn() {}, error() {} },
        parent: { postMessage: (m) => sent.push(m) },
        addEventListener: (t, fn) => { listeners[t] = fn; }
    };
    win.window = win;
    vm.createContext(win);
    vm.runInContext('(' + Project.consoleBridge.toString() + ')([{ file: "app.js", first: 10, lines: 3 }]);', win);

    const circular = { n: 1 };
    circular.self = circular;
    win.console.log('hi', 5, { a: [1, 'x'] }, circular, undefined);
    assert.deepEqual(logged, ['hi'], 'original console.log still runs');
    assert.equal(sent[0].type, 'pc-console');
    assert.equal(sent[0].level, 'log');
    assert.deepEqual(sent[0].args, ['hi', '5', '{a: [1, "x"]}', '{n: 1, self: [Circular]}', 'undefined']);

    win.onerror('Uncaught Error: boom', '', 12, 1, { name: 'Error', message: 'boom' });
    assert.equal(sent[1].level, 'error');
    assert.deepEqual(sent[1].args, ['Error: boom']);
    assert.equal(sent[1].line, 3);
    assert.equal(sent[1].source, 'app.js');

    win.onerror('x', '', 99, 1, null);
    assert.equal(sent[2].source, null, 'lines outside a project script have no source');

    listeners.unhandledrejection({ reason: 'nope' });
    assert.equal(sent[3].level, 'error');
    assert.includes(sent[3].args[0], 'nope');
});

test('project: resolveRelativePath normalizes project links and ignores external or same-page ones', () => {
    const r = Project.resolveRelativePath;
    assert.equal(r('index.html', 'resume.html'), 'resume.html');
    assert.equal(r('index.html', './resume.html'), 'resume.html');
    assert.equal(r('index.html', 'sub/page.html#section'), 'sub/page.html');
    assert.equal(r('index.html', 'gallery.html?x=1'), 'gallery.html');
    assert.equal(r('sub/page.html', '../index.html'), 'index.html');
    assert.equal(r('sub/page.html', 'other.html'), 'sub/other.html');
    assert.equal(r('sub/page.html', '/resume.html'), 'resume.html');
    assert.equal(r('index.html', 'my%20page.html'), 'my page.html');
    assert.equal(r('index.html', 'sub/'), 'sub/index.html');
    assert.equal(r('a/b/c.html', '../../d/e.html'), 'd/e.html');
    assert.equal(r('index.html', '../outside.html'), null, 'cannot climb above the project root');
    ['https://example.com/a.html', 'http://x.test', 'mailto:a@b.test', 'tel:+15550100', 'javascript:void(0)', 'data:text/html,hi', '//cdn.test/x.html', '#top', '', '   ', null, undefined].forEach((href) => {
        assert.equal(r('index.html', href), null, String(href) + ' is not a project path');
    });
});

test('project: rewriteAssetUrls points relative asset references at blob URLs and leaves everything else alone', () => {
    const urls = { 'images/hero.png': 'blob:H', 'img/a b.png': 'blob:AB', 'fonts/x.woff2': 'blob:F', 'sub/pic.jpg': 'blob:P' };
    const html = [
        '<img src="images/hero.png" alt="x">',
        '<img src=\'./images/hero.png?v=2\'>',
        '<img srcset="images/hero.png 1x, missing.png 2x">',
        '<video poster="img/a%20b.png"></video>',
        '<a href="images/hero.png">link</a>',
        '<img src="https://example.com/images/hero.png">',
        '<div style="background:url(images/hero.png)"></div>',
        '<p>src="images/hero.png" in text</p>'
    ].join('\n');
    const out = Project.rewriteAssetUrls(html, 'index.html', urls);
    assert.includes(out, '<img src="blob:H" alt="x">');
    assert.includes(out, '<img src="blob:H">');
    assert.includes(out, 'srcset="blob:H 1x, missing.png 2x"');
    assert.includes(out, 'poster="blob:AB"');
    assert.includes(out, '<a href="images/hero.png">', 'anchor hrefs are not rewritten');
    assert.includes(out, 'src="https://example.com/images/hero.png"');
    assert.includes(out, 'url("blob:H")');
    assert.includes(out, '<p>src="images/hero.png" in text</p>', 'text outside tags is untouched');
    assert.equal(Project.rewriteAssetUrls('<img src="pic.jpg">', 'sub/page.html', urls), '<img src="blob:P">');
});

test('project: assemblePreview rewrites stylesheet urls relative to the stylesheet and mimeFor names types', () => {
    const files = { entries: {
        'index.html': '<html><head><link rel="stylesheet" href="css/site.css"></head><body><img src="images/hero.png"></body></html>',
        'css/site.css': 'body { background: url(../images/hero.png); } @font-face { src: url("../fonts/x.woff2"); }'
    } };
    const urls = { 'images/hero.png': 'blob:H', 'fonts/x.woff2': 'blob:F' };
    const doc = Project.assemblePreview(files, { liveJs: false, assetUrls: urls });
    assert.includes(doc, '<img src="blob:H"');
    assert.includes(doc, 'url("blob:H")');
    assert.includes(doc, 'url("blob:F")');
    assert.excludes(doc, '../images/hero.png');
    const plain = Project.assemblePreview(files, { liveJs: false });
    assert.includes(plain, 'src="images/hero.png"', 'without assetUrls the preview is unchanged');
    assert.equal(Project.mimeFor('a/b/Photo.JPG'), 'image/jpeg');
    assert.equal(Project.mimeFor('f.woff2'), 'font/woff2');
    assert.equal(Project.mimeFor('x.unknown'), 'application/octet-stream');
});

test('parts: find, scan, sync, and pull keep marker regions in step with their part files', () => {
    const header = '<header>\n  <nav>Home</nav>\n</header>';
    const page = (body) => '<html><body>\n  ' + Parts.wrap('parts/header.html', body, '  ') + '\n  <main>x</main>\n</body></html>';
    const entries = {
        'index.html': page(header),
        'about.html': page('<header>OLD</header>'),
        'sub/deep.html': '<html><body>' + Parts.wrap('../parts/header.html', header, '') + '</body></html>',
        'lost.html': '<body><!-- pc:part src="parts/nope.html" -->x<!-- /pc:part --></body>',
        'parts/header.html': header + '\n'
    };
    const info = Parts.scan(entries);
    const state = (page) => info.regions.find((r) => r.page === page).state;
    assert.equal(state('index.html'), 'synced');
    assert.equal(state('about.html'), 'differs');
    assert.equal(state('sub/deep.html'), 'synced', 'relative src resolves from the page folder');
    assert.equal(state('lost.html'), 'missing');
    assert.equal(info.parts['parts/header.html'], 3);
    assert.ok(Parts.isPart(entries, 'parts/header.html'));
    assert.ok(!Parts.isPart(entries, 'index.html'));

    const synced = Parts.sync(entries, { part: 'parts/header.html' });
    assert.deepEqual(synced.changed, ['about.html']);
    assert.equal(synced.entries['about.html'], entries['index.html'], 'region is replaced and the marker indentation is kept');
    assert.equal(synced.entries['index.html'], entries['index.html'], 'synced pages are untouched');
    assert.includes(synced.entries['about.html'], '\n  <main>x</main>');
    assert.includes(synced.entries['about.html'], '-->\n  <header>', 'the first line keeps the region indentation');

    const edited = Object.assign({}, entries, { 'parts/header.html': '<header>NEW</header>\n' });
    const all = Parts.sync(edited, { part: 'parts/header.html' });
    assert.deepEqual(all.changed.sort(), ['about.html', 'index.html', 'sub/deep.html']);
    assert.includes(all.entries['sub/deep.html'], '<header>NEW</header>');
    assert.equal(Parts.scan(all.entries).regions.filter((r) => r.state === 'differs').length, 0);

    const pulled = Parts.pull(entries, 'about.html', 0);
    assert.equal(pulled.entries['parts/header.html'], '<header>OLD</header>\n');
    assert.includes(pulled.entries['index.html'], '<header>OLD</header>', 'pulling a region updates every other page');
    assert.equal(Parts.relPath('sub/deep.html', 'parts/header.html'), '../parts/header.html');
    assert.equal(Parts.relPath('index.html', 'parts/header.html'), 'parts/header.html');
});

test('parts: nested, unclosed, and stray markers are reported and never rewritten', () => {
    const nested = '<!-- pc:part src="a.html" --><!-- pc:part src="b.html" -->x<!-- /pc:part -->';
    const res = Parts.find(nested);
    assert.equal(res.regions.length, 1);
    assert.equal(res.regions[0].src, 'b.html');
    assert.equal(res.invalid.length, 1);
    assert.equal(Parts.find('<!-- pc:part src="a.html" -->never closed').invalid.length, 1);
    assert.equal(Parts.find('stray <!-- /pc:part -->').invalid.length, 1);
    assert.equal(Parts.sync({ 'a.html': '<!-- pc:part src="b.html" -->x', 'b.html': 'y' }, null).changed.length, 0);
});

test('finding: search, navigation, and replacement helpers use exact offsets', () => {
    const text = 'Foo foo FOO\nfoo';
    assert.deepEqual(Finding.findAll(text, 'foo').map((m) => m.start), [0, 4, 8, 12]);
    assert.deepEqual(Finding.findAll(text, 'foo', { caseSensitive: true }).map((m) => m.start), [4, 12]);
    assert.deepEqual(Finding.findAll(text, ''), []);
    assert.deepEqual(Finding.findAll('a.b a+b (a)', 'a.b').map((m) => m.start), [0], 'regex characters are literal');
    assert.deepEqual(Finding.findAll('aaa', 'aa').map((m) => m.start), [0], 'matches do not overlap');
    assert.deepEqual(Finding.findAll('x$&y', '$&').map((m) => m.start), [1]);

    const matches = Finding.findAll(text, 'foo');
    assert.equal(Finding.nearest(matches, 0), 0);
    assert.equal(Finding.nearest(matches, 5), 2);
    assert.equal(Finding.nearest(matches, 13), 0, 'wraps to the first match');
    assert.equal(Finding.nearest([], 3), -1);
    assert.equal(Finding.step(matches, 3, 1), 0);
    assert.equal(Finding.step(matches, 0, -1), 3);
    assert.equal(Finding.step(matches, -1, -1), 3);
    assert.equal(Finding.step([], -1, 1), -1);

    const one = Finding.replaceAt(text, matches[1], 'bar');
    assert.equal(one.text, 'Foo bar FOO\nfoo');
    assert.equal(one.caret, 7);
    const all = Finding.replaceAll(text, 'foo', '$1-baz');
    assert.equal(all.text, '$1-baz $1-baz $1-baz\n$1-baz', 'replacement text is literal');
    assert.equal(all.count, 4);
    assert.deepEqual(Finding.replaceAll('abc', 'x', 'y'), { text: 'abc', count: 0 });
    assert.equal(Finding.findAll('é É', 'é').length, 2, 'case-insensitive search folds accented letters');
    assert.equal(Finding.findAll('é É', 'é', { caseSensitive: true }).length, 1);
});

test('code-shade: the coloured copy never loses or adds characters (self-closing tags, stray quotes, odd input)', () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..');
    const check = (text, lang, label) => {
        const lines = CodeShade.shade(text, lang);
        assert.equal(lines.map((l) => l.runs.map((r) => r.text).join('')).join('\n'), text, label + ' round-trips');
        assert.ok(!lines.some((l) => l.kind === 'plain'), label + ' needed the safety fallback, so a tokenizer drops text');
    };
    const svg = CodeShade.shade('<circle cx="4" r="1.75"/>', 'html')[0];
    assert.equal(svg.runs.map((r) => r.text).join(''), '<circle cx="4" r="1.75"/>');
    assert.deepEqual(svg.runs[svg.runs.length - 1], { text: '/>', mark: 'tag' }, 'the slash stays with the closing bracket');
    ['<script>', '<script>var a = "', '<a href="', '<p title="a>b">x</p>', '<p title=\'x"y\'>', '<a <b>', '<div class=', '<a href=a/b/c>', '<', '</', "<script>`abc ${", 'a{b:url(', '\t<p>\t', '<![CDATA[', '<img src="a.png" / >', '<br/>', '<br />'].forEach((s) => {
        ['html', 'css', 'js'].forEach((lang) => check(s, lang, JSON.stringify(s) + ' as ' + lang));
    });
    const files = ['app.html', 'index.html', 'src/styles.css', 'src/home.css', 'sw.js', 'src/project.js', 'src/app/stage.js', 'test/project.test.js'];
    files.forEach((f) => {
        const text = fs.readFileSync(path.join(root, f), 'utf8');
        const lang = /\.css$/.test(f) ? 'css' : (/\.js$/.test(f) ? 'js' : 'html');
        check(text, lang, f);
        [0.13, 0.37, 0.61, 0.89].forEach((frac) => check(text.slice(0, Math.floor(text.length * frac)), lang, f + ' cut at ' + frac));
    });
});

test('files: validateFilePath normalizes names and rejects unsafe or clashing ones', () => {
    const entries = { 'index.html': '', 'About.html': '', 'css/site.css': '' };
    const v = (p, cur) => Project.validateFilePath(entries, p, cur);
    assert.equal(v('  ./sub\\page.html ').path, 'sub/page.html');
    assert.equal(v('/lead//ing.html').path, 'lead/ing.html');
    ['', '   ', 'a/', '../x.html', 'a/../b.html', 'a/./b.html', 'bad:name.html', 'a|b.html', 'x'.repeat(201)].forEach((p) => assert.ok(!v(p).ok, JSON.stringify(p) + ' is rejected'));
    assert.ok(!v('about.html').ok, 'a case-only clash with another file is rejected');
    assert.ok(v('about.html', 'About.html').ok, 'renaming a file by case alone is allowed');
    assert.ok(!v('index.html').ok);
});

test('files: renameAsset rewrites references to an image that is not a text entry', () => {
    const entries = {
        'index.html': '<img src="images/logo.png"><img src="images/logo.png?v=2"><img src="images/other.png">',
        'css/site.css': 'a { background: url("../images/logo.png"); }',
        'pages/team.html': '<img src="../images/logo.png">'
    };
    const known = ['images/logo.png', 'images/other.png'];
    const res = Project.renameAsset(entries, 'images/logo.png', 'img/brand.png', { known: known });
    assert.equal(res.error, null);
    assert.equal(res.path, 'img/brand.png');
    assert.includes(res.entries['index.html'], 'src="img/brand.png"');
    assert.includes(res.entries['index.html'], 'src="img/brand.png?v=2"');
    assert.includes(res.entries['index.html'], 'src="images/other.png"');
    assert.includes(res.entries['css/site.css'], 'url("../img/brand.png")');
    assert.includes(res.entries['pages/team.html'], 'src="../img/brand.png"');
    assert.equal(res.refsUpdated, 3);
    assert.ok(Project.renameAsset(entries, 'images/logo.png', 'images/other.png', { known: known }).error, 'a taken name is refused');
    assert.ok(Project.renameAsset(entries, 'images/logo.png', 'images/Other.PNG', { known: known }).error, 'a case-only clash is refused');
    assert.ok(Project.renameAsset(entries, 'images/logo.png', 'images/logo.jpg', { known: known }).error, 'the extension must stay');
    assert.ok(!Project.renameAsset(entries, 'images/logo.png', 'images/Logo.png', { known: known }).error, 'a case-only rename is allowed');
    assert.equal(Project.renameAsset(entries, 'images/logo.png', 'images/logo.png', { known: known }).refsUpdated, 0);
});

test('files: renameFile moves a file in place and rewrites every reference to it', () => {
    const entries = {
        'index.html': '<link rel="stylesheet" href="style.css"><a href="about.html#team">About</a><a href="./about.html?x=1">b</a><a href="/about.html">c</a><a href="https://example.com/about.html">ext</a><a href="#top">top</a>',
        'about.html': '<link rel="stylesheet" href="style.css"><img src="img/a.png"><a href="index.html">Home</a>',
        'style.css': 'body { background: url("img/a.png"); } .x { background: url(other.css); }',
        'pages/team.html': '<link rel="stylesheet" href="../style.css"><!-- pc:part src="../parts/header.html" -->x<!-- /pc:part -->',
        'parts/header.html': '<header>h</header>',
        'script.js': 'var href = "style.css";'
    };
    const res = Project.renameFile(entries, 'style.css', 'css/site.css', { known: ['img/a.png'] });
    const unknown = Project.renameFile(entries, 'style.css', 'css/site.css');
    assert.includes(unknown.entries['css/site.css'], 'url("img/a.png")', 'paths that are not known project files are left alone');
    assert.equal(res.error, null);
    assert.deepEqual(Object.keys(res.entries), ['index.html', 'about.html', 'css/site.css', 'pages/team.html', 'parts/header.html', 'script.js'], 'the file keeps its position');
    assert.includes(res.entries['index.html'], '<link rel="stylesheet" href="css/site.css">');
    assert.includes(res.entries['about.html'], 'href="css/site.css"');
    assert.includes(res.entries['pages/team.html'], 'href="../css/site.css"');
    assert.includes(res.entries['css/site.css'], 'url("../img/a.png")', 'a moved file keeps pointing at what it pointed at');
    assert.equal(res.entries['script.js'], entries['script.js'], 'scripts are not rewritten');
    assert.ok(res.refsUpdated >= 4);

    const page = Project.renameFile(entries, 'about.html', 'company/about us.html', { known: ['img/a.png'] });
    assert.includes(page.entries['index.html'], 'href="company/about%20us.html#team"');
    assert.includes(page.entries['index.html'], 'href="company/about%20us.html?x=1"');
    assert.includes(page.entries['index.html'], 'href="/company/about%20us.html"', 'root-relative links stay root-relative');
    assert.includes(page.entries['index.html'], 'href="https://example.com/about.html"');
    assert.includes(page.entries['index.html'], 'href="#top"');
    const moved = page.entries['company/about us.html'];
    assert.includes(moved, 'href="../style.css"');
    assert.includes(moved, 'src="../img/a.png"', 'binary assets listed in options.known are re-pointed too');
    assert.includes(moved, 'href="../index.html"');

    const part = Project.renameFile(entries, 'parts/header.html', 'parts/top.html');
    assert.includes(part.entries['pages/team.html'], 'pc:part src="../parts/top.html"');

    const same = Project.renameFile(entries, 'about.html', 'about.html');
    assert.equal(same.entries, entries);
    assert.ok(Project.renameFile(entries, 'about.html', 'index.html').error);
    assert.ok(Project.renameFile(entries, 'missing.html', 'x.html').error);
    const sameDir = Project.renameFile({ 'a.html': '<a href="./b.html">b</a>', 'b.html': '' }, 'b.html', 'c.html');
    assert.includes(sameDir.entries['a.html'], 'href="c.html"');
});

test('files: duplicateFile, deleteFile, and treeAfter keep the file list and tree consistent', () => {
    const entries = { 'index.html': 'a', 'about.html': 'b', 'style.css': 'c', 'style-copy.css': 'd' };
    const dup = Project.duplicateFile(entries, 'style.css');
    assert.equal(dup.path, 'style-copy-2.css');
    assert.deepEqual(Object.keys(dup.entries), ['index.html', 'about.html', 'style.css', 'style-copy-2.css', 'style-copy.css']);
    assert.equal(dup.entries['style-copy-2.css'], 'c');
    assert.equal(Project.duplicateFile({ 'a/b': 'x' }, 'a/b').path, 'a/b-copy', 'files without an extension and dotted folders');
    assert.equal(Project.duplicateFile({ 'v1.2/readme': 'x' }, 'v1.2/readme').path, 'v1.2/readme-copy');
    assert.ok(Project.duplicateFile(entries, 'nope.html').error);

    const del = Project.deleteFile(entries, 'style.css');
    assert.ok(!('style.css' in del.entries));
    assert.equal(Project.deleteFile({ 'index.html': 'a', 'x.css': '' }, 'index.html').error.includes('at least one .html'), true, 'the last page cannot be deleted');
    assert.equal(Project.deleteFile({ 'index.html': 'a', 'about.htm': '' }, 'index.html').error, null, 'another page remains');
    assert.ok(Project.deleteFile(entries, 'nope.html').error);

    const tree = [{ path: 'img', kind: 'dir', is_text: false }, { path: 'img/a.png', kind: 'file', is_text: false }, { path: 'index.html', kind: 'file', is_text: true }];
    assert.equal(Project.treeAfter(null, { type: 'delete', path: 'x' }), null);
    assert.deepEqual(Project.treeAfter(tree, { type: 'delete', path: 'index.html' }).map((t) => t.path), ['img', 'img/a.png']);
    const renamed = Project.treeAfter(tree, { type: 'rename', from: 'index.html', to: 'pages/home.html' });
    assert.deepEqual(renamed.map((t) => t.path), ['img', 'img/a.png', 'pages', 'pages/home.html'], 'new folders appear in the tree');
    assert.equal(renamed.find((t) => t.path === 'pages').kind, 'dir');
    assert.deepEqual(Project.treeAfter(tree, { type: 'duplicate', from: 'index.html', to: 'index-copy.html' }).map((t) => t.path), ['img', 'img/a.png', 'index-copy.html', 'index.html']);
    const added = Project.treeAfter(tree, { type: 'add', path: 'photos/new.png', is_text: false });
    assert.deepEqual(added.map((t) => t.path), ['img', 'img/a.png', 'index.html', 'photos', 'photos/new.png']);
    assert.equal(added.find((t) => t.path === 'photos/new.png').is_text, false, 'added binaries are marked as not text');
    assert.equal(Project.treeAfter(tree, { type: 'add', path: 'index.html' }).length, 3, 'adding an existing path changes nothing');
    assert.equal(tree.length, 3, 'the input tree is not modified');
});

test('filesync: dirtyPaths lists files that differ from the saved baseline, including new files', () => {
    const saved = { 'index.html': 'a', 'style.css': 'b' };
    assert.deepEqual(FileSync.dirtyPaths({ 'index.html': 'a', 'style.css': 'b' }, saved), []);
    assert.deepEqual(FileSync.dirtyPaths({ 'index.html': 'a!', 'style.css': 'b', 'new.js': '' }, saved), ['index.html', 'new.js']);
    assert.deepEqual(FileSync.dirtyPaths({ 'index.html': 'a' }, null), ['index.html']);
});

test('links: finds missing pages, images, stylesheets, scripts, CSS urls, and risky links with exact positions', () => {
    const entries = {
        'index.html': [
            '<link rel="stylesheet" href="style.css">',
            '<link rel="stylesheet" href="missing.css">',
            '<script src="app.js"></script><script src="gone.js"></script>',
            '<a href="about.html#team">ok</a> <a href="about.html#nope">frag</a> <a href="nowhere.html">dead</a>',
            '<a href="About.html">case</a> <a href="contact">clean</a> <a href="sub/">dir</a> <a href="../up.html">out</a>',
            '<a href="#hero">hero</a> <a href="#ghost">ghost</a> <a href="#top">top</a> <a href="#">bare</a> <a href="?page=2">q</a>',
            '<a href="https://example.com/x.html">ext</a> <a href="mailto:a@b.test">m</a> <a href="{{ url }}">tpl</a>',
            '<img src="img/a.png"><img src="img/b.png" srcset="img/a.png 1x, img/c.png 2x"><video poster="img/p.png"></video>',
            '<div id="hero" style="background:url(img/bg.png)"></div>',
            '<style>.x { background: url("img/s.png"); } /* url(img/commented.png) */</style>',
            '<!-- <a href="commented.html">x</a> -->'
        ].join('\n'),
        'about.html': '<h2 id="team">Team</h2><a name="old">o</a><a href="index.html#hero">back</a>',
        'contact.html': '<p>contact</p>',
        'sub/index.html': '<p>sub</p>',
        'style.css': '@import "base.css"; @import url(theme.css); body { background: url(../img/a.png) } .f { src: url("font.woff2") }',
        'app.js': 'var s = "img/never-checked.png";'
    };
    const res = Links.createChecker().check(entries, ['img/a.png', 'img/p.png', 'img/bg.png', 'theme.css']);
    const msgs = res.problems.map((p) => p.file + ' ' + p.severity + ' ' + p.ref + ' | ' + p.message);
    const has = (needle) => assert.ok(msgs.some((m) => m.includes(needle)), 'expected a problem containing ' + JSON.stringify(needle) + '\n' + msgs.join('\n'));
    const hasNot = (needle) => assert.ok(!msgs.some((m) => m.includes(needle)), 'unexpected problem ' + JSON.stringify(needle));
    has('index.html error missing.css | Stylesheet not found: missing.css');
    has('index.html error gone.js | Script not found: gone.js');
    has('index.html error nowhere.html | Linked page not found: nowhere.html');
    has('about.html#nope | No element with id "nope" in about.html');
    has('index.html warning About.html | Linked page "About.html" matches about.html only if case is ignored');
    has('index.html warning contact | Link "contact" has no extension');
    has('index.html error ../up.html | Linked page "../up.html" points outside the project');
    has('index.html warning #ghost | No element with id "ghost" on this page');
    has('index.html error img/b.png | Image not found: img/b.png');
    has('img/c.png | Image not found: img/c.png');
    has('index.html error img/s.png | File not found: img/s.png');
    has('style.css error base.css | Stylesheet not found: base.css');
    has('style.css error font.woff2 | File not found: font.woff2');
    has('style.css error ../img/a.png | File "../img/a.png" points outside the project');
    [' #hero | ', ' #top | ', ' # | ', ' ?page=2 | ', ' https://example.com/x.html | ', ' mailto:a@b.test | ', ' {{ url }} | ', ' commented.html | ', ' img/never-checked.png | ', ' about.html#team | ', ' sub/ | ', ' theme.css | ', ' img/a.png | ', ' img/p.png | ', ' img/bg.png | ', ' style.css | ', ' app.js | '].forEach((needle) => hasNot(needle));
    assert.equal(res.errors + res.warnings, res.problems.length);

    const first = res.problems.find((p) => p.ref === 'missing.css');
    assert.equal(first.line, 2);
    assert.equal(entries['index.html'].slice(first.start, first.end), 'href="missing.css"', 'the range covers the attribute');
    const css = res.problems.find((p) => p.file === 'style.css' && p.ref === 'font.woff2');
    assert.equal(entries['style.css'].slice(css.start, css.end), 'font.woff2', 'CSS urls are located exactly');
    const inline = res.problems.find((p) => p.ref === 'img/s.png');
    assert.equal(entries['index.html'].slice(inline.start, inline.end), 'img/s.png');
    assert.equal(entries['index.html'].slice(0, inline.start).split('\n').length, inline.line);

    const checker = Links.createChecker();
    const again = checker.check(entries, ['img/a.png', 'img/p.png', 'img/bg.png', 'theme.css']);
    assert.deepEqual(checker.check(entries, ['img/a.png', 'img/p.png', 'img/bg.png', 'theme.css']).problems, again.problems, 'cached extraction gives the same result');
    const fixed = Object.assign({}, entries, { 'nowhere.html': '<p>now exists</p>' });
    assert.ok(!checker.check(fixed, ['img/a.png']).problems.some((p) => p.ref === 'nowhere.html'), 'adding the target clears the problem');
    assert.equal(Links.createChecker().check({ 'index.html': '<p>nothing to check</p>' }, []).problems.length, 0);
});

test('finding: findInFiles and replaceInFiles search and replace across a whole project', () => {
    const entries = {
        'index.html': '<h1>Acme Corp</h1>\n<p>Welcome to ACME.\nacme again</p>',
        'about.html': '<p>About Acme</p>',
        'style.css': 'body { color: red; }',
        'script.js': 'var name = "Acme";'
    };
    const found = Finding.findInFiles(entries, 'acme');
    assert.equal(found.total, 5);
    assert.deepEqual(found.files.map((f) => f.path + ':' + f.matches.length), ['index.html:3', 'about.html:1', 'script.js:1']);
    const first = found.files[0].matches;
    assert.deepEqual(first.map((m) => m.line), [1, 2, 3]);
    assert.equal(entries['index.html'].slice(first[1].start, first[1].end), 'ACME');
    assert.equal(first[1].before + first[1].hit + first[1].after, '<p>Welcome to ACME.');
    assert.equal(first[0].column, 5);
    assert.equal(Finding.findInFiles(entries, 'acme', { caseSensitive: true }).total, 1, 'only the lowercase "acme again"');
    assert.equal(Finding.findInFiles(entries, 'Acme', { caseSensitive: true }).total, 3);
    assert.deepEqual(Finding.findInFiles(entries, ''), { files: [], total: 0 });

    const long = Finding.findInFiles({ 'a.txt': 'x'.repeat(100) + 'NEEDLE' + 'y'.repeat(100) }, 'needle').files[0].matches[0];
    assert.ok(long.before.startsWith('…') && long.after.endsWith('…'), 'long lines are shortened around the match');
    assert.ok(long.before.length <= 31 && long.after.length <= 51);

    const all = Finding.replaceInFiles(entries, 'acme', 'Globex');
    assert.equal(all.count, 5);
    assert.deepEqual(all.files, ['index.html', 'about.html', 'script.js']);
    assert.equal(all.entries['index.html'], '<h1>Globex Corp</h1>\n<p>Welcome to Globex.\nGlobex again</p>');
    assert.equal(all.entries['style.css'], entries['style.css'], 'files without matches are untouched');
    assert.equal(entries['about.html'], '<p>About Acme</p>', 'the input is not modified');
    const some = Finding.replaceInFiles(entries, 'acme', '$&', { paths: ['about.html'] });
    assert.deepEqual(some.files, ['about.html']);
    assert.equal(some.entries['about.html'], '<p>About $&</p>', 'only the chosen files change, and the replacement is literal');
    assert.equal(some.entries['index.html'], entries['index.html']);
    assert.deepEqual(Finding.replaceInFiles(entries, 'zzz', 'x').files, []);
    assert.equal(Finding.replaceInFiles(entries, 'zzz', 'x').count, 0);
});

test('zip: builds a valid stored zip with correct CRCs, UTF-8 names, and binary data', () => {
    assert.equal(Zip.crc32(new TextEncoder().encode('123456789')), 0xCBF43926, 'the standard CRC-32 check value');
    assert.equal(Zip.crc32(new Uint8Array(0)), 0);
    const png = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0, 255, 128, 10, 13]);
    const bytes = Zip.build([
        { path: 'index.html', data: '<h1>Café ✓</h1>\n' },
        { path: 'css/site.css', data: 'body{}' },
        { path: 'img/über.png', data: png },
        { path: 'empty.txt', data: '' }
    ], new Date(2026, 10, 2, 13, 45, 30));
    assert.deepEqual(Array.from(bytes.subarray(0, 4)), [0x50, 0x4B, 0x03, 0x04], 'starts with a local file header');
    const entries = Zip.list(bytes);
    assert.deepEqual(entries.map((e) => e.path), ['index.html', 'css/site.css', 'img/über.png', 'empty.txt']);
    assert.equal(new TextDecoder().decode(entries[0].data), '<h1>Café ✓</h1>\n');
    assert.deepEqual(Array.from(entries[2].data), Array.from(png), 'binary data survives');
    entries.forEach((e) => assert.equal(Zip.crc32(e.data), e.crc, e.path + ' CRC matches'));
    assert.equal(entries[3].size, 0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    assert.equal(view.getUint16(10, true), (13 << 11) | (45 << 5) | 15, 'DOS time');
    assert.equal(view.getUint16(12, true), ((2026 - 1980) << 9) | (11 << 5) | 2, 'DOS date');
    assert.equal(view.getUint16(6, true) & 0x0800, 0x0800, 'the UTF-8 name flag is set');
    assert.deepEqual(Zip.list(Zip.build([])), []);

    ['', '/', 'a/', '../x.txt', 'a/../b.txt', 'a//b.txt', './a.txt'].forEach((p) => {
        assert.throws(() => Zip.build([{ path: p, data: 'x' }]), p + ' is rejected');
    });
    assert.equal(Zip.list(Zip.build([{ path: '/lead.txt', data: 'x' }]))[0].path, 'lead.txt', 'leading slashes are dropped');
    assert.throws(() => Zip.build([{ path: 'a.txt', data: 'x' }, { path: 'a.txt', data: 'y' }]), 'duplicates are rejected');
    assert.throws(() => Zip.list(new Uint8Array(40)), 'garbage is not a zip');
});

test('imagelib: lists images from every source, makes unique upload paths, and formats sizes', () => {
    assert.ok(ImageLib.isImage('a/b/Photo.JPG') && ImageLib.isImage('x.svg') && ImageLib.isImage('x.avif'));
    assert.ok(!ImageLib.isImage('style.css') && !ImageLib.isImage('image') && !ImageLib.isImage(''));
    const all = ImageLib.list({
        assets: { 'images/hero.png': {}, 'images/b.jpg': {} },
        tree: [{ path: 'img', kind: 'dir', is_text: false }, { path: 'img/logo.webp', kind: 'file', is_text: false }, { path: 'images/hero.png', kind: 'file', is_text: false }, { path: 'index.html', kind: 'file', is_text: true }, { path: 'notes.bin', kind: 'file', is_text: false }],
        entries: { 'index.html': '', 'icons/mark.svg': '<svg/>' }
    });
    assert.deepEqual(all.map((i) => i.path + ':' + i.source), ['icons/mark.svg:text', 'images/b.jpg:asset', 'images/hero.png:asset', 'img/logo.webp:file']);
    assert.equal(all[3].name, 'logo.webp');
    assert.equal(all[3].folder, 'img');
    assert.deepEqual(ImageLib.list({}), []);

    const taken = ['images/photo.png', 'images/photo-2.png', 'Images/Other.PNG'];
    assert.equal(ImageLib.uniquePath(taken, 'photo.png'), 'images/photo-3.png');
    assert.equal(ImageLib.uniquePath(taken, 'other.png'), 'images/other-2.png', 'names clash without regard to case');
    assert.equal(ImageLib.uniquePath([], 'My Photo (1).jpg'), 'images/My-Photo-(1).jpg');
    assert.equal(ImageLib.uniquePath([], 'a/b:c.png'), 'images/abc.png', 'path characters are removed');
    assert.equal(ImageLib.uniquePath([], 'x.png', ''), 'x.png', 'an empty folder means the project root');
    assert.equal(ImageLib.uniquePath([], 'x.png', '/gfx/'), 'gfx/x.png');
    assert.equal(ImageLib.uniquePath([], '', 'images'), 'images/image');
    assert.equal(ImageLib.formatBytes(512), '512 B');
    assert.equal(ImageLib.formatBytes(2048), '2.0 KB');
    assert.equal(ImageLib.formatBytes(150 * 1024), '150 KB');
    assert.equal(ImageLib.formatBytes(3.5 * 1024 * 1024), '3.5 MB');
    assert.equal(ImageLib.formatBytes(-1), '');
});

test('links: usage lists where each project file is referenced', () => {
    const used = Links.usage({
        'index.html': '<img src="img/a.png">\n<a href="about.html#x">a</a> <a href="https://x.test/img/a.png">e</a> <a href="#top">t</a>',
        'about.html': '<img src="../img/a.png" srcset="img/b.png 1x">',
        'pages/team.html': '<img src="../img/a.png"><div style="background:url(../img/b.png)"></div>',
        'style.css': '.x { background: url(img/a.png); } /* url(img/c.png) */'
    });
    assert.deepEqual(used['img/a.png'].map((u) => u.file + ':' + u.line), ['index.html:1', 'pages/team.html:1', 'style.css:1']);
    assert.deepEqual(used['img/b.png'].map((u) => u.file), ['about.html', 'pages/team.html']);
    assert.equal(used['about.html'].length, 1);
    assert.equal(used['img/c.png'], undefined, 'commented-out references are not counted');
    assert.equal(used['../img/a.png'], undefined, 'paths above the project are dropped');
    assert.deepEqual(Links.usage({}), {});
});

test('folders: treeAfter makes and moves directories, and deriveTree builds a tree from files', () => {
    const tree = Project.deriveTree({ 'index.html': '', 'pages/a.html': '', 'pages/deep/b.html': '' }, null, ['img/x.png']);
    assert.deepEqual(tree.map((t) => t.kind + ':' + t.path), ['file:img/x.png', 'dir:img', 'file:index.html', 'dir:pages', 'file:pages/a.html', 'dir:pages/deep', 'file:pages/deep/b.html'].sort((a, b) => (a.split(':')[1] < b.split(':')[1] ? -1 : 1)));
    assert.equal(tree.find((t) => t.path === 'img/x.png').is_text, false);
    const same = Project.deriveTree({}, tree);
    assert.deepEqual(same, tree, 'an existing tree is copied, not rebuilt');
    assert.ok(same !== tree);

    const made = Project.treeAfter(tree, { type: 'mkdir', path: 'assets/fonts' });
    assert.ok(made.some((t) => t.path === 'assets' && t.kind === 'dir') && made.some((t) => t.path === 'assets/fonts' && t.kind === 'dir'));
    assert.equal(Project.treeAfter(made, { type: 'mkdir', path: 'assets/fonts' }).length, made.length, 'making an existing folder changes nothing');

    const moved = Project.treeAfter(tree, { type: 'moveDir', from: 'pages', to: 'site/pages' });
    const paths = moved.map((t) => t.path);
    assert.ok(paths.includes('site') && paths.includes('site/pages') && paths.includes('site/pages/a.html') && paths.includes('site/pages/deep/b.html'));
    assert.ok(!paths.some((p) => p === 'pages' || p.indexOf('pages/') === 0));
    assert.equal(moved.find((t) => t.path === 'site/pages/a.html').kind, 'file');
});

test('folders: moveFolder moves every file under a folder and rewrites links both ways', () => {
    const entries = {
        'index.html': '<link rel="stylesheet" href="style.css"><a href="pages/a.html">A</a><img src="pages/pic.png">',
        'style.css': 'body { background: url("pages/pic.png"); }',
        'pages/a.html': '<link rel="stylesheet" href="../style.css"><a href="b.html">B</a><a href="../index.html">home</a><img src="pic.png">',
        'pages/b.html': '<a href="a.html">A</a>'
    };
    const known = ['pages/pic.png'];
    const res = Project.moveFolder(entries, 'pages', 'site/pages', { known: known });
    assert.equal(res.error, null);
    assert.equal(res.path, 'site/pages');
    assert.deepEqual(res.moves.map((m) => m.to).sort(), ['site/pages/a.html', 'site/pages/b.html', 'site/pages/pic.png']);
    assert.deepEqual(Object.keys(res.entries), ['index.html', 'style.css', 'site/pages/a.html', 'site/pages/b.html']);
    assert.includes(res.entries['index.html'], 'href="site/pages/a.html"');
    assert.includes(res.entries['index.html'], 'src="site/pages/pic.png"');
    assert.includes(res.entries['style.css'], 'url("site/pages/pic.png")');
    assert.includes(res.entries['site/pages/a.html'], 'href="../../style.css"');
    assert.includes(res.entries['site/pages/a.html'], 'href="b.html"', 'links between files that moved together stay as they were');
    assert.includes(res.entries['site/pages/a.html'], 'href="../../index.html"');
    assert.includes(res.entries['site/pages/a.html'], 'src="pic.png"');
    assert.equal(res.entries['site/pages/b.html'], entries['pages/b.html']);
    assert.equal(res.refsUpdated, 3);

    const back = Project.moveFolder(res.entries, 'site/pages', 'pages', { known: ['site/pages/pic.png'] });
    assert.deepEqual(back.entries, entries, 'moving it back restores every file exactly');
});

test('folders: moveFolder refuses unsafe or clashing moves', () => {
    const entries = { 'index.html': '', 'a/x.html': '', 'a/b/y.html': '', 'b/x.html': '', 'notes.txt': '' };
    const mv = (from, to, known) => Project.moveFolder(entries, from, to, { known: known || [] });
    assert.ok(mv('a', 'a/b/c').error, 'not into itself');
    assert.ok(mv('a', 'b').error, 'a clash with an existing file is refused');
    assert.ok(mv('a', 'B').error, 'case-insensitively too');
    assert.ok(mv('a', 'notes.txt/a').error, 'a file cannot hold a folder');
    assert.ok(mv('a', '../a').error);
    assert.ok(mv('a', '').error);
    assert.equal(mv('a', 'a').moves.length, 0);
    assert.equal(mv('a', 'c').error, null);
    assert.ok(Project.validateFolderPath(['index.html'], ['img'], 'IMG').error, 'folder names are compared without regard to case');
    assert.ok(Project.validateFolderPath(['index.html'], [], 'index.html/x').error);
    assert.equal(Project.validateFolderPath(['index.html'], ['img'], '/assets//fonts/').path, 'assets/fonts');
});
