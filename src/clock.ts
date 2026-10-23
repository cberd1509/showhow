/**
 * A virtual clock for every scene and backdrop frame (not the stage itself), installed before their
 * scripts run. Libraries that animate on their own (requestAnimationFrame loops, performance.now,
 * Date, timers, CSS and Web Animations) then run unmodified and render frame-exactly: the render
 * calls `__showhowClock.set(t)` before each frame and the page's time is exactly t. Math.random is
 * seeded, so particles and noise are the same on every render.
 *
 * Also stands in for the HyperFrames runtime a catalog block expects: `window.__hyperframes`
 * hands it the variables passed in the frame URL (`?vars=…`).
 */
export const CLOCK_SCRIPT = `(() => {
  if (window === window.top) return;
  const EPOCH = 1767225600000; // 2026-01-01, a fixed "now" for Date
  let now = 0;
  let seq = 0;
  const frames = new Map();
  const timers = new Map();

  // Seeded randomness (mulberry32): the same stars, particles and noise every render.
  let seed = 0x5eed;
  Math.random = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };

  performance.now = () => now * 1000;
  const RealDate = Date;
  class ClockDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(EPOCH + now * 1000); }
    static now() { return EPOCH + now * 1000; }
  }
  window.Date = ClockDate;

  window.requestAnimationFrame = (cb) => { frames.set(++seq, cb); return seq; };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  const addTimer = (cb, ms, repeat, args) => {
    if (typeof cb !== 'function') return 0;
    timers.set(++seq, { cb, at: now + Math.max(0, +ms || 0) / 1000, every: repeat ? Math.max(0.001, (+ms || 0) / 1000) : 0, args });
    return seq;
  };
  window.setTimeout = (cb, ms, ...args) => addTimer(cb, ms, false, args);
  window.setInterval = (cb, ms, ...args) => addTimer(cb, ms, true, args);
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);

  // CSS animations and Web Animations that play on their own follow the clock too; ones a scene
  // has paused (a GSAP or kit.motion-driven animation) are left alone.
  const driven = new WeakMap();
  const syncAnimations = () => {
    if (!document.getAnimations) return;
    for (const a of document.getAnimations()) {
      if (!driven.has(a)) {
        if (a.playState === 'paused') continue;
        driven.set(a, now - (Number(a.currentTime) || 0) / 1000);
        a.pause();
      }
      a.currentTime = Math.max(0, (now - driven.get(a)) * 1000);
    }
  };

  const tick = () => {
    for (const [id, t] of [...timers]) {
      if (t.at > now + 1e-9) continue;
      if (t.every) t.at += t.every; else timers.delete(id);
      try { t.cb(...(t.args || [])); } catch (e) { console.error(e); }
    }
    const cbs = [...frames.values()];
    frames.clear();
    for (const cb of cbs) { try { cb(now * 1000); } catch (e) { console.error(e); } }
  };

  window.__showhowClock = {
    get time() { return now; },
    // Forward in steps of at most 1/60 s, so loops that integrate (physics, trails) see every frame.
    set(t) {
      if (t < now) { now = t; tick(); syncAnimations(); return; }
      let steps = 0;
      while (now < t - 1e-9 && steps++ < 3600) { now = Math.min(t, now + 1 / 60); tick(); }
      now = t;
      if (!steps) tick(); // work queued for "now" (a first render, a 0 ms timer) still runs
      syncAnimations();
    },
  };

  // A HyperFrames block reads its variables from the runtime: give it the ones in ?vars=.
  let vars = {};
  try { vars = JSON.parse(new URLSearchParams(location.search).get('vars') || '{}'); } catch {}
  window.__hyperframes = window.__hyperframes || { getVariables: () => vars };
})();`;
