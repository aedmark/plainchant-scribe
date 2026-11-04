const harness = require('./harness.js');

globalThis.test = harness.test;
globalThis.assert = harness.assert;
globalThis.HtmlAst = require('../src/html-ast.js');
globalThis.CssAst = require('../src/css-ast.js');
globalThis.XmlAst = require('../src/xml-ast.js');
globalThis.BookTemplate = require('../src/book-template.js');
globalThis.Book = require('../src/book.js');
globalThis.OpfEdit = require('../src/opf-edit.js');
globalThis.Nav = require('../src/nav.js');
globalThis.Xhtml = require('../src/xhtml.js');
globalThis.BookStage = require('../src/book-stage.js');
globalThis.ExampleBook = require('../src/example-book.js');
globalThis.BookMeta = require('../src/book-meta.js');
globalThis.CodeShade = require('../src/code-shade.js');
globalThis.DomOutline = require('../src/dom-outline.js');
globalThis.Project = require('../src/project.js');
globalThis.Parts = require('../src/parts.js');
globalThis.Links = require('../src/links.js');
globalThis.Editing = require('../src/editing.js');
globalThis.Suggest = require('../src/suggest.js');
globalThis.Library = require('../src/library.js');
globalThis.Store = require('../src/store.js');
globalThis.Versions = require('../src/versions.js');
globalThis.FileSync = require('../src/filesync.js');
globalThis.Importing = require('../src/importing.js');
globalThis.Finding = require('../src/finding.js');
globalThis.Zip = require('../src/zip.js');
globalThis.ImageLib = require('../src/imagelib.js');
globalThis.Hints = require('../src/hints.js');
globalThis.Preview = require('../src/preview.js');
globalThis.Format = require('../src/format.js');
globalThis.Shortcuts = require('../src/shortcuts.js');
globalThis.ProjectLink = require('../src/projectlink.js');

require('./html-ast.test.js');
require('./css-ast.test.js');
require('./xml-ast.test.js');
require('./book-template.test.js');
require('./book.test.js');
require('./opf-edit.test.js');
require('./nav.test.js');
require('./xhtml.test.js');
require('./book-stage.test.js');
require('./book-meta.test.js');
require('./epubcheck.test.js');
require('./hints.test.js');
require('./preview.test.js');
require('./format.test.js');
require('./shortcuts.test.js');
require('./projectlink.test.js');
require('./codeshade.test.js');
require('./theme.test.js');
require('./project.test.js');
require('./structure.test.js');

const results = harness.runTests();
let failed = 0;
for (const r of results) {
    if (r.ok) console.log('  ok   ' + r.name);
    else { failed++; console.log('  FAIL ' + r.name + '\n         ' + r.error); }
}
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
