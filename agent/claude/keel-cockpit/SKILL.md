---
name: keel-cockpit
description: Keep a keel workspace's .keel/context.md in the shape the Keel Cockpit pane renders — the fixed headings, one State line per project, Open questions as links, a bumped Updated date — and run keel verbs the way the pane does. Use in any vault or repo tree with a keel.json.
---

# Keel Cockpit: keep `.keel/context.md` in the shape the pane renders

A person working with you has the Keel Cockpit plugin open in a side pane in Obsidian. It
renders the workspace's `.keel/context.md` — one collapsible section per heading, the items
under *Open questions* as links, the unanswered `[!question]` blocks in the workspace, the
diff of the context file since its previous `Updated:` date, and buttons for `keel status`,
`doctor`, `start` and `save`. The pane reads the file you write. Keeping it in shape is your
job, not the plugin's: the plugin edits nothing except to add a missing `## Open questions`
heading.

## The file you are writing

`.keel/context.md` at the root of the keel workspace (the nearest ancestor directory with a
`keel.json`). It is the handoff between sessions — yours, another agent's, and the person's.
Its headings are fixed; the pane renders them in order and collapses each:

```markdown
# Workspace Context

Workspace: <name> · Created: <date> · Updated: <date> (what changed, one clause)

## Workspace Overview
## Layout
## State
## Open questions
## Agent State
```

- **`Updated:`** on the third line, `YYYY-MM-DD`, plus a short clause saying what moved. The
  pane's handoff diff uses the previous value as its base, so a session that changes the file
  without bumping this date is invisible in the pane.
- **`## State`** is one line per project, and the line is the next session's briefing: what is
  done, with card ids and commit hashes, and what is next. Touch **only your own project's
  line** — other sessions are editing theirs at the same time, and the last writer wins.
- **`## Open questions`** is a list of links to unanswered `[!question]` blocks (the Keel Open
  Questions convention), one line each, with who asked, when, the options and what it blocks.
  Write `- _none_` when there is nothing open. The pane turns each into a link and shows the
  blocks it points at, so a bad relative path shows up as a dead link.
- **`## Agent State`** is the standing rules for this workspace, not this session's news.

## Before you edit it

Re-read the file. Parallel sessions share it and you are not the only writer. Change your
lines, leave the rest byte-for-byte alone, and never reformat the whole file.

## Running keel

The person can run `keel status`, `keel doctor`, `keel start` and `keel save` from the pane,
with the JSON envelope rendered. You run the same verbs from a terminal inside the checkout.
Both write the same state, so say which one you used when it matters, and do not tell the
person to run a verb you could run yourself.

`keel save` from the pane asks which checkout and what changed, then stages, commits with
provenance and pushes. It is the only writing verb in the pane; treat a red `keel doctor` in
the pane as a real problem with the binding, not as a plugin bug.

## What the pane will not show you

- **Contents of `.keel/credentials/`.** The pane lists names only, and so should you: never
  read, print, copy or commit a credential file, and never name one in the context file.
- **`.code/`.** Checkouts are not in the vault and the pane never opens them. Paths to
  checkouts belong in this machine's binding, not in vault documents; keep vault docs
  machine-neutral.
- **Anything outside the workspace.** The pane scopes to the workspace of the active note.

## Do not

- Do not rename, reorder or drop the headings above; the pane keys off them.
- Do not put this session's narrative in `## Agent State`, or standing rules in `## State`.
- Do not write checkout paths, machine names or credentials into the context file.
- Do not resolve a `[!question]` block yourself — that is the person's click. List it under
  `## Open questions` and carry on with everything that does not depend on the answer.
- Do not edit another project's `## State` line, even to fix it.

## At session end

Re-read the file, update your project's `## State` line and your links under
`## Open questions`, bump `Updated:` with a clause saying what changed, and append any
decision to your project's `INDEX.md` decision log. Then `keel save` from inside the checkout.
