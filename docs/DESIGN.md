# UX design

This document describes what the extension looks like and how it behaves. The implementation is covered in [SPEC.md](SPEC.md).

## 1. Goals

- Tag any post in one or two interactions, without leaving the timeline.
- Find a saved post later by tag, author, text or source.
- Keep working when X is slow, changes its layout, or deletes the post.
- Treat bookmarks and likes equally: both are captured, tagged and exported the same way.
- Keep all data on the user's machine, and make it easy to take out: a full backup, or any filtered slice, in open formats.

### Non-goals for v1

- Cross-device sync.
- Mobile apps. (Firefox for Android is a possible later target.)
- Writing anything back to X: no bookmarking or liking on the user's behalf.
- X's bookmark folders. They are a paid feature; the extension neither reads nor depends on them, and behaves the same on free and paid accounts.
- AI or automatic tagging.
- Archiving media files. Only media URLs are stored.

## 2. Principles

1. **Feels native.** Injected controls match X's icon size, spacing, hover states and current theme. Nothing shifts layout.
2. **Tags belong to the user, not to X.** A tag survives the post being unbookmarked, unliked or deleted.
3. **Passive by default.** The extension only records what the browser already loaded. Anything that drives the page (auto-scroll) is opt-in and user-started.
4. **Degrades gracefully.** If the inline button cannot be injected, the library still works. If full post data is missing, a minimal record is saved from the page.
5. **Keyboard first.** Every flow can be completed without a mouse.

## 3. Concepts

| Term | Meaning |
| --- | --- |
| Post | A single X post, identified by its numeric ID. |
| Source | Why a post is in the library: `bookmark`, `like`, or `tagged` (tagged without being bookmarked or liked). A post can have several sources. |
| Tag | A user-defined label with a name and a colour. A post can have any number of tags. |
| Library | The extension's own view of every saved post. |
| Capture | Recording a post into the library. |
| Account | The X account that was logged in when a post was captured. Libraries are separated per account. |

Tags are flat in v1. A `/` in a tag name (`dev/rust`) is displayed as a nested group in the sidebar but is stored as a plain name, so no migration is needed if real hierarchy is added later.

## 4. Surfaces

### 4.1 Inline tag button

A tag icon is added to the action bar of every post, immediately left of X's bookmark icon.

```
┌──────────────────────────────────────────────────────────────┐
│ (o) Display Name @handle · 3h                                │
│     Post text goes here and wraps across a couple of lines   │
│     like any other post in the timeline.                     │
│                                                              │
│     ( reply )  ( repost )  ( like )  ( views )   [#] [B] [^] │
│                                                   │   │   └ share
│                                                   │   └ X bookmark
│                                                   └ tag button
└──────────────────────────────────────────────────────────────┘
```

States:

| State | Appearance |
| --- | --- |
| No tags | Outline icon, same grey as neighbouring icons. |
| Has tags | Filled icon in the accent colour, with a small count when there is more than one tag. |
| Hover / focus | Circular tinted background, matching X's hover treatment. Tooltip: "Tag" or the list of tag names. |
| Saving | No spinner. Writes are optimistic. |
| Failed write | Icon briefly shakes and a toast explains the error. |

The button appears on timeline posts, the focused post on a post detail page, and replies. It does not appear on ads.

### 4.2 Tag popover

Clicking the tag button (or pressing the shortcut on a focused post) opens a popover anchored to the button.

```
                      ┌────────────────────────────────┐
                      │ [rust x] [to-read x] ty|       │
                      ├────────────────────────────────┤
                      │ > typescript               128 │
                      │   typography                14 │
                      │   + Create "ty"                │
                      ├────────────────────────────────┤
                      │ Recent: design  ai  recipes    │
                      └────────────────────────────────┘
```

Behaviour:

- The input is focused on open. Existing tags are shown as removable chips.
- Typing filters existing tags, ranked by prefix match and then by use count. The last row always offers to create the typed name if it does not exist.
- `Enter` applies the highlighted suggestion. Pressed before the suggestions for the typed text have arrived, it waits for them and applies the best match, so a few letters and `Enter` pick the existing tag. `Up` / `Down` move the highlight. `Backspace` on an empty input removes the last chip. `Esc` or a click outside closes the popover.
- Every change is saved immediately. There is no Save button.
- "Recent" shows the last five tags used, for one-click tagging.
- Tag names are trimmed, with runs of spaces inside them made single, lower-cased for comparison, and limited to 50 characters. Invisible characters are not allowed, so two tags cannot look the same. A semicolon is not allowed, because it separates tags in CSV exports. The display keeps the casing of first creation.
- The popover flips above the button when there is not enough space below, and is never clipped by the timeline column.

Shortcut: `Alt+T` opens the popover for the post that currently has keyboard focus. It is configurable, and deliberately avoids X's own single-key shortcuts (`l`, `b`, `t`, `r` and others).

### 4.3 Tag prompt after bookmarking

When the user bookmarks a post through X's own button, a small toast appears bottom-centre, above X's own confirmation.

```
        ┌──────────────────────────────────────────┐
        │  Saved to library      [ Add tags ]   x  │
        └──────────────────────────────────────────┘
```

"Add tags" opens the tag popover for that post. The toast dismisses itself after five seconds. It can be turned off in settings, and can be enabled separately for likes (off by default, since likes are far more frequent).

### 4.4 Capture banner

> **As first built:** a single status line at the bottom centre of the window, shown when a page of bookmarks or likes has been captured ("xorganize · 240 bookmarks captured") and hidden when you move to another page. It has no controls. The fuller banner described below, with auto-scroll, comes with a later milestone.

On the Bookmarks page and on the user's own Likes tab, a slim banner sits under the page header. The wording follows the page ("240 likes captured").

```
┌──────────────────────────────────────────────────────────────┐
│ Bookmarks                                                    │
├──────────────────────────────────────────────────────────────┤
│ [#] 240 captured · scroll to capture more   [ Auto-scroll ]  │
├──────────────────────────────────────────────────────────────┤
│  ...timeline...                                              │
```

- The count updates as the page loads more posts.
- **Auto-scroll** is opt-in. It scrolls at a human-like pace, shows a Stop button while running, and stops by itself at the end of the list or on any error. The banner then reads "All 1,832 bookmarks captured".
- The banner can be collapsed to a single icon. Once the first full capture is complete it stays collapsed by default.

### 4.5 Library

The library is one application shown in two containers:

- **Full tab** (`library.html`), opened from the toolbar popup or a shortcut. The primary view.
- **Side panel**, a narrow single-column version docked beside x.com. Chromium only.

Full tab layout:

```
┌───────────────────┬──────────────────────────────────────────────────────┐
│ xorganize         │ [ Search posts, @authors, #tags...            ]  [⚙] │
│                   │ Filters: [rust x] [typescript x]  Match: (All) Any   │
│ SOURCES           │ 37 posts · Sort: Saved (newest)                      │
│   All        2104 ├──────────────────────────────────────────────────────┤
│   Bookmarks  1832 │ [ ] (o) Display Name @handle · 12 Mar 2026           │
│   Likes       410 │         Post text, up to four lines, then a fade     │
│   Tagged only  22 │         [img] [img]                                  │
│   Untagged    967 │         [rust] [typescript] [+]         Open on X  ⋯ │
│                   ├──────────────────────────────────────────────────────┤
│ TAGS         [+]  │ [ ] (o) Another Author @other · 2 Feb 2026           │
│   ai          212 │         Another post body...                         │
│   design       88 │         [rust] [+]                      Open on X  ⋯ │
│ v dev             ├──────────────────────────────────────────────────────┤
│     rust       37 │ ...                                                  │
│     typescript 128│                                                      │
│   recipes      14 │                                                      │
│   to-read      61 │                                                      │
└───────────────────┴──────────────────────────────────────────────────────┘
```

Sidebar:

- **Sources** are mutually exclusive quick filters. "All" is every bookmarked, liked or tagged post. "Tagged only" is tagged but neither bookmarked nor liked. "Untagged" is bookmarked or liked with no tag: the inbox for triage. A source and tags combine.
- **Tags** are listed by name with counts, groups among them in the same order. Click to show only that tag; click it again to clear it. `Ctrl`/`Cmd`+click adds a tag to the filter, or takes it out. A group can be collapsed. Each tag has a `⋯` button, shown on hover and focus, which a right click on the tag also opens. It offers Rename, Change colour, Merge into another tag, and Delete, in a panel under the tag. Esc closes it.
- Renaming to a name another tag already has is refused, with a pointer to Merge. A change of casing alone is allowed.
- Merging moves every post of one tag to the other and removes the first.
- Deleting a tag takes it off every post. It asks for confirmation and states how many posts are affected. It never removes a bookmarked or liked post. A post that is in the library only because of that tag leaves it, as when its last tag is taken off, and the confirmation says how many will.

Main column:

- **Search** matches post text, author name and handle, by any part of a word, ignoring case and accents. Every word must match, in any order, and `"quoted words"` must appear together. `#name` filters by tag and `@handle` by author, so the whole query can be typed; `#"to read"` names a tag with a space. The last word, while it is still being typed, also matches names that start with it, so `#ru` already shows `rust`. Several `#` tags must all match, several `@` authors any one. Search combines with the source and tag filters, and keeps the chosen sort. Results update as the user types, and as posts arrive from x.com. Clear filters empties the search too.
- **Match All / Any** switches between requiring every selected tag and any of them. It appears once two tags are selected.
- **Sort**: saved order (newest first, the default; for Bookmarks and Likes, X's own order), post date (newest first), author (A to Z).
- **No posts match** offers Clear filters, which returns to All with no tags and keeps the sort.
- **Post card** shows avatar, name, handle, date, text, media thumbnails, a quoted post if present, and tag chips. The `[+]` chip opens the same tag popover as the inline button. "Open on X" opens the original in a new tab. The `⋯` menu offers Copy link and Remove from library. Remove asks first: the post's tags go with it, and a post still bookmarked or liked on X comes back the next time that page loads.
- Changes made in the library show at once in open x.com tabs.
- **Export view**, in the menu beside Sort, exports exactly the posts in the current filter as JSON or CSV (see 5.6).
- A post that has been unbookmarked or deleted on X is still shown, with a muted "No longer bookmarked" or "Unavailable on X" label.
- The list is virtualised, so tens of thousands of posts scroll smoothly.

Bulk actions: ticking any checkbox reveals a bar.

```
┌──────────────────────────────────────────────────────────────┐
│ 12 selected    [ Add tags ] [ Remove tags ] [ Remove ]  Clear│
└──────────────────────────────────────────────────────────────┘
```

`Shift`+click selects a range. `Ctrl`/`Cmd`+`A` selects every post in the current filter.

Library keyboard shortcuts: `/` focuses search, `j` / `k` move between posts, `t` tags the focused post, `x` toggles selection, `o` opens the post on X, `?` shows the shortcut list. They act only outside a field or dialog, and never while typing in the tag popover.

> **As first built:** every shortcut except `x`, which comes with bulk actions (M6).

Side panel differences: the sidebar collapses into a filter dropdown, cards are denser, and bulk selection is omitted.

### 4.6 Toolbar popup

```
┌───────────────────────────────┐
│ xorganize                     │
│ 2,104 posts · 43 tags         │
│ 967 untagged                  │
│                               │
│ [ Open library ]              │
│ [ Open side panel ]           │
│                               │
│ Last backup: 12 days ago      │
│ [ Export now ]      Settings  │
└───────────────────────────────┘
```

The toolbar icon shows a small badge while a capture session is running.

### 4.7 Settings

| Group | Setting | Default |
| --- | --- | --- |
| Capture | Capture bookmarks | On |
| Capture | Capture likes | On |
| Capture | Prompt for tags after bookmarking | On |
| Capture | Prompt for tags after liking | Off |
| Library | Keep posts after they are unbookmarked or unliked | Tagged posts only |
| Library | Show images from X (avatars and thumbnails, loaded without cookies) | On |
| Appearance | Theme | Follow X on x.com, follow system in the library |
| Shortcuts | Open tag popover | `Alt+T` |
| Data | Export library (JSON backup, or CSV) | |
| Data | Import library (merge or replace) | |
| Data | Backup reminder | Every 30 days |
| Data | Delete all data | Requires typing a confirmation word |

## 5. Key flows

### 5.1 First run

1. Installation opens a welcome tab with three short points: what is captured, that everything stays local, and how to back it up.
2. A single button, "Capture my bookmarks", opens `x.com/i/bookmarks`.
3. The capture banner is visible. The user scrolls, or starts auto-scroll.
4. When the end of the list is reached, the banner offers "Capture likes next" and "Open library". The first opens the user's own Likes tab, where the same banner appears.
5. The library opens on the Untagged view, ready for triage.

If the user is logged out of X, the welcome tab says so and links to the login page instead.

### 5.2 Tag while browsing

1. The user sees a post in any timeline and clicks the tag button.
2. They type two or three letters and press `Enter`. They press `Esc`.
3. The icon is now filled. The post is in the library with source `tagged`, whether or not it was bookmarked.

### 5.3 Bookmark, then tag

1. The user clicks X's bookmark button.
2. The post is captured immediately, without visiting the Bookmarks page.
3. The toast offers "Add tags". If ignored, the post waits in Untagged.

### 5.4 Find something later

1. The user opens the library and types `#rust tokio`.
2. The list narrows to posts tagged `rust` whose text or author matches "tokio".
3. They press `o` to open the post on X.

### 5.5 Triage a backlog

1. The user opens Untagged.
2. They select a run of posts with `Shift`+click and choose Add tags.
3. Tagged posts leave the Untagged view as soon as the popover closes.

### 5.6 Export, back up and restore

Export is a core feature, not only a safety net. There are two scopes and two formats.

| | JSON | CSV |
| --- | --- | --- |
| **Whole library** (popup, settings) | Complete backup. Can be imported again. | One row per post, for spreadsheets and other tools. |
| **Current view** (library, "Export view") | The filtered posts and the tags they use. Can be imported again. | The filtered posts, one row each. |

- "Current view" means whatever the library is showing: a tag, a combination of tags, a source, a search. Exporting everything tagged `recipes` is three clicks.
- A CSV row holds the post link, author, dates, sources (bookmark, like), the tags as one delimited column, and the text.
- Files are named with the date, and with the tag name when a single tag is exported. They never contain cookies, tokens or anything other than library data.
- Import accepts JSON only. It shows a preview ("1,950 posts, 40 tags, 1,203 tag assignments") and a choice of **Merge** (default; unions tags and keeps the newer copy of each post) or **Replace**.
- If the last backup is older than the reminder interval, the popup and the library show a quiet reminder.

### 5.7 Unbookmark or unlike

The post loses that source. Depending on the "Keep posts" setting it stays in the library (always, when it still has tags, by default) or is removed.

## 6. States and edge cases

| Situation | Behaviour |
| --- | --- |
| Empty library | Illustration, one sentence, and the "Capture my bookmarks" button. |
| No search results | "No posts match" with a button that clears filters. |
| Post deleted or author suspended | Cached copy stays visible, labelled "Unavailable on X". |
| X changes its layout and the tag button cannot be injected | The library and popup keep working. The popup shows "Inline tagging is unavailable, check for an update". |
| X changes its data format and capture stops | The capture banner shows a warning rather than a silent zero. Existing data is unaffected. |
| Several X accounts in one browser | Each account has its own library. The library header shows which account is displayed and offers a switcher when more than one exists. |
| Storage nearly full | A warning in settings, with a suggestion to export. |
| Two tabs edit the same post | Last write wins. Both tabs update live. |
| Very long posts | Card shows four lines with "Show more". Full text is stored and searchable. |
| Sensitive media | Thumbnails X marks as sensitive are not loaded until "Show sensitive media" is clicked. |

## 7. Visual design, theming, accessibility

- **Theme on x.com:** injected UI reads X's active background colour and picks matching light, dim or dark tokens. It re-reads when the theme changes.
- **Theme in the library:** follows the system setting, with a manual override.
- **Isolation:** injected UI is rendered inside a shadow root so that X's styles and the extension's styles cannot affect each other.
- **Tag colours:** a fixed palette of twelve colours, each with a light and dark variant that meets WCAG AA contrast for text. New tags get the next unused colour.
- **Accessibility:** every control has an accessible name. The popover is a labelled dialog with a combobox and listbox, and returns focus to the tag button on close. All actions are reachable by keyboard. Motion respects `prefers-reduced-motion`. Colour is never the only indicator of state.
- **Branding:** the extension uses its own icon and name. It does not use X's logo or trademarks in its artwork.

## 8. Decisions

1. **Bookmark folders are out of scope.** The extension is agnostic of X's paid folders. Tags are the only organising mechanism, and nothing requires a paid account.
2. **Bookmarks and likes are both first-class.** Both are captured by default, share one tag vocabulary, and export together.
3. **Export is JSON and CSV in v1**, for the whole library or the current view. Markdown export is a later candidate.
4. **The extension never writes to X.** Tagging a post does not bookmark or like it.
5. **The side panel does not follow the page in v1.** It is a compact library and nothing more.
