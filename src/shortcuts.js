(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Shortcuts = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // `file` and `needle` point at the code that handles the key, so test/structure.test.js can
    // fail when a shortcut listed here is removed or renamed.
    const GROUPS = [
        {
            title: 'Anywhere',
            items: [
                { keys: ['F1', 'Ctrl/Cmd+/'], action: 'Open this guide', file: 'src/app/help.js', needle: "e.key === 'F1'" },
                { keys: ['Ctrl/Cmd+S'], action: 'Save the project to the Studio workspace', file: 'src/app/persistence.js', needle: "=== 's'" },
                { keys: ['Ctrl/Cmd+Z'], action: 'Undo (all files and Stage actions)', file: 'src/app/typing.js', needle: "key === 'z'" },
                { keys: ['Ctrl/Cmd+Shift+Z', 'Ctrl+Y'], action: 'Redo', file: 'src/app/typing.js', needle: "key === 'y'" },
                { keys: ['Esc'], action: 'Close the open dialog or menu', file: 'src/app/dialogs.js', needle: "e.key === 'Escape'" },
                { keys: ['Ctrl/Cmd+Shift+1'], action: 'Code view', file: 'src/app/panes.js', needle: 'Digit1' },
                { keys: ['Ctrl/Cmd+Shift+2'], action: 'Split view', file: 'src/app/panes.js', needle: 'Digit2' },
                { keys: ['Ctrl/Cmd+Shift+3'], action: 'Stage only', file: 'src/app/panes.js', needle: 'Digit3' },
                { keys: ['Ctrl/Cmd+Shift+I'], action: 'Show or hide the Inspector', file: 'src/app/panes.js', needle: "e.code === 'KeyI'" }
            ]
        },
        {
            title: 'Code editor',
            items: [
                { keys: ['Tab'], action: 'Accept a suggestion, expand an abbreviation such as ul*3, or indent', file: 'src/app/typing.js', needle: "e.key === 'Tab'" },
                { keys: ['Alt+Shift+F'], action: 'Format the open file', file: 'src/app/format-ui.js', needle: "e.code === 'KeyF'" },
                { keys: ['Ctrl/Cmd+F'], action: 'Find in the file', file: 'src/app/find.js', needle: "key !== 'f' && key !== 'h'" },
                { keys: ['Ctrl/Cmd+H'], action: 'Find and replace in the file', file: 'src/app/find.js', needle: "key === 'h'" },
                { keys: ['Ctrl/Cmd+Shift+F'], action: 'Find and replace across the project', file: 'src/app/find.js', needle: 'e.shiftKey ? true' }
            ]
        },
        {
            title: 'Find bar',
            items: [
                { keys: ['Enter'], action: 'Next match (Replace in the replace field)', file: 'src/app/find.js', needle: 'stepFind(e.shiftKey ? -1 : 1)' },
                { keys: ['Shift+Enter'], action: 'Previous match', file: 'src/app/find.js', needle: 'stepFind(e.shiftKey ? -1 : 1)' },
                { keys: ['Esc'], action: 'Close the find bar', file: 'src/app/find.js', needle: 'closeFind();' }
            ]
        },
        {
            title: 'Design Stage',
            items: [
                { keys: ['Click'], action: 'Select an element and highlight its code', file: 'src/app/stage.js', needle: 'pc-select' },
                { keys: ['Ctrl/Cmd+Click'], action: 'Follow a link to another project page', file: 'src/app/stage.js', needle: '(e.ctrlKey || e.metaKey) && el.closest("a[href]")' },
                { keys: ['Enter'], action: 'Finish editing text in place', file: 'src/app/stage.js', needle: 'finishInlineEdit(true)' },
                { keys: ['Shift+Enter'], action: 'New line while editing text in place', file: 'src/app/stage.js', needle: 'e.key === "Enter" && !e.shiftKey' },
                { keys: ['Esc'], action: 'Cancel text editing, or cancel a drag', file: 'src/app/stage.js', needle: 'finishInlineEdit(false)' },
                { keys: ['Delete', 'Backspace'], action: 'Delete the selected element', file: 'src/app/stage.js', needle: 'e.key === "Delete"' },
                { keys: ['Alt+Up', 'Alt+Down'], action: 'Move the selected element up or down', file: 'src/app/stage.js', needle: 'e.key === "ArrowUp" && selectedId' }
            ]
        },
        {
            title: 'Menus and lists',
            items: [
                { keys: ['Up', 'Down'], action: 'Move through Explorer and Dock menu items', file: 'src/app/explorer-ui.js', needle: "e.key === 'ArrowDown'" }
            ]
        }
    ];

    function all() {
        const out = [];
        GROUPS.forEach((g) => g.items.forEach((item) => out.push(Object.assign({ group: g.title }, item))));
        return out;
    }

    return { GROUPS: GROUPS, all: all };
});
