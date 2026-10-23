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

`<root>` is `<skill-dir>/../..`. If `<root>/node_modules` is missing, run `npm install --prefix <root>` once. Check `node --version` (23.6 or newer), `ffmpeg -version`, and that Google Chrome is installed; tell the person what's missing rather than working around it.

**The voice key.** Narration and music use ElevenLabs when a key is set. Check with `showhow key --status` (it says whether one is set and where from, never the key). If none is set and the video wants a natural voice, offer the person the choice: the free macOS voice (`voice: { provider: say }`, fine for drafts), or their ElevenLabs key. For the key, give them the exact command to run **in their own terminal** — `node <root>/bin/showhow.js key` with `<root>` resolved to an absolute path — which asks for it with hidden input, checks it and saves it to `~/.config/showhow/.env`. Never ask for the key in chat, never read or print the config file or `.env`, and never pass the key on a command line. If the person pastes a key into the chat anyway, don't repeat it; suggest they rotate it at elevenlabs.io and use `showhow key`. ElevenLabs bills per character: before the first `voice` or `make` on a long script, tell the person roughly how many characters it is. Narration is cached by line, across specs, so re-runs and vertical cuts are free.

## 1. Pin down the video

You need: the app URL, the goal, and where it ends. Infer the purpose from the ask; it sets the shape:

| Purpose | Asked as | Shape | Length |
|---|---|---|---|
| **Tutorial** | "how do I…", "record how to…" | The click path, step by step; a card to open and close | 45–120 s |
| **Deep-dive guide** | "explain how X works", "for people building X" | Chapters per concept: what it is → where it lives (recorded) → how the pieces connect (a `flow` or lifted `ui` scene) → what to watch for; a rich `guide.md` | 4–10 min |
| **Marketing video** | "a video for clients / social", "make it engaging" | [/brag](https://github.com/latent-spaces/brag)'s rules with a voice: hook in 2 s (a question or a promise, ideally shown on a real object) → the end user's experience (public page, in a phone) → what the business gets, shown as the real panels that reveal it (`collage`), not as figures → logo + tagline. Every frame postable. `style: trailer`; `format: vertical` for Reels/Shorts/TikTok | 30–60 s |
| **Executive trailer** | "present X to leadership / a client / investors", "a product trailer" | Between a launch video and a guide: value, not procedure. Hook (the problem or the promise) → reveal (name + one line) → 3–5 value beats, each a short claim proven at once by real product (a tight recorded moment or a lifted `ui` scene, no click-by-click) → proof in numbers (`stats`) → how it connects (`flow`) → close (tagline; the ask, if the person gave one). `style: trailer` | 90–120 s |

A trailer talks about outcomes, not buttons; name a button only when it's the point. Ask who watches it (leadership, clients, investors), the language, whether numbers may appear, and the length. Its **numbers** are the person's (`facts`) or the app's demo data shown **labelled as such** (`badge: "Demo data"` keeps a label on screen; say so in the stats `note`) — never invented, and never demo figures passed off as real. **Positioning lines** (hook, tagline) come from the product's own site or app copy; invent them only when the person says to, and tell them which lines are invented. No roadmap unless the person gives it.

**Vertical (9:16).** `format: vertical` renders 1080×1920 for Reels, Shorts and TikTok. A vertical cut of a landscape video is a two-line spec: `extends: <spec>.yaml` and `format: vertical`; the narration is shared (no new credits). Recorded footage becomes a portrait slice the camera moves over: the wide shot aims at where the step acts, highlights frame tighter. Prefer the customer's phone view and scenes over wide desktop pages, which show only a slice. Built-in scenes adapt; your own should use `innerWidth`/`innerHeight` (or `@media (max-aspect-ratio: 1/1)`) and keep text 120 px from the top and above y = 1520 (captions and platform buttons sit below). Preview each scene with `showhow scene` on the vertical spec before rendering.

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

If the app needs sign-in, run `showhow login --profile <name> <app url> [other urls in the flow]` in the background and ask the person to sign in and close the window. Never type a password, read a one-time code, or automate sign-in. Every later command uses `profile: <name>` from the spec.

## 3. Discover the path

Write a spec with just `title`, `app`, `profile` and no steps beyond the first `goto`, then explore:

1. `showhow probe <spec>` → read the ARIA snapshot and look at the screenshot (Read the png).
2. Pick the next action from what is actually there. Target by **role and accessible name**, exactly as the snapshot prints them (`{ role: link, name: Settings }`); fall back to `label`, `placeholder`, `text`, `testId`, then `css`.
3. Add it as a step, `probe --after <that step>`, repeat until the goal is on screen.

If Playwright MCP is available you may explore with it instead, but write every action you keep into the spec and re-verify with `probe`: the spec is what records.

Things that break discovery: links with `target=_blank` open a tab — follow it with a `waitForUrl` at the head of the next step. Menus open on hover or click — probe after opening them. Lazy content — `waitFor` it.

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
- **Narration says what and why, in the app's own words.** Name controls exactly as labelled ("click **Add to Claude**"). Lead with the outcome when it isn't obvious. Two sentences at most per step. No filler ("simply", "just", "easy").
- **`sync` the click to the word.** `sync: Settings` lands the cursor on Settings as the narrator says it.
- **Setup is off the clock.** A step's leading `goto` / `waitForUrl` / `waitFor` / `wait` run before it starts and are cut from the video, so loading is never on screen.
- **`highlight` instead of clicking** what must not be clicked. `label:` adds a tag to the ring.
- **Cards** for the intro, the outro, and steps that can't be recorded (they happen in another app, or you were told not to do them). An outro card with numbered `bullets` recaps the steps.
- `zoom: 1` on a step keeps the full screen; otherwise the camera follows targets on its own.
- **Chapters.** `chapter: Calls` on steps groups them; each run of a name starts a chapter. A `card: { style: chapter, title: Calls }` step makes a numbered section opener. Without `chapter`, every titled step is one.
- **Cards** animate on their own (aurora background, words blurring in, bullets one by one). `highlight:` paints title words in the accent; `image: <step id>` puts that step's key moment beside the text, tilted, with its highlight ring (default: the nearest recorded step; `false` for none).
- **Target what is visible.** Charts often carry an accessibility-only `table`; highlight the heading or the chart, not the hidden table.

**Music.** `music: { prompt: "...", volume: 0.28 }` composes an instrumental bed with ElevenLabs Music (cached per prompt, shared by every video and language that uses it), or `music: { file: bed.mp3 }`. It fades in and out and ducks under the voice; the mix is normalised to -16 LUFS. Describe a steady, unobtrusive bed: no build-ups, no drops, no vocals.

**Pronunciation.** `voice.pronounce: { api.example.com: api dot example dot com }` — write the script and guide in the written form; only the voice hears the spoken one, and captions fold it back.

**Other languages.** A translation is a small spec that `extends` the original and overrides by step id: `title`, `voice` (`language`, a native `voice`), each step's `title`/`say`/`card`, and per-action `sync`/`label` by position (`do: [{}, {}, { sync: servidor }]`). The app's UI keeps its language, so name controls as they read on screen. Narration lengths differ, so a translation is its own `make`.

**Every claim needs a source.** People will build on what a tutorial says, so separate what the product *does* from what you *suggest*:

- **How it works** — only what the app itself states or shows: its UI text and help copy (the ARIA snapshot carries it: paragraphs, hints, empty states), its public docs, or behaviour you observed while probing. Write these as plain facts. Mine that copy deliberately for deep-dive guides; apps explain themselves more than people expect.
- **Suggestions** — your own advice (a structure for a prompt, how many tests to run, naming conventions). In `guide:` put them in a labelled callout in the guide's language — `> **Suggestion:** …` / `> **Sugerencia:** …` — never as plain fact. In narration, phrase them as advice ("a good habit is…"), not as how the product works.
- **Never claim outcomes** — "converts better", "doubles calls", "most users" — unless the person gave you the data. No invented numbers, ever.
- Keep it about the product the person named. Don't carry conventions or examples over from another product's tutorial.

**Video vs. written guide.** Narration stays short; a step's `guide:` (Markdown) goes only into `guide.md` — best practices, tables, examples, common mistakes. A builder's guide wants both: the video shows where things are, the written guide explains why.

**Several videos of one app.** Put `app`, `profile`, `mock`, `theme` and `music` in a base file without steps, and have each video `extends` it: they share fixtures, look and the music track.

**Compression.** `render` writes a web-sized `tutorial.mp4` (x264 CRF 24, chapters kept) and keeps the master in `work/master.mp4`. Ask once whether the person wants that; for editing in another tool they may want the master: `--no-compress`, or `output: { compress: false }` (a number sets the CRF).

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

**The app's look.** `probe` prints `brand:` (background, surface, text, muted, accent, fonts, radius) and writes `fonts.css` with the app's fonts embedded. Copy what's right into `theme.app` and `theme.fonts: probe/fonts.css`, set `theme.accent` to the brand accent if it found one, and scenes can match the product. Check it against the screenshot; it's a reading, not a verdict.

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
    return tl;
  };
</script>
```

Measure layout (positions for rings, arrows, labels) only after `await kit.ready()` (make the function `async`) and before creating `from()` tweens, which pose elements at their start state immediately. Two GSAP traps: tween `filter` (and other compound values) with `fromTo` from an explicit start — from the CSS default `none` it starts at `brightness(0)`, a black flash; and when two steps use the same scene back to back, start the second where the first ended (a match move) rather than re-entering, or the cut reads as a jump. Everything that moves goes on that timeline: no CSS animations or transitions, timers, `Date.now()`, `Math.random()` (seed one if you need noise) or network. (`window.showhowScene({ t, … })`, a plain draw function of t, still works.)

**Motion that reads well** (from Hyperframes' guidance):
- Entrances ease out (`expo.out`, `back.out(1.6)` for small overshoot on transforms); exits ease in; camera moves are linear.
- Stagger clearly shorter than the move it offsets (≈0.09 s for 0.5 s). Sequential things stagger; things that already exist arrive together. The focal element never waits.
- No frozen holds: one slow continuous move per scene (a 3–5% linear push) so the last second is still alive.
- Combine properties only when they tell one story (slide + fade + un-blur = arrival). Counters ease out and never pass their value; digits are tabular.
- Vary energy: quiet scenes make the hero moment land. Don't use a scene where a recorded step shows it better.
- Sound: one effect per meaningful arrival, quiet (0.15–0.3), never on every word. The music bed is ducked under narration already.

Layout like a slide: one idea, large type, inside the title-safe area and above the bottom 190 px (captions). `render` checks every scene settled and refuses to continue if text leaves the safe area, collides, is clipped, sits under the captions, or the scene shows nothing. Before a full render, check each scene alone: `showhow scene <spec> <step>` writes a sheet of eight stills across its narration (real word timings, real lifts), lists its sounds and runs the layout check. Read the sheet: mid-motion frames matter as much as the settled one.

## 6. Make it, then look at it

`showhow make <spec>`. Then pull stills from every step (`ffmpeg -ss <t> -i tutorial.mp4 -frames:v 1`) — chapters.txt has each step's start — and look at them. Check: the right thing is on screen when it is named, the camera is on the action, nothing private shows, captions don't cover the thing being clicked (if they do, change the step's `zoom`), cards are readable. Fix the spec, re-run.

If a target is not found during `record`, the UI differs from discovery (a modal, a new deploy, a slower load): `probe --after` the previous step and adjust.

## 7. Deliver

Everything is in `showhow-output/<spec name>/`:

- `tutorial.mp4` — 1920×1080, narration, click and key sounds
- `tutorial.srt`, `tutorial.vtt` — word-timed captions
- `chapters.txt` — paste into a YouTube description (YouTube's rules applied: first at 0:00, each ≥ 10 s; it reads chapters only from the description)
- chapters embedded in the MP4 (QuickTime, VLC, IINA, most players) and `chapters.vtt` (HTML5 players, Vimeo)
- `guide.md` + `guide/*.png` — the written version, one screenshot per step with the target ringed
- `poster.jpg` — the intro card settled, beside the key moment; `poster:` in the spec overrides its text or image

Tell the person where they are, the length, and anything you did not show (mocked data, highlighted-not-clicked steps). **List every suggestion you wrote** (narration and guide), so they can keep, change or cut each one before sharing. Offer: another voice or language (translate the `say` lines, change `voice`, run `make` — the recording is re-paced to the new narration), or re-recording after a UI change (`record` + `render`; the spec doesn't change unless the UI did).
