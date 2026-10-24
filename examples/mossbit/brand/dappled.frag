// Mossbit's backdrop: sunlight through leaves on a cream wall. Soft leaf shadows drift and sway,
// warm light pools between them. Uniforms (from showhow): t, res, bg, bg2, acc, c1–c4; fbm() and n().
void main() {
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = uv * vec2(res.x / res.y, 1.);
  // Branches sway: the shadow field is warped by a slow wind.
  vec2 wind = vec2(.04 * sin(t * .45 + p.y * 2.), .03 * cos(t * .38 + p.x * 1.7));
  vec2 q = p * 2.6 + wind + vec2(t * .015, 0.);
  float leaves = fbm(q + fbm(q * 1.7 + t * .05));
  float shadow = smoothstep(.5, .58, leaves);
  // Light pools: brighter, sun-tinted where the canopy opens.
  float light = smoothstep(.42, .28, leaves) * (.6 + .4 * sin(t * .7 + leaves * 9.));
  vec3 col = mix(bg, bg2, uv.y * .6);
  col = mix(col, mix(bg2, c3, .3) * .9, shadow * .5);
  col += c1 * light * .16;
  // A soft warm glow from the window (top right) and a gentle vignette.
  col += c1 * .10 * smoothstep(1.4, 0., length(uv - vec2(.85, 1.05)));
  col *= .94 + .06 * smoothstep(1.2, .3, length(uv - .5));
  gl_FragColor = vec4(col, 1.);
}
