# Find a good first issue on GitHub

A tutorial (about a minute) on public GitHub pages, no sign-in: open a big open-source project (Visual Studio Code),
go to Issues, filter by the `good first issue` label, open one, and read what makes it approachable: steps to
reproduce, the labels, and any linked pull requests. It opens with a `kinetic` hook and closes with a `flow` recap.

- `github.yaml`: the landscape tutorial (1920×1080)
- `github.vertical.yaml`: the same steps and narration as a 9:16 cut (`extends` + `format: vertical`)

```sh
node bin/showhow.js make examples/github/github.yaml
node bin/showhow.js make examples/github/github.vertical.yaml
```

The narration uses the free macOS voice (`voice: { provider: say }`), so it costs nothing to run. Output goes to
`examples/github/showhow-output/` (not committed).

GitHub is a live site: issue titles, counts and the page layout drift. The spec opens one specific issue by its
title (`pick`); if that issue is closed or renamed, choose another from the filtered list, update `pick`, and
re-probe (`node bin/showhow.js probe examples/github/github.yaml --after pick`).
