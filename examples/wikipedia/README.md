# See who edited a Wikipedia article (English and Spanish)

A translation example. The English tutorial opens an article on en.wikipedia.org, goes to **View history**, reads
one line of it (when, who, size of the change, edit summary), then opens **prev** to compare an edit with the version
before it. The Spanish spec `extends` the English one and overrides, by step id, the title, the voice, the
narration, the article URL and the two controls whose names differ on screen (**Ver historial**, **ant**).

- `wikipedia.yaml`: English, on en.wikipedia.org
- `wikipedia.es.yaml`: Spanish, on es.wikipedia.org (`extends: wikipedia.yaml`)

```sh
node bin/showhow.js make examples/wikipedia/wikipedia.yaml
node bin/showhow.js make examples/wikipedia/wikipedia.es.yaml
```

Voices: Alice (English) and Sarah (Spanish), ElevenLabs featured voices on Eleven v3; about 770 and 900 characters. Output goes to `examples/wikipedia/showhow-output/`
(not committed).

Wikipedia is live: the newest edit at the top of the history is whatever was saved last, so the narration describes
the parts of a history line and of a diff, never a particular edit. If the page layout changes, re-probe
(`node bin/showhow.js probe examples/wikipedia/wikipedia.yaml --after changes`) and refresh the targets.
