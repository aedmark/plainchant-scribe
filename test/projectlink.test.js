test('ProjectLink: one folder maps to one live project, whatever the path spelling (one folder = one project)', () => {
    const links = { a: { path: '/home/me/site/' }, b: { path: 'C:\\Work\\Site' }, c: { path: '/home/me/other' }, gone: { path: '/home/me/trash' }, none: {} };
    const scripts = { a: {}, b: {}, c: {}, gone: { deletedAt: 5 }, none: {} };
    assert.equal(ProjectLink.findByPath(links, scripts, '/home/me/site'), 'a');
    assert.equal(ProjectLink.findByPath(links, scripts, '/home/me/site/'), 'a');
    assert.equal(ProjectLink.findByPath(links, scripts, 'c:/work/site/'), 'b');
    assert.equal(ProjectLink.findByPath(links, scripts, '/home/me/Site'), null, 'POSIX paths are case-sensitive');
    assert.equal(ProjectLink.findByPath(links, scripts, '/home/me/trash'), null, 'a deleted project does not claim the folder');
    assert.equal(ProjectLink.findByPath(links, scripts, '/home/me/site', 'a'), null, 'a project is not its own duplicate');
    assert.equal(ProjectLink.findByPath(links, scripts, ''), null);
    assert.equal(ProjectLink.findByPath({}, {}, '/x'), null);
});

test('ProjectLink: disk changes are measured against the last sync, not against unexported Studio edits', () => {
    assert.equal(ProjectLink.hashText('a\r\nb'), ProjectLink.hashText('a\nb\n'), 'line endings and a final newline do not count');
    assert.ok(ProjectLink.hashText('a') !== ProjectLink.hashText('b'));
    const synced = ProjectLink.hashEntries({ 'index.html': '<p>1</p>', 'a.css': 'a{}', 'old.js': '1' });
    const same = ProjectLink.changedOnDisk(synced, { 'index.html': '<p>1</p>\n', 'a.css': 'a{}', 'old.js': '1' });
    assert.equal(same.count, 0);
    const diff = ProjectLink.changedOnDisk(synced, { 'index.html': '<p>2</p>', 'a.css': 'a{}', 'new.js': '2' });
    assert.deepEqual(diff.changed, ['index.html']);
    assert.deepEqual(diff.added, ['new.js']);
    assert.deepEqual(diff.removed, ['old.js']);
    assert.equal(diff.count, 3);
    assert.equal(ProjectLink.changedOnDisk(null, { 'a.css': 'x' }).added.length, 1);
});
