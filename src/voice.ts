import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadSpec, type Spec } from './spec.ts';
import { outputDir } from './paths.ts';

export interface Word {
  word: string;
  start: number;
  end: number;
}

export interface Line {
  step: string;
  file: string;
  duration: number;
  words: Word[];
}

const ELEVEN_DEFAULT_VOICE = 'XrExE9yKIg1WjnnlVkGX'; // Matilda: clear, informative
const ELEVEN_DEFAULT_MODEL = 'eleven_multilingual_v2';

/**
 * One audio file per step, with word timings. Cached by the exact text and
 * voice, so editing one line re-generates one line and nothing else.
 */
const VOICE_CACHE = path.resolve(import.meta.dirname, '..', '.cache', 'voice');

export async function voice(file: string): Promise<Line[]> {
  const { spec } = loadSpec(file);
  const dir = path.join(outputDir(file), 'voice');
  mkdirSync(dir, { recursive: true });
  const provider = spec.voice?.provider ?? (process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : 'say');
  const spoken = spec.steps.filter((s) => s.say);

  const lines: Line[] = [];
  const pronounce = Object.entries(spec.voice?.pronounce ?? {});
  const speakable = (s: string) => pronounce.reduce((t, [w, sp]) => t.split(w).join(sp), s.trim());
  for (const [i, step] of spoken.entries()) {
    const text = speakable(step.say!);
    const key = createHash('sha1')
      .update(JSON.stringify([provider, spec.voice?.voice, spec.voice?.model, spec.voice?.language, text]))
      .digest('hex')
      .slice(0, 12);
    const base = path.join(dir, `${step.id}-${key}`);
    const meta = `${base}.json`;
    if (existsSync(meta)) {
      lines.push(JSON.parse(readFileSync(meta, 'utf8')));
      continue;
    }
    // Shared across specs (a translation's unchanged lines, a vertical cut of the same script): the
    // same line with the same neighbours (they shape the intonation) is the same audio. Paid once.
    const prev = spoken[i - 1] && speakable(spoken[i - 1].say!);
    const next = spoken[i + 1] && speakable(spoken[i + 1].say!);
    const sharedKey = createHash('sha1').update(JSON.stringify([provider, spec.voice?.voice, spec.voice?.model, spec.voice?.language, text, prev, next])).digest('hex');
    const shared = path.join(VOICE_CACHE, sharedKey);
    if (existsSync(`${shared}.json`)) {
      const cached: Line = JSON.parse(readFileSync(`${shared}.json`, 'utf8'));
      const audio = `${base}${path.extname(cached.file)}`;
      copyFileSync(cached.file, audio);
      const line = { ...cached, step: step.id, file: audio };
      writeFileSync(meta, JSON.stringify(line, null, 2));
      lines.push(line);
      continue;
    }
    console.log(`voice: ${step.id} (${provider})`);
    const line =
      provider === 'elevenlabs'
        ? await eleven(spec, step.id, text, base, prev, next)
        : say(spec, step.id, text, base);
    line.words = unpronounce(line.words, pronounce);
    writeFileSync(meta, JSON.stringify(line, null, 2));
    mkdirSync(VOICE_CACHE, { recursive: true });
    const keep = `${shared}${path.extname(line.file)}`;
    copyFileSync(line.file, keep);
    writeFileSync(`${shared}.json`, JSON.stringify({ ...line, file: keep }, null, 2));
    lines.push(line);
  }
  writeFileSync(path.join(dir, 'lines.json'), JSON.stringify(lines, null, 2));
  const total = lines.reduce((n, l) => n + l.duration, 0);
  console.log(`voice: ${lines.length} lines, ${total.toFixed(1)}s of narration`);
  return lines;
}

export function readLines(file: string): Map<string, Line> {
  const p = path.join(outputDir(file), 'voice', 'lines.json');
  if (!existsSync(p)) throw new Error('no narration yet: run `showhow voice` first');
  const lines: Line[] = JSON.parse(readFileSync(p, 'utf8'));
  return new Map(lines.map((l) => [l.step, l]));
}

async function eleven(spec: Spec, step: string, text: string, base: string, prev?: string, next?: string): Promise<Line> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  const voiceId = spec.voice?.voice ?? ELEVEN_DEFAULT_VOICE;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: spec.voice?.model ?? ELEVEN_DEFAULT_MODEL,
        language_code: spec.voice?.language,
        // Neighbouring lines keep the intonation continuous across steps.
        previous_text: prev,
        next_text: next,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as {
    audio_base64: string;
    alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
  };
  const out = `${base}.mp3`;
  writeFileSync(out, Buffer.from(body.audio_base64, 'base64'));
  const a = body.alignment;
  return { step, file: out, duration: probeDuration(out), words: wordsFromChars(a.characters, a.character_start_times_seconds, a.character_end_times_seconds) };
}

/** macOS fallback: no timings come back, so words are spread by length. */
function say(spec: Spec, step: string, text: string, base: string): Line {
  const aiff = `${base}.aiff`;
  const out = `${base}.wav`;
  execFileSync('say', ['-v', spec.voice?.voice ?? 'Samantha', '-o', aiff, text]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, '-ar', '44100', out]);
  const duration = probeDuration(out);
  const tokens = text.split(/\s+/).filter(Boolean);
  const chars = tokens.reduce((n, w) => n + w.length + 1, 0);
  let t = 0;
  const words = tokens.map((word) => {
    const d = ((word.length + 1) / chars) * duration;
    const w = { word, start: t, end: t + d };
    t += d;
    return w;
  });
  return { step, file: out, duration, words };
}

/** Folds spoken runs ("api dot example dot com") back into the written word, keeping its timing. */
function unpronounce(words: Word[], pronounce: [string, string][]): Word[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  let out = words;
  for (const [written, spoken] of pronounce) {
    const target = spoken.split(/\s+/).map(norm).filter(Boolean);
    const next: Word[] = [];
    for (let i = 0; i < out.length; i++) {
      const run = out.slice(i, i + target.length);
      if (run.length === target.length && run.every((w, j) => norm(w.word) === target[j])) {
        const trail = run[run.length - 1].word.match(/[^\p{L}\p{N}]+$/u)?.[0] ?? '';
        next.push({ word: written + trail, start: run[0].start, end: run[run.length - 1].end });
        i += target.length - 1;
      } else next.push(out[i]);
    }
    out = next;
  }
  return out;
}

function wordsFromChars(chars: string[], starts: number[], ends: number[]): Word[] {
  const words: Word[] = [];
  let cur: Word | null = null;
  chars.forEach((c, i) => {
    if (/\s/.test(c)) {
      if (cur) words.push(cur);
      cur = null;
    } else if (!cur) cur = { word: c, start: starts[i], end: ends[i] };
    else {
      cur.word += c;
      cur.end = ends[i];
    }
  });
  if (cur) words.push(cur);
  return words;
}

export function probeDuration(file: string): number {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(out.toString().trim());
}

/** When `word` is first spoken in the line (case and punctuation ignored). */
export function wordTime(line: Line | undefined, word: string): number | undefined {
  if (!line) return undefined;
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const target = word.split(/\s+/).map(norm);
  for (let i = 0; i + target.length <= line.words.length; i++) {
    if (target.every((w, j) => norm(line.words[i + j].word) === w)) return line.words[i].start;
  }
  return undefined;
}
