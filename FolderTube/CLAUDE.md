# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this directory is

This is the **built distribution** of the FolderTube Chrome extension (Manifest V3, v1.0.9). The files here are compiled output from a Plasmo/Parcel build pipeline — there are no TypeScript/JSX source files. You load this folder directly in Chrome via `chrome://extensions` → "Load unpacked".

Hash-suffixed files (`Foldertube-main.4159096a.js`, etc.) are minified bundles and should not be hand-edited. Editable source files are in `legacy/`.

## Extension architecture

The extension runs four layers of JavaScript:

**Background service worker** (`static/background/index.js`)
Handles auth token storage (JWT access + refresh tokens in `chrome.storage.local` via `@plasmohq/storage`), external messages from `foldertube.vercel.app`, authenticated API calls proxied from content scripts, and a periodic profile-status polling alarm. It is the only context that can call the backend API (`https://foldertube.up.railway.app`).

**Bundled content scripts** (hash-named, injected on `https://www.youtube.com/*`):
- `api-client.*.js` — bridges content scripts to the background for API calls via `chrome.runtime.sendMessage({type:"apiCall", ...})`
- `subscription-cache.*.js` — caching layer for subscription data
- `drag-manager.*.js` — drag-and-drop reordering of folder tabs in the YouTube sidebar
- `folder-bar.*.js` — injects the folder sidebar strip into YouTube's guide panel
- `Foldertube-core.*.js` + `Foldertube-main.*.js` — core extension logic; exposes `window.tabManager` (folder state) and `window.subscriptionManager` (subscription list)

**Legacy content scripts** (`legacy/`, editable plain JS):
- `subscriptions-filter.js` — `SubscriptionsFilter` class; injects a sticky chip filter bar on `/feed/subscriptions`, fetches latest videos via YouTube RSS (concurrency 20, 5-min cache), renders a custom video grid per folder
- `settings-modal.js` — settings/management modal with 4 tabs (General, Folders, Channels, Account), i18n for 20+ languages auto-detected from YouTube's `ytcfg`, import/export JSON

**Web-accessible scripts** (injected into the page's JS context, not the extension context):
- `legacy/config-reader.js` — reads `window.ytcfg` to extract the authenticated YouTube channel ID; fires `window.postMessage({type:"YTT_CONFIG_DATA", ...})`
- `legacy/subscriptions-fetcher.js` — fetches `/feed/channels`, parses `ytInitialData` JSON to extract subscription list; responds to `YTT_FETCH_SUBSCRIPTIONS` postMessage events with `YTT_SUBSCRIPTIONS_DATA`

## Key global state

`window.tabManager.tabData` — folder store: `{ [folderId]: { name, color, channelIds, index } }`
`window.subscriptionManager.getAll()` — returns array of `{ id, name, url, thumbnail, handle, avatarUrl }`

## Inter-script communication

| Direction | Mechanism | Message type |
|-----------|-----------|-------------|
| page → content script | `window.postMessage` | `YTT_CONFIG_DATA`, `YTT_SUBSCRIPTIONS_DATA` |
| content script → page | `window.postMessage` | `YTT_FETCH_SUBSCRIPTIONS` |
| content → background | `chrome.runtime.sendMessage` | `{type:"apiCall"}` |
| background → content | `chrome.tabs.sendMessage` | `tokenUpdated`, `tokenCleared`, `profileUpdated`, `websiteUrlChanged`, `apiUrlChanged` |
| within content | `document.dispatchEvent` | `YTT_SUBSCRIPTIONS_UPDATED`, `CHANNEL_MOVED`, `TAB_CREATED`, `TAB_DELETED` |
| website → extension | `chrome.runtime.sendMessage` (external) | `setTokens`, `logout`, `ping`, `setApiUrl`, `setWebsiteUrl` |

## External services

- **API**: `https://foldertube.up.railway.app` — authenticated backend (JWT)
- **Website / auth origin**: `https://foldertube.vercel.app` — allowed external origin for token handoff

## Manifest permissions

`storage`, `tabs`, `alarms` + host permissions for `youtube.com` and the Railway API.

## YouTube SPA navigation

The extension hooks `yt-navigate-finish`, `yt-page-data-updated`, and `popstate` (debounced 120 ms) to re-inject UI after YouTube's SPA navigations. A 2-second polling fallback re-injects if the DOM was replaced.
