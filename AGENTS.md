# Working on showhow

- `src/` is the CLI, TypeScript run directly by Node (type stripping: no enums, no namespaces, `.ts` import extensions). `npm run check` typechecks.
- `src/stage.html` draws every frame of a video (cards, camera, cursor, captions, scenes) as a pure function of time; `src/timeline.ts` decides what it shows when; `src/render.ts` seeks the stage frame by frame and muxes with ffmpeg. Geometry per format lives in `src/format.ts`.
- `scenes/` are the built-in motion-graphics templates (`showhow:<name>`); each file's header documents its data. They must work at 1920×1080 and 1080×1920.
- `skills/showhow/SKILL.md` is the agent workflow. Keep the tool and the skill generic: no product, brand or customer names outside `examples/`.
- Test a change on `examples/smoke` (`node bin/showhow.js make examples/smoke/smoke.yaml`, then the `.vertical` spec) and look at the frames; `showhow scene <spec> <step>` previews one scene.
- Don't edit `src/stage.html` or `scenes/` while a render is running: the render reads them live.
- Never commit `.env`, `.profiles/` (signed-in browser profiles) or `showhow-output/`.
