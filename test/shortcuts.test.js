test('Shortcuts: every listed key still has a handler in the file it names (P7-15)', () => {
    const fs = require('fs');
    const path = require('path');
    const items = Shortcuts.all();
    assert.ok(items.length >= 20, 'the cheat sheet lists the main shortcuts');
    items.forEach((item) => {
        assert.ok(item.keys.length && item.action && item.group, 'complete entry: ' + item.action);
        const source = fs.readFileSync(path.join(__dirname, '..', item.file), 'utf8');
        assert.ok(source.includes(item.needle), item.action + ': ' + item.file + ' no longer contains ' + item.needle);
    });
    const combos = [];
    Shortcuts.GROUPS.forEach((g) => g.items.forEach((i) => i.keys.forEach((k) => combos.push(g.title + '|' + k))));
    assert.equal(new Set(combos).size, combos.length, 'no key is listed twice in one group');
});
