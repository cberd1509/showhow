# Contributing to showhow

Thanks for helping. showhow is a CLI plus an agent skill; most changes touch one of three places:

- `src/`: the CLI (`probe`, `voice`, `record`, `render`, `scene`, …), run directly by Node (TypeScript, no build step)
- `src/stage.html` and `scenes/`: what's drawn in each frame (cards, captions, camera, built-in scenes)
- `skills/showhow/SKILL.md`: what the agent knows. A new feature isn't done until the skill says when to use it

## Setup

Node 23.6+, Google Chrome (or Microsoft Edge) and ffmpeg 7+.

```sh
npm ci
npm run check                      # type-check
node bin/showhow.js key            # an ElevenLabs key, for narration (asked in your terminal, saved outside the repo)
```

## Before you open a pull request

1. `npm run check` passes.
2. If you changed what a video looks like, make one and look at it:
   `node bin/showhow.js make examples/smoke/smoke.yaml`, plus `examples/mossbit/mossbit.vertical.yaml` for vertical.
   Narration is cached, so re-runs cost no credits. `showhow scene <spec> <step>` previews one scene as stills.
3. Say in the PR what you checked: which example, which frames.
4. Update `SKILL.md` and the README when behaviour or the spec format changes.

## Examples

Examples must be safe to publish: public sites with no sign-in, or the fictional Mossbit app in `examples/mossbit/app`.
Never commit real customer data, internal API responses, real people's faces or voices, or keys. Generated output
(`showhow-output/`) stays out of git; the README's previews live in `docs/media/`.

## Style

Match the code around you: small functions, comments that say why, no dependencies without a reason.
Libraries (React Bits, HyperFrames, motion.dev) are called, not copied into the repo.

By contributing you agree that your contributions are licensed under the MIT License.
