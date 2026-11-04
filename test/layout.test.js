// uses the global Layout set by test/run.js

const box = (x, y, w, h) => ({ x: x, y: y, w: w, h: h });

test('layout: display values are recognised and tracks are parsed', () => {
    ['flex', 'inline-flex', 'grid', 'inline-grid'].forEach((d) => assert.ok(Layout.isLayoutDisplay(d), d));
    ['block', 'none', 'table', '', null].forEach((d) => assert.ok(!Layout.isLayoutDisplay(d), String(d)));
    assert.equal(Layout.kindOf('inline-grid'), 'grid');
    assert.equal(Layout.kindOf('flex'), 'flex');
    assert.equal(Layout.kindOf('block'), null);
    assert.deepEqual(Layout.parseTracks('100px 50.5px 20px'), [100, 50.5, 20]);
    assert.deepEqual(Layout.parseTracks('none'), []);
    assert.deepEqual(Layout.parseTracks('1fr 2fr'), []);
    assert.deepEqual(Layout.trackBoxes(10, [100, 50], 8), [{ start: 10, size: 100 }, { start: 118, size: 50 }]);
});

test('layout: grid handles sit in the gaps between tracks', () => {
    const model = { kind: 'grid', colGap: 10, rowGap: 6, columns: Layout.trackBoxes(0, [100, 100, 100], 10), rows: Layout.trackBoxes(0, [40, 40], 6) };
    const out = Layout.handles(model);
    const cols = out.filter((h) => h.axis === 'x');
    const rows = out.filter((h) => h.axis === 'y');
    assert.equal(cols.length, 2);
    assert.equal(rows.length, 1);
    assert.deepEqual(cols[0], Object.assign({ axis: 'x', prop: 'column-gap', value: 10 }, box(100, 0, 10, 86)));
    assert.deepEqual(rows[0], Object.assign({ axis: 'y', prop: 'row-gap', value: 6 }, box(0, 40, 320, 6)));
    assert.equal(Layout.handles({ kind: 'grid', colGap: 0, rowGap: 0, columns: Layout.trackBoxes(0, [50], 0), rows: Layout.trackBoxes(0, [50], 0) }).length, 0, 'one cell has no gaps');
});

test('layout: a single flex row gets one handle per neighbouring pair', () => {
    const model = { kind: 'flex', direction: 'row', colGap: 20, rowGap: 20, children: [box(0, 0, 100, 50), box(120, 0, 80, 30), box(220, 0, 60, 50)] };
    const out = Layout.handles(model);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], Object.assign({ axis: 'x', prop: 'column-gap', value: 20 }, box(100, 0, 20, 50)));
    assert.equal(out[1].x, 200);
    assert.equal(Layout.writeProp(out, out[0], 20, 20), 'gap', 'one axis with equal gaps writes the shorthand');
    assert.equal(Layout.writeProp(out, out[0], 20, 8), 'column-gap');
    assert.equal(Layout.handles(Object.assign({}, model, { spaced: true })).length, 0, 'justify-content: space-* hides main-axis handles');
    assert.equal(Layout.handles(Object.assign({}, model, { children: [box(0, 0, 10, 10)] })).length, 0);
});

test('layout: flex column and wrapped rows use both gap axes', () => {
    const column = Layout.handles({ kind: 'flex', direction: 'column', colGap: 0, rowGap: 12, children: [box(0, 0, 80, 30), box(0, 42, 80, 30)] });
    assert.equal(column.length, 1);
    assert.deepEqual(column[0], Object.assign({ axis: 'y', prop: 'row-gap', value: 12 }, box(0, 30, 80, 12)));

    const wrapped = Layout.handles({ kind: 'flex', direction: 'row', colGap: 10, rowGap: 14, children: [box(0, 0, 50, 20), box(60, 0, 50, 20), box(0, 34, 50, 20), box(60, 34, 50, 20)] });
    assert.equal(wrapped.filter((h) => h.prop === 'column-gap').length, 2, 'one column gap per line');
    const between = wrapped.filter((h) => h.prop === 'row-gap');
    assert.equal(between.length, 1);
    assert.deepEqual(between[0], Object.assign({ axis: 'y', prop: 'row-gap', value: 14 }, box(0, 20, 110, 14)));
    assert.equal(Layout.writeProp(wrapped, wrapped[0], 10, 14), 'column-gap');

    const overlap = Layout.handles({ kind: 'flex', direction: 'row', colGap: 0, rowGap: 0, children: [box(0, 0, 60, 20), box(40, 0, 60, 20)] });
    assert.equal(overlap.length, 0, 'overlapping items have no gap to drag');
});

test('layout: drag values round, snap, and clamp', () => {
    assert.equal(Layout.dragValue(16, 7.4), 23);
    assert.equal(Layout.dragValue(16, 7.4, 4), 24);
    assert.equal(Layout.dragValue(16, -40), 0);
    assert.equal(Layout.dragValue(990, 500), 1000);
});

test('layout: the shipped source evaluates to the same module', () => {
    const copy = (0, eval)(Layout.source);
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(Layout).sort());
    assert.equal(copy.dragValue(1, 1), 2);
    assert.equal(copy.handles({ kind: 'flex', direction: 'row', colGap: 5, rowGap: 5, children: [box(0, 0, 10, 10), box(15, 0, 10, 10)] }).length, 1);
});
