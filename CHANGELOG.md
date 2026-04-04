# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed
- Article tweets (X long-form posts shared via a `/status/` URL) now correctly extract and convert content. Previously, `isTweetPage()` matched any `/status/` URL and the extractor returned empty output because article tweets lack `[data-testid="tweetText"]`.
- Article body paragraphs are now properly separated in the markdown output. DraftEditor block elements (`div[data-block="true"]`, `section[data-block="true"]`) are now treated as paragraph-level nodes.
- Bold text in articles rendered via `style="font-weight: bold"` on `<span>` elements is now converted to `**...**` markdown.

## [0.2.0] - 2026-04-03

### Added
- Tweet conversion support: single tweets and tweet threads can now be converted to markdown.
- YAML frontmatter for tweets includes engagement stats: likes, reposts, bookmarks, and views.
- Tweets with images are downloaded and bundled into the ZIP alongside the markdown file.

## [0.1.0] - 2026-03-31

### Added
- Initial release: Chrome extension (Manifest V3) that converts X.com articles to Obsidian-flavored markdown.
- Extracts article title, author (from URL), date, and rich-text body content.
- Downloads and embeds article images using Obsidian wiki-link syntax (`![[images/image-1.jpg]]`).
- Generates YAML frontmatter with title, author, date, source URL, and `x-article` tag.
- Packages markdown and images into a downloadable ZIP file.
- HTML-to-markdown conversion handles headings, paragraphs, bold, italic, strikethrough, lists, blockquotes, code blocks, and links.
- Internal X.com profile links converted to Obsidian-style mentions (`[[@username]](https://x.com/username)`).
- JSZip injected before the content script to work around X.com's strict Content Security Policy.
- Downloads triggered via background service worker using `chrome.downloads` API.
