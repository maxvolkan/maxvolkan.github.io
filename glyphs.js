(() => {
  // tweak
  const OPACITY_DARK  = 0.55;
  const OPACITY_LIGHT = 0.95;
  const DENSITY       = 0.88;
  const CURSOR_GLOW   = 35;
  const GRID_PX       = 16;
  const GLYPHS        = "╱╲│─○◇△□▽┼✕◯◐◑";

  const FRAG = `
precision mediump float;
uniform vec2  u_size;
uniform float u_time;
uniform sampler2D u_glyphs;
uniform vec2  u_cursor;
uniform float u_velocity;
uniform vec3  u_ink;
uniform float u_alpha;

float h21(vec2 p){
  vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
  q+=dot(q,q.yzx+33.33);
  return fract((q.x+q.y)*q.z);
}

void main(){
  float sz=${GRID_PX}.;
  vec2 cur=vec2(u_cursor.x*u_size.x,(1.-u_cursor.y)*u_size.y);

  vec2 px=gl_FragCoord.xy;
  vec2 cell=floor(px/sz);
  float seed=h21(cell);

  vec2 cellMid=(cell+.5)*sz;
  vec2 away=cellMid-cur;
  float dist=length(away);
  float repel=1./(1.+dist*.005);
  px+=normalize(away+.01)*repel*(10.+u_velocity*6.);

  cell=floor(px/sz);
  vec2 luv=fract(px/sz);
  cellMid=(cell+.5)*sz;
  seed=h21(cell);

  float active=step(${DENSITY.toFixed(2)},seed);

  float phase=dot(cellMid/u_size,vec2(2.7,1.8))-u_time*.03+seed*6.28;
  float wave=sin(phase)*.5+.5;
  float band=smoothstep(.4,.6,wave)*smoothstep(.92,.7,wave);

  float yN=gl_FragCoord.y/u_size.y;
  float base=band*active*(.09+smoothstep(.35,.0,yN)*.06);

  float cd=length(cellMid-cur)/u_size.x;
  float glow=exp(-cd*cd*${CURSOR_GLOW}.)*(1.+u_velocity*.6);
  float vis=base+glow*(.15+u_velocity*.08)*(active+.35);

  float tick=u_time*(1.8+seed*3.)+seed*160.;
  float gi=mod(floor(tick),16.);
  vec2 ac=(vec2(mod(gi,4.),floor(gi/4.))+clamp(luv,.06,.94))/4.;
  float g=texture2D(u_glyphs,ac).r;

  vec3 ink=u_ink+glow*vec3(.06,.04,.01);
  float alpha=g*vis;

  vec2 sc=gl_FragCoord.xy/u_size-.5;
  alpha*=1.-.3*dot(sc,sc)*3.;

  float n=h21(gl_FragCoord.xy+fract(u_time*13.7))-.5;
  vec3 col=ink*alpha+n*.04*(1.+glow*.6);

  gl_FragColor=vec4(col,alpha*u_alpha);
}`;

  const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0,1);}";

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed", inset: "0", width: "100%", height: "100%",
    pointerEvents: "none", zIndex: "-10",
  });
  document.body.prepend(canvas);

  const gl = canvas.getContext("webgl", { alpha: true, antialias: false });
  if (!gl) return;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return; }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(prog);

  const U = {
    size:     gl.getUniformLocation(prog, "u_size"),
    time:     gl.getUniformLocation(prog, "u_time"),
    cursor:   gl.getUniformLocation(prog, "u_cursor"),
    velocity: gl.getUniformLocation(prog, "u_velocity"),
    ink:      gl.getUniformLocation(prog, "u_ink"),
    alpha:    gl.getUniformLocation(prog, "u_alpha"),
  };

  const atlas = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 192;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#fff";
    ctx.font = "31.2px 'Fira Mono', monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let i = 0; i < GLYPHS.length; i++) {
      const x = (i % 4) * 48 + 24;
      const y = Math.floor(i / 4) * 48 + 24;
      ctx.fillText(GLYPHS[i], x, y);
    }
    return c;
  })();

  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(prog, "u_glyphs"), 0);
  gl.clearColor(0, 0, 0, 0);

  const readState = () => {
    const isDark = document.body.classList.contains("dark");
    const raw = getComputedStyle(document.body).getPropertyValue("--text-rgb").trim();
    const [r, g, b] = raw.split(",").map(s => parseFloat(s) / 255);
    const dim = isDark ? 0.6 : 0.9;
    return {
      ink: [r * dim, g * dim, b * dim],
      alpha: isDark ? OPACITY_DARK : OPACITY_LIGHT,
    };
  };
  let state = readState();
  new MutationObserver(() => { state = readState(); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });

  const resize = () => {
    const w = Math.min(innerWidth, 3840);
    const h = Math.min(innerHeight, 2160);
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
  };
  resize();
  addEventListener("resize", resize, { passive: true });

  let cx = 0.5, cy = 0.5, vRaw = 0, vSmooth = 0, last = 0, lastDraw = 0;
  const onMove = (x, y) => {
    const nx = x / innerWidth, ny = y / innerHeight;
    vRaw = 600 * Math.hypot(nx - cx, ny - cy);
    cx = nx; cy = ny;
  };
  addEventListener("mousemove", e => onMove(e.clientX, e.clientY), { passive: true });
  addEventListener("touchmove", e => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); }, { passive: true });

  const start = performance.now();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf = 0;

  const frame = (t) => {
    const dt = last ? Math.min((t - last) / 1000, 0.1) : 0.016;
    last = t;
    const k = 1 - Math.exp(-dt / 0.12);
    vSmooth += (vRaw - vSmooth) * k;
    vRaw *= Math.exp(-dt / 0.14);
    if (t - lastDraw >= 30) {
      lastDraw = t;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(U.size, canvas.width, canvas.height);
      gl.uniform1f(U.time, (t - start) / 1000);
      gl.uniform2f(U.cursor, cx, cy);
      gl.uniform1f(U.velocity, Math.min(vSmooth / 40, 1));
      gl.uniform3f(U.ink, state.ink[0], state.ink[1], state.ink[2]);
      gl.uniform1f(U.alpha, state.alpha);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    if (!reduced) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  document.addEventListener("visibilitychange", () => {
    if (reduced) return;
    if (document.hidden) cancelAnimationFrame(raf);
    else raf = requestAnimationFrame(frame);
  }, { passive: true });
})();
