import { parseArgs } from 'node:util';
import path from 'node:path';

const USAGE = `showhow — narrated tutorial videos of any web app

  showhow login --profile <name> <url...>    Sign in by hand; the profile is reused by every run
  showhow probe <tutorial.yaml> [--after <step>] [--url <url>] [--out <dir>]
                                             Replay steps fast, then dump what is on screen:
                                             ARIA snapshot, screenshot, JSON requests
  showhow voice <tutorial.yaml>              Generate narration (cached per line)
  showhow record <tutorial.yaml> [--headed]  Drive the app, paced by the narration
  showhow scene <tutorial.yaml> <step>      One scene alone: a sheet of stills, its sounds, the layout check
  showhow render <tutorial.yaml> [--no-compress]
                                             Compose the video, captions and guide; compressed for the web
                                             unless --no-compress (the master stays in work/ either way)
  showhow make <tutorial.yaml> [--headed] [--no-compress]
                                             voice + record + render

Output goes to showhow-output/<tutorial name>/ next to the yaml.`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  allowNegative: true,
  options: {
    compress: { type: 'boolean' },
    profile: { type: 'string' },
    after: { type: 'string' },
    url: { type: 'string' },
    out: { type: 'string' },
    headed: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
});

const [command, ...rest] = positionals;

async function main() {
  switch (command) {
    case 'login': {
      const { login } = await import('./login.ts');
      if (!values.profile || !rest.length) throw new Error('login needs --profile and at least one URL');
      return login(values.profile, rest);
    }
    case 'probe': {
      const { probe } = await import('./probe.ts');
      return probe(need(rest[0]), { after: values.after, url: values.url, out: values.out, headed: values.headed });
    }
    case 'voice': {
      const { voice } = await import('./voice.ts');
      return voice(need(rest[0]));
    }
    case 'record': {
      const { record } = await import('./record.ts');
      return record(need(rest[0]), { headed: values.headed });
    }
    case 'scene': {
      const { previewScene } = await import('./scene.ts');
      if (!rest[1]) throw new Error("which step? showhow scene <spec> <step>");
      return previewScene(need(rest[0]), rest[1]);
    }
    case 'render': {
      const { render } = await import('./render.ts');
      return render(need(rest[0]), { compress: values.compress });
    }
    case 'make': {
      const file = need(rest[0]);
      await (await import('./voice.ts')).voice(file);
      await (await import('./record.ts')).record(file, { headed: values.headed });
      return (await import('./render.ts')).render(file, { compress: values.compress });
    }
    default:
      console.log(USAGE);
      process.exitCode = command && !values.help ? 1 : 0;
  }
}

function need(file: string | undefined): string {
  if (!file) throw new Error('missing <tutorial.yaml>');
  return path.resolve(file);
}

main().catch((err) => {
  console.error(`showhow: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
