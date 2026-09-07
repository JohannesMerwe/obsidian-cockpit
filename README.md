# Keel Cockpit

The keel workspace as a cockpit inside Obsidian: session context, keel verbs, handoff diff.

**Obsidian plugin** · id `keel-cockpit` · status: scaffold (2026-09-07), no features yet · MIT

keel keeps machine-local state in dotfolders that Obsidian hides. This plugin shows the
workspace's `.keel/context.md` in a side pane, runs `keel status`, `doctor`, `start` and
`save` from the vault and shows their JSON results, lists what the last agent session changed
in the context file, and shows the open questions left for you. Desktop only. Does nothing in
a vault without `keel.json`.

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
```

Point a throwaway dev vault's `.obsidian/plugins/keel-cockpit/` at this directory (or symlink
`main.js`, `manifest.json`, `styles.css`) and use the hot-reload plugin. Releases are
GitHub releases whose tag equals the `manifest.json` version; the workflow in
`.github/workflows/release.yml` builds and attaches the artifacts. Beta installs through BRAT.

## Agent skills

`agent/` will hold the same instructions in claude-skill and copilot-prompt formats, telling
an agent what convention this plugin renders and what it must never do. Copy them into your
agent's skills directory until keel links them for you.
