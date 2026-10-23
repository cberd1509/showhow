# Sketch a quick diagram in Excalidraw

A visual tutorial on excalidraw.com, no account: draw a box, fill and label it, add a second shape, connect the two
with an arrow, and move a shape so the arrow follows. It ends on the finished diagram, which is also the poster.

It shows two spec features made for apps like this one:

- `drag:` presses on a target and drags between two points given as fractions of its box, so shapes and arrows are
  drawn on the canvas like a person would.
- `fresh: true` starts every probe and recording from an empty browser profile. Excalidraw saves the canvas in the
  browser, so without it the last probe's drawing would already be on screen.

```sh
node bin/showhow.js make examples/excalidraw/excalidraw.yaml
```

The narration uses the free macOS voice (`voice: { provider: say }`). Output goes to
`examples/excalidraw/showhow-output/` (not committed).

Excalidraw is a live site: if its toolbar, shortcuts or the style panel on the left change, re-probe
(`node bin/showhow.js probe examples/excalidraw/excalidraw.yaml --after move`) and adjust the points or targets.
