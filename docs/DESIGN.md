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

1. **Native on x.com, our own in the library.** Injected controls match X's icon size, spacing, hover states and current theme, and nothing shifts layout. The library has its own calm, consistent look (7), and shows posts the way X does so they are recognised at a glance.
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

Shortcut: `Alt+T` opens the popover for the post that currently has keyboard focus, or for the tag button that has it. It is configurable, and deliberately avoids X's own single-key shortcuts (`l`, `b`, `t`, `r` and others).

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

> **As first built:** the library predates the look described here and in section 7. Since the first part of M5, it has the colours, type, buttons, icons and styled controls described in section 7, in all three themes. Since the second, it has the header bar with the account menu, `?` and the gear, the Settings page, a sidebar of sources and tags only, the 720 px list column, and the narrow layout with source pills and the filter sheet. Since the third, post cards are as described below, with Remove and Undo, copy results in a toast, and the tag popover opening from the start of its button in the library's own look. Since the fourth, the toolbar, the filters row, the backup reminder, No posts match, the empty library and the toasts are as described. Since the fifth, the sidebar's tags are too, which completes milestone M5, Look and feel (SPEC 17).

Full tab layout:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [#] xorganize       [ Search posts, @authors, #tags      / ]  ?  ⚙  @me ▾│
├──────────────────────────────────────────────────────────────────────────┤
│                     All posts  37 posts       Date saved ▾   [Export ▾] │
│  All posts   2104   [design x] [typography x]  (All tags|Any tag)  Clear │
│  Bookmarks   1832   ┌──────────────────────────────────────────────────┐ │
│  Likes        410   │ Your last backup was 45 days ago. [Back up now]  │ │
│  Tagged only   22   └──────────────────────────────────────────────────┘ │
│  Untagged     967   (o) Display Name @handle · 12 Mar            [B] [L] │
│                         Post text, up to four lines, then Show more     │
│  Tags            +      ┌────────────────┬────────┐                     │
│  • ai          212      │     image      │ image  │                     │
│  • design       88      └────────────────┴────────┘                     │
│  v dev         165      [• rust] [• typescript] [+]       [↗] [link] [⋯]│
│     • rust      37   ──────────────────────────────────────────────────  │
│     • typescript 128  (o) Another Author @other · 2 Feb                  │
│  • recipes      14      ...                                              │
└──────────────────────────────────────────────────────────────────────────┘
```

**Header bar**, across the top: the extension's mark and name; the search box, with `/` shown as its shortcut; `?` for the keyboard shortcuts; the gear for Settings (4.7); and the X account shown, as a menu that switches between the accounts this browser holds (6). An account is named by its @handle, as last seen on x.com, and by the end of its ID until then. Its picture from X is shown beside it while images from X are on.

**Width.** The page is centred, at most 1180 px wide: a 236 px sidebar and a list column of at most 720 px, so post text stays near X's own line length. Below 720 px the side panel layout below takes over.

Sidebar:

- **Sources** are mutually exclusive quick filters, each with its icon: "All posts" is every bookmarked, liked or tagged post. "Tagged only" is tagged but neither bookmarked nor liked. "Untagged" is bookmarked or liked with no tag: the inbox for triage, and its view says so under its title. A source and tags combine.
- **Tags** are listed by name with counts, groups among them in the same order. Click to show only that tag; click it again to clear it. `Ctrl`/`Cmd`+click adds a tag to the filter, or takes it out, and a line under the list says so. A tag no post carries is shown dimmed, with 0. "+" beside the heading creates a tag.
- **Groups.** Clicking a group's name shows every tag in it, matching any of them, and clicking it again clears them. Its count is the posts carrying any of its tags, each once. The arrow beside it folds the group. A group that is also a tag, such as `dev` beside `dev/rust`, is that tag: clicking its name shows the tag, and it has the tag's count and menu.
- **Managing a tag.** On hover and focus a tag's `⋯` button takes the place of its count, so counts stay in one column. It, or a right click on the tag, opens a menu: Rename…, Change colour (the palette, in the menu), Merge into… (while there is another tag), and Delete tag…. Esc closes it. A colour applies at once. The others ask in a dialog: a new name, the tag to merge into, or a confirmation. The menu opens above the tag when there is no room below it.
- **New tag.** "+" asks for a name in a dialog. A name another tag has is refused. The new tag has the next unused colour, and shows dimmed with 0 until a post carries it.
- Renaming to a name another tag already has is refused, with a pointer to Merge. A change of casing alone is allowed.
- Merging moves every post of one tag to the other and removes the first.
- Deleting a tag takes it off every post. It asks for confirmation and states how many posts are affected. It never removes a bookmarked or liked post. A post that is in the library only because of that tag leaves it, as when its last tag is taken off, and the confirmation says how many will.

Main column, from the top:

- **Toolbar**: the view's title (the source, or the tag when one tag is chosen) and how many posts it lists; then **Sort** and **Export** as menus.
- **Search** matches post text, author name and handle, by any part of a word, ignoring case and accents. Every word must match, in any order, and `"quoted words"` must appear together. `#name` filters by tag and `@handle` by author, so the whole query can be typed; `#"to read"` names a tag with a space. The last word, while it is still being typed, also matches names that start with it, so `#ru` already shows `rust`. Several `#` tags must all match, several `@` authors any one. Search combines with the source and tag filters, and keeps the chosen sort. Results update as the user types, and as posts arrive from x.com.
- **Filters row**, shown while anything narrows the view: the search as a chip, each chosen tag as a removable chip, **All tags / Any tag** as a two-way switch once two tags are chosen, and **Clear all**, which returns to All posts with no tags and no search, and keeps the sort.
- **Sort** menu: Date saved (newest first, the default; for Bookmarks and Likes, X's own order), Date posted (newest first), Author (A to Z). Each choice says what it means in a second line.
- **Export** menu: exports exactly the posts in the current view as JSON ("Can be imported again") or CSV ("For spreadsheets") (see 5.6). The result is a toast.
- **Backup reminder**, under the toolbar when due (5.6): a tinted bar with **Back up now** and **Remind me later**.
- **No posts match**: an outlined panel that names what was searched for and in which source, with **Clear search** when there is a search, and **Show all posts**.

Post card:

- Avatar, name, @handle and date, as X shows them, so a post is recognised at a glance. The date leaves out the year within the current year. At the right of that line, a bookmark mark and a like mark show why the post is in the library.
- Text, cut to four lines with **Show more**.
- Media in one rounded frame, laid out as X does: one wide, two side by side, three as one tall and two small, four as a grid. Videos and gifs are their still image, with a "Video" or "GIF" badge.
- A quoted post in its own rounded frame, with its author's small avatar, name, handle and date.
- A footer row: the tag chips, then the tag button. With no tag it reads "Add tag"; with tags it is a small `+`. Clicking a chip shows that tag; `Ctrl`/`Cmd`+click adds it to the filter. The tag button opens the same tag popover as the inline button, below it and starting at its left edge.
- A post X no longer serves shows an "Unavailable on X" label in the footer. One that has been unbookmarked, and stays because it is liked or tagged, shows "No longer bookmarked"; one unliked, "No longer liked". The label goes if it is bookmarked or liked again.
- **Actions**, at the right of the footer, shown while the card is hovered or has focus: Open on X (in a new tab), Copy link, and `⋯`. The `⋯` menu offers Edit tags, Open on X and Copy link, each with its shortcut, and Remove from library.
- **Remove from library** acts at once, and a toast offers **Undo** while it shows. The menu item says, in a second line, that the post's tags go with it and that it comes back if it is still bookmarked or liked on X (decision 7).
- The card has a quiet background on hover and a focus ring when it has keyboard focus.
- Changes made in the library show at once in open x.com tabs.
- The list is virtualised, so tens of thousands of posts scroll smoothly.

**Toasts.** Every result is reported in one place, at the bottom centre: "Link copied", "Exported 37 posts as CSV", "Removed from library" with Undo, "Backup saved: …". A toast closes itself after five seconds, or with its close button. Only one shows at a time; a new one replaces it.

Bulk actions: ticking any checkbox reveals a bar.

```
┌──────────────────────────────────────────────────────────────┐
│ 12 selected    [ Add tags ] [ Remove tags ] [ Remove ]  Clear│
└──────────────────────────────────────────────────────────────┘
```

`Shift`+click selects a range. `Ctrl`/`Cmd`+`A` selects every post in the current filter.

Library keyboard shortcuts: `/` focuses search, `j` / `k` move between posts, `t` tags the focused post, `x` toggles selection, `o` opens the post on X, `?` shows the shortcut list. They act only outside a field or dialog, and never while typing in the tag popover.

> **As first built:** every shortcut except `x`, which comes with bulk actions (M7).

**Side panel, and any window narrower than 720 px:**

- The header holds the mark, the search box, a filter button and the gear. The filter button shows how many tags are chosen.
- Sources become a row of pills with counts under the header.
- The filter button opens a sheet from the bottom with the tags, each with a tick when chosen, All tags / Any tag once two are chosen, and a button that says how many posts it will show ("Show 4 posts").
- Cards are denser: a 32 px avatar, three lines of text, no media. Bulk selection is omitted.

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

Settings is a page of the library, opened from the gear in its header, with "Back to library" in the header in place of the search box. A short list on the left jumps to its groups. Each group is a panel of rows: a title, a line saying what the setting does, and its control at the right.

| Group | Setting | Default |
| --- | --- | --- |
| Capture | Prompt for tags after bookmarking | On |
| Capture | Prompt for tags after liking | Off |
| Appearance | Theme: Match X, System, Light, Dim or Dark, each shown as a small preview | Match X |
| Privacy | Show images from X (avatars and thumbnails, loaded without cookies). Says that, turned off, the library makes no network request at all. | On |
| Privacy | Stored in this browser: what the library holds for each account, and its size. Read only. | |
| Shortcuts | Open tag popover | `Alt+T` |
| Backup and restore | Back up the library (JSON), with when it was last done | |
| Backup and restore | Export as CSV, which says it cannot be imported again | |
| Backup and restore | Restore from a backup (merge or replace) | |
| Backup and restore | Backup reminder | Every 30 days |
| Danger zone | Delete all data | Requires typing a confirmation word. Deletes every account's posts, tags and tag assignments; keeps settings |

- **Capture.** Bookmarks and likes are always both captured; there is no switch to stop one. The sidebar already keeps them apart, so someone who wants only bookmarks need never open Likes. Everything stays on the device either way, and a source that was off would leave the library following X for some posts and not others.
- **Theme.** Match X uses the theme last seen on x.com: Light, Dim or Dark. Until x.com has been visited, it follows the system. System follows the system's light or dark setting. The tag button and popover on x.com always follow X, whatever the library uses.
- The Danger zone panel has a red-tinted border, and its button is outlined in red. "Delete all data…" opens a dialog that says what goes and what stays: every post, tag and tag assignment, for every X account in this browser; settings stay, so that a choice such as not loading images from X is not undone; nothing on X changes. Its button stays disabled until "delete" is typed, in any case. Cancel has focus first. Afterwards the library shows its empty state, from which a backup can be restored.

> **As first built:** the Settings page has the Appearance, Privacy, Backup and restore, and Danger zone groups. Match X and System preview the two themes they most often choose between, side by side. The Capture rows come with the tag prompt (M6), and Shortcuts with M7. The backup reminder shows in the library only until the popup (M7).

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
- Post IDs are longer than a spreadsheet can hold as a number. Opened with default settings, LibreOffice and Excel round them, and a sheet saved that way keeps the wrong IDs. Choosing Text for the ID column on import keeps them exact (in LibreOffice, ticking "Format quoted field as text" does it). The post link always carries the exact ID.
- Files are named with the date, and with the tag name when a single tag is exported. They never contain cookies, tokens or anything other than library data.
- Import accepts JSON only (decision 8). It checks the whole file first, and a file it cannot use is refused with the reason, before anything changes ("This is not a JSON backup…", "The file is damaged: post 12 is not valid").
- It then shows a preview: "1,950 posts, 40 tags and 1,203 tag assignments, exported 2 Jan 2026", and a choice of **Merge** (default, focused first; unions tags by name and keeps the newer copy of each post) or **Replace**, which says it deletes what the library holds first.
- A view's file holds part of a library, so it can only be merged: the preview says so and offers no Replace.
- A file is imported into the X account it was exported from, and the library then shows that account. The preview says so when it is not the account shown.
- An empty library offers "Restore from a backup", so a new profile can be filled from a backup before anything is captured.
- If the last backup is older than the reminder interval, the popup and the library show a quiet reminder: "Your last backup was 45 days ago", or "Your library has not been backed up yet", with **Back up now** and **Remind me later**.
  - Only a JSON backup of the whole library counts, because only that can restore it. A CSV or a view's file does not.
  - A library that has never been backed up is reminded once the interval has passed since its first post was saved, not on its first day.
  - **Remind me later** starts the interval again, so the reminder does not come back on every visit.
  - The interval is a setting (4.7): every week, every 30 days (the default), every 90 days, or never.

### 5.7 Unbookmark or unlike

The post loses that source. It stays in the library while it is still bookmarked, liked or tagged, and its card then says "No longer bookmarked" or "No longer liked". Otherwise it leaves the library. There is no setting for this: a post with no source and no tag would have no place in any view, and removing tagged posts would lose the user's tags (principle 2).

## 6. States and edge cases

| Situation | Behaviour |
| --- | --- |
| Empty library | A small drawing, "Your library is empty", one sentence on what the extension does, and three numbered steps: open your bookmarks on X, scroll to the end or let xorganize scroll, tag posts anywhere on X. (Until auto-scroll, M6, the second step only says to scroll to the end.) **Open my bookmarks on X** is the primary button, **Restore from a backup** the secondary one (5.6). A last line says that everything stays in this browser. |
| No search results | "No posts match", naming the search and the source ("Nothing in Bookmarks matches “tokio”"), with **Clear search** when there is a search and **Show all posts** (4.5). |
| Post deleted or author suspended | Cached copy stays visible, labelled "Unavailable on X". |
| X changes its layout and the tag button cannot be injected | The library and popup keep working. The popup shows "Inline tagging is unavailable, check for an update". |
| X changes its data format and capture stops | The capture banner shows a warning rather than a silent zero. Existing data is unaffected. |
| Several X accounts in one browser | Each account has its own library. The library header shows which account is displayed and offers a switcher when more than one exists. |
| Storage nearly full | A warning in settings, with a suggestion to export. |
| Two tabs edit the same post | Last write wins. Both tabs update live. |
| Very long posts | Card shows four lines with "Show more". Full text is stored and searchable. |
| Sensitive media | Thumbnails X marks as sensitive are not loaded until "Show sensitive media" is clicked. |

## 7. Visual design, theming, accessibility

Two looks, on purpose (decision 9):

- **On x.com**, the tag button, popover and toasts look like part of X: X's icon size, spacing, hover tint, font and current theme. Nothing shifts layout.
- **In the library**, the extension has its own look, set out below. Only posts keep X's shape (avatar, name, handle, date, text, media), so that they are recognised.

### 7.1 Themes

The library has three themes: Light, Dim and Dark (4.7). On x.com, injected UI reads X's active background colour and picks matching light, dim or dark tokens, and re-reads when the theme changes.

Library tokens. Text colours are given against `bg`; every text pair must meet WCAG AA (4.5:1), which a unit test checks.

| Token | Use | Light | Dim | Dark |
| --- | --- | --- | --- | --- |
| `bg` | Page | `#ffffff` | `#15181e` | `#0a0b0d` |
| `surface` | Panels, cards in settings | `#ffffff` | `#1b1f26` | `#111317` |
| `raised` | Menus, popover, dialogs | `#ffffff` | `#222731` | `#17191e` |
| `field` | Search box, switches, pills | `#f2f4f7` | `#20252d` | `#15171b` |
| `hover` | Hovered rows and buttons | `#f1f3f6` | `#262c36` | `#1b1e23` |
| `card-hover` | Hovered post card | `#f8f9fb` | `#191c23` | `#0f1114` |
| `chip` | Tag chips | `#eef0f3` | `#272d37` | `#1c1f25` |
| `chip-hover` | Hovered chips and their buttons | `#e3e6eb` | `#313845` | `#262a31` |
| `border` | Dividers | `#e7e9ee` | `#2a303a` | `#1f2228` |
| `border-strong` | Button and field outlines | `#d3d8df` | `#3b4350` | `#2f343c` |
| `text` | Body text | `#14161a` | `#e9ecf1` | `#e8e9eb` |
| `text-2` | Secondary text, counts, handles | `#5a616d` | `#a3abb8` | `#969ca6` |
| `text-3` | Icons only, not text, at 3:1 or more. Placeholders use `text-2` | `#7d8591` | `#7f8896` | `#6f7680` |
| `danger` | Destructive actions | `#c8202b` | `#ff6b6b` | `#ff6b6b` |
| `danger-soft` | Hovered danger outline button | `#fdecec` | `#312227` | `#231516` |
| `on-danger` | Text on a danger fill | `#ffffff` | `#15181e` | `#0a0b0d` |
| `notice-bg` / `notice-text` | Backup reminder | `#fbf5e8` / `#6d4500` | `#2a2418` / `#f0d08f` | `#1f1b12` / `#eacb8a` |
| `notice-border` | Backup reminder | `#f0e2c0` | `#3d3320` | `#2f2817` |
| `toast-bg` / `toast-text` | Toasts, the inverse of the page | `#17191d` / `#f3f4f6` | `#eceff3` / `#15181e` | `#e8e9eb` / `#0a0b0d` |
| `toast-accent` | A toast's action, such as Undo | `#b5b5ed` | `#5050bc` | `#5050bc` |

White text on Dim and Dark's lighter red would be 2.8:1, so a danger button there carries the page's own dark colour instead. The scrim behind dialogs is black at 36%, 50% and 60%.

**Accent.** Indigo, `#5b5bd6`, its own colour and not X's blue. It fills primary buttons, the selected theme, switches and the mark, with white text on it, at 5.4:1. Hovered, a primary button darkens to `#5050bc`. Derived from it:

- `accent-ink`, for accent-coloured text and icons: mixed 12% towards black in Light, 42% towards white in Dim and Dark.
- `accent-soft`, the selected-row tint: 11% of the accent in Light, 24% in Dim and Dark.

Shadows are soft and used only for things that float: menus, the popover, dialogs and toasts.

### 7.2 Type, space and shape

- **Font:** Inter, packaged with the extension (SIL Open Font License), so the library looks the same on every system and loads nothing from the network. Scripts it does not cover fall back to the system font. On x.com, injected UI uses X's own font stack.
- **Sizes:**
  - 12 px: section labels, counts.
  - 13 px: buttons, secondary lines, toasts.
  - 14 px: interface text.
  - 15 px: post text.
  - 17 px: dialog titles.
  - 20 px: the view title.
  - 26 px: the empty state's heading.

  Weights are 400, 500, 600 and 650. Counts use tabular figures.
- **Spacing** on a 4 px grid: mostly 4, 8, 12, 16, 24 and 32. 6 and 10 are used inside small controls.
- **Corners:**
  - 7 to 8 px: buttons and rows.
  - 10 px: the search box.
  - 12 px: menus and the reminder.
  - 14 px: media, quoted posts, the popover and settings panels.
  - 16 px: dialogs.
  - Round: chips, pills and avatars.
- **Sizes of controls:** buttons are 34 px high (28 small, 42 large), icon buttons 36 px (30 small), sidebar rows 34 px, the header 60 px.

### 7.3 Components

- **Buttons**, one set used everywhere:
  - **primary** (accent fill), one per view at most;
  - **secondary** (outlined);
  - **quiet** (no outline until hovered);
  - **danger** (red fill), only for the confirming button of a destructive dialog;
  - **danger outline**, for the button that opens one.
- **Icons:** the extension's own set, drawn on a 24 px grid with a 1.75 px rounded stroke, inline SVG, no icon font and no dependency. They include:
  - all posts, bookmark, like, tag and untagged;
  - search, settings, help and account;
  - plus, close, chevron and more;
  - open on X, copy link, remove, rename, colour and merge;
  - sort, export and import;
  - backup, privacy, warning and tick;
  - image and play.

  Icon-only buttons carry an accessible name and a tooltip.
- **The mark:** the tag drawing used by the inline button, white on an accent rounded square.
- **Menus** for every choice that is not a setting row: account, sort, export, the card's `⋯`, a tag's `⋯`. They open under their button, close on Esc or a click outside, and put focus back on the button. A tag's menu opens above its button when there is no room below, since the sidebar can be near the bottom of the window.
- **Form controls** are styled to match: the switch for on and off settings, a select-like button that opens a menu for choices, the two-way switch for All tags / Any tag.
- **Tag colours:** a fixed palette of twelve colours, each with a light and dark variant that meets WCAG AA contrast for text. New tags get the next unused colour. Shown as a dot before the tag's name.
- **Motion:** colour and opacity change over 120–150 ms on hover, focus and when menus open. Only the group arrow turns. Nothing moves when `prefers-reduced-motion` is set.

### 7.4 Isolation, accessibility, branding

- **Isolation:** injected UI is rendered inside a shadow root so that X's styles and the extension's styles cannot affect each other. The tag popover takes the token set of where it is shown: X's on x.com, the library's in the library.
- **Accessibility:** every control has an accessible name. The popover is a labelled dialog with a combobox and listbox. On close it returns focus to where it was opened from: the tag button, or the post when opened with the shortcut, so that X's `j` and `k` carry on from there. All actions are reachable by keyboard, including the card actions that otherwise show only on hover. Focus is shown by a 2 px accent ring. Motion respects `prefers-reduced-motion`. Colour is never the only indicator of state: the chosen source is also bold, the chosen theme also ringed, and the bookmark and like marks have names.
- **Branding:** the extension uses its own icon, name and colours. It does not use X's logo, trademarks or brand colour in its artwork or its interface.

## 8. Decisions

1. **Bookmark folders are out of scope.** The extension is agnostic of X's paid folders. Tags are the only organising mechanism, and nothing requires a paid account.
2. **Bookmarks and likes are both first-class.** Both are captured by default, share one tag vocabulary, and export together.
3. **Export is JSON and CSV in v1**, for the whole library or the current view. Markdown export is a later candidate.
4. **The extension never writes to X.** Tagging a post does not bookmark or like it.
5. **The side panel does not follow the page in v1.** It is a compact library and nothing more.
6. **Deleting a tag removes the posts only it kept.** A post that is in the library only because it was tagged leaves when it loses its last tag, whether that tag is taken off or deleted. Keeping it would leave a post that no source and no tag lists, which nothing could show or clean up. A tag deletion never removes a bookmarked or liked post, and its confirmation states how many posts will leave (4.5).
7. **Removing a post does not touch X.** Following decision 4, Remove from library does not unbookmark or unlike the post. A post still bookmarked or liked on X therefore comes back the next time that page is captured, and the Remove item says so (4.5). To keep it out, unbookmark or unlike it on X as well.
8. **The JSON backup is the only way to restore.** CSV is for reading the library elsewhere and is never imported. A CSV row has no tag colours, no unused tags, no order from X, no media details, links or quoted posts, and no tagging times, so a library restored from it would be poorer than the one exported. A sheet saved from a spreadsheet may also hold rounded post IDs (5.6), which an import could not tell from real ones.
9. **The library has its own look; x.com keeps X's.** Copying X's interface in the library would make it read as an imitation of X, invite confusion with X itself, and need chasing whenever X restyles. The library is also a different kind of tool: filters, menus, settings and bulk actions, for which X has no patterns. So the library has its own colours, mark, type and controls (7), and keeps only the shape of a post. On x.com the opposite holds: what the extension adds must look like part of the page (principle 1).
10. **Removing a post is undone, not confirmed.** Removing one post is common during triage and easy to reverse, so it happens at once and a toast offers Undo for five seconds, which puts back the post and its tag assignments. A question every time would slow triage and teach people to click through it. Destructive actions that cannot be put back from memory keep their confirmation: deleting a tag, replacing the library on import, and deleting all data.
11. **The library's default theme is Match X.** Someone who reads X in Dim expects their saved posts in Dim too. The extension already reads X's theme to draw the tag button, so the library can follow it without asking for anything more (SPEC 9.3). Until x.com has been visited, it follows the system.
