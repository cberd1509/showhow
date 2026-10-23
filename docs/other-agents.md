# Using showhow with other agents

The skill is a single file, [`skills/showhow/SKILL.md`](../skills/showhow/SKILL.md), and it drives the CLI in `bin/`. Any agent that can run shell commands and read images can follow it.

1. Clone the repo and run `npm install` in it.
2. Give the agent the skill:
   - **Cursor, Windsurf, Aider, any agent with custom instructions:** paste `SKILL.md`, or point the agent at its path.
   - **Agents that discover skill folders** (`.agents/skills/`, `~/.gemini/config/skills/`, …): symlink or copy `skills/showhow/` there. The skill finds the CLI at `<skill-dir>/../../bin/showhow.js`, so a symlink keeps that path working; if you copy the folder, also put `showhow` on your `PATH` (`npm link` in the repo).
3. Ask for a video: *"make a tutorial of how to export a report in https://app.example.com"*.

The agent needs to look at screenshots it takes (probe output, stills from the render) to do this well.
