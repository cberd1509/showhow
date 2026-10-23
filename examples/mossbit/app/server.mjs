// Mossbit: a fictional office-plant-care app, the demo product for showhow's flagship example.
// No dependencies: `node server.mjs` serves the app on http://localhost:4173 with a demo sign-in,
// a JSON API over in-memory data, and each plant's public page (what a QR tag on its pot opens).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.PORT || 4173);
const ROOT = import.meta.dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };

const days = (n) => new Date(Date.now() - n * 86400000).toISOString();
const people = {
  ana: { name: 'Ana Ruiz', color: '#e07a5f' },
  sam: { name: 'Sam Okafor', color: '#2f6b3f' },
  lena: { name: 'Lena Fischer', color: '#ffd166' },
  raj: { name: 'Raj Patel', color: '#7ccf5a' },
  mia: { name: 'Mia Chen', color: '#c9654c' },
};
const plants = [
  { id: 'fernando', name: 'Fernando', kind: 'fern', species: 'Boston fern', spot: '3rd floor · by the big window', every: 5, last: 9, by: 'ana', light: 'Bright, indirect light', extra: 'Mist the leaves on Fridays' },
  { id: 'monty', name: 'Monty', kind: 'monstera', species: 'Monstera', spot: 'Lobby · next to the sofa', every: 7, last: 2, by: 'raj', light: 'Medium light', extra: 'Wipe the leaves once a month' },
  { id: 'prickles', name: 'Prickles', kind: 'cactus', species: 'Bunny-ear cactus', spot: 'Reception desk', every: 14, last: 6, by: 'lena', light: 'Full sun', extra: 'Less water in winter' },
  { id: 'sylvia', name: 'Sylvia', kind: 'snake', species: 'Snake plant', spot: 'Meeting room Oak', every: 14, last: 16, by: 'sam', light: 'Any light', extra: 'Let the soil dry out first' },
  { id: 'basil', name: 'Basilio', kind: 'fern', species: 'Bird’s nest fern', spot: 'Kitchen · window sill', every: 4, last: 6, by: 'mia', light: 'Bright, indirect light', extra: 'Likes the humidity' },
  { id: 'olive', name: 'Olivia', kind: 'monstera', species: 'Fiddle-leaf fig', spot: '2nd floor · design corner', every: 7, last: 3, by: 'ana', light: 'Bright light', extra: 'Don’t move her around' },
  { id: 'spike', name: 'Spike', kind: 'cactus', species: 'Golden barrel', spot: '2nd floor · Sam’s desk', every: 21, last: 10, by: 'sam', light: 'Full sun', extra: 'Almost no water' },
  { id: 'zoe', name: 'Zoe', kind: 'snake', species: 'ZZ plant', spot: 'Meeting room Pine', every: 14, last: 5, by: 'raj', light: 'Low light', extra: 'Very forgiving' },
];
const log = [
  { plant: 'monty', who: 'raj', what: 'watered', ago: 2 },
  { plant: 'olive', who: 'ana', what: 'watered', ago: 3 },
  { plant: 'fernando', who: 'lena', what: 'scanned', ago: 1, note: 'Leaves look a bit dry' },
  { plant: 'zoe', who: 'raj', what: 'watered', ago: 5 },
  { plant: 'prickles', who: 'lena', what: 'watered', ago: 6 },
  { plant: 'basil', who: 'mia', what: 'watered', ago: 6 },
  { plant: 'fernando', who: 'ana', what: 'watered', ago: 9 },
];
const mood = (p) => (p.last > p.every ? 'thirsty' : 'happy');
const view = (p) => ({ ...p, mood: mood(p), lastWatered: days(p.last), carer: people[p.by], qr: `/qr/${p.id}.svg` });

// Insights over the last 30 days: what the panels on the Insights page draw.
const insights = {
  mood: Array.from({ length: 30 }, (_, i) => ({ day: days(29 - i).slice(0, 10), happy: [7, 7, 6, 8, 7, 6, 7, 8, 8, 7, 6, 7, 7, 8, 8, 7, 7, 6, 7, 8, 8, 8, 7, 7, 8, 7, 6, 7, 6, 6][i] })),
  carers: [['ana', 14], ['raj', 11], ['lena', 8], ['mia', 6], ['sam', 3]].map(([id, n]) => ({ ...people[id], n })),
  hours: [0, 0, 0, 0, 0, 0, 0, 1, 4, 9, 6, 4, 3, 7, 5, 3, 2, 4, 2, 1, 0, 0, 0, 0],
  loved: [['monty', 23], ['prickles', 17], ['fernando', 12]].map(([id, n]) => ({ ...view(plants.find((p) => p.id === id)), hearts: n })),
};

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const signedIn = (req) => /(^|;\s*)mb_session=demo/.test(req.headers.cookie || '');

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  if (p === '/favicon.ico') return send(res, 204, '', 'image/x-icon');
  // API
  if (p === '/api/session' && req.method === 'POST') {
    res.writeHead(204, { 'set-cookie': 'mb_session=demo; Path=/; SameSite=Lax' });
    return res.end();
  }
  if (p === '/api/me') return signedIn(req) ? send(res, 200, { name: 'Sam Okafor', first: 'Sam', workspace: 'Juniper Studio' }) : send(res, 401, { error: 'signed out' });
  if (p === '/api/plants') return send(res, 200, plants.map(view));
  if (p === '/api/activity') return send(res, 200, log.map((e) => ({ ...e, who: people[e.who], plant: view(plants.find((x) => x.id === e.plant)), at: days(e.ago) })));
  if (p === '/api/insights') return send(res, 200, insights);
  let m = p.match(/^\/api\/plants\/([\w-]+)(\/water)?$/);
  if (m) {
    const plant = plants.find((x) => x.id === m[1]);
    if (!plant) return send(res, 404, { error: 'no such plant' });
    if (m[2] && req.method === 'POST') {
      plant.last = 0;
      plant.by = 'raj';
      log.unshift({ plant: plant.id, who: 'raj', what: 'watered', ago: 0 });
    }
    return send(res, 200, view(plant));
  }
  // Pages
  if (p === '/') {
    res.writeHead(302, { location: '/app' });
    return res.end();
  }
  const page = p === '/login' ? 'login.html' : p.startsWith('/p/') ? 'plant.html' : /^\/app(\/|$)/.test(p) ? 'app.html' : null;
  if (page) {
    if (page === 'app.html' && !signedIn(req)) {
      res.writeHead(302, { location: '/login' });
      return res.end();
    }
    return send(res, 200, await readFile(path.join(ROOT, page)), TYPES['.html']);
  }
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) return send(res, 403, 'no');
  try {
    return send(res, 200, await readFile(file), TYPES[path.extname(file)] || 'application/octet-stream');
  } catch {
    return send(res, 404, 'not found', 'text/plain');
  }
}).listen(PORT, () => console.log(`mossbit demo on http://localhost:${PORT}`));
