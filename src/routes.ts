import type { BrowserContext, Request } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Spec } from './spec.ts';
import { merge } from './merge.ts';

type Route = NonNullable<NonNullable<Spec['mock']>['routes']>[number];

/**
 * API mocks. A route matches a URL pattern (glob, with `:name` segments that
 * capture), a method, and optionally a window of steps. `json` answers
 * without touching the network — reads and writes alike, so a "save" never
 * reaches the real server. `patch` fetches the real response and overrides
 * fields. Values may use templates:
 *
 *   "{{now}}", "{{now-36m}}", "{{now+2d}}"   ISO timestamps relative to the run
 *   "{{date-3d}}"                           the same, as YYYY-MM-DD
 *   "{{params.id}}"                         a captured URL segment
 *   "{{body}}", "{{body.name}}"             the request's JSON body, or a field
 *
 * A string that is exactly one template takes the value's type (an object for
 * "{{body}}"); otherwise templates are interpolated as text.
 */
export async function applyRoutes(context: BrowserContext, spec: Spec, specDir: string, currentStep: () => string | undefined) {
  const routes = (spec.mock?.routes ?? []).map((r) => ({ ...r, re: compile(r.url) }));
  if (!routes.length) return;
  const order = spec.steps.map((s) => s.id);
  const active = (r: Route) => {
    const at = order.indexOf(currentStep() ?? '');
    if (r.from && (at < 0 || at < order.indexOf(r.from))) return false;
    if (r.until && at >= 0 && at > order.indexOf(r.until)) return false;
    return true;
  };
  const find = (req: Request) => {
    const method = req.method();
    if (method === 'OPTIONS') return undefined; // preflights stay real; CORS is the server's to answer
    for (const r of routes) {
      if (r.method && r.method.toUpperCase() !== method) continue;
      if (!r.method && method !== 'GET') continue; // writes are only mocked when asked for
      const m = r.re.exec(req.url().split('#')[0]);
      if (m && active(r)) return { route: r, params: m.groups ?? {} };
    }
    return undefined;
  };

  await context.route(
    (url) => routes.some((r) => r.re.test(url.toString())),
    async (route) => {
      const req = route.request();
      const hit = find(req);
      if (!hit) return route.fallback();
      const { route: r, params } = hit;
      let body: unknown;
      try {
        body = req.postDataJSON();
      } catch {
        body = req.postData();
      }
      const vars = { params, body };
      const origin = (await req.headerValue('origin')) ?? '*';
      if (r.json !== undefined) {
        let json: unknown;
        try {
          json = hydrate(load(r.json, specDir, params), vars);
        } catch {
          // A mocked API never falls through to real data: no fixture is a 404.
          console.warn(`  mock: no fixture for ${req.method()} ${req.url()}`);
          return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' }, body: '{"status":404}' });
        }
        return route.fulfill({
          status: r.status ?? (req.method() === 'POST' ? 201 : 200),
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' },
          body: JSON.stringify(json),
        });
      }
      const real = await route.fetch();
      if (r.patch === undefined) return route.fulfill({ response: real });
      const patched = merge(await real.json().catch(() => ({})), hydrate(load(r.patch, specDir, params), vars));
      return route.fulfill({ response: real, status: r.status ?? real.status(), json: patched });
    },
  );
}

/** A glob (`**` any, `*` one segment) with `:name` segments, as an anchored regex. Query strings are allowed after. */
function compile(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      re += '.*';
      i++;
    } else if (c === '*') re += '[^/?#]*';
    else if (c === ':' && /[A-Za-z_]/.test(pattern[i + 1] ?? '') && pattern[i - 1] === '/') {
      const name = /^[A-Za-z_]\w*/.exec(pattern.slice(i + 1))![0];
      re += `(?<${name}>[^/?#]+)`;
      i += name.length;
    } else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}(?:[?#].*)?$`);
}

/** Inline JSON, or a fixture path (relative to the spec) whose name may use `{id}`-style params. */
function load(v: unknown, dir: string, params: Record<string, string>): unknown {
  if (typeof v !== 'string') return v;
  const file = v.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? _);
  return JSON.parse(readFileSync(path.resolve(dir, file), 'utf8'));
}

const UNIT: Record<string, number> = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 };

function hydrate(v: unknown, vars: { params: Record<string, string>; body: unknown }): unknown {
  if (Array.isArray(v)) return v.map((x) => hydrate(x, vars));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, hydrate(x, vars)]));
  if (typeof v !== 'string' || !v.includes('{{')) return v;
  const value = (expr: string): unknown => {
    const now = /^(now|date)(?:([+-])(\d+(?:\.\d+)?)([smhdw]))?$/.exec(expr);
    if (now) {
      const delta = now[2] ? (now[2] === '-' ? -1 : 1) * Number(now[3]) * UNIT[now[4]] : 0;
      const iso = new Date(Date.now() + delta).toISOString();
      return now[1] === 'date' ? iso.slice(0, 10) : iso;
    }
    const [root, ...rest] = expr.split('.');
    let cur: unknown = root === 'params' ? vars.params : root === 'body' ? vars.body : undefined;
    for (const k of rest) cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[k] : undefined;
    return cur;
  };
  const whole = /^\{\{\s*([\w.+-]+)\s*\}\}$/.exec(v);
  if (whole) return value(whole[1]);
  return v.replace(/\{\{\s*([\w.+-]+)\s*\}\}/g, (_, e) => String(value(e) ?? ''));
}
