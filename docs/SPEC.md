# Technical implementation spec

This document describes how the extension is built. What it looks like and how it behaves is covered in [DESIGN.md](DESIGN.md).

## 1. Summary

A Manifest V3 browser extension. A script in the page's own JavaScript context observes the JSON responses the x.com web client already receives. Posts found in those responses are normalised and stored in IndexedDB under the extension's origin. Injected UI on x.com and a standalone library page read and write that store.

The extension makes no network requests of its own, loads no remote code, and has no backend.

## 2. Constraints and assumptions

- **Undocumented data source.** x.com's internal GraphQL API is not public. Operation names, response shapes and DOM attributes listed here are assumptions based on observed behaviour. Each one must be confirmed against live traffic during milestone M1 and is expected to change over time. Section 7.5 describes how the design limits the damage.
- **Terms of service.** The extension only reads data the user's own session has already loaded. It never calls X's API itself, never replays requests, and never touches credentials. Auto-scroll is the only feature that drives the page; it is opt-in, user-started and rate-limited.
- **No paid features.** Everything works on a free X account. Bookmark folders are not read, mirrored or required.
- **Browsers.** Chromium 116+ is the primary target. Firefox 128+ is a secondary target (no side panel API; the library opens as a tab).
- **Scale.** Designed for up to 50,000 posts and 1,000 tags per account.

## 3. Stack

| Concern | Choice | Reason |
| --- | --- | --- |
| Extension framework | WXT | Vite-based, MV3-first, builds for Chromium and Firefox from one codebase, file-based entrypoints. |
| Language | TypeScript, `strict` | |
| UI | Preact + Signals | Small bundle, which matters for a content script injected on every x.com page. |
| Styling | Plain CSS with custom properties, in a shadow root | No runtime styling cost, full isolation from X's CSS. |
| Storage | IndexedDB through Dexie 4 | Compound indexes, migrations, cross-context live queries. |
| Validation | Valibot | Small, tree-shakeable schema validation for untrusted input. |
| Search | MiniSearch | In-memory full-text index, sufficient at the target scale. |
| List virtualisation | `@tanstack/virtual-core` | |
| Tests | Vitest (unit), Playwright (end to end against a mock site) | |
| Tooling | pnpm, ESLint, Prettier | |

Dependency policy: every runtime dependency must be justified in the pull request that adds it. No analytics, telemetry or error-reporting SDKs.

## 4. Architecture

```
                         x.com tab
┌───────────────────────────────────────────────────────────────┐
│  MAIN world                      ISOLATED world               │
│ ┌───────────────────┐ postMessage ┌─────────────────────────┐ │
│ │ interceptor       │────────────▶│ bridge                  │ │
│ │ wraps fetch / XHR │             │ validates, parses,      │ │
│ │ no extension APIs │             │ keeps seen-post cache   │ │
│ └───────────────────┘             ├─────────────────────────┤ │
│                                   │ injected UI (shadow DOM)│ │
│                                   │ tag button, popover,    │ │
│                                   │ toast, capture banner   │ │
│                                   └────────────┬────────────┘ │
└────────────────────────────────────────────────┼──────────────┘
                                 runtime messages│
                                                 ▼
                                   ┌─────────────────────────┐
                                   │ background service worker│
                                   │ sole writer for content  │
                                   │ scripts, owns migrations │
                                   └────────────┬────────────┘
                                                │ Dexie
                                                ▼
                                   ┌─────────────────────────┐
                                   │ IndexedDB               │
                                   │ (extension origin)      │
                                   └────────────▲────────────┘
                                                │ Dexie (direct)
                          ┌─────────────────────┴───────────────┐
                          │ extension pages                     │
                          │ library tab, side panel, popup,     │
                          │ options, welcome                    │
                          └─────────────────────────────────────┘
```

Why this split:

- **The interceptor must run in the MAIN world**, because only code in the page's own context can wrap the page's `fetch` and `XMLHttpRequest`. It has no access to extension APIs and holds no state.
- **The database must live under the extension origin.** IndexedDB opened from a content script belongs to `x.com`, where the site can read or clear it. Content scripts therefore never open the database; they send messages to the service worker.
- **Extension pages open the database directly.** They share the extension origin, so Dexie live queries pick up writes made by the service worker without any custom messaging.

## 5. Repository layout

```
.
├── docs/
│   ├── DESIGN.md
│   └── SPEC.md
├── entrypoints/
│   ├── interceptor.content.ts     # MAIN world, document_start
│   ├── x.content/                 # ISOLATED world: bridge + injected UI
│   │   ├── index.ts
│   │   ├── bridge.ts
│   │   ├── seen-cache.ts
│   │   ├── dom/                   # selectors, post discovery, mounting
│   │   └── ui/                    # TagButton, TagPopover, Toast, CaptureBanner
│   ├── background.ts
│   ├── library/                   # full-tab library app
│   ├── sidepanel/                 # same app, compact layout
│   ├── popup/
│   ├── options/
│   └── welcome/
├── src/
│   ├── capture/
│   │   ├── operations.ts          # table of known GraphQL operations
│   │   ├── extract.ts             # shape-tolerant post extraction
│   │   └── normalise.ts           # raw result -> Post
│   ├── db/
│   │   ├── schema.ts              # Dexie schema + migrations
│   │   ├── repo.ts                # all reads and writes
│   │   └── types.ts
│   ├── messaging/
│   │   ├── protocol.ts            # message types + Valibot schemas
│   │   └── client.ts
│   ├── search/
│   ├── transfer/                  # export / import
│   ├── settings/
│   └── ui/                        # components shared by content UI and pages
├── tests/
│   ├── fixtures/                  # synthetic responses only, see 12.4
│   ├── unit/
│   └── e2e/
│       └── mock-site/             # static pages imitating x.com markup
├── public/icons/
├── wxt.config.ts
├── package.json
├── LICENSE
└── README.md
```

## 6. Manifest

Generated by WXT. The effective Chromium manifest:

```json
{
  "manifest_version": 3,
  "name": "xorganize",
  "minimum_chrome_version": "116",
  "permissions": ["storage", "unlimitedStorage", "sidePanel"],
  "host_permissions": ["https://x.com/*", "https://twitter.com/*"],
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [
    {
      "matches": ["https://x.com/*", "https://twitter.com/*"],
      "js": ["content-scripts/interceptor.js"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": ["https://x.com/*", "https://twitter.com/*"],
      "js": ["content-scripts/x.js"],
      "run_at": "document_start"
    }
  ],
  "action": { "default_popup": "popup.html" },
  "side_panel": { "default_path": "sidepanel.html" },
  "options_ui": { "page": "options.html", "open_in_tab": true },
  "commands": {
    "open-library": { "description": "Open the library" }
  }
}
```

Permission rationale, to be repeated in the store listing:

| Permission | Why |
| --- | --- |
| `https://x.com/*`, `https://twitter.com/*` | Read posts as they load and add the tag button. No other sites. |
| `storage` | Settings. |
| `unlimitedStorage` | Prevents the browser evicting the library under storage pressure. |
| `sidePanel` | The optional side panel view. |

Not requested: `tabs`, `cookies`, `webRequest`, `scripting`, `downloads`, `<all_urls>`. Export uses an object URL and an anchor element, which needs no permission.

The default extension content security policy is kept: no remote scripts, no `eval`.

## 7. Capture pipeline

### 7.1 Interceptor (MAIN world)

Runs at `document_start`, before the site's own scripts, so it wraps the originals before the site can keep private references to them.

- Wraps `window.fetch`. After the original resolves, clones the response and reads the clone.
- Wraps `XMLHttpRequest.prototype.open` and `send`. Records the URL on `open` and the body on `send`, and adds a `load` listener.
- Considers only URLs matching `^https://(x|twitter)\.com/i/api/graphql/[^/]+/([A-Za-z]+)`. The captured group is the operation name.
- Forwards only operations listed in section 7.3. Everything else is ignored without being read.
- Posts `{ channel: "xorganize", v: 1, kind: "response" | "mutation", op, payload }` to the same window with `targetOrigin` set to `location.origin`.

Rules for this file:

- It must never throw into the page and never change what the page receives. All work is inside `try`/`catch`, and the original return values are passed through untouched.
- It never reads or forwards request headers. Authorisation and CSRF headers never leave the page context.
- It stays dependency-free and under roughly 150 lines, so that it can be audited at a glance.

### 7.2 Bridge (ISOLATED world)

- Listens for `message` events where `event.source === window` and `data.channel === "xorganize"`.
- Treats the payload as **untrusted**. Any script on the page can post a look-alike message, so every payload passes through a Valibot schema with size limits, and nothing from it is ever inserted as HTML.
- Runs extraction and normalisation (7.4), then:
  - puts every post into the **seen cache**, an in-memory LRU of the most recent 1,000 posts, keyed by post ID;
  - for source timelines, sends the posts to the service worker to be stored;
  - for mutations, looks the post up in the seen cache and sends a store or source-removal message.

The seen cache is what allows a post to be saved with full data the moment the user tags or bookmarks it anywhere on the site. It is never persisted.

### 7.3 Operations

Operation names are assumptions to verify in M1.

| Operation | Kind | Action |
| --- | --- | --- |
| `Bookmarks` | Source timeline | Store every post with source `bookmark`, record sort index. |
| `BookmarkSearchTimeline` | Source timeline | Same. |
| `Likes` | Source timeline | Store every post with source `like`, record sort index. Only when the timeline belongs to the logged-in account. |
| `HomeTimeline`, `HomeLatestTimeline`, `TweetDetail`, `UserTweets`, `UserTweetsAndReplies`, `UserMedia`, `SearchTimeline`, `ListLatestTweetsTimeline` | Ambient timeline | Seen cache only. Nothing is stored. |
| `CreateBookmark` | Mutation | Read `variables.tweet_id` from the request body. Store the post from the seen cache with source `bookmark`. |
| `DeleteBookmark` | Mutation | Clear the `bookmark` source for `variables.tweet_id`. |
| `FavoriteTweet` | Mutation | As `CreateBookmark`, for `like`. |
| `UnfavoriteTweet` | Mutation | Clear the `like` source. |

Mutations are acted on only when the response reports success. Each source has a capture setting (both on by default); when a source is switched off, its timeline and mutations are ignored. Bookmark folder operations are deliberately absent from this table.

The Likes timeline of another user's profile is not visible on X, but the ownership check stays in place regardless: the profile user ID in the request variables must equal the logged-in account ID.

### 7.4 Extraction and normalisation

Extraction is deliberately tolerant of shape changes. Instead of following one fixed path into the response, `extract.ts` walks the JSON and collects candidates:

1. Find timeline **entries**: objects with an `entryId` string and a `sortIndex` string. Keep the sort index alongside whatever post is found inside.
2. Inside each entry (and anywhere else, for ambient timelines), find `tweet_results.result` objects.
3. Unwrap by `__typename`:
   - `Tweet`: use as is.
   - `TweetWithVisibilityResults`: use `.tweet`.
   - `TweetTombstone` or `TweetUnavailable`: record as unavailable when it is in a source timeline, otherwise skip.
4. Skip promoted entries (entry IDs beginning `promoted`, or content carrying promoted metadata).

`normalise.ts` maps a raw result to a `Post`. Each field tries a list of known locations in order, because X has moved fields before:

| Field | Locations to try, in order |
| --- | --- |
| `id` | `rest_id` |
| `text` | `note_tweet.note_tweet_results.result.text`, `legacy.full_text` |
| `createdAt` | `legacy.created_at` |
| `author.id` | `core.user_results.result.rest_id` |
| `author.handle` | `core.user_results.result.core.screen_name`, `core.user_results.result.legacy.screen_name` |
| `author.name` | `core.user_results.result.core.name`, `core.user_results.result.legacy.name` |
| `author.avatarUrl` | `core.user_results.result.avatar.image_url`, `core.user_results.result.legacy.profile_image_url_https` |
| `media` | `legacy.extended_entities.media[]`, `legacy.entities.media[]` |
| `urls` | `legacy.entities.urls[]` (expanded and display forms) |
| `quotedId` | `quoted_status_result.result.rest_id`, `legacy.quoted_status_id_str` |
| `lang` | `legacy.lang` |
| `sensitive` | `legacy.possibly_sensitive` |

A quoted post is normalised and stored as its own record. Shortened `t.co` links in the text are replaced with their expanded form so that search works on real URLs.

A post is accepted only if it has a numeric-string `id` and an author handle. Everything else is optional.

### 7.5 Detecting breakage

Shape changes must be visible, not silent.

- If a **source timeline** response arrives and extraction yields zero posts while the response is larger than a small threshold, the bridge raises a `capture-degraded` state.
- The capture banner then shows a warning, and the popup shows "Capture may be broken, check for an update".
- A debug mode (off by default, in settings) logs to the console only the **key paths** of an unparseable response, never values, so that a user can paste it into a bug report without leaking content.

### 7.6 Fallback from the DOM

When the user tags a post that is missing from the seen cache (for example after the service worker and page have been open for a long time), a minimal record is built from the page:

| Data | Selector (to verify) |
| --- | --- |
| Post container | `article[data-testid="tweet"]` |
| Post ID and handle | the permalink `a[href*="/status/"]` that contains a `time` element |
| Created at | `time[datetime]` |
| Text | `[data-testid="tweetText"]` |
| Display name | `[data-testid="User-Name"]` |

The record is flagged `partial: true`. It is upgraded to a full record the next time the post passes through the interceptor.

### 7.7 Identifying the account

The logged-in account's numeric ID is needed to keep libraries separate and to apply the Likes ownership check. Source, to verify: the `twid` cookie, read through `document.cookie` in the isolated world, in the form `u%3D<id>`. Only the numeric ID is extracted and kept. If it cannot be determined, capture is paused and the banner says so; posts are never stored against an unknown account.

### 7.8 Auto-scroll

Runs in the content script, only on a source timeline page, and only after the user presses the button.

- Scrolls by roughly one viewport, then waits for the next source response or 1.5 to 3 seconds (randomised), whichever is later.
- Stops when the user presses Stop, switches tab, or navigates; when two consecutive scrolls bring no new posts; or when any response returns an error status (for example rate limiting). It does not retry by itself.
- Never issues requests of its own. It only scrolls.

## 8. Injected UI

- **Mounting.** One shadow root per injected control, with styles adopted through a shared constructable stylesheet. A single `MutationObserver` on the primary column finds new `article[data-testid="tweet"]` elements and mounts a tag button into the action bar (the `[role="group"]` row, before the element containing `[data-testid="bookmark"]` or `[data-testid="removeBookmark"]`). The observer callback is batched with `requestAnimationFrame`.
- **Recycling.** X virtualises its timeline and reuses DOM nodes. Each mount is tagged with the post ID it was created for and is re-bound when that changes.
- **Tag state for visible posts.** The content script asks the service worker for the tags of visible post IDs in one batched request, and subscribes to changes so that edits in the library or another tab are reflected.
- **Popover.** A single instance per tab, portalled to a shadow root on `document.body`, positioned with a small in-house routine (flip and shift only).
- **Navigation.** x.com is a single-page application. Route changes are detected through WXT's location-change event, and the capture banner is mounted or removed accordingly.
- **Theme.** Tokens are chosen from the computed background colour of `body`, re-evaluated when its `style` attribute changes.
- **Failure.** If the action bar cannot be found for a post, that post is skipped. After repeated failures across a session, the content script reports `inline-ui-degraded` to the service worker, which surfaces it in the popup.

All selectors live in `entrypoints/x.content/dom/selectors.ts` so that a layout change is a one-file fix.

## 9. Data model

### 9.1 Types

```ts
type PostId = string;      // numeric string; exceeds Number.MAX_SAFE_INTEGER
type AccountId = string;   // numeric string
type TagId = string;       // random 16-character ID

type SourceKind = "bookmark" | "like";

interface Post {
  accountId: AccountId;
  id: PostId;
  url: string;                       // https://x.com/<handle>/status/<id>
  text: string;
  createdAt: number | null;          // epoch ms
  lang?: string;
  author: {
    id?: string;
    handle: string;
    name: string;
    avatarUrl?: string;
  };
  media: Array<{
    kind: "photo" | "video" | "gif";
    url: string;                     // remote URL only; no blobs stored
    previewUrl?: string;
    alt?: string;
  }>;
  links: Array<{ url: string; display: string }>;
  quotedId?: PostId;
  sensitive: boolean;

  // Indexed flags are 0 | 1, because booleans are not valid IndexedDB keys.
  isBookmark: 0 | 1;
  isLike: 0 | 1;
  hasTags: 0 | 1;                    // denormalised; maintained by repo.ts
  bookmarkSort?: string;             // zero-padded timeline sort index
  likeSort?: string;

  partial: boolean;                  // built from the DOM fallback
  unavailable: boolean;              // tombstoned on X
  firstSeenAt: number;
  lastSeenAt: number;
  savedAt: number;                   // when it entered the library
}

interface Tag {
  accountId: AccountId;
  id: TagId;
  name: string;                      // display form
  nameKey: string;                   // NFKC, trimmed, lower-cased
  color: number;                     // palette index, 0 to 11
  createdAt: number;
  lastUsedAt: number;
}

interface PostTag {
  accountId: AccountId;
  postId: PostId;
  tagId: TagId;
  taggedAt: number;
}

interface Meta {
  key: string;                       // e.g. "lastExportAt", "captureComplete:bookmark"
  accountId: AccountId | "";
  value: unknown;
}
```

Notes:

- Posts quoted by a saved post are stored with `isBookmark`, `isLike` and `hasTags` all `0`. The library hides such records unless they are referenced by a visible post. A cleanup pass removes orphans.
- Sort indexes are stored as fixed-width, zero-padded strings so that string comparison matches numeric order.
- Tag use counts are computed with a count on the `postTags` index, not stored, so they cannot drift.

### 9.2 Dexie schema

```ts
db.version(1).stores({
  posts:
    "[accountId+id], [accountId+isBookmark+bookmarkSort], [accountId+isLike+likeSort], " +
    "[accountId+hasTags+savedAt], [accountId+savedAt], [accountId+author.handle]",
  tags: "[accountId+id], &[accountId+nameKey], [accountId+lastUsedAt]",
  postTags: "[accountId+postId+tagId], [accountId+tagId+taggedAt], [accountId+postId]",
  meta: "[accountId+key]",
});
```

Rules:

- All writes go through `repo.ts`. Any write that touches `postTags` runs in a transaction that also updates `posts.hasTags` and `tags.lastUsedAt`.
- Upserting a post merges: source flags are OR-ed, `firstSeenAt` and `savedAt` keep the earliest value, a full record replaces a partial one, and a partial record never overwrites a full one.
- Schema changes add a new `db.version(n)` with an upgrade function. Old versions are never edited.

### 9.3 Settings

Stored in `storage.local` under one key, validated on read, with defaults applied for missing fields. `storage.sync` is not used in v1, so nothing leaves the device.

## 10. Messaging

Content scripts talk to the service worker over `runtime.sendMessage` for requests and a long-lived `runtime.connect` port for subscriptions. Every message is defined in `src/messaging/protocol.ts` as a discriminated union with a Valibot schema, and validated on receipt.

| Message | Direction | Purpose |
| --- | --- | --- |
| `posts/upsert` | content → worker | Store posts from a source timeline or mutation. Payload capped at 200 posts. |
| `posts/clear-source` | content → worker | A bookmark or like was removed. |
| `tags/for-posts` | content → worker | Tags for a batch of visible post IDs. |
| `tags/suggest` | content → worker | Autocomplete: prefix, limit. |
| `tags/set` | content → worker | Add or remove tags on one post; creates tags as needed; includes the post record when it is not yet stored. |
| `capture/status` | content → worker | Counts and completion state for the banner. |
| `health/report` | content → worker | `capture-degraded` or `inline-ui-degraded`. |
| `tags/changed` | worker → content (port) | Push updates for subscribed post IDs. |
| `settings/changed` | worker → content (port) | Push settings updates. |

The service worker can be stopped by the browser at any time. It therefore keeps no state in memory that matters: every handler opens the database on demand, and the content script reconnects its port when it drops.

The worker checks `sender.id` and, for content-script messages, that `sender.url` is on an allowed host.

## 11. Library application

- **Data access.** Opens Dexie directly. Lists are driven by live queries, so changes made on x.com appear without a reload.
- **Filtering.** Source and single-tag filters use the compound indexes. Multi-tag filters fetch the post ID set for each tag from `postTags` and intersect (Match All) or union (Match Any) in memory.
- **Search.** On open, a MiniSearch index is built in a web worker from `text`, `author.handle` and `author.name` for the current account. It is updated incrementally from live-query changes. The query parser lifts `#tag` and `@handle` tokens out as structured filters and passes the rest to MiniSearch with prefix matching on the final term. Expected cost at 50,000 posts: an index build of a second or two, off the main thread, with the unfiltered list shown immediately.
- **Rendering.** A virtualised list with measured row heights. Avatars and thumbnails are loaded lazily from X's media hosts with `referrerpolicy="no-referrer"`. These image loads are the only network activity, and they are issued by the browser for `<img>` elements, not by extension code.
- **Sharing code.** The side panel imports the same app with a `compact` flag. The tag popover and tag chip components are shared with the injected UI.

## 12. Import and export

Export is a core feature. `src/transfer/` exposes one function, `exportPosts(scope, format)`, used by every entry point.

| | `json` | `csv` |
| --- | --- | --- |
| `scope: "library"` | All posts, tags and assignments for the account. | One row per library post. |
| `scope: { postIds }` | The given posts, the tags they use, and their assignments. | One row per given post. |

The library's "Export view" resolves the current filter to a list of post IDs and passes it as the scope, so the export always matches what is on screen.

### 12.1 JSON format

```json
{
  "format": "xorganize",
  "version": 1,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "accountId": "0000000000",
  "tags": [{ "id": "…", "name": "rust", "color": 3, "createdAt": 0 }],
  "posts": [{ "id": "…", "text": "…", "author": { "handle": "…", "name": "…" }, "isBookmark": 1, "isLike": 0 }],
  "postTags": [{ "postId": "…", "tagId": "…", "taggedAt": 0 }]
}
```

- Each post carries its source flags (`isBookmark`, `isLike`), so bookmarks and likes travel in the same file.
- Export builds a `Blob` and triggers a download named `xorganize-export-YYYY-MM-DD.json`. A single-tag view adds the tag name: `xorganize-export-recipes-YYYY-MM-DD.json`.
- A scoped file has the same format as a full one, with `"scope": "partial"` added. It is importable like any other.
- The file contains library data only. It never contains cookies, tokens or settings.
- The format version is independent of the database schema version. Importers must accept every earlier format version.

### 12.2 CSV format

UTF-8 with a byte order mark (so spreadsheet applications detect the encoding), RFC 4180 quoting, one header row.

| Column | Content |
| --- | --- |
| `post_id` | Post ID, as text. |
| `url` | Link to the post on X. |
| `author_handle` | Without the `@`. |
| `author_name` | |
| `posted_at` | ISO 8601, UTC. Empty if unknown. |
| `saved_at` | ISO 8601, UTC. |
| `sources` | `bookmark`, `like`, or both, separated by `;`. Empty for a post that is only tagged. |
| `tags` | Tag names separated by `;`. A `;` inside a tag name is not allowed at creation, so the column splits cleanly. |
| `text` | Full post text. |
| `media_urls` | Separated by a space. |

Cells that begin with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with a single quote, so that post text cannot be interpreted as a spreadsheet formula. CSV is export-only.

### 12.3 Import

- Import accepts JSON only. It validates the whole file against a schema before writing anything, then shows the preview described in the design.
- **Merge** matches tags by `nameKey` (so the same tag created on two machines is unified) and posts by ID, using the upsert rules in 9.2.
- **Replace** clears the account's data and writes the file, in one transaction. It is not offered for a file marked `"scope": "partial"`.

### 12.4 Test fixtures

Fixtures in `tests/fixtures/` are **hand-written or generated, never copied from real traffic**. Real responses contain other people's posts, account identifiers and tracking fields. A generator script produces fixtures of the right shape with placeholder IDs, handles such as `@example_user`, and lorem-ipsum text.

## 13. Security and privacy

| Risk | Mitigation |
| --- | --- |
| The page forges bridge messages | Schema validation, size caps, numeric-string checks on every ID. Worst case is junk posts in the user's own library. |
| Stored content used for script injection | All text is rendered as text nodes. No `innerHTML`, no `dangerouslySetInnerHTML`. Lint rule enforces this. |
| Malicious links in stored posts | Only `https:` URLs are stored. Links open with `rel="noopener noreferrer"`. |
| Credential exposure | The interceptor never reads request headers. No cookie other than the account ID portion of `twid` is read. The extension requests no `cookies` permission. |
| Data leaving the device | No `fetch`, `XMLHttpRequest`, `WebSocket` or `sendBeacon` calls in extension code. A unit test scans the built bundle for these and fails if any appear outside the interceptor's wrappers. |
| Formula injection through CSV export | Cells with a leading formula character are neutralised (12.2). |
| Malicious import file | Full schema validation before any write, with limits on string lengths and counts. |
| Supply chain | Lockfile committed, minimal dependencies, dependency review in CI, reproducible build instructions so that a store package can be compared with the source. |
| X storing or reading extension data | Database is under the extension origin, not `x.com`. Injected UI uses closed shadow roots. Tag names are visible in the page's DOM tree only while the popover is open. |

Privacy statement for the store listing and README: the extension collects nothing, transmits nothing, and stores everything locally.

## 14. Testing

| Layer | What is covered |
| --- | --- |
| Unit: capture | Extraction and normalisation against synthetic fixtures for every operation, including each alternate field location, tombstones, promoted entries, quoted posts, long-form text and malformed input. |
| Unit: database | Upsert merge rules, tag transactions, `hasTags` maintenance, migrations (using `fake-indexeddb`). |
| Unit: transfer | Round-trip export and import, merge and replace, scoped export, CSV quoting and formula neutralisation, rejection of invalid files. |
| Unit: search | Query parsing and filter composition. |
| Component | Tag popover keyboard behaviour and accessibility roles. |
| End to end | Playwright loads the built extension against `tests/e2e/mock-site`, a static site that imitates x.com's markup and serves fixture responses. Covers capture, inline tagging, the library and export. |
| Manual | A checklist run against live x.com before each release, since automated tests cannot use a real account. |

CI never logs in to X and holds no X credentials.

## 15. Build, CI and release

- **Scripts:** `dev`, `dev:firefox`, `build`, `build:firefox`, `zip`, `typecheck`, `lint`, `test`, `test:e2e`.
- **CI (GitHub Actions):** on every pull request, run typecheck, lint, unit tests, a build for both browsers, and the end-to-end suite on Chromium. Run a secret scanner (gitleaks) over the diff.
- **Releases:** a version tag builds both zips and attaches them to a GitHub release. Store submission is manual at first.
- **Versioning:** semantic versioning. The changelog flags any release that includes a database migration.
- **Licence:** MIT. Copyright is held by "xorganize contributors".

## 16. Repository hygiene

The repository is public, so the following never get committed:

- Captured traffic (`*.har`, raw response dumps). These contain session cookies and bearer tokens.
- Personal library exports.
- Signing keys, store credentials and `.env` files.
- Local editor, agent and assistant configuration.
- Screenshots that show a real account, real handles or real post content. Documentation screenshots are taken against the mock site.

`.gitignore` covers the file patterns. The CI secret scan is the backstop. Bug report templates ask reporters not to attach HAR files and to use the key-path debug output from 7.5 instead.

## 17. Milestones

| Milestone | Scope | Done when |
| --- | --- | --- |
| M0 Skeleton | WXT project, both content scripts, service worker, empty library page, CI. | The extension loads and CI is green. |
| M1 Capture | Interceptor, bridge, extraction, normalisation, database, account detection, capture banner without auto-scroll, for both the Bookmarks and Likes timelines. Verify every assumption in section 18. | Scrolling the Bookmarks page and the Likes tab fills the database, confirmed against a real free account. |
| M2 Tagging | Tag button, popover, seen cache, DOM fallback, tag messages. | A post can be tagged from any timeline and the state survives a reload. |
| M3 Library | Sources, tag sidebar, post cards, virtualised list, search, tag management. | A tagged post can be found by tag and by text. |
| M4 Export | JSON and CSV export for the whole library and the current view, import with merge and replace, backup reminder, delete all. | Export then import into a clean profile reproduces the library, and a single tag can be exported to CSV. |
| M5 Live capture | Bookmark and like mutations, tag prompt toast, auto-scroll. | Bookmarking or liking a post anywhere adds it without visiting the Bookmarks or Likes page. |
| M6 Release | Side panel, popup, settings, welcome page, bulk actions, accessibility pass, Firefox build, store listing. | Published to the Chrome Web Store and Firefox Add-ons. |

Later candidates: Markdown export, optional encrypted sync, saved searches, Firefox for Android.

## 18. Assumptions to verify in M1

Each of these is from observed behaviour and has not been confirmed for this spec.

1. The web client calls `/i/api/graphql/<id>/<OperationName>` and the operation names in 7.3 are current.
2. Which of `fetch` and `XMLHttpRequest` the client uses for these calls. The interceptor wraps both regardless.
3. A MAIN-world script declared at `document_start` runs before the client captures references to `fetch` and `XMLHttpRequest`.
4. Timeline entries carry `entryId` and `sortIndex`, and the bookmark sort index orders by time bookmarked.
5. The field locations listed in 7.4.
6. Mutation request bodies carry the post ID at `variables.tweet_id`.
7. The `twid` cookie is readable from script and has the form `u%3D<id>`.
8. The DOM attributes listed in 7.6 and section 8.
9. Whether the Bookmarks or Likes timelines stop returning results after a fixed number of posts, which would limit the first backfill.
10. Firefox behaviour for MAIN-world content scripts and the fallback when no side panel is available.
