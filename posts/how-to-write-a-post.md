---
title: How to write a post
title_ja: 投稿の書き方
date: 2026-10-30
summary: A template post for the journal, kept as a draft. Copy it, or run the new command.
cover:
draft: true
crosspost: linkedin, substack
---

This post is a template and stays a draft, so it never shows up on the live site. Preview it with
`node tools/publish.mjs --drafts` and open the journal at localhost.

## Starting a post

```
node tools/publish.mjs new "My title"
```

That writes `posts/my-title.md` and an empty `posts/my-title/` folder for its images. Fill in the
lines at the top:

- **title** and **summary**: the summary shows on the journal cards, in the feed and on LinkedIn.
- **title_ja**: optional, set vertically down the side of the cover.
- **cover**: a photo in the post's folder. It gets dithered into the site's palette. Leave it empty and
  the cover is a frame of the brain.
- **cover_art**: a cover you made yourself (Photopea, Inkscape, Affinity…), used exactly as it is.
- **crosspost**: where it goes after it's live, `linkedin, substack` or nothing.

## Publishing

1. Delete `draft: true`.
2. `node tools/publish.mjs` rebuilds `journal/`, `feed.xml` and the homepage's news and journal rows.
3. Commit and push.
4. Once the page is live, `node tools/publish.mjs crosspost my-title` posts it to LinkedIn and copies a
   Substack-ready version to paste. Add `--dry-run` first to see exactly what would be sent.

> Images go in the post's folder and are linked like `![what it shows](photo.jpg)`. They show
> toned to the palette and turn to full colour when you point at them.
