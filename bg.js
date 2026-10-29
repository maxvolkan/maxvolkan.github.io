// Background: one WebGL2 full-screen pass. A spinning brain (a sheet of turntable frames)
// over an optional depth-parallax photo, mixed into one brightness, Bayer-dithered, then drawn
// in the page theme's two colours. Ported from the beanlette_site PoC.

// ───────── looks ─────────
// size = brain height in screen heights, x/y = brain centre (0..1 of the screen, past 1 = cut off),
// opacity = how much ink the brain lays down, spin = frames/s, levels = tones after dithering,
// px = canvas pixel size, strength/wiggle = the photo's mouse parallax and idle drift (the brain ignores the
// mouse, it only spins), crisp = nearest-pixel brain (off = smooth), blend = crossfade between frames
// (off = steps frame to frame), photo = photo behind.
const STYLES = {
  giant: { size: 0.9, x: 0.9, y: 0.5, opacity: 0.6, spin: 8, levels: 2, px: 2, strength: 1, wiggle: 1, crisp: false, blend: false, photo: false },
  photo: { size: 0.9, x: 0.9, y: 0.5, opacity: 0,   spin: 8, levels: 3, px: 2, strength: 1, wiggle: 1, crisp: false, blend: false, photo: true },
};
// Turntable sheet from tools/render-brain.py: `frames` frames of w×h in rows of `cols`.
// black = the render's background brightness (0..1), counted as "no brain".
const BRAIN = { src: 'assets/brain/brain.jpg', frames: 64, cols: 8, w: 448, h: 336, black: 0, start: 0 };
// ponytail: placeholder photo for local testing only, swap for your own before shipping (no credit needed then)
// Salk Institute by Carol M. Highsmith, public domain, via Wikimedia Commons
const SCENE = 'scenes/brutal';

// ───────── shaders ─────────
// One triangle bigger than the screen covers every pixel; its corners come from gl_VertexID, so no vertex buffer.
const VERT = `#version 300 es
  out vec2 v_uv;
  void main() {
    vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);  // (0,0) (2,0) (0,2)
    v_uv = p;                                               // 0..1 across the visible screen
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

const FRAG = `#version 300 es
  precision highp float;
  precision highp sampler2DArray;

  uniform sampler2D u_color;        // the photo
  uniform sampler2D u_depth;        // its depth map: white = near, black = far
  uniform sampler2DArray u_brain;   // one layer per turntable frame
  uniform vec2  u_resolution;       // canvas size in pixels
  uniform vec2  u_mouse;            // 0..1, eased, (0,0) = bottom-left
  uniform float u_turbo;            // 0..1, ramps up while the mouse button is held
  uniform float u_scroll;           // 0..1 page scroll
  uniform float u_time;             // seconds
  uniform float u_frame;            // brain frame; the fraction blends into the next one
  uniform float u_frames, u_aspect, u_black;  // brain sheet: frame count, frame w/h, background brightness
  uniform float u_size, u_x, u_y, u_opacity, u_photo, u_levels, u_strength, u_wiggle, u_crisp, u_blend;
  uniform float u_base;             // brightness of the bare page: 1 on cream, 0 on dark
  uniform vec3  u_dark, u_light;    // the theme's two colours

  in vec2 v_uv;
  out vec4 fragColor;

  #define PI 3.1415
  #define MAX_SCROLL 0.05      // how far scrolling pans the photo (in uv)
  #define SCROLL_DISTORT 0.15  // how much scrolling stretches near objects
  #define ZOOM 0.99            // zoom in a touch so displaced edges stay on the image
  #define PORTRAIT_ZOOM 0.9    // ...more on phones, which also leaves room to pan

  // "cover" fit: crop the photo to the screen's aspect ratio, centred, then pan with scroll.
  vec2 coverUV(vec2 uv) {
    vec2 img = vec2(textureSize(u_color, 0));
    float frame = u_resolution.x / u_resolution.y, image = img.x / img.y;
    bool landscape = frame > image;
    uv = 0.5 + (uv - 0.5) * (landscape ? ZOOM : PORTRAIT_ZOOM);
    vec2 visible = landscape ? vec2(1.0, image / frame) : vec2(frame / image, 1.0);
    uv = 0.5 + (uv - 0.5) * visible;
    float range = landscape ? min(1.0 - visible.y, MAX_SCROLL) : MAX_SCROLL;
    uv.y += range * (0.5 - u_scroll);
    return uv;
  }

  // Ordered (Bayer) dithering: add a repeating 4x4 pattern of tiny offsets before rounding to n levels.
  const mat4 BAYER = mat4(0.0, 8.0, 2.0, 10.0,  12.0, 4.0, 14.0, 6.0,  3.0, 11.0, 1.0, 9.0,  15.0, 7.0, 13.0, 5.0) / 16.0;
  float dither(float v, float n) {
    ivec2 p = ivec2(v_uv * u_resolution) % 4;
    v += (BAYER[p.x][p.y] + 1.0 / 32.0 - 0.5) / (n - 1.0);  // centred offsets, so pure 0 and 1 never round to a dot
    return clamp(floor(v * (n - 1.0) + 0.5) / (n - 1.0), 0.0, 1.0);
  }

  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  // crisp = nearest texel (the sprite's own chunky pixels), otherwise smooth bilinear
  vec4 brainAt(vec2 b, float layer) {
    if (u_crisp > 0.5) {
      ivec2 size = textureSize(u_brain, 0).xy;
      return texelFetch(u_brain, ivec3(clamp(ivec2(b * vec2(size)), ivec2(0), size - 1), int(layer)), 0);
    }
    return texture(u_brain, vec3(b, layer));
  }

  void main() {
    vec2 m = u_mouse * 2.0 - 1.0;  // -1..1 from centre
    vec2 drift = u_wiggle * vec2(sin(u_time * 0.5 * PI) * cos(u_time * 0.6) * 0.0075,
                                 cos(u_time * 0.8 * PI) * sin(u_time) * 0.0025);  // slow idle drift

    // photo: shift where we read it by offset * depth, so near pixels move more (the PoC's trick)
    vec2 uv = coverUV(v_uv);
    vec2 offset = vec2(0.0, u_scroll * SCROLL_DISTORT) + drift + u_strength * mix(m * 0.2, m, u_turbo);
    float photo = luma(texture(u_color, uv + offset * texture(u_depth, uv).g).rgb);
    float v = mix(u_base, photo, u_photo);

    // brain: a box u_size screens tall (screen widths on portrait phones) centred at (u_x, u_y); it ignores the mouse and just spins
    vec2 box = vec2(u_aspect, 1.0) * u_size * min(u_resolution.x, u_resolution.y);
    vec2 b = (v_uv - vec2(u_x, 1.0 - u_y)) * u_resolution / box + 0.5;
    if (b == clamp(b, 0.0, 1.0)) {
      b.y = 1.0 - b.y;  // frames are uploaded top row first
      float i = floor(u_frame);
      vec4 c = mix(brainAt(b, i), brainAt(b, mod(i + 1.0, u_frames)), (u_frame - i) * u_blend);
      float ink = clamp((luma(c.rgb) - u_black) / (1.0 - u_black), 0.0, 1.0) * c.a;
      v = mix(v, 1.0 - u_base, ink * u_opacity);  // brighter brain = more ink (light dots on dark, dark on cream)
    }
    fragColor = vec4(mix(u_dark, u_light, dither(v, u_levels)), 1.0);
  }`;

// ───────── helpers ─────────
const $ = (s) => document.querySelector(s);
const canvas = $('#bg'), f = $('#tweak form').elements;
const clamp = (v, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);
// Frame-rate independent easing toward a target. Higher rate = snappier.
const damp = (v, target, rate, dt) => target + (v - target) * Math.exp(-rate * dt);
const load = (src) => new Promise((ok, fail) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => fail(new Error('could not load ' + src));
  img.src = src;
});
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ───────── tweak panel (visit with ?tweak): its form is the live settings, presets fill it ─────────
const params = new URLSearchParams(location.search);
if (params.has('tweak')) $('#tweak').hidden = false;
if (Object.hasOwn(STYLES, params.get('style'))) f.style.value = params.get('style');  // ?style=photo to compare looks
const showValues = () => { for (const o of document.querySelectorAll('#tweak output')) o.value = o.previousElementSibling.value; };
const applyStyle = () => {
  const s = STYLES[f.style.value];
  for (const k in s) f[k].type === 'checkbox' ? f[k].checked = s[k] : f[k].value = s[k];
  if (reduced) f.spin.value = f.wiggle.value = 0;
  showValues();
};
$('#tweak form').oninput = showValues;
f.style.onchange = applyStyle;
applyStyle();

// ───────── theme: dither between the page's background and its ink colour ─────────
let theme;
const readTheme = () => {
  const css = getComputedStyle(document.body), dark = document.body.classList.contains('dark');
  const bg = css.getPropertyValue('--bg').trim().match(/\w\w/g).map((h) => parseInt(h, 16) / 255);
  const ink = css.getPropertyValue('--text-rgb').split(',').map((n, k) => bg[k] + (n / 255 - bg[k]) * 0.84);
  theme = dark ? { dark: bg, light: ink, base: 0 } : { dark: ink, light: bg, base: 1 };
};
readTheme();
new MutationObserver(readTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });

// ───────── input → targets (the render loop eases toward them) ─────────
const target = { x: 0.5, y: 0.5 }, mouse = { x: 0.5, y: 0.5 };  // 0..1, y down
let gyro = false, scrollTarget = 0, scroll = 0, turboTarget = 0, turbo = 0, held;

const point = (x, y) => { if (!gyro) { target.x = clamp(x / innerWidth); target.y = clamp(y / innerHeight); } };
addEventListener('mousemove', (e) => point(e.clientX, e.clientY), { passive: true });
for (const t of ['touchstart', 'touchmove']) addEventListener(t, (e) => point(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
// Phone tilt (where the browser allows it without asking; iPhones need a permission prompt, so they use touch)
addEventListener('deviceorientation', (e) => {
  if (e.gamma === null || e.beta === null) return;
  gyro = true;
  target.x = (clamp(e.gamma, -45, 45) + 45) / 90;
  target.y = (clamp(e.beta, -45, 45) + 45) / 90;
});
// Hold the mouse button for 150ms → turbo: the photo warps
addEventListener('mousedown', (e) => { if (!e.target.closest('#tweak')) held = setTimeout(() => turboTarget = 1, 150); });
addEventListener('mouseup', () => { clearTimeout(held); turboTarget = 0; });
const onScroll = () => scrollTarget = clamp(scrollY / Math.max(1, document.body.clientHeight - innerHeight));
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ───────── WebGL ─────────
async function main() {
  const gl = canvas.getContext('webgl2', { antialias: false, depth: false });
  if (!gl) throw new Error('this browser has no WebGL2');

  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(prog, s);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const u = {};
  for (let k = 0; k < gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); k++) {
    const name = gl.getActiveUniform(prog, k).name;
    u[name] = gl.getUniformLocation(prog, name);
  }
  const setFilter = (target, filter) => {
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  const [color, depth, sheet] = await Promise.all([load(SCENE + '_color.jpg'), load(SCENE + '_depth.png'), load(BRAIN.src)]);

  // Photo + depth. NEAREST keeps the crunchy look; flip Y because GL's origin is bottom-left.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  [color, depth].forEach((img, unit) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    setFilter(gl.TEXTURE_2D, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  });
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  // Brain: each frame of the sheet goes through a small canvas into its own layer of a texture array,
  // so frames never bleed into each other. LINEAR smooths it when it's blown up giant.
  // ponytail: RGBA layers cost frames×w×h×4 bytes of GPU memory (~38MB now); fewer/smaller frames if phones struggle
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, gl.createTexture());
  setFilter(gl.TEXTURE_2D_ARRAY, gl.LINEAR);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, BRAIN.w, BRAIN.h, BRAIN.frames);
  const slice = Object.assign(document.createElement('canvas'), { width: BRAIN.w, height: BRAIN.h }).getContext('2d');
  for (let i = 0; i < BRAIN.frames; i++) {
    slice.clearRect(0, 0, BRAIN.w, BRAIN.h);
    slice.drawImage(sheet, (i % BRAIN.cols) * BRAIN.w, Math.floor(i / BRAIN.cols) * BRAIN.h, BRAIN.w, BRAIN.h, 0, 0, BRAIN.w, BRAIN.h);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, BRAIN.w, BRAIN.h, 1, gl.RGBA, gl.UNSIGNED_BYTE, slice.canvas);
  }
  gl.uniform1i(u.u_color, 0);
  gl.uniform1i(u.u_depth, 1);
  gl.uniform1i(u.u_brain, 2);
  gl.uniform1f(u.u_frames, BRAIN.frames);
  gl.uniform1f(u.u_aspect, BRAIN.w / BRAIN.h);
  gl.uniform1f(u.u_black, BRAIN.black);

  const hoverless = matchMedia('(hover: none)');
  const t0 = performance.now();
  let last = t0, spin = BRAIN.start;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    // everything eases toward its target: this is the "floaty" feel
    mouse.x = damp(mouse.x, target.x, 6, dt);
    mouse.y = damp(mouse.y, target.y, 6, dt);
    scroll = damp(scroll, scrollTarget, 3, dt);
    turbo = damp(turbo, turboTarget, 3, dt);
    spin = (spin + dt * +f.spin.value) % BRAIN.frames;

    // canvas pixels = CSS pixels / pixel size (ignores devicePixelRatio on purpose: chunkier dither)
    const px = +f.px.value, w = Math.round(canvas.clientWidth / px), h = Math.round(canvas.clientHeight / px);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }

    gl.uniform2f(u.u_resolution, w, h);
    gl.uniform2f(u.u_mouse, mouse.x, 1 - mouse.y);  // GL's y points up
    gl.uniform1f(u.u_turbo, turbo);
    gl.uniform1f(u.u_scroll, scroll);
    gl.uniform1f(u.u_time, (now - t0) / 1000);
    gl.uniform1f(u.u_frame, spin);
    gl.uniform1f(u.u_size, +f.size.value);
    gl.uniform1f(u.u_x, +f.x.value);
    gl.uniform1f(u.u_y, +f.y.value);
    gl.uniform1f(u.u_crisp, f.crisp.checked ? 1 : 0);
    gl.uniform1f(u.u_blend, f.blend.checked ? 1 : 0);
    gl.uniform1f(u.u_opacity, +f.opacity.value);
    gl.uniform1f(u.u_photo, f.photo.checked ? 1 : 0);
    gl.uniform1f(u.u_levels, +f.levels.value);
    gl.uniform1f(u.u_strength, +f.strength.value);
    gl.uniform1f(u.u_wiggle, +f.wiggle.value);
    gl.uniform1f(u.u_base, theme.base);
    gl.uniform3fv(u.u_dark, theme.dark);
    gl.uniform3fv(u.u_light, theme.light);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // DOM parallax: styles.css moves the title, icons and glyph field against the mouse by different amounts
    if (!hoverless.matches) {
      document.documentElement.style.setProperty('--mx', mouse.x - 0.5);
      document.documentElement.style.setProperty('--my', mouse.y - 0.5);
    }
  }
  requestAnimationFrame(frame);
  canvas.classList.add('on');
}

// No WebGL2 or a missing file: the page just stays plain, everything else still works.
main().catch((e) => console.error(e));
