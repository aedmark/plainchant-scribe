(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Layout = factory();
})(typeof self !== 'undefined' ? self : this, function factory() {
    'use strict';

    const LAYOUT_RE = /^(inline-)?(flex|grid)$/;
    const TRACK_RE = /^-?\d*\.?\d+(px)?$/;
    const EPS = 0.5;

    function isLayoutDisplay(display) {
        return LAYOUT_RE.test(String(display || '').trim());
    }

    function kindOf(display) {
        const d = String(display || '');
        if (/grid/.test(d)) return 'grid';
        return /flex/.test(d) ? 'flex' : null;
    }

    function parseTracks(value) {
        const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length || !parts.every((p) => TRACK_RE.test(p))) return [];
        return parts.map(parseFloat);
    }

    function trackBoxes(start, sizes, gap) {
        let at = start;
        return sizes.map((size) => {
            const box = { start: at, size: size };
            at += size + gap;
            return box;
        });
    }

    function rectOf(axis, along, alongSize, spanStart, spanSize) {
        return axis === 'x'
            ? { x: along, y: spanStart, w: alongSize, h: spanSize }
            : { x: spanStart, y: along, w: spanSize, h: alongSize };
    }

    function strip(axis, along, alongSize, spanStart, spanSize, value) {
        return Object.assign({ axis: axis, prop: axis === 'x' ? 'column-gap' : 'row-gap', value: value }, rectOf(axis, along, alongSize, spanStart, spanSize));
    }

    function gridHandles(m) {
        const out = [];
        const cols = m.columns;
        const rows = m.rows;
        const top = rows[0].start;
        const height = rows[rows.length - 1].start + rows[rows.length - 1].size - top;
        const left = cols[0].start;
        const width = cols[cols.length - 1].start + cols[cols.length - 1].size - left;
        for (let i = 0; i < cols.length - 1; i++) {
            const at = cols[i].start + cols[i].size;
            out.push(strip('x', at, cols[i + 1].start - at, top, height, m.colGap));
        }
        for (let i = 0; i < rows.length - 1; i++) {
            const at = rows[i].start + rows[i].size;
            out.push(strip('y', at, rows[i + 1].start - at, left, width, m.rowGap));
        }
        return out;
    }

    function groupLines(children, rowDir) {
        const pos = rowDir ? 'y' : 'x';
        const size = rowDir ? 'h' : 'w';
        const lines = [];
        children.slice().sort((a, b) => a[pos] - b[pos]).forEach((c) => {
            const last = lines[lines.length - 1];
            if (last && c[pos] < last.end - EPS) {
                last.items.push(c);
                last.end = Math.max(last.end, c[pos] + c[size]);
            } else {
                lines.push({ items: [c], start: c[pos], end: c[pos] + c[size] });
            }
        });
        return lines;
    }

    function flexHandles(m) {
        const rowDir = String(m.direction || 'row').indexOf('row') === 0;
        const main = rowDir ? 'x' : 'y';
        const mainSize = rowDir ? 'w' : 'h';
        const cross = rowDir ? 'y' : 'x';
        const lines = groupLines(m.children, rowDir);
        const out = [];
        lines.forEach((line) => {
            if (m.spaced) return;
            const items = line.items.slice().sort((a, b) => a[main] - b[main]);
            for (let i = 0; i < items.length - 1; i++) {
                const at = items[i][main] + items[i][mainSize];
                const gap = items[i + 1][main] - at;
                if (gap >= -EPS) out.push(strip(main, at, gap, line.start, line.end - line.start, main === 'x' ? m.colGap : m.rowGap));
            }
        });
        for (let i = 0; i < lines.length - 1; i++) {
            const gap = lines[i + 1].start - lines[i].end;
            if (gap < -EPS) continue;
            const all = lines[i].items.concat(lines[i + 1].items);
            const from = Math.min.apply(null, all.map((c) => c[main]));
            const to = Math.max.apply(null, all.map((c) => c[main] + c[mainSize]));
            out.push(strip(cross, lines[i].end, gap, from, to - from, cross === 'x' ? m.colGap : m.rowGap));
        }
        return out;
    }

    function handles(model) {
        if (!model || !model.kind) return [];
        if (model.kind === 'grid' && model.columns && model.rows && model.columns.length && model.rows.length) return gridHandles(model);
        if (!model.children || model.children.length < 2) return [];
        return flexHandles(model);
    }

    function dragValue(start, delta, snap) {
        const raw = Number(start) + Number(delta);
        const value = snap ? Math.round(raw / snap) * snap : Math.round(raw);
        return Math.max(0, Math.min(1000, value));
    }

    function writeProp(all, handle, colGap, rowGap) {
        const props = new Set(all.map((h) => h.prop));
        return props.size === 1 && colGap === rowGap ? 'gap' : handle.prop;
    }

    return {
        isLayoutDisplay: isLayoutDisplay, kindOf: kindOf, parseTracks: parseTracks, trackBoxes: trackBoxes,
        handles: handles, dragValue: dragValue, writeProp: writeProp,
        source: '(' + factory.toString() + ')()'
    };
});
