// The signed-in app: Today, Plants, a plant's page, Insights. Plain DOM, data from /api.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ago = (iso) => {
  const d = Math.round((Date.now() - new Date(iso)) / 86400000);
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};
const initials = (n) => n.split(' ').map((w) => w[0]).join('');
const avatar = (p) => `<span class="avatar" style="background:${p.color}">${initials(p.name)}</span>`;
const moodChip = (p) => p.mood === 'thirsty' ? `<span class="chip thirsty">Thirsty · ${Math.round((Date.now() - new Date(p.lastWatered)) / 86400000)} days</span>` : '<span class="chip happy">Happy</span>';
const api = (p) => fetch(p).then((r) => r.json());

// Where each plant sits on the office map (percent of the map).
const SPOTS = { fernando: [78, 28], monty: [18, 72], prickles: [36, 80], sylvia: [60, 70], basil: [88, 74], olive: [52, 26], spike: [30, 30], zoe: [70, 48] };

async function today() {
  const [me, plants] = await Promise.all([api('/api/me'), api('/api/plants')]);
  const thirsty = plants.filter((p) => p.mood === 'thirsty');
  const happy = Math.round((100 * (plants.length - thirsty.length)) / plants.length);
  $('#main').innerHTML = `
    <div class="top"><div><h1>Good morning, ${esc(me.first)}</h1><p>${thirsty.length} plants need a drink today.</p></div><button class="btn leaf">+ Add a plant</button></div>
    <div class="stats">
      <div class="card stat"><b>${plants.length}</b><span>Plants</span></div>
      <div class="card stat"><b>${happy}%</b><span>Feeling happy</span></div>
      <div class="card stat"><b>${thirsty.length}</b><span>Thirsty right now</span></div>
      <div class="card stat"><b>5</b><span>People caring this week</span></div>
    </div>
    <div class="grid2">
      <section class="card" aria-label="Needs attention"><h3>Needs attention</h3><p class="sub">The plants asking for help, most urgent first.</p>
        <div class="rows">${thirsty.map((p) => `<a class="row" href="/app/plants/${p.id}"><span class="face">${Mossbit.plant({ kind: p.kind, mood: p.mood, size: 46 })}</span><span class="who"><b>${esc(p.name)}</b><span>${esc(p.spot)}</span></span>${moodChip(p)}</a>`).join('')}
        ${plants.filter((p) => p.mood === 'happy').slice(0, 2).map((p) => `<a class="row" href="/app/plants/${p.id}"><span class="face">${Mossbit.plant({ kind: p.kind, mood: p.mood, size: 46 })}</span><span class="who"><b>${esc(p.name)}</b><span>${esc(p.spot)}</span></span>${moodChip(p)}</a>`).join('')}</div>
      </section>
      <section class="card" aria-label="Office map"><h3>Office map</h3><p class="sub">Every plant, where it lives.</p>
        <div class="map">
          <div class="room" style="left:4%;top:8%;width:40%;height:40%">2nd floor</div>
          <div class="room" style="left:48%;top:8%;width:48%;height:40%">3rd floor</div>
          <div class="room" style="left:4%;top:54%;width:44%;height:40%">Lobby</div>
          <div class="room" style="left:52%;top:54%;width:44%;height:40%">Meeting rooms</div>
          ${plants.map((p) => `<span class="dot ${p.mood}" title="${esc(p.name)}" style="left:${SPOTS[p.id][0]}%;top:${SPOTS[p.id][1]}%"></span>`).join('')}
        </div>
        <div class="legend"><span><i style="background:#7ccf5a"></i>Happy</span><span><i style="background:#ffd166"></i>Thirsty</span></div>
      </section>
    </div>`;
}

async function plantsPage() {
  const plants = await api('/api/plants');
  $('#main').innerHTML = `<div class="top"><div><h1>Plants</h1><p>${plants.length} plants across 4 spaces.</p></div><button class="btn leaf">+ Add a plant</button></div>
    <div class="plantgrid">${plants.map((p) => `<a class="card ptile" href="/app/plants/${p.id}">${Mossbit.plant({ kind: p.kind, mood: p.mood, size: 110 })}<b>${esc(p.name)}</b><span>${esc(p.spot)}</span>${moodChip(p)}</a>`).join('')}</div>`;
}

async function plantPage(id) {
  const [p, activity] = await Promise.all([api(`/api/plants/${id}`), api('/api/activity')]);
  const mine = activity.filter((e) => e.plant.id === id);
  $('#main').innerHTML = `<div class="crumb"><a href="/app/plants">Plants</a> / ${esc(p.name)}</div>
    <div class="hero">
      <div class="card portrait">${Mossbit.plant({ kind: p.kind, mood: p.mood, size: 180 })}</div>
      <section class="card" aria-label="About ${esc(p.name)}">
        <h1>${esc(p.name)}</h1><div class="species">${esc(p.species)} · ${esc(p.spot)}</div>${moodChip(p)}
        <div class="care">
          <div><i>💧</i>Water every ${p.every} days · last ${ago(p.lastWatered)} by ${esc(p.carer.name.split(' ')[0])}</div>
          <div><i>☀️</i>${esc(p.light)}</div>
          <div><i>🌿</i>${esc(p.extra)}</div>
        </div>
      </section>
      <section class="card tag" aria-label="QR tag"><h3>QR tag</h3><p class="sub">On the pot. Anyone can scan it.</p><div class="qr"><img src="${p.qr}" alt="QR tag for ${esc(p.name)}"></div><button class="btn ghost">Print tag</button></section>
    </div>
    <section class="card timeline" aria-label="Care log"><h3>Care log</h3><p class="sub">Who looked after ${esc(p.name)}.</p><div class="rows">
      ${mine.map((e) => `<div class="row">${avatar(e.who)}<span class="who"><b>${esc(e.who.name)} ${e.what} ${esc(p.name)}</b>${e.note ? `<span>“${esc(e.note)}”</span>` : ''}</span><small>${ago(e.at)}</small></div>`).join('')}
    </div></section>`;
}

async function insights() {
  const d = await api('/api/insights');
  const max = Math.max(...d.hours);
  const top = d.carers[0].n;
  $('#main').innerHTML = `<div class="top"><div><h1>Insights</h1><p>The last 30 days at Juniper Studio.</p></div></div>
    <div class="ins">
      <section class="card" aria-label="Plant mood"><h3>Plant mood</h3><p class="sub">Happy plants each day, out of 8.</p>
        <div class="bars">${d.mood.map((x) => `<i class="${x.happy < 7 ? 'low' : ''}" style="height:${(x.happy / 8) * 100}%"></i>`).join('')}</div>
        <div class="axis"><span>30 days ago</span><span>Today</span></div></section>
      <section class="card" aria-label="Who keeps them alive"><h3>Who keeps them alive</h3><p class="sub">Waterings this month.</p>
        ${d.carers.map((c) => `<div class="lb">${avatar(c)}<span style="width:96px">${esc(c.name.split(' ')[0])}</span><span class="bar"><i style="width:${(c.n / top) * 100}%"></i></span><span>${c.n}</span></div>`).join('')}</section>
      <section class="card" aria-label="When people scan"><h3>When people scan</h3><p class="sub">Tag scans by hour of the day.</p>
        <div class="bars" style="height:110px">${d.hours.slice(6, 21).map((h) => `<i style="height:${Math.max(3, (h / max) * 100)}%;background:var(--deep)"></i>`).join('')}</div>
        <div class="axis"><span>6 am</span><span>noon</span><span>8 pm</span></div></section>
      <section class="card" aria-label="Most-loved plants"><h3>Most-loved plants</h3><p class="sub">Hearts from people who scanned them.</p>
        <div class="loved">${d.loved.map((p) => `<div>${Mossbit.plant({ kind: p.kind, mood: 'happy', size: 84 })}${esc(p.name)}<span>♥ ${p.hearts}</span></div>`).join('')}</div></section>
    </div>`;
}

function soon(name) {
  $('#main').innerHTML = `<div class="top"><div><h1>${name}</h1><p>Not part of the demo.</p></div></div>`;
}

const path = location.pathname.replace(/\/$/, '');
const m = path.match(/^\/app\/plants\/([\w-]+)$/);
const route = path === '/app' ? 'home' : m ? 'plants' : path.split('/')[2];
document.querySelector(`a.nav[data-r="${route}"]`)?.classList.add('on');
document.getElementById('mini').innerHTML = Mossbit.bit({ size: 34 });
(path === '/app' ? today() : m ? plantPage(m[1]) : route === 'plants' ? plantsPage() : route === 'insights' ? insights() : soon(route === 'tags' ? 'QR tags' : 'Settings'));
