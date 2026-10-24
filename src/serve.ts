import { setTimeout as sleep } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Spec } from './spec.ts';

/**
 * Runs `fn` with the spec's local app up: `serve: { command, url }` starts it (in the spec's folder)
 * unless something already answers at `url`, waits until it answers, and stops it afterwards.
 */
export async function withServer<T>(spec: Spec, dir: string, fn: () => Promise<T>): Promise<T> {
  const s = spec.serve;
  if (!s) return fn();
  const url = s.url ?? spec.app;
  if (await answers(url)) return fn();
  console.log(`serve: ${s.command}`);
  const child = spawn(s.command, { cwd: path.resolve(dir, s.cwd ?? '.'), shell: true, detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => (err = (err + d).slice(-2000)));
  const stop = () => {
    try {
      process.kill(-child.pid!, 'SIGTERM');
    } catch {
      /* already gone */
    }
  };
  // Ctrl-C (or a kill) ends the run without reaching `finally`: stop the server on the way out too.
  const onSignal = (sig: NodeJS.Signals) => { stop(); process.exit(sig === 'SIGINT' ? 130 : 143); };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    const until = Date.now() + (s.timeout ?? 30) * 1000;
    while (!(await answers(url))) {
      if (child.exitCode !== null) throw new Error(`serve: "${s.command}" exited (${child.exitCode})\n${err}`);
      if (Date.now() > until) throw new Error(`serve: nothing answered at ${url} after ${s.timeout ?? 30}s\n${err}`);
      await sleep(300);
    }
    return await fn();
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    stop();
  }
}

async function answers(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2000) });
    return res.status < 500;
  } catch {
    return false;
  }
}
