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
| Styling | Plain CSS with custom properties. On x.com in a shadow root with X's tokens; in the library one token set per theme (DESIGN 7) | No runtime styling cost, full isolation from X's CSS. |
| Font | Inter, packaged with the extension (SIL Open Font License) | The library looks the same on every system, with no network request. Injected UI on x.com uses X's own font. |
| Storage | IndexedDB through Dexie 4 | Compound indexes, migrations, cross-context live queries. |
| Validation | Hand-written type guards, with size caps | Enough for the messages that exist today. A schema library (Valibot) is to be added when importing files needs it (M4). |
| Search | Our own substring index, in a web worker | No dependency. A search narrows the chosen view rather than ranking results, so a full-text library's tokenising and scoring would go unused. Its word splitting would also miss languages written without spaces. Measured at 50,000 posts: 1.3 s to read the library in the worker, then a few milliseconds per search (11). |
| List virtualisation | `@tanstack/virtual-core` | Renders only the rows near the viewport. No dependencies of its own; reads `navigator` only to detect iOS, and makes no network, storage or messaging calls. |
| Tests | Vitest (unit), Playwright (end to end against a mock site) | |
| Tooling | pnpm, ESLint, Prettier | |

Dependency policy: every runtime dependency must be justified in the pull request that adds it. No analytics, telemetry or error-reporting SDKs.

## 4. Architecture

```
                         x.com tab
┌───────────────────────────────────────────────────────────────┐
│  MAIN world                      ISOLATED world               │
│ ┌───────────────────┐  private    ┌─────────────────────────┐ │
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
│   │   ├── content.ts             # routes bridge messages in the content script
│   │   ├── pipeline.ts            # what to store from each response
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
│   ├── library/                   # what the library page shows: catalogue, views, thumbnails, format
│   ├── worker/
│   │   └── handler.ts             # routes runtime messages in the background worker
│   ├── search/                    # query parsing, the search worker's index, page-worker messages
│   ├── transfer/                  # export / import
│   ├── settings/
│   └── ui/                        # the tag popover, shared by x.com and the library
├── tests/
│   ├── fixtures/                  # synthetic responses only, see 12.4
│   ├── unit/
│   └── e2e/
│       └── mock-site/             # static pages imitating x.com markup
├── public/icons/
├── wxt.config.ts
├── package.json
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

Code in `src/` is given its dependencies (database, browser APIs, DOM, clock, timers), and only `entrypoints/` wires in the real ones. Each module has one responsibility: validation, pure decisions, effects, routing, wiring or UI. See [CONTRIBUTING.md](../CONTRIBUTING.md#code-quality).

## 6. Manifest and permissions

Privacy and security take priority over convenience and features. The extension asks for the least it can work with: **one host and no API permissions**. The manifest is generated by WXT from `wxt.config.ts`. As built today:

```json
{
  "manifest_version": 3,
  "name": "xorganize",
  "minimum_chrome_version": "116",
  "host_permissions": ["https://x.com/*"],
  "action": { "default_title": "Open xorganize library" },
  "background": { "service_worker": "background.js" },
  "content_security_policy": {
    "extension_pages": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  },
  "content_scripts": [
    {
      "matches": ["https://x.com/*"],
      "js": ["content-scripts/interceptor.js"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": ["https://x.com/*"],
      "js": ["content-scripts/x.js"],
      "run_at": "document_start"
    }
  ]
}
```

### 6.1 What is requested, and what is not

| Item | Status | Reason |
| --- | --- | --- |
| `https://x.com/*` | Requested | Read posts as they load and add the tag button. The only site the extension can touch. |
| `https://twitter.com/*` | Not requested | Every page there redirects to `x.com`, so it would be a permission with no use. |
| `storage` | Not requested | Settings are kept in IndexedDB (9.3), which needs no permission. |
| `unlimitedStorage` | Not requested | Only to be added if M1 shows the library can be evicted under storage pressure and `navigator.storage.persist()` does not prevent it. |
| `sidePanel` | Not requested | Only to be added if and when the side panel ships. The library tab does not need it. |
| `tabs`, `cookies`, `webRequest`, `scripting`, `downloads`, `debugger`, `<all_urls>` | Never | Not needed. Opening the library tab, downloading an export and picking a file to import all work without a permission. |
| `web_accessible_resources` | Never | Would let any web page test whether the extension is installed. |
| `externally_connectable`, external message listeners | Never | No web page or other extension can message this one. |
| Content scripts in subframes (`all_frames`) | Never | Only the top-level page is read. |

Rule for changes: a new permission, host, or manifest key needs its reason added to this table first. `tests/e2e/manifest.spec.ts` compares the built manifest against an exact list, so an addition cannot slip in unnoticed, including one introduced by a dependency or a framework upgrade.

### 6.2 Content security policy

The policy applies to every extension page and to the background worker.

- `connect-src 'none'`: the browser refuses any network request from extension code. "Nothing leaves the device" is enforced by the browser, not only promised by the code. The library's search worker runs under the same policy, and a test confirms it.
- `default-src 'none'` with `'self'` for scripts, styles, images and fonts: only files packaged with the extension can load, the library's font among them. No remote code, no inline script, no `eval`.
- `img-src` also allows `https://pbs.twimg.com`, X's image server, and nothing else. See below.
- `base-uri`, `form-action`, `frame-ancestors` are `'none'`: pages cannot be re-based, cannot submit forms anywhere, and cannot be framed.

**Images from X.** The library shows avatars and media thumbnails, so `img-src` allows X's image server. This was planned for M3 and brought forward. It is the only exception to "only packaged files", and it is deliberately narrow:

- One host. Avatars, photos and the still images of videos and gifs are all on `pbs.twimg.com`, confirmed against a real account on 2026-11-25. Video files (`video.twimg.com`) are never loaded, and X's default avatars (`abs.twimg.com`) are not allowed either: those posts show the author's initial instead. Code checks every URL against the same host before rendering it (`xImageUrl` in `src/hosts.ts`), so a URL from anywhere else becomes a placeholder rather than a request that the policy then refuses.
- No cookies. Every image is requested with `crossorigin="anonymous"`, so the browser leaves out cookies. Checked on 2026-11-25: `pbs.twimg.com` answers with `access-control-allow-origin` set to the requesting origin, `cross-origin-resource-policy: cross-origin`, and no `Set-Cookie`.
- No referrer. `referrerpolicy="no-referrer"` on each image and a `no-referrer` meta tag on the page.
- Images only. `connect-src` is still `'none'`, so extension code cannot read from that server with `fetch`. A test confirms this, and that an image from any other host is refused.
- Media marked as sensitive is not requested until the user asks for it.
- A setting turns images off. While it is off, the library requests nothing from X at all. It is on by default: each request reveals only the requesting IP address and an image address, to the company that already knows which posts this account has bookmarked and liked.

The trade-off: with images on, X's image server can see that this browser is looking at those images at that moment, from outside x.com.

The development server uses WXT's looser default policy for live reload. Production builds, and every automated test, use the strict one.

## 7. Capture pipeline

### 7.1 Interceptor (MAIN world)

Runs at `document_start`, before the site's own scripts, so it wraps the originals before the site can keep private references to them.

- Wraps `window.fetch`. After the original resolves, clones the response and reads the clone.
- Wraps `XMLHttpRequest.prototype.open` and `send`. Records the URL on `open` and the body on `send`, and adds a `load` listener.
- Considers only URLs matching `^https://x\.com/i/api/graphql/[^/]+/([A-Za-z]+)`. The captured group is the operation name.
- Forwards only operations listed in section 7.3. Everything else is ignored without being read.
- Sends `{ v: 1, kind: "response" | "mutation", op, payload }` to the isolated content script over the private channel described in 7.2. It never uses `window.postMessage`.

Rules for this file:

- It must never throw into the page and never change what the page receives. All work is inside `try`/`catch`, and the original return values are passed through untouched.
- It never reads or forwards request headers. Authorisation and CSRF headers never leave the page context.
- It stays dependency-free and under roughly 150 lines, so that it can be audited at a glance.
- It leaves nothing behind that the page can observe: no globals, no DOM changes, no messages, no unhandled rejections. A browser test loads a page that records all of these and asserts it sees nothing, and that every response and error reaches the page unchanged.
- The wrappers are proxies of the native functions, installed with the original property flags. They therefore keep the original `name` and `length`, and print as native code. Everything they rely on (`Reflect.apply`, `Promise.prototype.then`, the response and request accessors, `addEventListener`) is captured before any page script runs, so a page that later replaces those built-ins neither breaks the wrappers nor sees them at work.

What remains detectable, stated plainly, because reading responses requires wrapping page functions at all:

| Trace | Detail |
| --- | --- |
| Printed source | A wrapped function prints as `function () { [native code] }`, without its name. A site that compares against the exact native string can tell. |
| Identity | `window.fetch` is no longer the same object as the `fetch` of a freshly created iframe. |
| Stack traces | An error thrown synchronously inside a wrapped call has one extra frame, which names the extension's script URL and so its ID. |
| Built-ins used during a call | A few ordinary methods (`URL` parsing, string methods) are called while a request is examined. A page that replaces those could notice the calls. |

None of these is exposed by ordinary site code; each needs the site to look for it deliberately. They are accepted, and revisited if X is seen to act on them.

### 7.2 Bridge (ISOLATED world)

The two content scripts share the page's DOM and nothing else, so they need a channel through it. That channel must not let the page detect the extension, read the traffic, or inject messages. `window.postMessage` fails all three, since every script on the page can listen to it, so it is not used. (WXT's own content-script start-up message, which includes the extension's ID, is switched off for the same reason.)

The channel, in `src/messaging/bridge.ts`:

1. **Handshake before the page exists.** Both scripts run at `document_start`, before any page script. Each synchronously offers a random channel ID through a DOM event on `document`. Event dispatch is synchronous, so whichever script runs second reaches the first, and the exchange is finished before the page could have registered a listener.
2. **Random event names afterwards.** All later traffic uses event names derived from that ID (a fresh UUID per page load), which the page never sees and cannot guess. Payloads are JSON strings.
3. **Captured DOM functions.** The functions used to listen and dispatch are captured when the script loads. A page that later replaces them on the prototype sees none of the traffic.
4. **No lingering listener.** If the other script has not appeared by `DOMContentLoaded`, the waiting listener is removed, so the page cannot probe for it.

An automated test loads a page whose first script records every message event, every event dispatched from page JavaScript and every listener registration, and asserts that it records nothing while the handshake completes.

On top of that channel, the bridge:

- Still treats every payload as **untrusted** and passes it through a Valibot schema with size limits. Nothing from it is ever inserted as HTML. The channel is defence in depth, not a reason to trust its contents.
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

Mutations are acted on only when the response reports success. Both sources are always captured; there is no setting to switch one off (DESIGN, 4.7). Bookmark folder operations are deliberately absent from this table.

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

**Built** (`src/dom/post-from-page.ts`), for bookmark and like requests. Tagging will use it too.

When the user tags a post that is missing from the seen cache (for example after the service worker and page have been open for a long time), a minimal record is built from the page:

| Data | Selector (to verify) |
| --- | --- |
| Post container | `article[data-testid="tweet"]` |
| Post ID and handle | the permalink `a[href*="/status/"]` that contains a `time` element |
| Created at | `time[datetime]` |
| Text | `[data-testid="tweetText"]` |
| Display name | `[data-testid="User-Name"]` |

The record is flagged `partial: true`. It is upgraded to a full record the next time the post passes through the interceptor. A partial record never replaces the content of a full one: if the post is already stored in full, only its source changes.

### 7.7 Identifying the account

The logged-in account's numeric ID is needed to keep libraries separate and to apply the Likes ownership check. Source, to verify: the `twid` cookie, read through `document.cookie` in the isolated world, in the form `u%3D<id>`. Only the numeric ID is extracted and kept. If it cannot be determined, capture is paused and the banner says so; posts are never stored against an unknown account.

The library shows the account that most recently stored a post, by capture or by tagging (`rememberAccount` in `repo.ts`), or the one chosen in its header's account menu (`chooseAccount`), which only offers accounts that hold something here.

**The account's @handle and picture** (built), for the library's header and Settings, which would otherwise name an account only by its ID. Both are read on each check for new posts, and only while the account's ID is known (`src/dom/viewer-profile.ts`):

- The handle comes from the address of X's link to the signed-in account's own profile (`SELECTORS.profileLink`, whose `href` is `/<handle>`).
- The picture comes from the `src` of the avatar in X's account button (`SELECTORS.accountSwitcher`), and only from the avatar container named after that same handle. It is kept only if it is a profile picture on X's image server (`isXAvatarUrl` in `src/hosts.ts`: https, `pbs.twimg.com`, `/profile_images/`, no query).

Nothing else on that link or button is read. They are sent as `account/seen` (10) when first read and when either changes, and stored as the `[accountId, 'profile']` row of `meta` (9.3). The library loads the picture like any image from X (6.2): without cookies or a referrer, and not at all while images from X are off. The trade-off: the handle and picture's address are stored once x.com is open while signed in, even before anything has been captured, as X's theme is (8). They never leave the device, and Delete all data removes them.

### 7.8 Auto-scroll

Runs in the content script, only on a source timeline page, and only after the user presses the button.

- Scrolls by roughly one viewport, then waits for the next source response or 1.5 to 3 seconds (randomised), whichever is later.
- Stops when the user presses Stop, switches tab, or navigates; when two consecutive scrolls bring no new posts; or when any response returns an error status (for example rate limiting). It does not retry by itself.
- Never issues requests of its own. It only scrolls.

## 8. Injected UI

**Built so far:**

- **Status line** (`entrypoints/x.content/banner.ts`). After each captured page of bookmarks or likes it shows the account's running total for that source, at the bottom centre of the window, and hides when the address changes. It also reports a tag change that could not be saved. It lives in a closed shadow root with a constructed stylesheet, takes no input (`pointer-events: none`), and is given its text with `textContent`.
- **Tag button** (`entrypoints/x.content/inline/tag-button.ts`), one per post, placed just before the element holding X's bookmark button, or at the end of the action bar when there is none. A post's ID comes from its own permalink, the first status link around a timestamp (`postIdOf` in `src/dom/post-from-page.ts`); adverts have none, so they get no button. Buttons appear only while an account is signed in.
- **Tag popover** (`src/ui/popover.tsx` and `TagPopover.tsx`, Preact), one per tab, shared with the library (11). It is given the window it runs in, and the anchor it opens from: a tag button here, a card's `[+]` there. Its behaviour is in pure functions in `src/inline/` (`popover-model.ts`, `position.ts`). If Enter is pressed before the suggestions for the typed text have arrived, they are fetched first and the best match applied, so typing a few letters and pressing Enter uses the existing tag instead of creating a new one from those letters. The popover's host is removed from the page when it closes.
- **Theme** (`src/dom/theme.ts`, `src/inline/change-report.ts`). Read from the computed background colour of `body` before each check for new posts, and whenever the `style` or `class` of the root element or `body` changes (`entrypoints/x.content/inline/theme-watcher.ts`): a change in X's display settings only restyles the page and adds no elements, so the check for new posts alone would miss it. The tag button and popover take X's matching tokens, and buttons already on the page are re-themed when it changes. The theme is sent to the worker as `theme/seen` (10) when first read and whenever it changes, never more often, so that the library can match it (9.3).
- **Account handle and picture** (`src/dom/viewer-profile.ts`, `src/inline/change-report.ts`). Read before each check for new posts from X's link to the signed-in account's profile and from its account button, and sent as `account/seen` (10) when first read and whenever they or the account change (7.7).
- **Tag state** (`src/inline/tag-state.ts`): tags of the posts on screen, requested in one batch per task, kept current through the `tags` port (`src/inline/tags-port.ts`). Changes are optimistic and put back if the worker refuses them (`src/inline/tagger.ts`).
- **Tag prompt** (`entrypoints/x.content/inline/prompt-toast.ts`, DESIGN 4.3). After a bookmark or like made on X is stored, when the worker's reply says to prompt (9.3, 10), a toast offers Add tags, which opens the popover from the post's tag button. It shows only when one of that post's buttons is wholly on screen (`firstInView` in `src/inline/prompt.ts`), and checks again on Add tags, since the post may have scrolled away. Its five seconds pause while the pointer is over it or focus is in it (`createDismissTimer`). Plain DOM in a closed shadow root, kept from the page like the popover (keyboard guard, `contain`), and in the page only while it shows.
- **Keeping input from the page** (`src/inline/keyboard-guard.ts`). Key, input, composition and clipboard events are composed: they leave a shadow root and travel through the page, retargeted to the host. So the page could read what is typed into the popover, and X's single-key shortcuts would fire while typing. A capture listener on `window`, added at `document_start` before any page script, stops these events when they are aimed at an extension host and hands them to that host's handler. Stopping propagation does not prevent the default action, so typing still types. Pointer events are stopped at the host as they bubble out, so a click on the tag button does not also open the post. What the page can still see: that the pointer went down on a host; the Alt key of the Alt+T shortcut, which goes down while focus is still on X's post; and, when the popover was opened that way, the Escape that closed it coming up on the post, where focus returns. The tag button's own handler takes Alt+T, since keys aimed at it never reach the shortcut's listener on the window.

The rest of this section describes the design. Where it differs from what is built, what is built is described above.

- **Mounting.** One shadow root per injected control, with styles adopted through a shared constructable stylesheet. A single `MutationObserver` on the primary column finds new `article[data-testid="tweet"]` elements and mounts a tag button into the action bar (the `[role="group"]` row, before the element containing `[data-testid="bookmark"]` or `[data-testid="removeBookmark"]`). The observer callback is batched with `requestAnimationFrame`.
- **Recycling.** X virtualises its timeline and reuses DOM nodes. Each mount is tagged with the post ID it was created for and is re-bound when that changes.
- **Tag state for visible posts.** The content script asks the service worker for the tags of visible post IDs in one batched request, and subscribes to changes so that edits in the library or another tab are reflected.
- **Popover.** A single instance per tab, portalled to a shadow root on `document.body`, positioned with a small in-house routine (flip and shift only).
- **Navigation.** x.com is a single-page application. Route changes are detected through WXT's location-change event, and the capture banner is mounted or removed accordingly.
- **Theme.** Tokens are chosen from the computed background colour of `body`, re-evaluated when the `style` or `class` of the root element or `body` changes. The theme is also sent to the worker when first read and whenever it changes (`theme/seen`, 10), so the library can match it (9.3).
- **Failure.** If the action bar cannot be found for a post, that post is skipped. After repeated failures across a session, the content script reports `inline-ui-degraded` to the service worker, which surfaces it in the popup.

All selectors live in `src/dom/selectors.ts` so that a layout change is a one-file fix.

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
  unbookmarkedAt?: number;           // when it was seen to leave a source it is no longer in
  unlikedAt?: number;

  partial: boolean;                  // built from the DOM fallback
  unavailable: boolean;              // tombstoned on X
  firstSeenAt: number;
  lastSeenAt: number;                // set by every capture and import; search reads posts changed since
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
  key: string;                       // e.g. "lastBackupAt", "captureComplete:bookmark"
  accountId: AccountId | "";
  value: unknown;
}
```

Notes:

- Posts quoted by a saved post are stored with `isBookmark`, `isLike` and `hasTags` all `0`. The library hides such records unless they are referenced by a visible post. A cleanup pass removes orphans.
- Sort indexes are stored as fixed-width, zero-padded strings so that string comparison matches numeric order. Two other kinds of key cover posts with no index yet. A post the user has just bookmarked or liked gets a key built from the time, prefixed with `~`, which sorts above every real index: newest first, at the top. A post known to be bookmarked or liked only because the API said so when it appeared in another timeline gets a key built from the post's own date, prefixed with `!`, which sorts below every real index: when it was bookmarked or liked is not known, so it must not be shown as if it were recent. Either is replaced by the real index when the timeline supplies it.
- Sources follow two signals. A post arriving through a bookmarks or likes timeline, or through a bookmark or like request, gets that source. For the other source, the post's own `legacy.bookmarked` and `legacy.favorited` fields are followed when present, so a post seen in the bookmarks timeline that is also liked is recorded as both, and one that has since been unliked elsewhere loses the like.
- When a source is removed and the post has no other source and no tags, the post is deleted (DESIGN, 5.7). A post that stays records when it left the source, as `unbookmarkedAt` or `unlikedAt`, by an unbookmark or unlike request (`clearSource`) or by X's own flag on a later capture (`mergePost`, `lostAt`). The time is removed when the post is back in the source. Neither is indexed: only the card reads them (`postLabels` in `src/library/format.ts`).
- Tag use counts are computed with a count on the `postTags` index, not stored, so they cannot drift.
- Tagging a post that is not yet stored stores it from the copy the page loaded: from the seen cache when it is there, otherwise from the page itself, flagged partial (7.6). Its bookmark and like flags follow what the API reported, as for any captured post; tagging never sets them (DESIGN, decision 4). A post whose last tag is removed and that has no source is deleted. A tag on no post is kept, for later use, until it is deleted in the library.
- Tag management (`src/db/tags.ts`). Renaming keeps the tag's ID, so every post follows, and refuses a name another tag has. Merging moves each post's link to the other tag, keeping the earlier `taggedAt` where a post carried both, and deletes the first tag. Deleting a tag removes its links, clears `hasTags` on posts left with none, and removes posts left with no tag and no source. Removing a post from the library (`removePost` in `repo.ts`) deletes it with its links.
- Tag names (`src/tags/names.ts`): NFKC-normalised, trimmed, inner runs of white space collapsed to one space, at most 50 characters as a person counts them, no semicolon, and no control, formatting or separator characters except the zero-width joiner that emoji sequences use. The comparison key is that name lower-cased. A new tag gets the lowest palette colour not yet in use, or the least used one once all twelve are (`src/tags/palette.ts`).

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

// Posts by when they were last stored from X, so that search re-reads only
// what changed (11). The field already existed, so nothing needs upgrading.
db.version(2).stores({ posts: "<the version 1 indexes>, [accountId+lastSeenAt]" });
```

Rules:

- All writes go through `src/db/repo.ts` (posts, settings) and `src/db/tags.ts` (tags). Any write that touches `postTags` runs in a transaction that also updates `posts.hasTags` and `tags.lastUsedAt`.
- Upserting a post merges: source flags are OR-ed, `firstSeenAt` and `savedAt` keep the earliest value, a full record replaces a partial one, and a partial record never overwrites a full one.
- Schema changes add a new `db.version(n)` with an upgrade function. Old versions are never edited.

### 9.3 Settings

Stored as one `settings` row in the `meta` table of the same IndexedDB database, validated on read, with defaults applied for missing fields or values of the wrong type (`readSettings` in `repo.ts`). The settings are `remoteImages` (6.2), `backupReminderDays` (7, 30, 90, or 0 for never; 30 by default; any other value reads as the default), `theme` (`x`, `system`, `light`, `dim` or `dark`; `x`, Match X, by default; any other value reads as the default), and `promptAfterBookmark` and `promptAfterLike` (DESIGN 4.3; on and off by default). The theme last seen on x.com is not a setting: the worker keeps it as the `['', 'xTheme']` row of `meta` (`light`, `dim` or `dark`; anything else is ignored), from `theme/seen` (10). It is written only when it differs from the stored one (`recordXTheme` in `repo.ts`), so that an open library, which reads it with the catalogue, does not re-read for nothing. Delete all data removes it with the other rows, and the library then follows the system until x.com is visited again. Each account's @handle and picture (7.7) are kept the same way, as the `[accountId, 'profile']` row, from `account/seen` (`recordProfile`); a row without a valid handle is ignored, and so is a picture that is not on X's image server. This avoids the `storage` permission altogether. Content scripts cannot open the database. The only settings x.com needs so far are the two prompts, and the worker applies them itself: its reply to a post just added on X says whether to prompt (`prompts` in `repo.ts`, 10). So nothing about settings is pushed to the page, and the prompt never shows for a post that was not stored. Nothing is synced, so nothing leaves the device.

## 10. Messaging

Content scripts talk to the service worker over `runtime.sendMessage` for requests and a long-lived `runtime.connect` port for subscriptions. Every message is defined in `src/messaging/protocol.ts` as a discriminated union with a hand-written guard and size caps, and validated on receipt (see section 3 on Valibot).

| Message | Direction | Purpose |
| --- | --- | --- |
| `capture/posts` | content → worker | Store posts from a bookmarks or likes timeline, or one the user just bookmarked or liked, with referenced posts and the IDs of unavailable ones. Capped at 200 items. The reply carries the account's new totals. A post just bookmarked or liked is sent alone and marked `added`; the reply to it also carries `prompt: true` when the settings ask to offer tags for it (9.3). |
| `capture/clear` | content → worker | A bookmark or like was removed. The reply carries the account's new totals. |
| `tags/for-posts` | content → worker | **Built.** Tags for up to 100 visible post IDs. The reply lists each post's tags in the order they were applied. |
| `tags/suggest` | content → worker | **Built.** Autocomplete: the typed text and a limit of up to 20. Names that start with the text come first, then names that contain it, each by use count. The reply also carries the five most recently used tags. |
| `tags/set` | content → worker | **Built.** Adds tags by name and removes them by ID on one post, up to 20 of each, creating tags as needed. Carries the post record when the page has it, so that a post not yet stored can be. The reply carries the post's tags afterwards. |
| `health/report` | content → worker | `capture-degraded` or `inline-ui-degraded`. |
| `theme/seen` | content → worker | **Built.** The theme x.com shows, `light`, `dim` or `dark`, and nothing else. Sent when the content script first reads it and when it changes. The worker stores it as `xTheme` (9.3). |
| `account/seen` | content → worker | **Built.** The signed-in account's ID, its @handle as x.com shows it and, when shown, its picture on X's image server, and nothing else. Sent when the content script first reads them and when they change. The worker stores the handle and picture for the library's header (7.7, 9.3). |
| `tags/changed` | worker → content (port) | **Built.** After every successful `tags/set`, sent to every open `tags` port: account, post ID and its tags. A content script ignores changes for an account other than its own. |
| `tags/edited` | library → worker (channel) | **Built.** After every tag or post change made in the library, on the `xorganize-tags` `BroadcastChannel`. Carries only the account. |
| `tags/refresh` | worker → content (port) | **Built.** Passed on from `tags/edited` to every open `tags` port. A content script for that account asks again for the tags of every post it shows. |
| `settings/changed` | worker → content (port) | Push settings updates. Not built: no setting needs it yet, since the prompt settings come with the capture reply. |

Ports are opened with the name `tags` and are accepted only from senders that pass the same check as messages. The worker keeps them in memory only. When the browser stops the worker, the ports close, and each content script reconnects when it next needs to, and then asks again for what it shows.

The library writes to the database itself, so the worker does not see its changes. It announces them on a `BroadcastChannel` instead. A channel reaches only contexts of the same origin, the extension's, so neither x.com nor the content scripts running there can hear or send on it, and the runtime message checks above stay as they are. A notice cannot wake a stopped worker, and need not: a stopped worker has no open ports, and each content script catches up when it reconnects.

The service worker can be stopped by the browser at any time. It therefore keeps no state in memory that matters: every handler opens the database on demand, and the content script reconnects its port when it drops.

The worker checks `sender.id`, that the message comes from the top frame, and that `sender.url` is on the allowed host.

## 11. Library application

- **Data access.** Opens Dexie directly. Lists are driven by live queries, so changes made on x.com appear without a reload.
- **Filtering** (built, `src/library/browse.ts` and `select.ts`). The page lists post IDs, not posts. It reads a catalogue once each time the library changes, from the indexes alone:
  - bookmarks and likes from their sort indexes, tagged posts from `hasTags`, and every post in the order it was saved;
  - every tag with the posts carrying it, from one pass over the `postTags` index.

  Every view is then worked out from the catalogue in memory, so a change of source, tag, sort or search takes tens of milliseconds at 50,000 posts. Reading the catalogue takes about a second at that size, and is not repeated per view. "All" is the union of the sources, so posts stored only because a saved post quotes them are never listed. "Tagged only" is tagged with neither source, "Untagged" has a source and no tag. Selected tags are intersected (Match All) or united (Match Any).
- **Order** (built). "Saved" is the timeline's own order for Bookmarks and Likes, and the order posts entered the library (`savedAt`) otherwise. "Post date" sorts by post ID: X's IDs grow with time, so no date index is needed. "Author" reads handles from the `author.handle` index and sorts them ignoring case, each author's posts newest first. Reading handles walks the index one entry at a time (about 2 s at 50,000 posts), so it happens only while that order is chosen, with the saved order shown until it is ready.
- **Search** (built, `src/search/`). The query parser (`query.ts`) lifts out `#tag` and `@handle` tokens. Double quotes keep spaces in a phrase or a tag name, and the last token, while still being typed, matches by how names start.
  - **Tags** are matched against the catalogue on the page.
  - **Text and authors** go to a web worker (`entrypoints/library/search-worker.ts`, logic in `service.ts`). It opens the database itself, reads the account's posts a page of 1,000 at a time, and holds each post's text, handle and name, lower-cased and without accents. A post matches when it contains every term, anywhere in a word; `@` handles must match one of those given.
  - **Keeping current.** The worker watches the IDs and the posts stored since it last read, through the `lastSeenAt` index and a live query. A new, changed or removed post therefore updates the results while the page is open, without re-reading the library.
  - **Cost** at 50,000 posts, measured in Chromium: 1.3 s to read the library, off the main thread, while the list is already shown. After that, 25–45 ms from a keystroke to the updated list, and about 26 MB of text in the worker.
  - **Messages.** Both directions are checked (`protocol.ts`) and capped at 50 terms of 500 characters each. Each search carries a sequence number, so a late answer to an earlier one is ignored.
- **Rendering** (built). A list that scrolls with the page and renders only the cards near the viewport, with measured heights. Post contents, tags and quoted posts are read only for those cards, a page of 25 at a time, so memory does not grow with the library. Long text is cut to four lines with Show more. Avatars and thumbnails are loaded lazily from X's image server without cookies or a referrer (6.2). These image loads are the only network activity. They are issued by the browser for `<img>` elements, not by extension code, and can be turned off in settings. Photos are requested at X's `small` size. Up to four thumbnails are shown per post.
- **Tag management** (built). A tag's menu in the sidebar renames, recolours, merges and deletes (9.1), and "+" creates a tag on no post (`createTag` in `src/db/tags.ts`), refusing a name in use. Before a deletion, the page works out from the catalogue how many posts carry the tag and how many it alone keeps in the library (`src/library/tag-actions.ts`), and says so. Every change is announced to the worker (10, `src/library/edits.ts`).
- **Card actions** (built). The tag button opens the tag popover, with the tag state and optimistic changes used on x.com, reading and writing the database directly (`src/library/tagging.ts`). Copy link uses `navigator.clipboard.writeText`, which needs no permission when the user has just clicked. Remove from library acts at once, with Undo in a toast. A tag chip on a card chooses that tag, as in the sidebar.
- **Keyboard** (built, `src/library/shortcuts.ts`). Single keys outside a field or a dialog: `/`, `j`, `k`, `t`, `o` and `?`. Cards take focus, and a card not yet rendered is scrolled to and focused once it is. The library runs the same keyboard guard as x.com (8), so what is typed in the popover never reaches its shortcuts.
- **Export** (built). Beside Sort, the Export menu offers JSON and CSV for the posts listed; in Settings, "Back up now" saves a JSON backup and "Export CSV" the whole library as CSV (12). `createLibraryExport` resolves to the count and the file's name. A toast says how many posts went out and as what, or, for a backup, the file's name (`exportMessage` and `backupMessage` in `src/library/view-export.ts`).
- **Import** (built). In Settings, "Choose a file…" picks a JSON file; an empty library offers "Restore from a backup" instead. The file is checked, previewed, then merged or replaces the library (12.3). Why a file was refused, and what an import wrote, are said in a toast.
- **Backup reminder** (built, `src/library/backup-reminder.ts`). Only a whole-library JSON export counts as a backup, since nothing else can restore the library. `createLibraryExport` (`src/library/exporter.ts`) records its time as the account's `lastBackupAt` in `meta`, once the file has been handed to the browser. "Remind me later" records `backupReminderDismissedAt`. The reminder is due once `backupReminderDays` have passed since the latest of those two and of the oldest post's `savedAt`, so a new library is not asked for a backup on its first day. It is read with the catalogue, so it goes as soon as a backup is recorded.
- **Delete all data** (built, `deleteAllData` in `repo.ts`). Under Settings, after the word "delete" is typed. In one transaction it clears posts, tags and tag assignments for every account, and every `meta` row but the settings, so that a choice such as not loading images from X survives. The accounts that had data are announced to the worker (10), so open x.com tabs drop their tags. Nothing on X changes.
- **Look and feel** (M5, built; DESIGN 4.5, 4.7 and 7). What each part needed:
  - **Tokens** (built). One set per theme as custom properties under `[data-theme=…]`, on the root element and on Settings' theme previews, in `entrypoints/library/tokens.css`, which holds only hex colours, shadows and scrims. The page sets `data-theme` on the root element from a pure `themeFor(setting, xTheme, systemDark)` (`src/library/theme.ts`): Match X uses `xTheme`, else the system; System uses `prefers-color-scheme`. Before the settings are read it follows the system, and `use-theme.ts` applies the choice once the catalogue, which carries the setting and `xTheme`, arrives, and again when the system's scheme changes. Each branch has a unit test. `tests/unit/tokens.test.ts` reads the stylesheet itself and checks every text token against each background it is drawn on, in each theme, for 4.5:1, and the icon colour for 3:1.
  - **Font** (built). `InterVariable.woff2` from Inter 4.1, the official release (`web/` in `Inter-4.1.zip`, SHA-256 `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e`), unmodified: SHA-256 `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3`. It is under `public/fonts/` with the release's licence as `LICENSE-Inter.txt`. It is not cut down to Latin: the release ships no such variable file, and an unmodified file can be checked byte for byte against the release, which a browser test does on the build. The cost is size, 352 KB, inside the package only. `@font-face` loads it from `'self'`, so the policy (6.2) is unchanged, and it is not a web-accessible resource, so x.com cannot probe for it.
  - **Icons** (built). Path data in one module (`entrypoints/library/icons.ts`), drawn as inline SVG by one `Icon` component. No icon package.
  - **Controls** (built). Buttons are one set of classes (`button` with `--primary`, `--quiet`, `--danger`, `--danger-outline`, `--small`, `--large`, and `icon-button`). Choices are native selects in a `Select` wrapper with the library's own arrow, on and off settings are checkboxes with `role="switch"`, and All tags / Any tag is a radio group drawn as two segments. Each keeps the native control's keyboard and accessibility behaviour.
  - **The popover in the library** (built) takes the library's look instead of X's: `createPopover` is given `look: 'library'`, and `popoverStyles` (`src/ui/styles.ts`) maps the library's tokens onto the names the popover uses. Custom properties pass into its shadow root from the page, so it follows the library's theme. Its placement takes an alignment: the end of the button on x.com, as X's menus sit, and the start in the library (`align` in `placePopover`, `src/inline/position.ts`). Opening from the end in the library put it over the sidebar; a browser test that failed first now checks it opens over the list.
  - **Toolbar and states** (built). `Toolbar.tsx`: the view's title (the tag when one tag is chosen among all posts, else the source; `viewTitle` in `src/library/toolbar.ts`) as the page's heading, the count or how the search is going, and the Sort (`SortMenu.tsx`) and Export (`ExportMenu.tsx`) menus; the Untagged view says it is the inbox. `FilterBar.tsx` shows the search as a chip, the chosen tags, All tags / Any tag, and Clear all. The backup reminder is a tinted bar under them. No posts match (`NoMatches.tsx`) names the search and the source (`noMatchLine`), with Clear search and Show all posts. The empty library (`EmptyLibrary.tsx`) has a drawing, three steps, a link that opens the bookmarks on X in a new tab, and Restore from a backup.
  - **Post cards** (built, `PostCard.tsx`). The name, @handle and date (`postDate`: no year within the current one), and marks for Bookmarked and Liked; the text; the media in one frame (`MediaFrame.tsx`, one to four cells laid out as X does, each a still from X's image server); the quoted post in its own frame; and a footer with the tag chips, the tag button ("Add tag" while there are none), labels such as "Unavailable on X", and the actions, which show while the card is hovered or has focus. Its `⋯` menu (`PostMenu.tsx`) lists Edit tags (`t`), Open on X (`o`), Copy link, and Remove from library. Below 720 px cards are denser and show no media. The footer's labels come from `postLabels`: media not shown, "Unavailable on X", and "No longer bookmarked" or "No longer liked" (9.1).
  - **Header** (built, `Header.tsx`). The mark and name, the search box with `/` shown, `?`, the gear, and the account (`AccountMenu.tsx`): a label with one account, a menu with more. Accounts come with the catalogue (`storedAccounts` in `repo.ts`), so the menu follows captures live. Each is named by its @handle once seen on x.com (7.7), and by the last four digits of its ID until then (`src/library/accounts.ts`). Its picture is shown beside it while images from X are on, and an account icon otherwise.
  - **Settings** (built, `SettingsPage.tsx`). A view of the library page at `#settings`, so Back returns to the list; `#settings-<group>` jumps to a group, with the browser's own scrolling (`pageOf` in `src/library/route.ts`). No new entrypoint and no manifest change. On Settings only `?` acts among the shortcuts. "Stored in this browser" lists what each account holds, and the size is the browser's own estimate (`navigator.storage.estimate()`), which needs no permission. After Delete all data, the page returns to the list.
  - **Menus** (built). One component, `Menu.tsx`, a button and its list: Esc, a click outside or choosing an item closes it, and focus returns to the button. A chosen item acts after the menu has closed, so that one which moves focus, such as Edit tags into the popover, keeps it there. A row of the list with an open menu is raised above the rows after it. The arrows, Home and End move between items (`menuIndex` in `src/library/menu.ts`), and keys pressed in a menu do not reach the library's shortcuts. The account, sort, export, card and tag menus use it. It can be opened from outside (`open`, `onOpenChange`), as a right click on a tag does, and can focus its first item even when another is checked (`focusFirst`), as the tag menu, whose palette has a checked colour, does. The tag menu is `floating`: the sidebar scrolls, which would cut off a menu inside it, so the menu is fixed over the page at its button, placed by `placePopover` (`src/inline/position.ts`) below it or above when there is no room, and scrolling or resizing closes it.
  - **Toasts** (built). Every result is reported here: copying a link, removing a post, exports, backups and imports. One region with `role="status"` (`Toasts.tsx`). `TOAST_MS = 5000`. A new toast replaces the shown one, and a toast's timer closes only that toast. The state is a pure reducer (`src/library/toast.ts`).
  - **Undo** (built). `removePost` returns what it removed: the post and its tag assignments. `restorePost` puts them back in one transaction, skipping assignments whose tag was deleted meanwhile and keeping a copy of the post stored again from X meanwhile, and the account is announced as for any edit (10). Undo is offered while the toast shows.
  - **Sidebar** (built, `TagList.tsx`, `TagTreeItem.tsx`, `TagMenu.tsx`). Tags in the tree of `tagTree`, a tag no post carries dimmed with 0, and a line saying that Ctrl or Cmd-click combines. A group without a tag of its own shows every tag under it, matching any (`group` in `changeView`, `groupChosen`, `src/library/view.ts`); its count is the posts carrying any of them, each once (`groupCounts` in `src/library/tag-tree.ts`), worked out from the catalogue once per change of the library. A tag's `⋯` sits over the end of its row and takes the count's place on hover and keyboard focus; it is hidden by opacity, which keeps the count in the button's accessible name. The menu holds Rename…, the palette (`ColourSwatches.tsx`, a group of `menuitemradio` items), Merge into… and Delete tag…. Rename and "+" ask for a name in `TagNameDialog.tsx`, which shows why a name was refused (`renameProblem`, `createProblem`); Merge asks in `MergeTagDialog.tsx` (`mergeMessage`); Delete in `ConfirmDialog.tsx`.
  - **Narrow layout** (built). Below 720 px, the same components rearranged by the stylesheet alone: source pills, and a filter button that opens a bottom sheet (`FilterSheet.tsx`, a modal `<dialog>`) for tags. The list follows each tick at once. The side panel (M7) uses the same layout. The denser cards come with part 3.
- **Sharing code.** The side panel imports the same app with a `compact` flag. The tag popover is shared with the injected UI (`src/ui/`).

## 12. Import and export

Export is a core feature. `src/transfer/` exposes one function, `exportPosts(db, accountId, scope, format, now)` (`export.ts`, built), used by every control that exports. It reads the scope in one transaction (`read.ts`), so the file is a consistent picture, and returns the file's name, type and contents. Saving it is the page's job.

| | `json` | `csv` |
| --- | --- | --- |
| `scope: "library"` | All posts, tags and assignments for the account. | One row per library post. |
| `scope: { postIds }` | The given posts, the tags they use, and their assignments. | One row per given post. |

The library's "Export view" resolves the current filter to a list of post IDs and passes it as the scope, so the export always matches what is on screen, in its order (`src/library/view-export.ts`). "Export library" in the library's Settings passes `"library"`.

- **What a file holds.** "Library posts" are those bookmarked, liked or tagged. A JSON file also carries the stored posts that its posts quote, which have no source of their own, so that quotes still show after import. CSV leaves them out. A whole-library file holds every tag, used or not; a view's file holds the tags its posts carry.
- **Saving** (`entrypoints/library/main.tsx`). The contents are built as parts, one per record, so a large library is never held as one string. The page joins them into a `Blob`, and an `<a download>` pointing at a `blob:` URL hands it to the browser, which saves it as a download. The URL is revoked after a minute. This needs no `downloads` permission (6.1), and nothing leaves the device.

### 12.1 JSON format

```json
{
  "format": "xorganize",
  "version": 1,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "accountId": "0000000000",
  "tags": [{ "id": "…", "name": "rust", "color": 3, "createdAt": 0, "lastUsedAt": 0 }],
  "posts": [{ "id": "…", "text": "…", "author": { "handle": "…", "name": "…" }, "isBookmark": 1, "isLike": 0 }],
  "postTags": [{ "postId": "…", "tagId": "…", "taggedAt": 0 }]
}
```

- Each post carries its source flags (`isBookmark`, `isLike`), so bookmarks and likes travel in the same file.
- A post holds every stored field (9.1) except `accountId`, which the file states once, and `hasTags`, which import works out again from `postTags`. Its sort keys are kept, so that bookmarks and likes keep X's order. Times are epoch milliseconds, as stored; only `exportedAt` is ISO 8601.
- The file is written with one record on each line, so it can be read and compared as text.
- Export builds a `Blob` and triggers a download named `xorganize-export-YYYY-MM-DD.json`, with the user's local date. A view of exactly one tag, chosen in the sidebar, adds the tag name: `xorganize-export-recipes-YYYY-MM-DD.json`. In the name, letters and digits of any script are kept, lower-cased, and every run of anything else, `/` included, becomes one `-`, up to 50 characters (`filename.ts`). A name with nothing left is omitted.
- A scoped file has the same format as a full one, with `"scope": "partial"` added. It is importable like any other.
- The file contains library data only. It never contains cookies, tokens or settings.
- The format version is independent of the database schema version. Importers must accept every earlier format version.

### 12.2 CSV format

UTF-8 with a byte order mark (so spreadsheet applications detect the encoding), RFC 4180 quoting, one header row.

| Column | Content |
| --- | --- |
| `post_id` | Post ID, as text, always quoted. |
| `url` | Link to the post on X. |
| `author_handle` | Without the `@`, always quoted. |
| `author_name` | |
| `posted_at` | ISO 8601, UTC. Empty if unknown. |
| `saved_at` | ISO 8601, UTC. |
| `sources` | `bookmark`, `like`, or both, separated by `;`. Empty for a post that is only tagged. |
| `tags` | Tag names separated by `;`. A `;` inside a tag name is not allowed at creation, so the column splits cleanly. |
| `text` | Full post text. |
| `media_urls` | Separated by a space. |

Rows end in CRLF. A cell is quoted when it holds a comma, a double quote or a line break, and double quotes inside it are doubled. `post_id` and `author_handle` are always quoted. Spreadsheets read a bare run of digits as a number and keep only 15 significant digits, so a 19-digit post ID would lose its last four, and a handle such as `007` its zeros. Quoted, they stay text in LibreOffice Calc with "Format quoted field as text" ticked on import; Excel ignores the quotes and needs the column set to Text. The `url` column holds the full ID either way. Tags are listed in the order they were applied. Cells that begin with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with a single quote, so that post text cannot be interpreted as a spreadsheet formula. CSV is export-only (`csv.ts`).

### 12.3 Import

Built. `readBackup(file)` and `parseBackup(text, size)` check a file (`validate.ts`); `importBackup(db, backup, mode)` writes it (`import.ts`). The library wires them through `createLibraryImport` (`src/library/importer.ts`), which tells open x.com tabs that tags changed, as edits do.

- **JSON only** (DESIGN, decision 8). A CSV file is refused with a message saying so.
- **The whole file is checked before anything is written.** A file may come from anyone, or be damaged, so it is treated as untrusted, like the API responses in 7.4.
  - The header must name the format and a known version. A newer version is refused with a message to update the extension. Importers accept every earlier version; there is only version 1 so far.
  - Each post passes the capture check (`isCapturedPost`): numeric IDs, a post link of the form `https://x.com/<handle>/status/<id>`, https-only media, avatar and link URLs, and the capture's size limits. Its flags are 0 or 1, it has a position (in the form `sortKey`, `recentKey` or `unknownKey` writes) exactly in the sources it is in, and its times are non-negative numbers. When it left a source is optional, and dropped for a source it is in.
  - Each tag has a plain ID, a name that passes the rules in 9.1 (stored in its cleaned-up form), a palette colour and valid times.
  - No post, tag, name (ignoring case) or tag assignment appears twice, and every tag assignment names a post and a tag in the file.
  - Records are rebuilt from the fields above, at every level, so nothing else in the file is ever stored.
  - Limits, overridable through options (`DEFAULT_IMPORT_LIMITS`): 512 MiB per file, which is refused unread when larger; 1,000,000 posts, 10,000 tags and 5,000,000 tag assignments.
  - A problem names the record, for example "post 1,200 is not valid", and nothing is written.
- **The file's account is written to**, since bookmarks and likes belong to one X account. Importing a file counts as storing, so its account becomes the one the library shows (`activeAccount`). The preview says so when that is not the account shown.
- **Merge** writes in one transaction.
  - Tags are matched by `nameKey`, so the same tag created on two machines is unified. A matched tag keeps the library's name and colour, the earlier `createdAt` and the later `lastUsedAt`. A new tag keeps the file's ID, unless the library already uses that ID for another tag, when it gets a new one.
  - Posts are matched by ID (`mergeImported`), following the upsert rules in 9.2. Sources are combined, each keeping its position from the newer copy (the one with the later `lastSeenAt`) when that copy is in the source. Content and `unavailable` come from the newer copy, except that a partial copy never replaces a full one. `firstSeenAt` and `savedAt` keep the earlier value. When a source was left is kept while the merged post is in neither copy's source, from the newer copy that records it.
  - Tag assignments are added. A post tagged with the same tag on both sides keeps the earlier `taggedAt`. `hasTags` is set on every post the file tags.
  - Every post written gets `lastSeenAt` set to the time of the import, so that search reads it (11).
- **Replace** deletes the account's posts, tags and tag assignments, then writes the file, in the same transaction. Other accounts and settings are untouched. It is not offered for a file marked `"scope": "partial"`, and `importBackup` refuses it.

### 12.4 Test fixtures

Fixtures in `tests/fixtures/` are **hand-written or generated, never copied from real traffic**. Real responses contain other people's posts, account identifiers and tracking fields. A generator script produces fixtures of the right shape with placeholder IDs, handles such as `@example_user`, and lorem-ipsum text.

## 13. Security and privacy

| Risk | Mitigation |
| --- | --- |
| The site detects that the extension is installed | No `window.postMessage`, no web-accessible resources, no DOM changes or globals from the capture scripts, and a channel the page cannot observe (7.2). Covered by an automated test. Known limits: wrapped functions can be detected by a site that looks for them (7.1), and the tag button's host element is visible in the DOM by design, as is the tag prompt's while it shows. |
| The site reads what the user types into the extension's controls | Key, input and clipboard events aimed at an extension host are stopped on the window before any page listener, and handled by the extension (section 8). Controls are in closed shadow roots, and the popover is removed when it closes. Covered by an automated test with a page that listens as early and widely as it can. |
| The page forges or reads bridge messages | The channel's event names come from a random ID the page never sees (7.2). Payloads are still schema-validated, with size caps and numeric-string checks on every ID. Worst case is junk posts in the user's own library. |
| A web page or another extension messages this one | No external message listeners and no `externally_connectable`. The worker accepts runtime messages only from its own ID, from the top frame, on `https://x.com`. The library's edit notices travel on a `BroadcastChannel`, which only the extension's own origin can use, and carry nothing but an account ID, checked on receipt. |
| Stored content used for script injection | All text is rendered as text nodes. No `innerHTML`, no `dangerouslySetInnerHTML`. Lint rule enforces this. |
| Malicious links in stored posts | Only `https:` URLs are stored. Links open with `rel="noopener noreferrer"`. |
| Credential exposure | The interceptor never reads request headers. No cookie other than the account ID portion of `twid` is read. The extension requests no `cookies` permission. |
| Data leaving the device | Enforced by the browser: the content security policy sets `connect-src 'none'` for every extension page and the background worker (6.2), and automated tests confirm that a request from each is refused by that policy. Content scripts run under the page's policy instead, so for them a test scans the built bundle and fails if `fetch`, `XMLHttpRequest`, `WebSocket` or `sendBeacon` appears outside the interceptor's wrappers. |
| Over-broad permissions | One host, no API permissions. The built manifest is compared with an exact list in CI (6.1). |
| Formula injection through CSV export | Cells with a leading formula character are neutralised (12.2). |
| Malicious import file | Full schema validation before any write, with limits on string lengths and counts. |
| Supply chain | Lockfile committed, minimal dependencies, dependency review in CI, reproducible build instructions so that a store package can be compared with the source. |
| X storing or reading extension data | Database is under the extension origin, not `x.com`. Injected UI uses closed shadow roots. Tag names are visible in the page's DOM tree only while the popover is open. |

Privacy statement for the store listing and README: the extension collects nothing, transmits nothing, and stores everything locally.

## 14. Testing

| Layer | What is covered |
| --- | --- |
| Unit: capture | Extraction and normalisation against synthetic fixtures for every operation, including each alternate field location, tombstones, promoted entries, quoted posts, long-form text and malformed input. |
| Unit: database | Upsert merge rules, tag transactions, `hasTags` maintenance, renaming, merging and deleting tags, removing posts, migrations (using `fake-indexeddb`). |
| Unit: library | Views, edits and their notices, the popover's adapter, what a deletion affects, shortcuts. |
| Unit: transfer | Round-trip export and import, merge and replace, scoped export, CSV quoting and formula neutralisation, rejection of invalid files. |
| Unit: search | Query parsing, the text index, worker messages, the worker's reading and catching up, and combining search with the view. |
| Component | Tag popover keyboard behaviour and accessibility roles. |
| End to end | Playwright loads the built extension into headless Chromium. Requests to `https://x.com/*` are intercepted and answered from `tests/e2e/mock-site`, static pages that imitate x.com's markup, plus fixture responses. The content scripts therefore run under the real URL without the real site ever being contacted, and the suite passes with no network. Covers capture, inline tagging, the library and export. |
| Manual | A checklist run against live x.com before each release, since automated tests cannot use a real account. |

CI never logs in to X and holds no X credentials.

## 15. Build, CI and release

- **Development environment:** every command runs inside a Podman container through `container/run`. The container sees only the project directory, has no network unless `--net` is passed (needed only to install dependencies), keeps `node_modules` in a volume, and cannot read `.git` or modify `container/`. Tool versions are pinned exactly in `package.json`, and the image is built from them.
- **Using the extension by hand:** `container/browse` runs Chromium with the built extension in a second container and shows it in a tab of the maintainer's own browser, through a viewer on a `127.0.0.1` port with a one-time password per session. That container has network access, sees only the built extension (read-only), its own profile volume and a downloads folder, keeps Chromium's sandbox on, and starts the browser with no automation flags. The profile volume, which holds any login, is mounted by no other command.
- **Scripts:** `dev`, `dev:firefox`, `build`, `build:firefox`, `build:diagnostics`, `zip`, `typecheck`, `lint`, `test`, `test:e2e`, and `check`, which runs all of the verification steps in order.
- **CI (GitHub Actions):** on every pull request and push to `main`, run `check` in the same container as local development: typecheck, lint, unit tests, a build for both browsers, and the end-to-end suite on Chromium. Run a secret scanner (gitleaks) over the history. Actions are pinned to commit hashes.
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
| M2 Tagging | Tag button, popover, seen cache, DOM fallback, tag messages. **Built.** Confirmed against a real account on 2026-11-25, Alt+T with `j`/`k` focus after a fix (18.1, 14). | A post can be tagged from any timeline and the state survives a reload. |
| M3 Library | Sources, tag sidebar, post cards, virtualised list, search, tag management. Avatars and thumbnails were brought forward and are done. **Browsing built**: sources, tag sidebar with groups, tag filters, sort, tag chips and quoted posts on cards, virtualised list. **Search built**: text, `#tag` and `@handle`, the `/` shortcut. **Tag management built**: rename, recolour, merge and delete, the card's `[+]` and `⋯` menu, the `j`/`k`/`t`/`o`/`?` shortcuts. The `x` shortcut comes with bulk actions in M7. | A tagged post can be found by tag and by text. |
| M4 Export | JSON and CSV export for the whole library and the current view, import with merge and replace, backup reminder, delete all. **Export built**: JSON and CSV, for the whole library and the view. **Import built**: JSON, checked in full, previewed, merged or replacing the library. **Backup reminder and delete all built.** M4 is complete. | Export then import into a clean profile reproduces the library, and a single tag can be exported to CSV. |
| M5 Look and feel | The library's own look (DESIGN 4.5, 4.7, 7; 11), in five pull requests. **1. Foundations** (built)**:** tokens for Light, Dim and Dark; the `theme` setting with Match X (9.3, `theme/seen`); the packaged font; buttons, icons and styled form controls. No layout change. **2. Structure** (built)**:** the header bar with the account menu, `?` and the gear; the Settings page; a sidebar of sources and tags only; the 720 px list column; the narrow layout with the filter sheet. **3. Post cards** (built)**:** source marks, the X-style media frame, the footer with chips and the tag button, actions on hover and focus, the `⋯` menu, Remove with Undo; the popover's start alignment and library tokens. **4. Toolbar and states** (built)**:** one toolbar with Sort and Export menus, the filters row with All tags / Any tag, the reminder bar, the empty library, No posts match, and one toast region. **5. Sidebar** (built)**:** the tag menu, dimmed unused tags, groups that filter, counts in one column, "+" for a new tag. M5 is complete. | The library matches DESIGN 4.5, 4.7 and 7 in Light, Dim and Dark, at full width and at 390 px, and every existing browser test still passes. |
| M6 Live capture | Bookmark and like mutations, tag prompt toast, auto-scroll. Mutations were built with M1 (7.3); the rest comes in four pull requests. **1. Left sources** (built)**:** "No longer bookmarked" and "No longer liked" on cards (9.1). There is no "Keep posts" setting (DESIGN 5.7), and no switch to stop capturing a source (DESIGN 4.7). **2. Tag prompt** (built)**:** the toast after bookmarking (DESIGN 4.3), with its two settings, which reach x.com through the worker's reply (9.3). **3. Capture banner:** the status line becomes a floating bar with the running count, collapse, and the degraded warning (7.5). It stays a floating bar rather than going under X's page header, so that it depends on no selector in X's layout. **4. Auto-scroll** (7.8), and the empty library's pointer to it. | Bookmarking or liking a post anywhere adds it without visiting the Bookmarks or Likes page. |
| M7 Release | Side panel, popup, the remaining settings, welcome page, bulk actions, accessibility pass, Firefox build, store listing. | Published to the Chrome Web Store and Firefox Add-ons. |

Later candidates: Markdown export, optional encrypted sync, saved searches, Firefox for Android.

## 18. Assumptions to verify in M1

Each of these is from observed behaviour and has not been confirmed for this spec.

**How they are verified.** A separate diagnostics build (`pnpm build:diagnostics`, loaded with `container/browse --diagnostics`) observes every GraphQL response on x.com and records only its structure: key paths, value types, counts, the values of a few schema keys such as `__typename` when they look like identifiers, and entry-ID patterns reduced to known words and placeholders. It also records how many elements each planned selector matches and whether the account cookie has the expected format. It never records post text, handles, IDs, cookies or tokens; unit and browser tests feed it marked fixture data and assert none of it reaches the report. The report is saved from the library page as a JSON file, which the maintainer can read in full before sharing. The diagnostics code is removed from production builds at build time, and a test checks that.

1. The web client calls `/i/api/graphql/<id>/<OperationName>` and the operation names in 7.3 are current.
2. Which of `fetch` and `XMLHttpRequest` the client uses for these calls. The interceptor wraps both regardless.
3. A MAIN-world script declared at `document_start` runs before the client captures references to `fetch` and `XMLHttpRequest`.
4. Timeline entries carry `entryId` and `sortIndex`, and the bookmark sort index orders by time bookmarked.
5. The field locations listed in 7.4.
6. Mutation request bodies carry the post ID at `variables.tweet_id`.
7. The `twid` cookie is readable from script and has the form `u%3D<id>`.
8. The DOM attributes listed in 7.6 and section 8.
9. Whether the Bookmarks or Likes timelines stop returning results after a fixed number of posts, which would limit the first backfill.
10. Firefox behaviour for MAIN-world content scripts and the fallback when no side panel is available. In particular, whether both content scripts start before any page script there, which the private channel's handshake (7.2) depends on. This is tested for Chromium only.
11. Whether the library can be evicted under storage pressure without `unlimitedStorage`, and whether `navigator.storage.persist()` prevents it (6.1).
12. How closely the `fetch` and `XMLHttpRequest` wrappers can be made to match the originals, and what remains detectable (7.1).
13. (M2) The tag button sits correctly in the action bar of timeline posts, the focused post on a post page, and replies, and X's re-rendering neither removes it for long nor duplicates it.
14. (M2) X gives posts keyboard focus (with `j` and `k`), so that Alt+T finds the focused post; and the popover's keys never trigger X's shortcuts.
15. (M5) X's link to the signed-in account's own profile matches `a[data-testid="AppTabBar_Profile_Link"]` and its `href` is `/<handle>`; X's account button matches `[data-testid="SideNav_AccountSwitcher_Button"]` and holds the account's picture in `[data-testid="UserAvatar-Container-<handle>"] img` (7.7). The diagnostics build counts the link and the button with the other selectors.

### 18.1 Results so far

From a first diagnostics run against a real free account on 2026-11-25, in Chromium.

| # | Result |
| --- | --- |
| 1 | **Confirmed.** All calls go to `https://x.com/i/api/graphql/<id>/<OperationName>`. `Bookmarks`, `Likes` and `HomeTimeline` exist under those names. |
| 2 | **Confirmed.** Every observed call used `XMLHttpRequest`, with `GET` for timelines. |
| 3 | **Confirmed.** The interceptor saw the client's calls, so it is installed before the client takes its references. |
| 4 | **Confirmed** (by eye, 2026-11-25). Entries carry `entryId` and `sortIndex`. A response holds post entries followed by a top cursor and a bottom cursor. The library's bookmarks, ordered by sort index, matched the order on X, checked first as text and again with avatars and thumbnails shown. |
| 5 | **Confirmed, with corrections.** The author's handle and name are at `core.user_results.result.core.*` and the avatar at `avatar.image_url`; the older `legacy.*` locations were absent. Text, long-form text, dates, language, media, links and quoted posts are where 7.4 expects. `TweetWithVisibilityResults` wraps a post under `.tweet`. Timeline roots: `data.bookmark_timeline_v2.timeline`, `data.user.result.timeline.timeline`, `data.home.home_timeline_urt`. |
| 6 | **Confirmed** (second run). `CreateBookmark`, `DeleteBookmark`, `FavoriteTweet` and `UnfavoriteTweet` are `POST` requests whose JSON body carries the post ID at `variables.tweet_id`. |
| 7 | **Confirmed.** The cookie is readable and matches the expected format. For `Likes`, `variables.userId` equalled the account's ID. |
| 8 | **Confirmed.** Every selector in `src/dom/selectors.ts` matched on the home, bookmarks and likes pages. |
| 9 | **Partly** (second run). A bookmarks list of about twenty posts was read to its end: the last page simply holds fewer posts, followed by the two cursors. Whether a long list is cut off after some number of posts is still unknown. |
| 14 | **Confirmed after a fix** (by eye, 2026-11-25). X gives a post focus with `j` and `k`, and Alt+T opens that post's popover. At first it then stopped working: closing the popover gave focus to the tag button, where the keyboard guard kept every key from both Alt+T and X's shortcuts. The popover now gives focus back to the post when opened from it, and the tag button takes Alt+T itself (8). Checked again on a real account. |

One finding not anticipated by the spec: every post carries `legacy.bookmarked` and `legacy.favorited`, the account's own state for that post. A post seen in any timeline therefore says whether it is bookmarked or liked, which gives a second way to keep sources accurate. These flags can be trusted. In the test account, most bookmarks were also flagged as liked but not all of them, and the account owner confirmed that this matched what they had actually liked.

The address of the bookmarks and likes pages was masked too aggressively in both runs to be read. The design no longer depends on it: the status line appears when a bookmarks or likes response is captured, not when a particular address is open.
