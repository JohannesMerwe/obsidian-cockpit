# Keel Cockpit

The keel workspace as a cockpit inside Obsidian: session context, keel verbs, handoff diff.

**Obsidian plugin** · id `keel-cockpit` · status: beta, not yet on the registry · MIT · desktop only

keel keeps machine-local state in dotfolders that Obsidian hides. This plugin shows the
workspace's `.keel/context.md` in a side pane, runs `keel status`, `doctor`, `start` and
`save` from the vault and shows their JSON results, lists what the last agent session changed
in the context file, and shows the open questions left for you. Desktop only. Does nothing in
a vault without `keel.json`.

## What it does

- **Context pane** (ribbon icon, or *Open cockpit*): the `.keel/context.md` of the workspace
  your active note is in, one collapsible section per heading, with the items under
  *Open questions* as links. Read-only, except a button that adds that heading when missing.
- **Unanswered questions**: every `[!question]` block in the workspace without a ticked box,
  as a link to its line. Until `keel questions` exists the plugin scans the markdown itself.
- **Verbs**: buttons and commands for `keel status`, `keel doctor`, `keel start` and
  `keel save`. Each runs the binary with `--json` and a timeout; the result is rendered from
  the envelope, with the raw JSON underneath. Save asks first: which checkout (from
  `keel repo list`, your note's project first) and what changed.
- **Handoff diff**: what changed in context.md since the previous `Updated:` date, from git
  when the vault tree is a repository, else from a copy the plugin keeps in its data.
- **Dotfolders**: the names in `.keel/` and `.keel/credentials/`. Never their contents, and
  never `.code/`.

Without a `keel.json` above the active note the pane says so and nothing else happens. The
plugin runs only the local `keel` (and `git` for the diff); no network, no telemetry.

### Settings

| Setting | Default | Meaning |
|---|---|---|
| Keel binary | empty | Full path to `keel`. Tried after PATH, which is often minimal for a desktop app; then `/opt/homebrew/bin`, `/usr/local/bin`, `~/go/bin`, `~/.local/bin`. |
| Timeout | 20 s | How long to wait for a keel command. |

## Part of a family

Keel Cockpit is one of the keel Obsidian plugins, five open-source plugins that make Obsidian a
better surface for working with AI coding agents on a vault of specs, plans and boards. Each
plugin stands alone; together they follow one integration spec. They light up extra features
in a vault managed by [keel](https://github.com/JohannesMerwe/pangolin-keel), and stay useful
without it.

| Plugin | Does |
|---|---|
| [Keel Open Questions](https://github.com/JohannesMerwe/obsidian-open-questions) | agents ask questions in your notes; you answer with a click; decisions get logged |
| [Keel Board](https://github.com/JohannesMerwe/obsidian-board) | kanban over a folder of markdown cards; dragging moves the file |
| [Keel Cockpit](https://github.com/JohannesMerwe/obsidian-cockpit) | session context, keel verbs and handoff diff inside the vault |
| [Keel Keys](https://github.com/JohannesMerwe/obsidian-keys) | ticket-style ids as links, autocomplete and next-number creation |
| [Keel Diagram](https://github.com/JohannesMerwe/obsidian-diagram) | edit Mermaid and D2 in place; text stays the source of truth |

This plugin owns the session view over .keel/context.md and the keel verbs (SPEC-integration §C5); keel itself owns the file and the CLI envelope.

## Principles

- Plain markdown first. No keel required.
- Integration with agents is files, not API calls. No keys, no network, no telemetry.
- Pure core in `src/core/` with no `obsidian` import, unit-tested; a thin Obsidian shell around it.

## Develop

```sh
npm install
npm run dev      # esbuild watch → main.js
npm run build    # tsc + esbuild production
npm run lint
npm test         # vitest over src/core
```

`src/core/` is pure TypeScript (detection, envelope, context parser, question scan, summary
rows, diff, snapshots); `src/shell/` holds the Node adapters (exec, git); `src/ui/` the pane
and the confirm modal.

Point a throwaway dev vault's `.obsidian/plugins/keel-cockpit/` at this directory (or symlink
`main.js`, `manifest.json`, `styles.css`) and use the hot-reload plugin. Releases are
GitHub releases whose tag equals the `manifest.json` version; the workflow in
`.github/workflows/release.yml` builds and attaches the artifacts. Beta installs through BRAT.

## Install

Until the plugin is on the community registry, install it with
[BRAT](https://github.com/TfTHacker/obsidian42-brat): *Add beta plugin* →
`JohannesMerwe/obsidian-cockpit`. Requires Obsidian 1.13.0 or later, and desktop Obsidian —
the plugin runs a local binary, which mobile cannot do.

## Agent skills

`agent/` holds the same instructions in two formats, telling an agent how to keep
`.keel/context.md` in the shape this pane renders (the fixed headings, one `## State` line per
project, `## Open questions` as links, a bumped `Updated:`), how to run the keel verbs, and
what it must never write there (credentials, checkout paths, another project's line):

- `agent/claude/keel-cockpit/SKILL.md` — on a machine where this repo is a declared checkout,
  `keel start` links it into `~/.claude/skills/` and `keel stop` unlinks it (keel
  0.1, KEEL-42). Without keel, copy the folder into `.claude/skills/`.
- `agent/copilot/keel-cockpit.prompt.md` — copy into `.github/prompts/`; keel does not link
  Copilot prompts yet (where they belong on a machine is an open question).
