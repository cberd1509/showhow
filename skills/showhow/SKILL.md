---
name: showhow
description: Make a narrated video and a written guide of any web app, from the live app alone — a how-to tutorial, a deep-dive guide, or a product presentation for stakeholders. Discovers the path in the browser, rewrites private data with mocks, lifts real UI into motion graphics, narrates with ElevenLabs (word-synced captions), records, zooms and renders. Use when someone says "/showhow", "make a tutorial of", "record how to …", "usage guide video", "walkthrough of <url>", "explain how <feature> works", or "present <app/module> to <stakeholders>".
---

# /showhow

Turn an app into a narrated video, captions, chapters and a written guide with screenshots: "how do I do X", "how does this work", or "what does this module give us".

You work from **the live app**, the way a new user would. Source code, if it happens to be around, is a cross-check — never a requirement and never the source of truth: the tutorial shows what is on screen today.

The tool is the `showhow` CLI (`<skill-dir>/../../bin/showhow.js`, or `showhow` if installed). `<skill-dir>` is the directory containing this file.

```
showhow login --profile <name> <url...>   a person signs in; recordings reuse the profile
showhow probe <spec> [--after <step>] [--url <url>]   what is on screen: ARIA tree, screenshot, JSON requests
showhow voice <spec>    narration per step (cached by text)
showhow record <spec>   drive the app, paced by the narration
showhow scene <spec> <step>   one scene alone: stills sheet, sounds, layout check
showhow render <spec>   video + captions + chapters + guide
showhow make <spec>     all three
```

## 0. Setup (first run)

`<root>` is `<skill-dir>/../..`. If `<root>/node_modules` is missing, run `npm install --prefix <root>` once. Check `node --version` (23.6 or newer), `ffmpeg -version` (7.0 or newer), and that Google Chrome or Microsoft Edge is installed (Chrome is used when both are; `SHOWHOW_BROWSER=msedge` picks Edge); tell the person what's missing rather than working around it.

**The voice key.** Narration and music use ElevenLabs when a key is set. Check with `showhow key --status` (it says whether one is set and where from, never the key). If none is set, ask the person for their ElevenLabs key before any narration: the macOS `say` voice sounds robotic and is never used for a video someone will watch (only a throwaway local test, and only if the person asks for it). For the key, give them the exact command to run **in their own terminal** — `node <root>/bin/showhow.js key` with `<root>` resolved to an absolute path — which asks for it with hidden input, checks it and saves it to `~/.config/showhow/.env`. Never ask for the key in chat, never read or print the config file or `.env`, and never pass the key on a command line. If the person pastes a key into the chat anyway, don't repeat it; suggest they rotate it at elevenlabs.io and use `showhow key`. ElevenLabs bills per character: before the first `voice` or `make` on a long script, tell the person roughly how many characters it is. Narration is cached by line, across specs, so re-runs and vertical cuts are free.

## 1. Pin down the video

You need: the app URL, the goal, and where it ends. Infer the purpose from the ask; it sets the shape:

| Purpose | Asked as | Shape | Length |
|---|---|---|---|
| **Tutorial** | "how do I…", "record how to…" | The click path, step by step; a card to open and close | 45–120 s |
| **Deep-dive guide** | "explain how X works", "for people building X" | Chapters per concept: what it is → where it lives (recorded) → how the pieces connect (a `flow` or lifted `ui` scene) → what to watch for; a rich `guide.md` | 4–10 min |
| **Marketing video** | "a video for clients / social", "make it engaging" | [/brag](https://github.com/latent-spaces/brag)'s rules with a voice: hook in 2 s (a question or a promise, ideally shown on a real object) → the end user's experience (public page, in a phone) → what the business gets, shown as the real panels that reveal it (`collage`), not as figures → logo + tagline. Every frame postable. `style: trailer`; `format: vertical` for Reels/Shorts/TikTok | 30–60 s |
| **Executive trailer** | "present X to leadership / a client / investors", "a product trailer" | Between a launch video and a guide: value, not procedure. Hook (the problem or the promise) → reveal (name + one line) → 3–5 value beats, each a short claim proven at once by real product (a tight recorded moment or a lifted `ui` scene, no click-by-click) → proof in numbers (`stats`) → how it connects (`flow`) → close (tagline; the ask, if the person gave one). `style: trailer` | 90–120 s |

A trailer talks about outcomes, not buttons; name a button only when it's the point. Ask who watches it (leadership, clients, investors), the language, whether numbers may appear, and the length. Its **numbers** are the person's (`facts`) or the app's demo data shown **labelled as such** (`badge: "Demo data"` keeps a label on screen; say so in the stats `note`) — never invented, and never demo figures passed off as real. **Positioning lines** (hook, tagline) come from the product's own site or app copy; invent them only when the person says to, and tell them which lines are invented. No roadmap unless the person gives it.

**Vertical (9:16).** `format: vertical` renders 1080×1920 for Reels, Shorts and TikTok. Make one when the person asks; tutorials default to landscape. **A vertical video is recorded for vertical, never cut from landscape footage.** With `format: vertical`, the app is recorded at a narrow portrait viewport (440×541, shaped like the vertical window) unless the spec sets a portrait `viewport` (e.g. `{ width: 390, height: 844, scale: 3 }` for a phone). The site then uses its own small-screen layout and each page fits the frame, instead of a desktop page the camera crops and pans over. Plan it as its own flow: run `showhow probe` on the vertical spec and read that layout. Menus collapse behind a hamburger, sidebars and filters move into drawers, tables scroll sideways, and some links are gone. Rewrite the steps for what is really on that screen (open the menu first, scroll to the section), and adjust the narration where the actions differ. The spec can `extends:` the landscape one and override those steps, or stand alone. Look at the vertical frames before delivering: every page should fill the window and read without zooming. Scenes and cards work in both formats; your own scenes should use `innerWidth`/`innerHeight` (or `@media (max-aspect-ratio: 1/1)`) and keep text 120 px from the top and above y = 1520 (captions and platform buttons sit below). Preview each scene with `showhow scene` on the vertical spec before rendering.

`style: trailer` turns off step chips and the cursor, frames each highlight tighter, keeps a slow push on wide shots, and puts `badge` (or nothing) where the title sits. Pair it with music up front: a more energetic `music.prompt`, `volume` ≈ 0.32 and `duck: 3` so the bed dips less under the voice. Keep each narrated beat to one or two sentences (8–12 s).

Infer the rest: audience, language (the app's or the person's), length.

Ask only what you can't see for yourself. Two things you must ask about when they apply:

- **Irreversible or account-changing steps** (Confirm, Delete, Pay, Allow, Send, Invite). Default: do not click them. Show them with `highlight` and finish with a card. Click only when the person says so for this run.
- **Real data on screen.** Default: mock it (section 4). Ask only if the person might want their real data shown.

## 1b. Think like the audience, then confirm the plan

Before discovery and before any script, answer these for yourself, in writing (they go at the top of the spec as comments):

1. **Who watches, and what do they already know?** A new user, a builder, an executive, a prospective client.
2. **What do they expect to see?** What would make them say "this is for me"? A client expects to see *their customers' experience* and *what they'd learn about their business*; an executive expects outcomes and where it fits; a builder expects how the pieces connect; a new user expects the clicks.
3. **What is the value, for them, in one sentence?** Then, for every beat: **what does this beat prove to this audience?** Cut any beat whose answer is "it shows a feature".
4. **What would undermine it?** Things that read as fake or irrelevant to *this* audience:
   - **Values vs. capability.** Demo numbers are not evidence to anyone. When the value is a capability ("you'll know your funnel and your customers"), show the capability — the real panels, what they reveal — and let the narration say what it means. Use figures only when the figures *are* the message and the person gave them.
   - **Mixed identities.** One visual style per video. If the content is a customer brand (photography, product, colours), the whole video takes that palette — accent, rings, bubbles, glows, cards — and the product appears as its name and logo in it; or the reverse. Set it once in `theme`; never let a scene fall back to another palette.
   - Admin screens in a video for end customers; procedure in a video for executives; marketing tone in a guide.
5. **What is the presentation strategy?** The arc (hook → … → close), the pace, voice or not, length, palette, and which beats are recorded footage vs. scenes.

Then **write a short plan for the person** — audience, the one-sentence value, the beats with what each proves, style and palette, length — and confirm it when any of these is a guess: the audience, the purpose, what may be shown (data, numbers, brands), the length or format, or the strategy itself. A two-minute confirmation is cheaper than a render. Don't ask about things you can see or sensible defaults; do ask about what changes the video. When the person corrects a beat, apply the reason behind it to the rest of the plan, not just that beat.

## 2. Session

**A local app** (the person's dev server, a demo): add `serve: { command: "npm run dev", url: "http://localhost:3000" }` to the spec. probe and record start it in the spec's folder, wait until it answers, and stop it afterwards; if something already answers at that URL, they use it as is.

Public pages need no session: leave `profile` out (it defaults to the app's hostname). If the app keeps state in the browser (a canvas, a cart, a dismissed welcome screen), set `fresh: true` so every probe and recording starts from an empty profile; otherwise what a probe left behind shows up in the recording.

If the app needs sign-in, run `showhow login --profile <name> <app url> [other urls in the flow]` in the background and ask the person to sign in and close the window. Never type a password, read a one-time code, or automate sign-in. Every later command uses `profile: <name>` from the spec.

## 3. Discover the path

Write a spec with just `title`, `app`, `profile` (if signed in) and one step whose `do` is a `goto`, then explore:

1. `showhow probe <spec>` → read the ARIA snapshot and look at the screenshot (Read the png).
2. Pick the next action from what is actually there. Target by **role and accessible name**, exactly as the snapshot prints them (`{ role: link, name: Settings }`); fall back to `label`, `placeholder`, `text`, `testId`, then `css`.
3. Add it as a step, `probe --after <that step>`, repeat until the goal is on screen.

If Playwright MCP is available you may explore with it instead, but write every action you keep into the spec and re-verify with `probe`: the spec is what records.

Things that break discovery: links with `target=_blank` open a tab — follow it with a `waitForUrl` at the head of the next step. Menus open on hover or click — probe after opening them. Lazy content — `waitFor` it: a menu often opens before its items load (typing into its filter too early finds nothing), so `waitFor` an item (`{ role: option }`) first. Probe runs fast, so a race that passes in `probe` can still fail in `record`, and the reverse: re-run `probe` when a step fails once.

**Actions** (`do:`; `src/spec.ts` has the exact types). A target is `{ role, name }` (name is a case-insensitive substring unless `exact: true`), else `label`, `placeholder`, `text`, `testId`, `css`; `nth` picks a match other than the first.

| Action | Does |
|---|---|
| `goto: <url>` | Opens a page (off the clock at the head of a step) |
| `click: <target>` | Moves the pointer there and clicks, on the `sync` word |
| `hover: <target>` | Moves the pointer there (menus that open on hover) |
| `highlight: <target>`, `label:` | Rings it without clicking; the camera follows. Several in one step, each with its own `sync`, walk the ring across a screen |
| `type: <text>`, `into: <target>` | Types into the target, or into whatever has focus |
| `press: <key>` | A key or chord (`Enter`, `Escape`, `Shift+1`, `r`) |
| `drag: <target>`, `from:`, `to:` | Presses and drags: draw on a canvas, move a card, a slider. `from`/`to` are points in the target's box as fractions (`{ x: 0.25, y: 0.5 }`, default the centre); `to` may be another target |
| `scroll: <target>` | Scrolls it smoothly to the middle of the screen (do this before a far-down `click` or `highlight`, or the page jumps) |
| `wait: <s>`, `waitFor: <target>`, `waitForUrl: <glob>` | Off the clock at the head of a step; on it anywhere else |
| `lift: <target>`, `as:` | Copies an element for a scene (section 5c) |

`sync` works on every action, keys and typing included: it starts on that word. The pointer moves to the centre of whatever it highlights, so tooltips and hover cards there will open: check the frames, and pick a target whose centre is calm if one covers what matters.

## 4. Privacy and mock data

Everything on screen ends up in a video someone will post. Look at every probe screenshot for names, emails, phone numbers, account ids, chat history, API keys, internal URLs, customer data. Then, in the spec:

```yaml
mock:
  text:                       # rewrite text anywhere it appears, even split across elements
    - { find: "Jane Doe", replace: "Alex Rivera" }
    - { find: "/[\\w.+-]+@[\\w-]+\\.[\\w.]+/", replace: "alex@example.com" }   # /regex/
  set:                        # pin one element's text or attribute
    - { selector: "img.avatar", attr: src, value: "https://i.pravatar.cc/80?img=5" }
  hide: [".billing-banner"]
  routes:                     # replace API responses: whole screens of believable fake data
    - { url: "**/api/agents", json: mocks/agents.json }
    - { url: "**/api/agents/:id", json: "mocks/agent-{id}.json" }        # :name captures, {name} picks the file
    - { url: "**/api/agents", method: POST, json: mocks/created.json }   # a "save" that never reaches the server
    - { url: "**/api/agents", json: mocks/agents-after.json, from: save } # only from step `save` on
    - { url: "**/api/auth/me", patch: { result: { user: { firstName: Alex } } } }  # real response, fields overridden
privacy:
  blur: ["nav .recent-chats"]  # last resort, when it can't be mocked
```

`json` routes never touch the network, reads or writes; only `patch` fetches the real response. A mocked endpoint with no fixture answers 404 — it never falls through to real data. Fixture values may use `{{now-36m}}` / `{{date-3d}}` (relative to the recording, so "36 min ago" stays true), `{{params.id}}`, and `{{body.name}}` (the request's JSON). Writes are mocked only when `method` names them.

When the person asks for mock data, prefer `routes`: `probe` writes `requests.json` with every JSON request the page made; copy one real response's **shape** into a fixture and fill it with fictional values, so the app renders mock data natively. Use `mock.text` for scattered strings (the signed-in name in the header). Re-probe and look at the screenshot: nothing real may remain.

## 5. Write the script

```yaml
title: Invite a teammate
app: https://app.example.com
profile: example
voice: { provider: elevenlabs, voice: XrExE9yKIg1WjnnlVkGX, language: en }
theme: { accent: "#6d5efc", background: "#0f1115" }
steps:
  - id: intro
    card: { kicker: Example, title: Connect Example to Claude, subtitle: About one minute. }
    say: In about a minute, Example will be one of Claude's tools.
  - id: settings
    title: Open Settings
    say: Start in Example and open Settings from the sidebar.
    do:
      - goto: https://app.example.com/
      - click: { role: link, name: Settings }
        sync: Settings
```

- **One step, one idea.** A step is a chapter, a guide heading and a screenshot. 4–9 steps.
- **Quote text with commas in `{ … }`.** In a YAML flow mapping an unquoted comma ends the value: `{ title: Who edited it, and why? }` becomes the title "Who edited it" plus a stray key. Quote it (`title: "Who edited it, and why?"`); the loader warns when it sees this.
- **Narration says what and why, in the app's own words.** Name controls exactly as labelled ("click **Add to Claude**"). Lead with the outcome when it isn't obvious. Two sentences at most per step. No filler ("simply", "just", "easy").
- **`sync` the click to the word.** `sync: Settings` lands the cursor on Settings as the narrator says it.
- **Setup is off the clock.** A step's leading `goto` / `waitForUrl` / `waitFor` / `wait` run before it starts and are cut from the video, so loading is never on screen.
- **`highlight` instead of clicking** what must not be clicked. `label:` adds a tag to the ring.
- **Cards** for the intro, the outro, and steps that can't be recorded (they happen in another app, or you were told not to do them). An outro card with numbered `bullets` recaps the steps.
- `zoom: 1` on a step keeps the full screen; otherwise the camera follows targets on its own.
- **Chapters.** `chapter: Calls` on steps groups them; each run of a name starts a chapter. A `card: { style: chapter, title: Calls }` step makes a numbered section opener. Without `chapter`, every titled step is one.
- **Cards** animate on their own (aurora background, words blurring in, bullets one by one). `highlight:` paints title words in the accent; `image: <step id>` puts that step's key moment beside the text, tilted, with its highlight ring (default: the nearest recorded step; `false` for none).
- **Target what is visible.** Charts often carry an accessibility-only `table`; highlight the heading or the chart, not the hidden table.

**Voice.** Always ElevenLabs, on **Eleven v3** (`eleven_v3`, the default: the most natural and expressive), with one of ElevenLabs' **featured voices** (the stock library, `GET /v2/voices?voice_type=default`; never clone a real person's voice). Pick the voice for the brand and the audience, and say which you picked: e.g. Jessica (playful, bright, warm) `cgSgspJ2msm6clMCkdW9`, Matilda (knowledgeable, professional) `XrExE9yKIg1WjnnlVkGX`, Laura (enthusiastic, quirky) `FGY2WhTYpPnrIDTdsKH5`, Sarah (confident, reassuring) `EXAVITQu4vr4xnSDxMaL`, George (warm British storyteller) `JBFqnCBsd6RMkjVDRZzb`, Brian (deep, comforting) `nPczCjzI2devNBz1zQrb`, Will (relaxed optimist) `bIHbv24MWmeRgasZH58o`, Chris (charming, down-to-earth) `iP95p4xoKVk53GoZ742B`, Eric (smooth, trustworthy) `cjVigY5qzO86Huf0OWal`, Alice (clear British educator) `Xb7hH8MSUJpSbSDYk0k2`. v3 speaks other languages with the same voice (`language: es`). v3 also reads audio tags for delivery, e.g. `say: "[excited] Meet Mossbit."` (`[whispers]`, `[laughs]`, `[sighs]`, `[curious]`…): showhow keeps them out of the captions and the guide. Use them sparingly, where a human narrator would; plain sentences with good punctuation usually carry the tone.

**Music.** `music: { prompt: "...", volume: 0.28 }` composes an instrumental bed with ElevenLabs Music (cached per prompt, shared by every video and language that uses it), or `music: { file: bed.mp3 }`. It fades in and out and ducks under the voice; the mix is normalised to -16 LUFS. Describe a steady, unobtrusive bed: no build-ups, no drops, no vocals.

**Pronunciation.** `voice.pronounce: { api.example.com: api dot example dot com }` — write the script and guide in the written form; only the voice hears the spoken one, and captions fold it back.

**Other languages.** A translation is a small spec that `extends` the original and overrides by step id: `title`, `app`, `voice` (`language`, a native `voice`), each step's `title`/`say`/`card`, and per-action `sync`/`label` by position (`do: [{}, {}, { sync: servidor }]`). The app's UI keeps its language, so name controls as they read on screen. Narration lengths differ, so a translation is its own `make`.

How the merge works, so the override does what you mean: objects merge key by key, lists merge item by item **by position**, `null` deletes a key. So an override can change a `goto` URL or a target's `name` (`click: { name: Ver historial }` keeps the original's `role` and `exact`), but it cannot add or remove steps, actions or bullets: items past the original's length are dropped, and a different action kind is added beside the original, not swapped in. Give the original the structure every language needs (same steps, same actions), and if a localized site needs a different path, make that translation a standalone spec.

**Every claim needs a source.** People will build on what a tutorial says, so separate what the product *does* from what you *suggest*:

- **How it works** — only what the app itself states or shows: its UI text and help copy (the ARIA snapshot carries it: paragraphs, hints, empty states), its public docs, or behaviour you observed while probing. Write these as plain facts. Mine that copy deliberately for deep-dive guides; apps explain themselves more than people expect.
- **Suggestions** — your own advice (a structure for a prompt, how many tests to run, naming conventions). In `guide:` put them in a labelled callout in the guide's language — `> **Suggestion:** …` / `> **Sugerencia:** …` — never as plain fact. In narration, phrase them as advice ("a good habit is…"), not as how the product works.
- **Never claim outcomes** — "converts better", "doubles calls", "most users" — unless the person gave you the data. No invented numbers, ever.
- Keep it about the product the person named. Don't carry conventions or examples over from another product's tutorial.

**Video vs. written guide.** Narration stays short; a step's `guide:` (Markdown) goes only into `guide.md` — best practices, tables, examples, common mistakes. A builder's guide wants both: the video shows where things are, the written guide explains why.

**Several videos of one app.** Put `app`, `profile`, `mock`, `theme` and `music` in a base file without steps, and have each video `extends` it: they share fixtures, look and the music track.

**Compression.** `render` writes a web-sized `<spec>.mp4` (named after the spec file; `output: { name }` to choose; x264 CRF 20, chapters kept) and keeps the master in `work/master.mp4`. Ask once whether the person wants that; for editing in another tool they may want the master: `--no-compress`, or `output: { compress: false }` (a number sets the CRF).

Show the person the step titles and narration before spending voice credits. Voice is cached per line, so later edits only regenerate what changed.

## 5b. Beyond the app's screens

The person may want more than the app shows. Take it in, like any brief:

- **Facts they give you** ("we support 40 languages", "the export runs nightly") are a source. Record each under `facts:` with where it came from (`source: the person, 2026-10-23`); the guide lists them under *Sources*. Use them as given; don't embellish.
- **Machine-readable sources** count too, when no screen says it: an MCP server's tool list and instructions, an OpenAPI file, a public changelog. Record them the same way.
- **Screens or clips they supply** (a mobile screenshot, a clip from another tool): a `scene` step with the built-in `showhow:media` template — `scene: { html: "showhow:media", data: { src: shots/mobile.png, title, caption, blur: [{x,y,w,h}], focus: {x,y,w,h,label,cue} } }`. Regions are fractions of the image. `focus` zooms in and rings a region, landing on the narration's `cue`, so a still reads like a recorded step. Videos are seeked per frame, so they stay in sync.
- **Ask for a screen when you can't reach it.** If the story needs a screen you can't record or shouldn't (a mobile or desktop app, a plan or role this account lacks, another person's view, a state you'd have to create for real: a payment, a sent email, a production error), don't skip it and don't fake it. Ask the person for it, precisely: which screen, in what state, what should be visible, and a size (at least 1600 px wide; a window, not the whole desktop). Ask them to save it in `shots/` next to the spec. When it arrives, **look at it before using it**: check that it shows what the narration claims, find the `focus` region, and `blur` anything private (names, emails, phone numbers, tokens, other customers), the same as the mock rules for live screens. Then say what you blurred.
- **Graphics the app has no screen for** (what an integration can do, how the pieces connect, a number worth seeing): a `scene` step. See section 5c.

## 5c. Motion graphics

A guide is structured, not flat. Between recorded steps, scenes carry what a screen can't: the idea, the connection, the number, the real UI at rest. They're HTML drawn frame by frame in the video's look, with sound that lands on their beats. [/brag](https://github.com/latent-spaces/brag)'s rules apply: **show the real thing**, **specific not generic**, **readable** (≈0.3 s per word of settled text), **make it alive**. They're not decoration: every scene says one thing the narration is saying at that moment.

**Lift the real UI.** Add `{ lift: <target>, as: <name> }` to any recorded step (it runs off the clock, so nothing visible happens). It copies that element as shown (mocks applied), with computed styles, pseudo-elements, images and fonts inlined, into `capture/lifts/<name>.html`. `probe` writes lifts to `probe/lifts/` so you can design with them before recording. Then a `showhow:ui` scene brings it to life. It's the strongest material you have: the product's own UI, not a redraw of it. Pick panels that explain something on their own: a checklist, a settings card, a result, a row. Targeting a panel's heading is easy; add `container: true` to lift the card around it.

**One palette.** Lifted panels keep the app's colours. When the video wears another palette (a customer brand's), `retint: [fromHue, toHue]` on `collage` (or `kit.retint(el, range)` in your own scene) moves saturated colours in that hue range to the video's accent, keeping their lightness.

**The customer's side.** For marketing, what the product's end users see (a public page, a checkout, a widget) sells better than the admin. Mock its API like any other (`probe` shows the requests), and lift it at the viewport it's used at: a small spec with `viewport: { width: 390, height: 844, scale: 3 }` and a `lift` step, run with `probe`, then copy `probe/lifts/<name>.html` next to the spec and pass that path (`lift: lifts/x.html`) to a scene. Don't fake what you can't record (a live video call, a payment); show the moment around it, honestly.

**Realistic demo data.** Placeholder art (flat shapes, initials) reads as fake. Use photography the licence allows (Unsplash: free for commercial use; credit it in an `assets/CREDITS.md` anyway), real-looking marks drawn for the fictional brand, and generated QR codes that actually scan. Never use a real brand's product or a real person's face for a fictional one.

**The app's look.** `probe` prints `brand:` (background, surface, text, muted, accent, fonts, radius) and writes `fonts.css` with the app's fonts embedded. Copy what's right into `theme.app`, copy `fonts.css` next to the spec and set `theme.fonts` to it, set `theme.accent` to the brand accent if it found one, and scenes can match the product. Check it against the screenshot; it's a reading, not a verdict.

**The brand, in full** (`theme`): `background`/`background2` (the field behind cards and scenes), `accent`, `text`, `font` (body, captions) and `headingFont` (the display face: card titles, scene headings, kinetic lines, big numbers), `palette` (the brand's other colours, as `--palette-1…` in scenes), `fonts` (the @font-face file). Every built-in scene and card uses them. `render` and `showhow scene` then warn about **colours outside the palette** (`palette: scene uses rgb(…) …`): an app panel in its own colour inside another brand's video, a template's default, a stray blue. Fix it (`retint`, your scene's CSS) or, if the colour is meant (water is blue), add it to `palette`. They also warn about **text too faint to read** (`scene text "…" is hard to read (contrast 1.1:1)`), usually light-on-light from colours written for a dark theme: use the shared tones every scene gets: `var(--soft)` and `var(--muted)` for secondary text, `var(--line)` for rules and borders, `var(--surface)` for panels. They're mixed from the theme's text colour, so they work on light and dark themes; never mix greys from white.

**A terminal.** When the flow runs a command (an install, a CLI, a test run), show it in `showhow:terminal` instead of describing it. Run the command for real first, in a scratch folder, and replay what it actually prints: its questions and their defaults, the lines it writes, the result. Shorten long downloads, never invent output. A local page the command produces (an HTML report) can then be recorded with `goto: path/to/index.html`, resolved from the spec's folder.

**Backdrops: don't default to the aurora.** Cards and scenes sit on a backdrop. The default (`aurora`) is a starting point, not a style: pick one that fits the brand, per video (`theme.backdrop`) and, when a beat calls for it, per step (`backdrop:` on a card or scene step). Built-in shaders, all in the theme's colours (`background`, `background2`, `accent`, `palette`):
- calm fields: `gradient` (grainy two-tone, turning), `mesh` (drifting colour fields), `grain` (flat, film grain), `sky` (soft clouds), `solid`
- flowing: `aurora`, `waves` (ribbons), `liquid` (ink folding in water), `plasma`, `lava` (merging blobs)
- light: `rays` (from above), `spotlight` (two sweeping spots), `sunburst` (turning rays, for reveals), `bokeh` (drifting lights), `stars` (a night sky)
- structure: `grid` (a floor to a glowing horizon), `blueprint` (a drafting grid), `topo` (contour lines), `cells` (Voronoi), `dots` (halftone), `stripes` (diagonal, energetic), `rings` (ripples), `scanlines` (CRT, retro)

A light brand gets a light video: set `background` light and `text` dark, and every card, caption and built-in scene follows. Text on the accent is white when it reads, else near-black; set `onAccent` to choose. Beyond the built-ins, a backdrop can be **anything that draws**:
- `{ shader: brand/x.frag }`: your own fragment shader (write only `void main(){ … gl_FragColor = … }`; uniforms `t`, `res`, `bg`, `bg2`, `acc`, `c1`–`c4`; `n()`, `fbm()` noise). See `examples/mossbit/brand/dappled.frag`.
- `{ react: vendor/reactbits/Silk/Silk.jsx, props: { color: "#7B5CFF" } }`: a React component (below).
- `{ hyperframes: vendor/hyperframes/compositions/starfield.html, vars: { density: dense } }`: a HyperFrames block (below).
- `{ html: scenes/bg.html }`: any page: three.js, p5, a canvas sketch, an SVG animation.
Preview with `showhow scene`. A scene can also paint its own full-frame background when the beat wants a place (a desk, a street, a night sky) rather than a field.

**Libraries: use their code, don't redraw it.** Scenes and backdrops are pages that run on a **virtual clock**: showhow controls `requestAnimationFrame`, `performance.now`, `Date`, timers, CSS and Web Animations, and seeds `Math.random`, advancing them frame by frame as it renders. So a library's own code runs unmodified and still renders frame-exactly. Install components the way each library distributes them, with `showhow add`, into `vendor/` next to the spec:
- **React Bits** (https://reactbits.dev: ~60 backgrounds such as Silk, Iridescence, LiquidChrome, Threads, Beams, Galaxy, Aurora, Balatro, Plasma, Particles, Hyperspeed, Dither, GridDistortion, LightRays; ~35 text animations such as SplitText, BlurText, ShinyText, DecryptedText, GradientText, RotatingText, CountUp, TextType; plus cards and effects). `showhow add reactbits:Silk` installs it from React Bits' registry. Use it as `backdrop: { react: …, props }` or `scene: { react: …, props }`; showhow bundles it and loads its npm imports (react, ogl, three, gsap, motion…) from esm.sh. Props are on its reactbits.dev page; set its colours from the theme. A text animation plays from mount, so put it in a scene step whose length fits it. Browse names with `gh api repos/DavidHDev/react-bits/contents/src/content/Backgrounds --jq '.[].name'` (or `TextAnimations`, `Animations`, `Components`).
- **HyperFrames** (https://hyperframes.heygen.com/catalog: ~450 blocks: shader transitions, kinetic type, caption styles, lower thirds, hand-drawn callouts, charts and maps, cursors, camera moves, device mockups, ambient overlays). Search with `npx hyperframes catalog <words> --json`, install with `showhow add hyperframes:<name>`, use as `scene: { hyperframes: …, vars }` (its timeline is seeked like a scene's) or `backdrop: { hyperframes: …, vars }` (looped). Its variables are declared in `data-composition-variables` at the top of the file. Blocks are 1920×1080; check one in vertical before relying on it.
- **motion.dev** (preloaded as `Motion` in every scene; https://motion.dev/docs): real springs and inertia (`Motion.animate(el, { x: [0, 400] }, { type: 'spring', stiffness, damping })`), sequences, `Motion.stagger()`, and helpers (`spring`, `interpolate`, `mix`, `wrap`, easings). Pass an animation to `kit.motion(tl, controls, at)` to drive it from the scene's timeline. Prefer springs for things with weight (characters landing, cards settling).
- **GSAP 3** (preloaded): the timeline your own scenes return; DrawSVG, MotionPath, MorphSVG, SplitText, CustomEase.
- **Any npm library** in your own scene: `<script type="module">import * as THREE from 'https://esm.sh/three@0.170.0'</script>`, pinned to a version. The virtual clock makes its animation loop render frame by frame.
Licenses travel with the code: React Bits is MIT + Commons Clause (use in the person's video; don't resell the component), HyperFrames Apache-2.0, motion.dev MIT. Say which components a video uses when you deliver it.

**Brand personality.** A brand video should feel like the brand, not like a template in its colours. Look for what carries its personality and put it on screen: its mascot or characters, its illustration style, its voice in the copy (playful, dry, warm), its shapes (rounded, sharp), its sound. If the brand has characters, make them act: they enter with weight (squash and stretch), react to what happens (a plant that wilts, then cheers up), and speak the narration (`kit.lipsync`). Choose the narration voice to match (a playful voice for a playful brand). If the product's own pages draw something (a mascot, an icon set), draw it in the scenes from the same source, so the video and the product are one cast. See `examples/mossbit`.

**Built-in scenes** (`scene: { html: "showhow:<name>", data: … }`; each file's header documents its data):

| Scene | For | Data (short) |
|---|---|---|
| `kinetic` | A hook, a chapter's thesis, a closing line | `lines: [{ text, accent, cue }]`, `sweep`, `kicker` |
| `ui` | A lifted piece of the real app, brought to life | `lift`, `items` (selector), `cues`, `draw` (SVG strokes), `marks: [{ text, cue, label }]`, `title` |
| `flow` | How things connect: inputs → core → outputs | `nodes: [{ id, label, sub, col, row, kind, cue }]`, `edges: [{ from, to, label }]`, `groups` |
| `stats` | 2–4 numbers that count up | `items: [{ value, suffix, format: duration, label, sub, cue }]`, `note` |
| `capabilities` | "What you can do with X", in columns | `columns: [{ title, badge, cue, items }]`, `footer` |
| `media` | A screen or clip the person supplied | `src`, `blur`, `focus: { x, y, w, h, label, cue }` |
| `collage` | "What you learn here": 2–4 real panels, each labelled with what it tells you | `items: [{ lift, label, cue }]`, `title`, `retint: [fromHue, toHue]` |
| `terminal` | A command run in a terminal: typed, its questions answered, output streaming, downloads filling | `window`, `lines: [{ cmd \| ask+answer \| out+tone \| progress+seconds \| blank, cue }]`, `cps` |

`cue` is a word from that step's narration: the element lands when it's spoken. Use cues: they're what make a scene feel directed instead of slid in.

**Your own scenes**, when no template fits (a before/after, a timeline, a state machine, an animated product concept), next to the spec: `scene: { html: scenes/x.html, data: … }`. GSAP 3 (with DrawSVG, MotionPath, MorphSVG, SplitText, CustomEase) is preloaded:

```html
<script>
  window.showhowTimeline = ({ data, duration, at, gsap, kit, theme }) => {
    const tl = gsap.timeline();          // build everything once; the render seeks it to each frame
    tl.from('.title', { y: 30, opacity: 0, filter: 'blur(12px)', duration: 0.9, ease: 'expo.out' }, 0.2);
    tl.from('.row', { y: 18, opacity: 0, stagger: 0.09, ease: 'back.out(1.6)' }, at('ventas', 1.5));
    kit.sfx(at('ventas', 1.5), 'pop');   // pop tick select toggle slide reveal thud success drop hover, or a file
    // kit.lift(name) → the lifted element; kit.count(el, from, to); kit.typeOn(el, text); kit.asset(path)
    // kit.lipsync(tl, ({ mouth, talking, blink }) => …): a character speaks this step's narration:
    //   mouth 0–1 per frame from the word timings, blink on a steady rhythm; draw the mouth from them
    // kit.retint(el, [fromHue, toHue]): saturated colours in that range take the accent
    return tl;
  };
</script>
```

Measure layout (positions for rings, arrows, labels) only after `await kit.ready()` (make the function `async`) and before creating `from()` tweens, which pose elements at their start state immediately. Two GSAP traps: tween `filter` (and other compound values) with `fromTo` from an explicit start — from the CSS default `none` it starts at `brightness(0)`, a black flash; and when two steps use the same scene back to back, start the second where the first ended (a match move) rather than re-entering, or the cut reads as a jump. Put what you choreograph on that timeline, so it lands on its cue. Anything else that moves on its own (a library's animation loop, CSS animations, timers, `Math.random()` noise) is fine too: the virtual clock runs it frame by frame, the same on every render. Pin network imports to a version. (`window.showhowScene({ t, … })`, a plain draw function of t, still works.)

**Motion that reads well** (from Hyperframes' guidance):
- Entrances ease out (`expo.out`, `back.out(1.6)` for small overshoot on transforms); exits ease in; camera moves are linear.
- Stagger clearly shorter than the move it offsets (≈0.09 s for 0.5 s). Sequential things stagger; things that already exist arrive together. The focal element never waits.
- No frozen holds: one slow continuous move per scene (a 3–5% linear push) so the last second is still alive.
- Combine properties only when they tell one story (slide + fade + un-blur = arrival). Counters ease out and never pass their value; digits are tabular.
- Vary energy: quiet scenes make the hero moment land. Don't use a scene where a recorded step shows it better.
- Sound: one effect per meaningful arrival, quiet (0.15–0.3), never on every word. The music bed is ducked under narration already.

Layout like a slide: one idea, large type, inside the title-safe area and above the bottom 190 px (captions). `render` checks every scene settled and refuses to continue if text leaves the safe area, collides, is clipped, sits under the captions, or the scene shows nothing. Before a full render, check each scene alone: `showhow scene <spec> <step>` writes a sheet of eight stills across its narration (real word timings, real lifts), lists its sounds and runs the layout check. Read the sheet: mid-motion frames matter as much as the settled one.

## 6. Make it, then look at it

`showhow make <spec>`. Then pull stills from every step (`ffmpeg -ss <t> -i <spec>.mp4 -frames:v 1`) — chapters.txt has each step's start — and look at them. Check: the right thing is on screen when it is named, the camera is on the action, nothing private shows, captions don't cover the thing being clicked (if they do, change the step's `zoom`), cards are readable. Fix the spec, re-run.

If a target is not found during `record`, the UI differs from discovery (a modal, a new deploy, a slower load): `probe --after` the previous step and adjust.

## 7. Deliver

Everything is in `showhow-output/<spec name>/`:

- `<spec>.mp4` — 1920×1080 (or 1080×1920), narration, click and key sounds; named after the spec file, or `output: { name }`
- `<spec>.srt`, `<spec>.vtt` — word-timed captions
- `chapters.txt` — paste into a YouTube description (YouTube's rules applied: first at 0:00, each ≥ 10 s; it reads chapters only from the description)
- chapters embedded in the MP4 (QuickTime, VLC, IINA, most players) and `chapters.vtt` (HTML5 players, Vimeo)
- `guide.md` + `guide/*.png` — the written version, one screenshot per step with the target ringed
- `poster.jpg` — the intro card settled, beside the key moment; `poster:` in the spec overrides its text or image

Tell the person where they are, the length, and anything you did not show (mocked data, highlighted-not-clicked steps). **List every suggestion you wrote** (narration and guide), so they can keep, change or cut each one before sharing. Offer: another voice or language (translate the `say` lines, change `voice`, run `make` — the recording is re-paced to the new narration), or re-recording after a UI change (`record` + `render`; the spec doesn't change unless the UI did).
