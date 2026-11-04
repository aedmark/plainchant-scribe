function layoutBridgeMain(Layout) {
    var HIT = 12;
    var layer = document.createElement('div');
    layer.id = 'pc-layout-layer';
    layer.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483644;pointer-events:none;';
    document.body.appendChild(layer);
    var timer = null;
    var drag = null;
    var lastInfo = '';

    function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
    function boxOf(el) { var r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
    function post(info) {
        var text = JSON.stringify(info);
        if (text === lastInfo) return;
        lastInfo = text;
        window.parent.postMessage(Object.assign({ type: 'pc-layout-info' }, info), '*');
    }

    function modelOf(el, cs) {
        var kind = Layout.kindOf(cs.display);
        var r = el.getBoundingClientRect();
        var model = { kind: kind, direction: cs.flexDirection, colGap: num(cs.columnGap), rowGap: num(cs.rowGap), children: [] };
        model.spaced = /^space-/.test(cs.justifyContent) && kind === 'flex';
        Array.prototype.forEach.call(el.children, function (child) {
            var c = getComputedStyle(child);
            if (c.display === 'none' || c.position === 'absolute' || c.position === 'fixed' || child.id === 'pc-layout-layer') return;
            model.children.push(boxOf(child));
        });
        if (kind === 'grid') {
            var left = r.left + num(cs.borderLeftWidth) + num(cs.paddingLeft);
            var top = r.top + num(cs.borderTopWidth) + num(cs.paddingTop);
            var cols = Layout.parseTracks(cs.gridTemplateColumns);
            var rows = Layout.parseTracks(cs.gridTemplateRows);
            if (cols.length && rows.length) {
                model.columns = Layout.trackBoxes(left, cols, model.colGap);
                model.rows = Layout.trackBoxes(top, rows, model.rowGap);
            }
        }
        return model;
    }

    function place(node, x, y, w, h) {
        node.style.left = x + 'px';
        node.style.top = y + 'px';
        node.style.width = w + 'px';
        node.style.height = h + 'px';
    }

    function guides(model) {
        if (!model.columns || model.columns.length * model.rows.length > 300) return;
        model.rows.forEach(function (row) {
            model.columns.forEach(function (col) {
                var cell = document.createElement('div');
                cell.style.cssText = 'position:fixed;box-sizing:border-box;border:1px dashed rgba(2,132,199,0.45);pointer-events:none;';
                place(cell, col.start, row.start, col.size, row.size);
                layer.appendChild(cell);
            });
        });
    }

    function handleNode(h, all, model, el, cs) {
        var vertical = h.axis === 'x';
        var node = document.createElement('div');
        node.className = 'pc-lh';
        node.title = 'Drag to change ' + h.prop + ' (hold Shift to snap to 4px)';
        var thickness = Math.max(h.w && vertical ? h.w : (vertical ? 0 : h.h), HIT);
        var x = vertical ? h.x + h.w / 2 - thickness / 2 : h.x;
        var y = vertical ? h.y : h.y + h.h / 2 - thickness / 2;
        node.style.cssText = 'position:fixed;box-sizing:border-box;pointer-events:auto;display:flex;align-items:center;justify-content:center;touch-action:none;background:rgba(245,158,11,0.18);cursor:' + (vertical ? 'col-resize' : 'row-resize') + ';';
        place(node, x, y, vertical ? thickness : h.w, vertical ? h.h : thickness);
        var grip = document.createElement('div');
        grip.style.cssText = 'background:#f59e0b;border-radius:2px;pointer-events:none;' + (vertical ? 'width:4px;height:min(24px,80%);' : 'height:4px;width:min(24px,80%);');
        node.appendChild(grip);
        node.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            try { node.setPointerCapture(e.pointerId); } catch (err) {}
            drag = { h: h, node: node, x0: x, y0: y, sx: e.clientX, sy: e.clientY, value: h.value, prev: el.style.getPropertyValue(h.prop), tip: tip(node) };
        });
        node.addEventListener('pointermove', function (e) {
            if (!drag || drag.node !== node) return;
            var delta = vertical ? e.clientX - drag.sx : e.clientY - drag.sy;
            drag.value = Layout.dragValue(h.value, delta, e.shiftKey ? 4 : 0);
            el.style.setProperty(h.prop, drag.value + 'px');
            var shift = drag.value - h.value;
            node.style.left = (vertical ? drag.x0 + shift : drag.x0) + 'px';
            node.style.top = (vertical ? drag.y0 : drag.y0 + shift) + 'px';
            drag.tip.textContent = h.prop + ': ' + drag.value + 'px';
        });
        function finish(commit) {
            if (!drag || drag.node !== node) return;
            var done = drag;
            drag = null;
            if (done.prev === '') el.style.removeProperty(h.prop); else el.style.setProperty(h.prop, done.prev);
            if (done.tip.parentNode) done.tip.parentNode.removeChild(done.tip);
            if (commit && done.value !== h.value) {
                window.parent.postMessage({ type: 'pc-layout-gap', id: el.getAttribute('data-pc-id'), prop: Layout.writeProp(all, h, model.colGap, model.rowGap), value: done.value }, '*');
            }
            schedule();
        }
        node.addEventListener('pointerup', function () { finish(true); });
        node.addEventListener('pointercancel', function () { finish(false); });
        return node;
    }

    function tip(near) {
        var t = document.createElement('div');
        t.style.cssText = 'position:fixed;pointer-events:none;background:#0f172a;color:#fff;font:600 11px/1.3 system-ui,sans-serif;padding:2px 6px;border-radius:4px;white-space:nowrap;z-index:1;';
        t.style.left = near.style.left;
        t.style.top = (parseFloat(near.style.top) - 22) + 'px';
        layer.appendChild(t);
        return t;
    }

    function draw() {
        if (drag) return;
        layer.textContent = '';
        var el = document.querySelector('[data-pc-selected="true"]');
        var cs = el ? getComputedStyle(el) : null;
        var id = el ? el.getAttribute('data-pc-id') : null;
        if (!el || !Layout.isLayoutDisplay(cs.display)) { post({ id: id, display: null }); return; }
        var model = modelOf(el, cs);
        post({ id: id, display: cs.display, kind: model.kind, direction: cs.flexDirection, wrap: cs.flexWrap, justify: cs.justifyContent, align: cs.alignItems });
        guides(model);
        var all = Layout.handles(model);
        all.forEach(function (h) { layer.appendChild(handleNode(h, all, model, el, cs)); });
    }

    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(draw, 30);
    }

    new MutationObserver(function (list) {
        if (list.every(function (m) { return layer.contains(m.target); })) return;
        schedule();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-pc-selected', 'style', 'class'], childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('load', schedule, true);
    window.addEventListener('mousedown', function (e) { if (e.target.closest && e.target.closest('.pc-lh')) e.stopImmediatePropagation(); }, true);
    window.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.pc-lh')) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    schedule();
}

function buildLayoutBridgeScript() {
    return '\n(' + layoutBridgeMain.toString() + ')(' + Layout.source + ');\n';
}
