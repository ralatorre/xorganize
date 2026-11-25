# xorganize

A browser extension that lets you tag, search, organise and export your X bookmarks and likes. Everything is stored locally in your browser. The extension makes no network requests of its own.

> Status: early development. The extension skeleton builds and loads, but it does not capture or tag anything yet.

## What it will do

- Add a tag button to every post on x.com.
- Capture your bookmarks and likes as you browse them, so they stay searchable even if the original post is deleted.
- Give you a library view to filter by tag, author, source or text.
- Export your library, or any filtered part of it, as JSON or CSV, and import it again on another machine.

It works with a free X account. It does not use or depend on X's paid bookmark folders.

## Documents

- [UX design](docs/DESIGN.md): surfaces, flows, wireframes.
- [Technical spec](docs/SPEC.md): architecture, data model, capture pipeline, milestones.

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

To remove everything it created: `podman volume rm xorganize-node-modules` and `podman image prune`.

## Licence

[MIT](LICENSE)

## Not affiliated

This project is not affiliated with, endorsed by, or sponsored by X Corp. It relies on undocumented behaviour of the x.com web client, which can change without notice.
