# Prism (vendored)

`prism.js` is the unmodified `prism.js` from the `prismjs@1.30.0` npm package (core, markup, CSS, C-like, and JavaScript). `LICENSE` is Prism's MIT license. Copyright (c) 2012 Lea Verou. https://prismjs.com

Plainchant Scribe uses only `Prism.tokenize()` (see `src/code-shade.js`); it never calls Prism's HTML output, so no markup is built from file text. To update, replace `prism.js` with the same file from a newer release, copy its `LICENSE`, and run `npm test`. Decision: D-034.
