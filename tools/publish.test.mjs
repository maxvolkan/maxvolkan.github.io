// node tools/publish.test.mjs: checks the small parsers the journal build and crossposting rely on
import assert from 'node:assert/strict';
import { parseFrontMatter, little, absolutize, slugify } from './publish.mjs';

const { meta, body } = parseFrontMatter('---\ntitle: Hi: there\ndraft: true\n---\n\nbody\n');
assert.equal(meta.title, 'Hi: there');  // only the first colon splits
assert.equal(meta.draft, 'true');
assert.equal(body.trim(), 'body');
assert.deepEqual(parseFrontMatter('no front matter').meta, {});

assert.equal(little('a (b) #c @d'), 'a \\(b\\) \\#c \\@d');

assert.equal(
  absolutize('<img src="x.png"> <a href="/bio"> <a href="https://e.com"> <a href="#top"> <a href="mailto:a@b.c">', 'https://s.io/journal/p/'),
  '<img src="https://s.io/journal/p/x.png"> <a href="https://s.io/bio"> <a href="https://e.com"> <a href="#top"> <a href="mailto:a@b.c">',
);

assert.equal(slugify('Hello, World! 2026'), 'hello-world-2026');
console.log('publish helpers ok');
