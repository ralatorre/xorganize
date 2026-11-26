# xorganize

A browser extension that lets you tag, search, organise and export your X bookmarks and likes. Everything is stored locally in your browser. The extension makes no network requests of its own.

> Status: early development. Bookmarks and likes are captured as you browse them on X. Any post can be tagged from x.com, and the library lists and searches posts by source, tag, text and author. Export is not built yet.

## What it will do

- Add a tag button to every post on x.com.
- Capture your bookmarks and likes as you browse them, so they stay searchable even if the original post is deleted.
- Give you a library view to filter by tag, author, source or text.
- Export your library, or any filtered part of it, as JSON or CSV, and import it again on another machine.

It works with a free X account. It does not use or depend on X's paid bookmark folders.

## Documents

- [UX design](docs/DESIGN.md): surfaces, flows, wireframes.
- [Technical spec](docs/SPEC.md): architecture, data model, capture pipeline, milestones.
- [Contributing](CONTRIBUTING.md): privacy rules, code quality standards, pull requests.

## Development

Everything runs inside a container, so nothing is installed on your machine apart from [Podman](https://podman.io). The `container/run` script builds the image on first use and runs a command in it.

```
container/run --net pnpm install    # install dependencies (the only step that needs the network)
container/run pnpm check            # typecheck, lint, unit tests, both builds, browser tests
container/run pnpm build            # build into .output/chrome-mv3
container/run bash                  # a shell inside the container
```

What the container can and cannot do:

- It sees this project directory and nothing else on the machine.
- It has no network access unless `--net` is given.
- Dependencies are kept in a Podman volume (`xorganize-node-modules`), not in the project directory.
- It cannot read or write `.git`, and cannot modify `container/`.
- The browser tests load the built extension into headless Chromium and serve a stand-in page for x.com. They never contact the real site.

### Using the extension by hand

`container/browse` runs a real browser with the extension loaded, still inside a container, and shows it in a tab of your own browser.

```
container/run pnpm build            # or: pnpm build:diagnostics
container/browse                    # or: container/browse --diagnostics
```

It prints an address on `127.0.0.1` with a one-time password. Open it, and you are looking at the container's browser.

- The viewer's port is open only on your machine, and each session has a new password.
- This container has network access, because it has to reach x.com. It sees the built extension (read-only), its own browser profile, and the `diagnostics/` folder for downloads. It does not see the rest of the project.
- The browser's own sandbox stays on, and it is started as an ordinary browser with no automation flags.
- The profile, including any login, lives in the Podman volume `xorganize-browser-profile`. No other command mounts it. `container/browse --forget` deletes it.

### Diagnostics build

The extension depends on undocumented behaviour of x.com. The diagnostics build records the **structure** of the responses X sends (key names, value types, counts, schema names) so that the project's assumptions can be checked against real traffic. It does not record post text, handles, IDs, cookies or tokens, and tests assert that. The report is saved as a file from the library page; read it before sharing it. The diagnostics build is never published.

### Cleaning up

To remove everything these commands created: `podman volume rm xorganize-node-modules xorganize-browser-profile` and `podman image prune`.

## Licence

[MIT](LICENSE)

## Not affiliated

This project is not affiliated with, endorsed by, or sponsored by X Corp. It relies on undocumented behaviour of the x.com web client, which can change without notice.
