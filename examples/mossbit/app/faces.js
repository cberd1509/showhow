// Mossbit's characters, as SVG strings: Bit (the mascot, a moss ball with a sprout) and the plants,
// each with a face on its pot. Shared by the app and the video's scenes, so both draw the same cast.
// Parts carry classes for animation: .sprout .leaf .eyes-open .eyes-shut .mouth-smile .mouth-open .mouth-ry
(function () {
  const C = { moss: '#4f9a52', mossDark: '#3b7d42', deep: '#2f6b3f', leaf: '#7ccf5a', leaf2: '#9be07a', sun: '#ffd166', clay: '#e07a5f', clayDark: '#c9654c', cream: '#fff8ec', ink: '#1e2a22', drop: '#7cc6e8', dry: '#b5b65a' };

  // A circle with soft bumps: moss.
  function bumpy(cx, cy, r, n, a) {
    let d = '';
    const steps = 96;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const rr = r + a * Math.sin(n * t) + a * 0.4 * Math.sin(3 * n * t + 1);
      d += `${i ? 'L' : 'M'}${(cx + rr * Math.cos(t)).toFixed(1)} ${(cy + rr * Math.sin(t)).toFixed(1)}`;
    }
    return d + 'Z';
  }

  // Eyes, cheeks and a mouth around (cx, cy); `w` is half the distance between the eyes.
  function face(cx, cy, w, mood, s = 1) {
    const ey = cy, my = cy + 20 * s;
    const eye = (x) => `<ellipse cx="${x}" cy="${ey}" rx="${7.5 * s}" ry="${9.5 * s}" fill="${C.ink}"/><circle cx="${x + 2.6 * s}" cy="${ey - 3.4 * s}" r="${2.8 * s}" fill="#fff"/>`;
    const shut = (x) => `<path d="M${x - 8 * s} ${ey} Q${x} ${ey + 7 * s} ${x + 8 * s} ${ey}" stroke="${C.ink}" stroke-width="${3.6 * s}" fill="none" stroke-linecap="round"/>`;
    const brows = mood === 'thirsty' ? `<path d="M${cx - w - 9 * s} ${ey - 15 * s} L${cx - w + 7 * s} ${ey - 19 * s}" stroke="${C.ink}" stroke-width="${3 * s}" stroke-linecap="round"/><path d="M${cx + w + 9 * s} ${ey - 15 * s} L${cx + w - 7 * s} ${ey - 19 * s}" stroke="${C.ink}" stroke-width="${3 * s}" stroke-linecap="round"/>` : '';
    const smile = mood === 'thirsty'
      ? `<path d="M${cx - 10 * s} ${my + 2 * s} Q${cx - 5 * s} ${my - 3 * s} ${cx} ${my + 1 * s} Q${cx + 5 * s} ${my + 5 * s} ${cx + 10 * s} ${my}" stroke="${C.ink}" stroke-width="${3.4 * s}" fill="none" stroke-linecap="round"/>`
      : `<path d="M${cx - 11 * s} ${my - 3 * s} Q${cx} ${my + 9 * s} ${cx + 11 * s} ${my - 3 * s}" stroke="${C.ink}" stroke-width="${3.6 * s}" fill="none" stroke-linecap="round"/>`;
    const sleepy = mood === 'sleepy';
    return `<g class="face">
      ${brows}
      <g class="eyes-open"${sleepy ? ' style="display:none"' : ''}>${eye(cx - w)}${eye(cx + w)}</g>
      <g class="eyes-shut"${sleepy ? '' : ' style="display:none"'}>${shut(cx - w)}${shut(cx + w)}</g>
      <ellipse cx="${cx - w - 10 * s}" cy="${ey + 13 * s}" rx="${8 * s}" ry="${4.5 * s}" fill="${C.clay}" opacity=".55"/>
      <ellipse cx="${cx + w + 10 * s}" cy="${ey + 13 * s}" rx="${8 * s}" ry="${4.5 * s}" fill="${C.clay}" opacity=".55"/>
      <g class="mouth-smile">${smile}</g>
      <g class="mouth-open" style="display:none"><ellipse class="mouth-ry" cx="${cx}" cy="${my + 2 * s}" rx="${9 * s}" ry="${7 * s}" fill="#5a1f1a"/><ellipse cx="${cx}" cy="${my + 6 * s}" rx="${5.5 * s}" ry="${2.6 * s}" fill="${C.clay}"/></g>
    </g>`;
  }

  /** Bit: the Mossbit mascot. mood: happy | sleepy. */
  function bit({ mood = 'happy', size = 200 } = {}) {
    const specks = [[70, 92], [128, 84], [148, 132], [62, 146], [104, 166], [90, 78], [140, 160]]
      .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${2.5 + (i % 3)}" fill="${C.mossDark}" opacity=".7"/>`).join('');
    return `<svg class="bit" overflow="visible" viewBox="0 0 200 200" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <ellipse class="shadow" cx="100" cy="188" rx="54" ry="7" fill="#000" opacity=".16"/>
      <g class="body">
        <g class="sprout" style="transform-origin:100px 62px">
          <path d="M100 64 C100 52 99 44 101 32" stroke="${C.deep}" stroke-width="5" fill="none" stroke-linecap="round"/>
          <path class="leaf" style="transform-origin:100px 38px" d="M100 40 C86 22 64 24 58 35 C70 46 88 48 100 40Z" fill="${C.leaf}"/>
          <path class="leaf" style="transform-origin:101px 34px" d="M101 34 C113 15 138 15 144 28 C132 41 113 43 101 34Z" fill="${C.leaf2}"/>
        </g>
        <path d="${bumpy(100, 120, 64, 15, 3.2)}" fill="${C.moss}"/>
        <ellipse cx="80" cy="96" rx="30" ry="18" fill="${C.leaf}" opacity=".32"/>
        ${specks}
        ${face(100, 114, 21, mood, 1.05)}
      </g>
    </svg>`;
  }

  const LEAVES = {
    fern: (dry) => [-58, -34, -12, 12, 34, 58].map((a, i) => {
      const top = 46 + (i % 2) * 12, col = dry ? C.dry : i % 2 ? C.leaf : C.leaf2;
      const pairs = [0, 1, 2, 3, 4, 5].map((k) => {
        const y = 122 - k * ((122 - top) / 6), r = 10 - k * 1.2;
        return `<ellipse cx="${100 - r}" cy="${y}" rx="${r}" ry="${r * 0.42}" transform="rotate(-28 ${100 - r} ${y})" fill="${col}"/><ellipse cx="${100 + r}" cy="${y}" rx="${r}" ry="${r * 0.42}" transform="rotate(28 ${100 + r} ${y})" fill="${col}"/>`;
      }).join('');
      return `<g class="leaf" style="transform-origin:100px 132px;transform:rotate(${a + (dry ? Math.sign(a) * 26 : 0)}deg)">
        <path d="M100 132 C99 104 100 76 100 ${top}" stroke="${dry ? C.dry : C.deep}" stroke-width="3" fill="none" stroke-linecap="round"/>${pairs}
        <ellipse cx="100" cy="${top - 2}" rx="3.5" ry="6" fill="${col}"/>
      </g>`;
    }).join(''),
    monstera: (dry) => [[-34, 0], [0, 1], [34, 0]].map(([a, k]) =>
      `<g class="leaf" style="transform-origin:100px 132px;transform:rotate(${a + (dry ? Math.sign(a || 1) * 26 : 0)}deg)">
        <path d="M100 132 L100 ${80 - k * 14}" stroke="${C.deep}" stroke-width="4"/>
        <path d="M100 ${84 - k * 14} c-36 -6 -48 -40 -26 -58 c10 -8 22 -6 26 4 c4 -10 16 -12 26 -4 c22 18 10 52 -26 58Z" fill="${dry ? C.dry : k ? C.leaf : C.moss}"/>
        <path d="M100 ${82 - k * 14} L100 ${34 - k * 14}" stroke="${C.deep}" stroke-width="2.5" opacity=".6"/>
        <path d="M84 ${56 - k * 14} l-10 -4 M116 ${56 - k * 14} l10 -4 M86 ${42 - k * 14} l-9 -6 M114 ${42 - k * 14} l9 -6" stroke="${C.cream}" stroke-width="3" stroke-linecap="round" opacity=".8"/>
      </g>`).join(''),
    cactus: (dry) => `<g class="leaf" style="transform-origin:100px 132px;transform:rotate(${dry ? 8 : 0}deg)">
        <rect x="80" y="44" width="40" height="92" rx="20" fill="${dry ? C.dry : C.moss}"/>
        <path d="M80 100 h-12 a10 10 0 0 1 -10 -10 v-18 a8 8 0 0 1 16 0 v12 h6" fill="${dry ? C.dry : C.leaf}"/>
        <path d="M120 88 h12 a10 10 0 0 0 10 -10 v-14 a8 8 0 0 0 -16 0 v8 h-6" fill="${dry ? C.dry : C.leaf}"/>
        ${[[92, 60], [108, 72], [92, 88], [108, 104], [92, 118]].map(([x, y]) => `<path d="M${x} ${y} l-3 -3 M${x} ${y} l3 -3" stroke="${C.cream}" stroke-width="1.6"/>`).join('')}
        <circle cx="100" cy="42" r="7" fill="${C.clay}"/><circle cx="100" cy="42" r="3" fill="${C.sun}"/>
      </g>`,
    snake: (dry) => [[-22, 0, 70], [-8, 1, 92], [8, 0, 84], [22, 1, 64]].map(([a, k, h]) =>
      `<g class="leaf" style="transform-origin:100px 132px;transform:rotate(${a + (dry ? Math.sign(a) * 22 : 0)}deg)">
        <path d="M92 132 C90 ${132 - h * 0.6} 96 ${132 - h} 100 ${130 - h - 14} C104 ${132 - h} 110 ${132 - h * 0.6} 108 132Z" fill="${dry ? C.dry : k ? C.moss : C.deep}" stroke="${C.sun}" stroke-width="2.5"/>
        <path d="M97 ${126 - h * 0.3} h6 M96 ${118 - h * 0.6} h8" stroke="${C.leaf2}" stroke-width="3" stroke-linecap="round" opacity=".7"/>
      </g>`).join(''),
  };

  /** A plant in a terracotta pot with a face. kind: fern | monstera | cactus | snake. mood: happy | thirsty | sleepy. */
  function plant({ kind = 'fern', mood = 'happy', size = 200 } = {}) {
    const dry = mood === 'thirsty';
    return `<svg class="plant ${mood}" overflow="visible" viewBox="0 0 200 240" width="${size}" height="${size * 1.2}" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="100" cy="232" rx="52" ry="6" fill="#000" opacity=".14"/>
      <g class="leaves">${LEAVES[kind](dry)}</g>
      <rect x="48" y="126" width="104" height="22" rx="7" fill="${C.clayDark}"/>
      <path d="M57 145 L143 145 L133 222 Q132 231 122 231 L78 231 Q68 231 67 222 Z" fill="${C.clay}"/>
      <path d="M64 150 L72 222" stroke="#fff" stroke-width="5" opacity=".18" stroke-linecap="round"/>
      ${face(100, 176, 15, mood, 0.95)}
      ${dry ? `<path class="drop" d="M146 118 q6 10 0 14 q-6 -4 0 -14Z" fill="${C.drop}"/>` : ''}
      ${mood === 'sleepy' ? `<text x="140" y="110" font-family="Fredoka, sans-serif" font-size="20" font-weight="600" fill="${C.deep}">z</text>` : ''}
    </svg>`;
  }

  /** Lip-sync helpers: mouth 0 shows the resting smile; above that, an open mouth of that height. */
  function setMouth(svg, m) {
    const open = m > 0.05;
    svg.querySelector('.mouth-smile').style.display = open ? 'none' : '';
    svg.querySelector('.mouth-open').style.display = open ? '' : 'none';
    if (open) svg.querySelector('.mouth-ry').setAttribute('ry', (2.5 + 9 * m).toFixed(1));
  }
  function setBlink(svg, shut) {
    svg.querySelector('.eyes-open').style.display = shut ? 'none' : '';
    svg.querySelector('.eyes-shut').style.display = shut ? '' : 'none';
  }

  window.Mossbit = { colors: C, bit, plant, setMouth, setBlink };
})();
