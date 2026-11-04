const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const stylesCss = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const homeCss = fs.readFileSync(path.join(root, 'src', 'home.css'), 'utf8');

function blockAfter(css, header) {
    const i = css.indexOf(header);
    assert.ok(i !== -1, 'missing block: ' + header);
    const open = css.indexOf('{', i);
    let depth = 0;
    for (let j = open; j < css.length; j++) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}' && --depth === 0) return css.slice(open + 1, j);
    }
    throw new Error('unterminated block: ' + header);
}

function vars(block) {
    const out = {};
    Array.from(block.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)).forEach((m) => { out[m[1]] = m[2].trim(); });
    return out;
}

function luminance(hex) {
    const n = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

const light = vars(blockAfter(stylesCss, ':root[data-theme="light"]'));
const dark = vars(blockAfter(stylesCss, ':root[data-theme="dark"]'));
const systemDark = vars(blockAfter(blockAfter(stylesCss, '@media (prefers-color-scheme: dark)'), ':root:not([data-theme])'));

test('theme (D-008): light, dark, and the system-dark fallback define the same variables, and the system fallback equals the dark theme', () => {
    assert.deepEqual(Object.keys(light).sort(), Object.keys(dark).sort(), 'light and dark define the same variables');
    Object.keys(dark).forEach((k) => assert.equal(systemDark[k], dark[k], k + ' differs between the dark theme and the system-dark fallback'));
    assert.deepEqual(Object.keys(systemDark).sort(), Object.keys(dark).sort());
    assert.ok(!/retro/.test(stylesCss), 'the inherited retro theme is gone: there is one look in two modes');
});

test('theme (D-008): text, buttons, and syntax colours are readable (WCAG AA, 4.5:1) in both modes', () => {
    [['light', light], ['dark', dark]].forEach(([name, t]) => {
        ['--text-void', '--text-strong', '--text-soft', '--text-void-muted'].forEach((fg) => {
            ['--bg-void', '--bg-raised', '--bg-sunken'].forEach((bg) => assert.ok(contrast(t[fg], t[bg]) >= 4.5, name + ': ' + fg + ' on ' + bg + ' is ' + contrast(t[fg], t[bg]).toFixed(2)));
        });
        [['--btn-text', '--btn-bg'], ['--btn-primary-text', '--btn-primary-bg'], ['--btn-primary-text', '--btn-primary-hover'], ['--on-accent', '--danger'], ['--on-accent', '--btn-success'], ['--danger-soft-text', '--danger-soft-bg'], ['--focus', '--bg-void'], ['--warn', '--bg-raised'], ['--warn', '--bg-void']].forEach(([fg, bg]) => {
            assert.ok(contrast(t[fg], t[bg]) >= 4.5, name + ': ' + fg + ' on ' + bg + ' is ' + contrast(t[fg], t[bg]).toFixed(2));
        });
        Object.keys(t).filter((k) => k.indexOf('--sh-') === 0).forEach((k) => {
            ['--bg-void', '--bg-sunken'].forEach((bg) => assert.ok(contrast(t[k], t[bg]) >= 4.5, name + ': ' + k + ' on ' + bg + ' is ' + contrast(t[k], t[bg]).toFixed(2)));
        });
    });
});

test('theme (D-008): no colour is hard-coded outside the theme blocks, and the home page palette matches the studio\'s', () => {
    const outside = stylesCss
        .replace(/@font-face \{[^}]*\}/g, '')
        .replace(/:root[^{]*\{[^}]*\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    const found = Array.from(outside.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b(?!-space)/g)).map((m) => m[0]);
    assert.deepEqual(found, [], 'colours outside the theme blocks: ' + found.join(', '));
    const homeLight = vars(blockAfter(homeCss, ':root'));
    const homeDark = vars(blockAfter(blockAfter(homeCss, '@media (prefers-color-scheme: dark)'), ':root'));
    Object.keys(homeLight).filter((k) => /^#/.test(homeLight[k])).forEach((k) => assert.equal(homeLight[k], light[k], 'home.css light ' + k + ' differs from styles.css'));
    Object.keys(homeDark).filter((k) => /^#/.test(homeDark[k])).forEach((k) => assert.equal(homeDark[k], dark[k], 'home.css dark ' + k + ' differs from styles.css'));
});

test('theme (D-008): the Settings choices are system, light, and dark, defaulting to the system, and EB Garamond ships with its licence', () => {
    const settings = fs.readFileSync(path.join(root, 'src', 'app', 'settings.js'), 'utf8');
    assert.includes(settings, "theme: 'system',");
    assert.includes(settings, "theme: ['system', 'light', 'dark'],");
    const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
    ['system', 'light', 'dark'].forEach((v) => assert.includes(html, 'name="theme" value="' + v + '"'));
    assert.excludes(html, 'value="retro"');
    assert.includes(fs.readFileSync(path.join(root, 'fonts', 'OFL-EBGaramond.txt'), 'utf8'), 'SIL Open Font License');
    assert.includes(stylesCss, "--font-display: 'EB Garamond'");
    ['latin-400-normal', 'latin-400-italic', 'latin-600-normal'].forEach((f) => assert.ok(fs.existsSync(path.join(root, 'fonts', 'eb-garamond-' + f + '.woff2')), f + ' is missing'));
});
