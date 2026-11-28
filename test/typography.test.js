const Typography = require('../src/typography.js');

test('typography: bold and italic toggles respect declared and computed defaults', () => {
    assert.equal(Typography.isBoldValue('700'), true);
    assert.equal(Typography.isBoldValue('bold'), true);
    assert.equal(Typography.isBoldValue('400'), false);

    assert.equal(Typography.toggleBold('', '400'), '700');
    assert.equal(Typography.toggleBold('700', '700'), '');
    assert.equal(Typography.toggleBold('', '700'), '400');
    assert.equal(Typography.toggleBold('400', '400'), '700');

    assert.equal(Typography.toggleItalic('', 'normal'), 'italic');
    assert.equal(Typography.toggleItalic('italic', 'italic'), '');
    assert.equal(Typography.toggleItalic('', 'italic'), 'normal');
    assert.equal(Typography.toggleItalic('normal', 'normal'), 'italic');
});

test('typography: text-decoration toggles combine underline and line-through and override anchor defaults', () => {
    assert.equal(Typography.toggleDecoration('', 'none solid rgb(0, 0, 0)', 'underline'), 'underline');
    assert.equal(Typography.toggleDecoration('underline', 'underline', 'line-through'), 'underline line-through');
    assert.equal(Typography.toggleDecoration('underline line-through', 'underline line-through', 'underline'), 'line-through');
    assert.equal(Typography.toggleDecoration('line-through', 'line-through', 'line-through'), '');

    // Anchor with browser default underline and no CSS declaration
    assert.equal(Typography.toggleDecoration('', 'underline solid rgb(0, 0, 238)', 'underline', 'a'), 'none');
    assert.equal(Typography.toggleDecoration('none', 'none', 'underline', 'a'), 'underline');
    assert.equal(Typography.toggleDecoration('line-through', 'line-through', 'line-through', 'a'), 'none');
});

test('typography: font-size stepping handles px, rem, %, fallback, and EPUB preferRelative em mode', () => {
    assert.equal(Typography.stepFontSize('', '16px', 1), '18px');
    assert.equal(Typography.stepFontSize('', '16px', -1), '14px');
    assert.equal(Typography.stepFontSize('12px', '12px', -1), '11px');
    assert.equal(Typography.stepFontSize('1.25rem', '20px', 1), '1.375rem');
    assert.equal(Typography.stepFontSize('1.25rem', '20px', -1), '1.125rem');
    assert.equal(Typography.stepFontSize('100%', '16px', 1), '110%');
    assert.equal(Typography.stepFontSize('', 'clamp(1rem, 2vw, 2rem)', 1), '18px');

    // Reflowable EPUB mode steps undeclared sizes in em instead of emitting px
    assert.equal(Typography.stepFontSize('', '16px', 1, { preferRelative: true }), '1.125em');
    assert.equal(Typography.stepFontSize('', '16px', -1, { preferRelative: true }), '0.875em');
    assert.equal(Typography.stepFontSize('', '24px', 1, { preferRelative: true }), '1.625em');
    // Explicitly declared px still steps in px
    assert.equal(Typography.stepFontSize('18px', '18px', 1, { preferRelative: true }), '20px');
});

test('typography: font preset matching, embedded font merging, and text-align toggling normalize values', () => {
    assert.equal(
        Typography.matchFontPreset('Georgia, "Times New Roman", serif'),
        "Georgia, 'Times New Roman', serif"
    );
    assert.equal(Typography.matchFontPreset("'Playfair Display', serif"), "'Playfair Display', serif");
    assert.equal(Typography.matchFontPreset(''), '');

    const merged = Typography.mergeFontOptions(['EB Garamond', 'EB Garamond', 'Alegreya'], Typography.BOOK_FONT_PRESETS);
    assert.equal(merged[0].label, 'EB Garamond (embedded)');
    assert.equal(merged[0].value, "'EB Garamond', serif");
    assert.equal(merged[1].label, 'Alegreya (embedded)');
    assert.equal(merged[1].value, 'Alegreya, serif');
    assert.equal(Typography.matchFontPreset('"EB Garamond", serif', merged), "'EB Garamond', serif");

    assert.equal(Typography.normalizeAlign('start'), 'left');
    assert.equal(Typography.normalizeAlign('end'), 'right');
    assert.equal(Typography.toggleAlign('', 'center'), 'center');
    assert.equal(Typography.toggleAlign('center', 'center'), '');
    assert.equal(Typography.toggleAlign('left', 'right'), 'right');
});
