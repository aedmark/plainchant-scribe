// The optional EPUBCheck run (P5-05, D-041, D-005), desktop only. The Problems tab's Run EPUBCheck button packs the
// book as Export would (without touching dcterms:modified), and the desktop shell runs the author's EPUBCheck jar on
// it. The rows go in their own EPUBCheck category, so "passes Scribe's checks" and "passes EPUBCheck" stay apart.
// The jar is chosen once and kept in settings; EPUBCHECK_JAR is used when nothing is chosen. Shift-click to choose again.

const epubcheckRunBtn = document.getElementById('epubcheckRunBtn');

function refreshEpubcheckButton() {
    epubcheckRunBtn.hidden = !(hasTauri() && isBookProject());
}

async function epubcheckJar(choose) {
    if (!choose && settings.epubcheckJar) return settings.epubcheckJar;
    if (!choose) {
        const fromEnv = await tauriInvoke('epubcheck_env_jar');
        if (fromEnv) return fromEnv;
    }
    const picked = await tauriInvoke('epubcheck_pick_jar');
    if (picked) setSetting('epubcheckJar', picked);
    return picked;
}

async function runEpubcheck(choose) {
    ensureEntries();
    syncBufferFromEditor();
    const jar = await epubcheckJar(choose);
    if (!jar) {
        showNotice('EPUBCheck was not run: no jar was chosen. Download a release from github.com/w3c/epubcheck, unzip it, and choose its epubcheck.jar.');
        return;
    }
    const book = currentScriptId;
    const entries = Object.assign({}, projectFiles.entries);
    const packed = await packOpenBook();
    problemsSummary.textContent = 'Running EPUBCheck…';
    let out;
    try {
        out = await tauriInvoke('epubcheck_run', { jar: jar, data: await blobToBase64(new Blob([packed.bytes])) });
    } catch (err) {
        // A jar that has moved is asked for again next time.
        if (/not a \.jar file|was not found\. Choose/.test(String(err))) setSetting('epubcheckJar', '');
        throw err;
    }
    let report;
    try { report = JSON.parse(out.report); } catch (e) { throw new Error('EPUBCheck\'s report could not be read.'); }
    const read = EpubcheckReport.read(report, entries);
    epubcheckRun = { book: book, entries: entries, problems: read.problems, version: read.version };
    if (book !== currentScriptId) return;
    problemsFilter = 'epubcheck';
    setSetting('problemsFilter', problemsFilter);
    runProblemsCheck();
    const warnings = read.problems.length - read.errors;
    showNotice('EPUBCheck ' + read.version + ' found ' + (read.problems.length ? read.errors + (read.errors === 1 ? ' error' : ' errors') + ' and ' + warnings + (warnings === 1 ? ' other message' : ' other messages') : 'no problems') + '. Ran: ' + out.command, read.errors > 0);
}

epubcheckRunBtn.addEventListener('click', (event) => {
    epubcheckRunBtn.disabled = true;
    runEpubcheck(event.shiftKey).catch((err) => {
        showNotice('Could not run EPUBCheck: ' + (err && err.message || err), true);
        renderProblems();
    }).finally(() => { epubcheckRunBtn.disabled = false; });
});
