# Be Anon

Watch Instagram stories without marking them as seen.

## How it works

`Be Anon Instagram` is a userscript that intercepts outgoing network requests made by Instagram in your browser. When it detects a request that would report a story view back to Instagram's servers - identified by URL patterns and request body content - it silently drops the request and returns a fake success response. Instagram's UI behaves normally; the view just never gets recorded.

It patches both `XMLHttpRequest` and `fetch`, covering the two request mechanisms Instagram uses. The interception runs before the page initializes (`document-start`), so no tracking slips through on load.

## Requirements

A userscript manager extension in your browser. [Tampermonkey](https://www.tampermonkey.net/) and [Violentmonkey](https://violentmonkey.github.io/) both work.

## Installation

1. Install a userscript manager if you don't have one.
2. Open `be-anon-instagram.js` and copy its contents into a new userscript in your manager, or use your manager's import feature.
3. Navigate to Instagram - the script activates automatically.

## License

MIT