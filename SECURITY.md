# Security

## Reporting a vulnerability

Please report security issues privately, through
[GitHub's private vulnerability reporting](https://github.com/cberd1509/showhow/security/advisories/new),
not in a public issue. You'll get a reply within a few days.

## What's in scope

- **Keys.** `showhow key` stores the ElevenLabs key in `~/.config/showhow/.env` (mode 600). Anything that could
  print, log, upload or commit it is a vulnerability.
- **Browser profiles.** Recordings can reuse a signed-in Chrome profile (`.profiles/`). Anything that leaks a
  profile's cookies or session outside the machine is in scope.
- **Mocks.** If a mock fails silently and real data reaches a rendered video, that's a bug worth reporting.
- **Pages and commands run from a spec** (`serve:`, scene HTML, `showhow add`). A spec is code: only run specs you trust.
