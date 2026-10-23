import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

/** Per-user settings, outside the tool's folder: a plugin update replaces that folder. */
export const CONFIG_ENV = path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config'), 'showhow', '.env');
const NAME = 'ELEVENLABS_API_KEY';

/**
 * `showhow key`: the person types their ElevenLabs key into their own terminal, hidden, and it is saved
 * to the per-user config (mode 600). It never passes through an agent's conversation.
 * `--status` says whether a key is set and where from, without showing it; `--remove` deletes it.
 */
export async function key(opts: { status?: boolean; remove?: boolean }) {
  if (opts.status) {
    const from = process.env.SHOWHOW_KEY_FROM;
    console.log(process.env[NAME] ? `key: set (${from ?? 'environment'})` : `key: not set — run \`showhow key\` in your own terminal, or use voice: { provider: say }`);
    return;
  }
  if (opts.remove) {
    write(lines().filter((l) => !l.startsWith(`${NAME}=`)));
    console.log(`key: removed from ${CONFIG_ENV}`);
    return;
  }
  if (!process.stdin.isTTY) throw new Error('`showhow key` asks for the key with hidden input: run it in your own terminal, not through an agent');
  const value = (await hidden(`ElevenLabs API key (elevenlabs.io → Developers → API Keys; input hidden): `)).trim();
  if (!value) throw new Error('no key entered');
  const res = await fetch('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': value } });
  if (res.status === 401) throw new Error('ElevenLabs rejected that key (401); nothing saved');
  write([...lines().filter((l) => !l.startsWith(`${NAME}=`)), `${NAME}=${value}`]);
  console.log(`key: saved to ${CONFIG_ENV} (only you can read it)${res.ok ? '' : ` — note: ElevenLabs answered ${res.status} to a test call; the key may lack the "user" permission, which is fine for voice and music`}`);
}

function lines(): string[] {
  return existsSync(CONFIG_ENV) ? readFileSync(CONFIG_ENV, 'utf8').split('\n').filter(Boolean) : [];
}

function write(list: string[]) {
  mkdirSync(path.dirname(CONFIG_ENV), { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_ENV, list.length ? `${list.join('\n')}\n` : '', { mode: 0o600 });
  chmodSync(CONFIG_ENV, 0o600);
}

function hidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    process.stdout.write(prompt);
    out._writeToOutput = (s: string) => { if (s.includes('\n') || s.includes('\r')) process.stdout.write('\n'); };
    rl.question('', (answer) => { rl.close(); resolve(answer); });
  });
}
