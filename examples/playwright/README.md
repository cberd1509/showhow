# Install Playwright and run your first test

A tutorial (about 45 seconds) of the whole flow on playwright.dev: open the docs, copy the install
command, run it in a terminal (its four questions answered, the browsers downloading), run the example
tests, and read the HTML report.

- `playwright.yaml`: the tutorial (landscape)
- `demo/`: the project the video's terminal output and report come from. `npm init playwright@latest`
  with its defaults was run here for real, then `npx playwright test --project=chromium`; the HTML
  report it wrote (`demo/playwright-report/`) is what the video opens.

```sh
node bin/showhow.js make examples/playwright/playwright.yaml
```

The terminals are `showhow:terminal` scenes replaying that real output (the downloads are shortened).
Narration: Matilda, an ElevenLabs featured voice, on Eleven v3 (about 690 characters).

To refresh the output after a Playwright release: delete `demo/`, re-run the two commands there, and
update the version numbers in the spec's terminal lines.
