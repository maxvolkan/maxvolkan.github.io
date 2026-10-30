// node tools/publish.test.mjs: checks the small parsers the journal build, the CMS and crossposting rely on
import assert from 'node:assert/strict';
import { parseFrontMatter, stringifyFrontMatter, little, absolutize, slugify, focusStyle, barcode } from './publish.mjs';

const { meta, body } = parseFrontMatter('---\ntitle: Hi: there\ndraft: true\n---\n\nbody\n');
assert.equal(meta.title, 'Hi: there');  // only the first colon splits
assert.equal(meta.draft, 'true');
assert.equal(body.trim(), 'body');
assert.deepEqual(parseFrontMatter('no front matter').meta, {});

// what the CMS saves reads back the same, keys in order, multi-line values flattened
const text = stringifyFrontMatter({ crosspost: 'linkedin', extra: 'x', title: 'A: b', cover: '', summary: 'two\nlines' }, '\nbody\n');
assert.equal(text, '---\ntitle: A: b\nsummary: two lines\ncover:\ncrosspost: linkedin\nextra: x\n---\n\nbody\n');
assert.deepEqual(parseFrontMatter(text), { meta: { title: 'A: b', summary: 'two lines', cover: '', crosspost: 'linkedin', extra: 'x' }, body: '\nbody\n' });

assert.equal(focusStyle('0.25,1'), ' style="object-position:25% 100%"');
for (const bad of ['', '0.5', '2,0.5', 'a,b', '-1,0']) assert.equal(focusStyle(bad), '');

// Code 39: start + 1 digit + stop = 3 characters of 15 units, with 2 gaps; '1' is wide bar, narrow…, wide bar
const svg = barcode('1');
assert.match(svg, /viewBox="0 0 47 1"/);
assert.equal(svg.match(/<rect/g).length, 15);  // 5 bars per character
assert.match(svg, /<rect x="16" width="3" height="1"\/>/);  // '1' starts with a wide bar right after '*' and its gap

assert.equal(little('a (b) #c @d'), 'a \\(b\\) \\#c \\@d');

assert.equal(
  absolutize('<img src="x.png"> <a href="/bio"> <a href="https://e.com"> <a href="#top"> <a href="mailto:a@b.c">', 'https://s.io/journal/p/'),
  '<img src="https://s.io/journal/p/x.png"> <a href="https://s.io/bio"> <a href="https://e.com"> <a href="#top"> <a href="mailto:a@b.c">',
);

assert.equal(slugify('Hello, World! 2026'), 'hello-world-2026');
console.log('publish helpers ok');
