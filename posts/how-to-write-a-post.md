---
title: How to write a post
date: 2026-10-30
summary: A template post for the journal, kept as a draft. Copy it, or start a new post in the CMS.
cover:
draft: true
crosspost: linkedin, substack
---

This post is a template and stays a draft, so it never shows up on the live site. The easiest way to
write is the CMS (`node tools/cms.mjs`): it shows the real page as you type, takes pasted images and
publishes with one button. Any editor works too; the CMS picks up your saves.

## Starting a post

In the CMS press `[+ new]`, or from the repo:

```
node tools/publish.mjs new "My title"
```

That writes `posts/my-title.md` and an empty `posts/my-title/` folder for its images. The lines at
the top:

- **title** and **summary**: the summary shows on the journal cards, in the feed and on LinkedIn.
- **cover**: a photo in the post's folder. It gets dithered into the site's palette. Leave it empty and
  the cover is a frame of the brain. **focus: x,y** (0–1) picks what stays in view when it's cropped;
  in the CMS, click the cover.
- **cover_art**: a cover you made yourself (Photopea, Inkscape, Affinity…), used exactly as it is.
- **crosspost**: where it goes after it's live, `linkedin, substack` or nothing.

Each `##` heading also becomes a small line on the cover, like a magazine's contents.

## Publishing

1. Delete `draft: true` (untick draft in the CMS).
2. CMS: `[publish…]` shows what will go live, then builds, commits, pushes and tells you when it's
   live. By hand: `node tools/publish.mjs`, then commit and push.
3. Once the page is live, crosspost: the CMS's `[linkedin]` / `[substack]` buttons, or
   `node tools/publish.mjs crosspost my-title` (add `--dry-run` first to see what would be sent).

> Images go in the post's folder and are linked like `![what it shows](my-title/photo.jpg)`. In the
> CMS, paste or drop an image and it does both for you. They show toned to the palette and turn to
> full colour when you point at them.
