/* ==========================================================================
   CONTOUR page — interactive outline map of Ukraine + logo draw-in, L/M/S switcher.

   Hero layers (bottom → top):
   - #ct-stage     the map "stage", tilted into pseudo-3D (CSS perspective + rotateX):
     - #ct-base    a rendered region of the map — what the camera sees plus a margin
                   (graticule, coastline ripples, land, urban areas, lakes, rivers, roads,
                   hatched RU/BY, borders, oblast centres). Panning only moves it with a
                   CSS transform; it is re-rendered when the margin runs out.
     - #ct-base-alt  spare canvas: zoom flies pre-render the destination here, so zooming
                   never shows an upscaled, pixelated map.
     - #ct-map     intro only — coastlines + borders drawn incrementally.
   - #ct-walls-gl  the soft part of the defence zone on WebGL: edge vignette (replaces the
                   CSS shade once docked), ground tint of each echelon, pseudo-3D walls.
                   Without WebGL all of it is drawn in 2D on #ct-walls.
   - #ct-walls     screen-space canvas for the crisp part of the zone: the S / M / L ring
                   outlines at true scale with their smooth merge, and the captions — all
                   drawn with the same perspective as the stage (proj()).
   - .ct-obj       up to 5 defence points (shields), placed in screen space. Click the map
                   to add one, press + move to drag it, click it to remove it (the last one
                   stays). Near an oblast centre a point takes its name. Arrow keys / Delete.
   Hold the left mouse button on the map to pan it; zoom with − / slider / + next to Replay.
   Russia and Belarus are unavailable territory: no point can be placed there.

   Performance notes
   - all map geometry is projected onto the unit sphere ONCE and cached as Path2D objects;
     a render at any zoom only sets the canvas matrix (no per-vertex work);
   - lines are also bucketed into a spatial grid, so a render strokes only the cells inside
     its region (at max zoom that is a small part of the map);
   - between renders the map is moved / scaled by CSS; a zoom drag re-renders only when the
     scale has drifted noticeably or the camera would see past the rendered margin;
   - the echelon merge is analytic (circle arcs + fillet arcs), not an SVG blur filter,
     so moving a point / the camera costs a few canvas paths per frame;
   - pan, drag, zoom and tilt only update state; one rAF ticker draws once per frame.

   Map data: assets/data/ukraine.js (Natural Earth via world-atlas; Crimea is part of Ukraine)
   and assets/data/ukraine-detail.js (Natural Earth 10m roads, urban areas, rivers, lakes).
   Nothing here is tied to scrolling.
   ========================================================================== */
(function () {
  const hero = document.getElementById('ct-hero');
  if (!hero) return;
  const base = document.getElementById('ct-base');
  const lineCv = document.getElementById('ct-map');
  const ctx = lineCv.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const INTRO_MS = 5200;   // CSS logo timeline length
  const DRAW = 1.6;        // seconds each map line takes to draw
  const MAP_FILL = 0.8;    // at zoom 1 Ukraine takes this share of the hero width
  // ZOOM_MIN is a floor: on wide screens the tilted view needs a bit more zoom to stay inside PAN_BOX
  const ZOOM_MIN = 1.25, ZOOM_MAX = 5, ZOOM_STEP = 1.4;
  // default framing (also used by Replay): this zoom, with Kyiv at this share of the hero size
  const DEFAULT_ZOOM = 1.65;
  const DEFAULT_FOCUS = { lon: 30.52, lat: 50.45, fx: 0.478, fy: 0.53 };
  const PAD = 0.15;        // rendered region = what the camera sees + this share of the hero size all round
  // ring radii in km — S is the SPYS HL tactical range (hand-launched, self defence)
  const KM = { L: 50, M: 30, S: 12 };
  const EARTH_KM = 6371;

  /* ---------- Logo: outline layer cloned from the fill paths ---------- */
  const fill = document.getElementById('ct-logo-fill');
  const stroke = document.getElementById('ct-logo-stroke');
  [...fill.querySelectorAll('path')].forEach((p, i) => {
    const ln = p.cloneNode();
    ln.removeAttribute('fill-rule');
    ln.setAttribute('class', 'ct-ln');
    ln.setAttribute('pathLength', '1');
    ln.style.setProperty('--d', (i * 0.1).toFixed(2) + 's');
    stroke.appendChild(ln);
  });

  /* ---------- Projection: Lambert azimuthal equal-area centred on Ukraine ----------
     Distances near the centre are preserved to well under 1 % across Ukraine,
     so 1 km on the ground = S / EARTH_KM px on screen. */
  const RAD = Math.PI / 180;
  const LON0 = 31 * RAD, LAT0 = 48.5 * RAD;
  const sin0 = Math.sin(LAT0), cos0 = Math.cos(LAT0);
  const UA_BOX = [22.1, 44.3, 40.3, 52.4];     // Ukraine extent (lon/lat)
  // the camera never sees past this box: it lies inside the detail data (roads, rivers: 15–47°E, 40.5–57.5°N)
  const PAN_BOX = [16, 41.5, 46, 56.5];
  let W = 0, H = 0, S0 = 1, S = 1, zoom = DEFAULT_ZOOM, zMin = ZOOM_MIN, minX = 0, maxY = 0, worldW = 0, worldH = 0, vx = 0, vy = 0;
  let dpr = 1, rdpr = 1;
  let ua = null, panB = null;                  // projected bounds of UA_BOX, rectangle inside PAN_BOX (unit sphere)
  function laea(lon, lat) {
    const l = lon * RAD - LON0, p = lat * RAD, cp = Math.cos(p);
    const k = Math.sqrt(2 / (1 + sin0 * Math.sin(p) + cos0 * cp * Math.cos(l)));
    return [k * cp * Math.sin(l), k * (cos0 * Math.sin(p) - sin0 * cp * Math.cos(l))];
  }
  const world = (lon, lat) => { const [x, y] = laea(lon, lat); return [x * S - minX, maxY - y * S]; };
  const project = (lon, lat) => { const [x, y] = world(lon, lat); return [x - vx, y - vy]; };
  function invert(X, Y) {
    const x = (X + vx + minX) / S, y = (maxY - (Y + vy)) / S, r = Math.hypot(x, y);
    if (r < 1e-9) return [LON0 / RAD, LAT0 / RAD];
    const c = 2 * Math.asin(Math.min(1, r / 2)), sc = Math.sin(c), cc = Math.cos(c);
    return [(LON0 + Math.atan2(x * sc, r * cos0 * cc - y * sin0 * sc)) / RAD, Math.asin(cc * sin0 + (y * sc * cos0) / r) / RAD];
  }
  // projected bounds of a lon/lat box (edges sampled — they are curved in this projection)
  function bounds([a, b, c, d]) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      for (const [lon, lat] of [[a + (c - a) * t, b], [a + (c - a) * t, d], [a, b + (d - b) * t], [c, b + (d - b) * t]]) {
        const [x, y] = laea(lon, lat); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    return { x0, x1, y0, y1 };
  }
  // the largest axis-aligned rectangle inside a projected lon/lat box
  function inner([a, b, c, d]) {
    let x0 = -Infinity, x1 = Infinity, y0 = -Infinity, y1 = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.02) {
      x0 = Math.max(x0, laea(a, b + (d - b) * t)[0]); x1 = Math.min(x1, laea(c, b + (d - b) * t)[0]);
      y0 = Math.max(y0, laea(a + (c - a) * t, b)[1]); y1 = Math.min(y1, laea(a + (c - a) * t, d)[1]);
    }
    return { x0, x1, y0, y1 };
  }
  const pxPerKm = () => S / EARTH_KM;
  function applyScale() {
    S = S0 * zoom;
    minX = panB.x0 * S; maxY = panB.y1 * S;
    worldW = Math.ceil((panB.x1 - panB.x0) * S); worldH = Math.ceil((panB.y1 - panB.y0) * S);
  }
  function fit() {
    ua = bounds(UA_BOX); panB = inner(PAN_BOX);
    S0 = (W * MAP_FILL) / (ua.x1 - ua.x0);
    // the least zoom at which the tilted camera's view still fits inside the pan box
    const f = footprint(TILT);
    zMin = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (f.x1 - f.x0) / ((panB.x1 - panB.x0) * S0), (f.y1 - f.y0) / ((panB.y1 - panB.y0) * S0)));
    if (hero.classList.contains('is-docked')) zoom = Math.min(ZOOM_MAX, Math.max(zMin, zoom));
    applyScale();
  }
  // default framing: Kyiv at DEFAULT_FOCUS.fx / fy of the hero
  function centreView() {
    const [wx, wy] = world(DEFAULT_FOCUS.lon, DEFAULT_FOCUS.lat);
    vx = wx - W * DEFAULT_FOCUS.fx;
    vy = wy - H * DEFAULT_FOCUS.fy;
    clampView();
  }
  // everything the camera sees stays inside the pan box — with tilt that is the whole trapezoid on
  // the map plane, not just the screen rectangle (the far edge reaches further and wider)
  function clampView() {
    const f = footprint(Math.max(tilt, tiltGoal));
    const fit = (v, lo, hi, size) => (hi - lo <= size ? Math.min(Math.max(v, -lo), size - hi) : (size - lo - hi) / 2);
    vx = fit(vx, f.x0, f.x1, worldW); vy = fit(vy, f.y0, f.y1, worldH);
  }

  /* ---------- Oblast centres (+ Simferopol, Sevastopol) — the only labelled cities ---------- */
  const CITIES = [
    ['Kyiv', 30.52, 50.45], ['Vinnytsia', 28.47, 49.23], ['Lutsk', 25.33, 50.75], ['Dnipro', 35.05, 48.46], ['Donetsk', 37.8, 48.0],
    ['Zhytomyr', 28.66, 50.25], ['Uzhhorod', 22.29, 48.62], ['Zaporizhzhia', 35.14, 47.84], ['Ivano-Frankivsk', 24.71, 48.92],
    ['Kropyvnytskyi', 32.26, 48.51], ['Luhansk', 39.31, 48.57], ['Lviv', 24.03, 49.84], ['Mykolaiv', 31.99, 46.98], ['Odesa', 30.73, 46.48],
    ['Poltava', 34.55, 49.59], ['Rivne', 26.25, 50.62], ['Sumy', 34.8, 50.91], ['Ternopil', 25.6, 49.55], ['Kharkiv', 36.23, 49.99],
    ['Kherson', 32.62, 46.64], ['Khmelnytskyi', 27.0, 49.42], ['Cherkasy', 32.06, 49.44], ['Chernivtsi', 25.94, 48.29],
    ['Chernihiv', 31.29, 51.49], ['Simferopol', 34.1, 44.95], ['Sevastopol', 33.52, 44.62],
  ];

  /* ---------- Map geometry, projected onto the unit sphere ONCE ----------
     Every path lives in unit-sphere coordinates; a render maps it to the screen with the
     canvas matrix [S, 0, 0, −S, −minX − x0, maxY − y0], so zooming never re-projects.
     Lines and small polygons are also bucketed into a grid: each kind has a full path plus
     one path per cell, and a render collects only the cells that intersect its region. */
  // line styles: 0 coast · 1 border · 2 Ukraine border · 3 RU/BY lines
  const STYLE = [['rgba(255,255,255,0.5)', 1], ['rgba(255,255,255,0.22)', 0.8], ['rgba(255,255,255,0.85)', 1.3], ['rgba(255,255,255,0.14)', 0.8]];
  const CELL = 0.02;       // grid cell in unit-sphere units (≈ 127 km)
  let geo = null, U = null, lines = [];
  const hitCtx = document.createElement('canvas').getContext('2d');     // identity transform → unit coords
  const EMPTY = new Path2D();

  function unitArr(f) {
    const a = new Float32Array(f.length);
    for (let i = 0; i < f.length; i += 2) { const [x, y] = laea(f[i], f[i + 1]); a[i] = x; a[i + 1] = y; }
    return a;
  }
  const addPoly = (path, a, close) => { path.moveTo(a[0], a[1]); for (let i = 2; i < a.length; i += 2) path.lineTo(a[i], a[i + 1]); if (close) path.closePath(); };
  // vertices [from, to) of a unit-coord array as one subpath: into the full path of its kind
  // and into the grid cell under its centre (the cell's box grows to hold it)
  function addChunk(kind, a, from, to, close) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = from; i < to; i += 2) { x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1]); }
    const key = `${Math.floor((x0 + x1) / 2 / CELL)},${Math.floor((y0 + y1) / 2 / CELL)}`;
    let C = U.grid.get(key);
    if (!C) U.grid.set(key, (C = { x0, y0, x1, y1, p: {} }));
    else { C.x0 = Math.min(C.x0, x0); C.y0 = Math.min(C.y0, y0); C.x1 = Math.max(C.x1, x1); C.y1 = Math.max(C.y1, y1); }
    const piece = a.subarray ? a.subarray(from, to) : a.slice(from, to);
    addPoly(U.full[kind] || (U.full[kind] = new Path2D()), piece, close);
    addPoly(C.p[kind] || (C.p[kind] = new Path2D()), piece, close);
  }
  // a polyline goes in as chunks no larger than a cell; consecutive chunks share an end vertex
  function addLine(kind, a) {
    let s = 0, x0 = a[0], x1 = a[0], y0 = a[1], y1 = a[1];
    for (let i = 2; i < a.length; i += 2) {
      x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1]);
      if (x1 - x0 <= CELL && y1 - y0 <= CELL) continue;
      if (i - s > 2) addChunk(kind, a, s, i, false);
      s = i - 2;
      x0 = Math.min(a[s], a[i]); x1 = Math.max(a[s], a[i]); y0 = Math.min(a[s + 1], a[i + 1]); y1 = Math.max(a[s + 1], a[i + 1]);
    }
    if (a.length - s > 2) addChunk(kind, a, s, a.length, false);
  }
  // kinds: grat · l0…l3 (line styles; l0 also carries the coastline ripples) · urban · lakes ·
  // r0…r2 (rivers, thin → thick) · d0…d2 (roads, major → minor)
  function buildUnit() {
    U = { lines: [], full: {}, grid: new Map(), land: new Path2D(), ua: new Path2D(), hostile: new Path2D() };
    geo.coast.forEach((c) => U.lines.push({ u: unitArr(c.p), cls: c.h ? 3 : 0 }));
    geo.border.forEach((b) => U.lines.push({ u: unitArr(b.p), cls: b.u ? 2 : b.h ? 3 : 1 }));
    U.lines.forEach((L) => addLine(`l${L.cls}`, L.u));
    geo.land.forEach((l) => addPoly(l.h ? U.hostile : l.u ? U.ua : U.land, unitArr(l.p), true));
    // graticule every 2°
    for (let lon = 10; lon <= 52; lon += 2) { const a = []; for (let lat = 38; lat <= 60; lat += 0.5) a.push(...laea(lon, lat)); addLine('grat', a); }
    for (let lat = 38; lat <= 60; lat += 2) { const a = []; for (let lon = 10; lon <= 52; lon += 0.5) a.push(...laea(lon, lat)); addLine('grat', a); }
    const D = window.CT_UKRAINE_DETAIL;
    if (D) {
      U.detail = true;
      D.urban.forEach((f) => addChunk('urban', unitArr(f), 0, f.length, true));
      D.lakes.forEach((f) => addChunk('lakes', unitArr(f), 0, f.length, true));
      D.rivers.forEach((r) => addLine(`r${r.w}`, unitArr(r.p)));
      D.roads.forEach((r) => addLine(`d${r.c}`, unitArr(r.p)));
    }
    U.cities = CITIES.map(([n, lon, lat]) => { const [ux, uy] = laea(lon, lat); return { n, ux, uy }; });
  }
  // a path getter for one region: each kind is merged from the grid cells that intersect the
  // region (+ pad px for the widest strokes); when most cells are in, the full paths are used
  function pathsIn(reg, pad = 40) {
    const p = pad / S, x0 = (reg.x + minX) / S - p, x1 = (reg.x + reg.w + minX) / S + p;
    const y0 = (maxY - reg.y - reg.h) / S - p, y1 = (maxY - reg.y) / S + p;
    const cells = [...U.grid.values()].filter((C) => C.x1 >= x0 && C.x0 <= x1 && C.y1 >= y0 && C.y0 <= y1);
    const all = cells.length > U.grid.size * 0.6, made = {};
    return (kind) => {
      if (all) return U.full[kind] || EMPTY;
      if (!made[kind]) { const path = new Path2D(); for (const C of cells) if (C.p[kind]) path.addPath(C.p[kind]); made[kind] = path; }
      return made[kind];
    };
  }
  // world px (current zoom) polylines — only for the intro draw-in
  function buildLines() {
    return U.lines.map((L) => {
      const a = L.u, n = a.length / 2, p = new Float32Array(n * 2), len = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        p[i * 2] = a[i * 2] * S - minX; p[i * 2 + 1] = maxY - a[i * 2 + 1] * S;
        if (i) len[i] = len[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
      }
      return { p, len, cls: L.cls, idx: 0, mid: [p[(n >> 1) * 2], p[(n >> 1) * 2 + 1]] };
    });
  }
  const hatchTile = (() => {
    const t = document.createElement('canvas'); t.width = t.height = 9;
    const h = t.getContext('2d'); h.strokeStyle = 'rgba(255,255,255,0.16)'; h.lineWidth = 1;
    h.beginPath(); h.moveTo(-1, 10); h.lineTo(10, -1); h.moveTo(-1, 1); h.lineTo(1, -1); h.moveTo(8, 10); h.lineTo(10, 8); h.stroke();
    return t;
  })();
  const isHostile = (x, y) => !!U && hitCtx.isPointInPath(U.hostile, (x + vx + minX) / S, (maxY - (y + vy)) / S);

  /* ---------- Rendered region: what the camera sees + a margin ----------
     Two map canvases: `cur` is on screen; during a zoom fly the spare one (`alt`) is
     pre-rendered at the destination zoom. The layer on top is always the one being scaled
     DOWN (stays crisp); `alt` becomes `cur` on landing — no upscaled, pixelated frames.
     The canvases are opaque, so the compositor draws them without blending. */
  const mkLayer = (cv) => ({ cv, c: cv.getContext('2d', { alpha: false }), reg: { x: 0, y: 0, w: 0, h: 0, S: 1, lines: false } });
  let cur = mkLayer(base), alt = mkLayer(document.getElementById('ct-base-alt'));
  let region = cur.reg, flying = false, lastRender = 0;
  const unitSpace = (c, reg) => c.setTransform(rdpr * S, 0, 0, -rdpr * S, rdpr * (-minX - reg.x), rdpr * (maxY - reg.y));
  function strokeLines(c, g) {
    const u = 1 / S;
    for (let s = 0; s < STYLE.length; s++) { c.strokeStyle = STYLE[s][0]; c.lineWidth = STYLE[s][1] * u; c.stroke(g(`l${s}`)); }
  }
  // lite: for a layer seen only in motion and from afar (the city flight's overview) — two coast ripples,
  // big rivers and main roads only
  // box: an explicit area to render instead (world px at the current scale)
  function renderRegion(withLines, L = cur, pad = PAD, lite = false, box = null) {
    // what the camera will see once its tilt settles, plus `pad` (share of the hero size) all round
    const f = footprint(tiltGoal), m = pad * Math.max(W, H), reg = L.reg;
    if (box) Object.assign(reg, box, { S, lines: withLines });
    else Object.assign(reg, { x: Math.floor(vx + f.x0 - m), y: Math.floor(vy + f.y0 - m), w: Math.ceil(f.x1 - f.x0 + 2 * m) + 1, h: Math.ceil(f.y1 - f.y0 + 2 * m) + 1, S, lines: withLines });
    const cw = Math.round(reg.w * rdpr), ch = Math.round(reg.h * rdpr);
    if (L.cv.width !== cw || L.cv.height !== ch) { L.cv.width = cw; L.cv.height = ch; L.cv.style.width = `${reg.w}px`; L.cv.style.height = `${reg.h}px`; }
    const c = L.c, u = 1 / S, zw = Math.min(1.8, Math.max(1, Math.sqrt(zoom)));   // lines get a little bolder when zoomed in
    const g = pathsIn(reg);
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, cw, ch);
    unitSpace(c, reg); c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = u; c.stroke(g('grat'));
    // coastline ripples: wide line-colour stroke, then a narrower background stroke
    const gap = Math.max(4, Math.round(W / 360)), coast = g('l0');
    for (let k = lite ? 2 : 5; k >= 1; k--) {
      c.lineWidth = (k * gap * 2 + 1.2) * u; c.strokeStyle = `rgba(255,255,255,${(0.12 - k * 0.018).toFixed(3)})`; c.stroke(coast);
      c.lineWidth = (k * gap * 2 - 1.2) * u; c.strokeStyle = '#000'; c.stroke(coast);
    }
    // land: neighbours, Ukraine slightly lifted
    c.fillStyle = '#0a0a0a'; c.fill(U.land);
    c.fillStyle = '#121212'; c.fill(U.ua);
    if (U.detail && lite) {
      c.fillStyle = '#030405'; c.fill(g('lakes'));
      c.strokeStyle = 'rgba(150,175,190,0.36)'; c.lineWidth = 1.6 * zw * u; c.stroke(g('r2'));
      c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 1.3 * zw * u; c.stroke(g('d0'));
    } else if (U.detail) {
      // urban areas (oblast centres), lakes and reservoirs, rivers thin → thick, roads minor → major
      const urban = g('urban'), lakes = g('lakes');
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fill(urban);
      c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 0.6 * u; c.stroke(urban);
      c.fillStyle = '#030405'; c.fill(lakes);
      c.strokeStyle = 'rgba(150,175,190,0.38)'; c.lineWidth = 0.7 * u; c.stroke(lakes);
      [[0.5, 0.16], [0.9, 0.26], [1.6, 0.36]].forEach(([w, a], k) => { c.strokeStyle = `rgba(150,175,190,${a})`; c.lineWidth = w * zw * u; c.stroke(g(`r${k}`)); });
      [[2, 0.6, 0.09], [1, 0.9, 0.17], [0, 1.3, 0.3]].forEach(([cls, w, a]) => { c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = w * zw * u; c.stroke(g(`d${cls}`)); });
    }
    // RU/BY on top of the detail layer: dark fill + hatch (clip in unit space, pattern anchored to the world)
    c.fillStyle = '#060606'; c.fill(U.hostile);
    c.save(); c.clip(U.hostile); c.setTransform(1, 0, 0, 1, 0, 0);
    const pat = c.createPattern(hatchTile, 'repeat');
    pat.setTransform(new DOMMatrix([rdpr, 0, 0, rdpr, -reg.x * rdpr, -reg.y * rdpr]));
    c.fillStyle = pat; c.fillRect(0, 0, cw, ch); c.restore();
    if (withLines) { unitSpace(c, reg); strokeLines(c, g); }
    // labels: oblast centres only (RU / BY carry no text, just the hatch)
    c.setTransform(rdpr, 0, 0, rdpr, -reg.x * rdpr, -reg.y * rdpr);
    c.textBaseline = 'middle'; c.textAlign = 'left';
    c.font = '500 10px "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
    for (const ct of U.cities) {
      const x = ct.ux * S - minX, y = maxY - ct.uy * S;
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(x - 1.5, y - 1.5, 3, 3);
      c.fillStyle = 'rgba(255,255,255,0.38)'; c.fillText(ct.n.toUpperCase(), x + 7, y);
    }
    positionLayer(L);
    if (L === cur) lastRender = performance.now();
  }

  /* place a rendered region on screen; between renders it is scaled by S / its own S */
  function positionLayer(L) {
    const k = S / L.reg.S;
    L.cv.style.transform = `translate3d(${(L.reg.x * k - vx).toFixed(2)}px, ${(L.reg.y * k - vy).toFixed(2)}px, 0) scale(${k.toFixed(5)})`;
  }
  function positionBase() { positionLayer(cur); if (flying) positionLayer(alt); }
  // does a rendered region (scaled by S / its own S) still cover everything the camera sees?
  function covers(reg = region) {
    const k = S / reg.S, x = reg.x * k - vx, y = reg.y * k - vy, f = footprint();
    return x <= f.x0 && y <= f.y0 && x + reg.w * k >= f.x1 && y + reg.h * k >= f.y1;
  }
  let renderTimer = 0;
  const panState = { active: false };
  function scheduleRender(delay = 140) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      if (panState.active || flying || (region.S === S && covers())) return;
      renderRegion(true);
    }, delay);
  }

  /* ---------- One rAF ticker: animations update state, the zone is drawn once per frame ---------- */
  const tasks = new Set();
  let tickRaf = 0, zoneDirty = false, ticking = false;
  // exactly one frame request at a time: requests made while a tick runs are folded into the
  // single re-arm at its end (otherwise every running animation would double the callbacks per frame)
  function tick(now) {
    tickRaf = 0; ticking = true;
    try {
      for (const t of tasks) if (t(now) === false) tasks.delete(t);
      if (zoneDirty) { zoneDirty = false; drawZone(now); }
    } finally { ticking = false; }
    if (tasks.size || zoneDirty) kick();
  }
  const kick = () => { if (!tickRaf && !ticking) tickRaf = requestAnimationFrame(tick); };
  function requestZone() { zoneDirty = true; kick(); }
  function addTask(fn) { tasks.add(fn); kick(); return fn; }

  /* ---------- Intro: lines drawn incrementally on #ct-map (view is static meanwhile) ---------- */
  let raf = 0, t0 = 0, introLines = false;
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  function frame(now) {
    const el = (now - t0) / 1000;
    let done = true;
    for (let s = 0; s < STYLE.length; s++) {
      ctx.beginPath(); let any = false;
      for (const L of lines) {
        if (L.cls !== s) continue;
        const n = L.len.length;
        if (L.idx >= n - 1) continue;
        const k = (el - L.delay) / DRAW;
        if (k <= 0) { done = false; continue; }
        const target = easeOut(Math.min(k, 1)) * L.len[n - 1];
        let j = L.idx;
        while (j < n - 1 && L.len[j + 1] <= target) j++;
        if (k >= 1) j = n - 1;
        if (j > L.idx) {
          const p = L.p; ctx.moveTo(p[L.idx * 2], p[L.idx * 2 + 1]);
          for (let i = L.idx + 1; i <= j; i++) ctx.lineTo(p[i * 2], p[i * 2 + 1]);
          L.idx = j; any = true;
        }
        if (L.idx < n - 1) done = false;
      }
      if (any) { ctx.strokeStyle = STYLE[s][0]; ctx.lineWidth = STYLE[s][1]; ctx.stroke(); }
    }
    if (done) finishLines(); else raf = requestAnimationFrame(frame);
  }
  // bake the lines into the rendered region; the intro canvas is hidden afterwards (one less 3D layer)
  function finishLines() {
    cancelAnimationFrame(raf); raf = 0;
    if (introLines) { introLines = false; if (region.S === S) { unitSpace(cur.c, region); strokeLines(cur.c, pathsIn(region)); region.lines = true; } }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    lineCv.style.visibility = 'hidden';
  }

  /* ---------- Pseudo-3D camera ----------
     The stage is tilted with a CSS perspective + rotateX; everything in screen space uses
     the same projection, and pointer input is mapped back onto the tilted plane (toPlane). */
  const stage = document.getElementById('ct-stage');
  const zoneCv = document.getElementById('ct-walls'), zctx = zoneCv.getContext('2d');
  const TILT = 35, PERSP = 1600, WALL_K = 0.5, BANDS = 12;
  let tilt = 0, tiltGoal = 0, tiltTask = null, heroRect = null;    // tiltGoal: where a tilt animation is heading
  // screen point → point on the (tilted) map plane, in hero px
  function toPlane(sx, sy, deg = tilt) {
    if (deg < 0.01) return [sx, sy];
    const a = deg * RAD, u = sx - W / 2, v = sy - H / 2;
    const Y = (v * PERSP) / (PERSP * Math.cos(a) + v * Math.sin(a));
    return [(u * (PERSP - Y * Math.sin(a))) / PERSP + W / 2, Y + H / 2];
  }
  // the part of the map plane the camera sees: the screen corners mapped onto the plane (a
  // trapezoid when tilted — the far edge is wider), as a box in hero px
  function footprint(deg = tilt) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [sx, sy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const [x, y] = toPlane(sx, sy, deg);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { x0, y0, x1, y1 };
  }
  // map-plane point at height h above the ground → screen
  function proj(x, y, h) {
    const a = tilt * RAD, X = x - W / 2, Y = y - H / 2;
    const yy = Y * Math.cos(a) - h * Math.sin(a), z = Y * Math.sin(a) + h * Math.cos(a), k = PERSP / (PERSP - z);
    return [W / 2 + X * k, H / 2 + yy * k];
  }
  // hero rect is read once per gesture (no layout reads on every pointer move)
  const planeFromEvent = (e) => { const r = heroRect || hero.getBoundingClientRect(); return toPlane(e.clientX - r.left, e.clientY - r.top); };
  function setTilt(deg) {
    tilt = deg;
    stage.style.transform = deg > 0.01 ? `perspective(${PERSP}px) rotateX(${deg.toFixed(2)}deg)` : '';
    hero.classList.toggle('is-tilted', deg > 0.5);
    points.forEach(placeBtn);
    requestZone();
  }
  function tiltTo(deg, ms = 1400) {
    if (tiltTask) tasks.delete(tiltTask);
    tiltGoal = deg;
    if (reduced) { setTilt(deg); return; }
    const from = tilt, start = performance.now();
    tiltTask = addTask((now) => {
      const t = Math.min(1, (now - start) / ms);
      setTilt(from + (deg - from) * easeInOut(t));
      if (t < 1) return true;
      tiltTask = null; return false;
    });
  }

  /* ---------- Defence zone: smooth union of the points' circles, per echelon ----------
     Outline = circle arcs not covered by other circles + "fillet" arcs (radius ∝ ring size)
     that round every joint and bridge nearby circles — the look of a blur/threshold "goo",
     computed analytically. The same outline carries the ground ring, the wall and the caption. */
  // hatchA: the light "\" hatch on each echelon's own band (L between the M and L rings, M between
  // S and M, S inside its ring), so the three colours never stack in the middle
  const ZONE = {
    L: { rgb: '79,191,106', fillA: 0.05, hatchA: 0.2, line: 'rgba(79,191,106,0.6)', wallA: 0.32, cap: '#6fd389' },
    M: { rgb: '227,181,46', fillA: 0.06, hatchA: 0.22, line: 'rgba(227,181,46,0.75)', wallA: 0.38, cap: '#f0c64a' },
    S: { rgb: '229,72,77', fillA: 0.09, hatchA: 0.26, line: 'rgba(229,72,77,0.95)', wallA: 0.46, cap: '#f06a6e' },
  };
  const HATCH = 9;           // hatch spacing on the map plane, px (as the RU / BY hatch)
  const INNER = { L: 'M', M: 'S', S: null };
  // each echelon's own symbol — the same on the map, in the cards and in the legend: L ▲ · M ◆ · S ■
  function glyph(c, r, x, y, s) {
    c.beginPath();
    if (r === 'L') { c.moveTo(x, y - s * 1.2); c.lineTo(x + s * 1.1, y + s * 0.8); c.lineTo(x - s * 1.1, y + s * 0.8); }
    else if (r === 'M') { c.moveTo(x, y - s * 1.25); c.lineTo(x + s * 1.25, y); c.lineTo(x, y + s * 1.25); c.lineTo(x - s * 1.25, y); }
    else { c.moveTo(x - s * 0.9, y - s * 0.9); c.lineTo(x + s * 0.9, y - s * 0.9); c.lineTo(x + s * 0.9, y + s * 0.9); c.lineTo(x - s * 0.9, y + s * 0.9); }
    c.closePath();
  }
  // a text label led by its echelon's symbol, centred on x (canvas font / baseline already set)
  function glyphLabel(c, r, txt, x, y, fill) {
    const s = 3.6, gw = s * 2.5 + 5, tw = c.measureText(txt).width, x0 = x - (gw + tw) / 2;
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.9)'; c.strokeText(txt, x0 + gw + tw / 2, y);
    c.fillStyle = fill; c.fillText(txt, x0 + gw + tw / 2, y);
    glyph(c, r, x0 + s * 1.25, y - 6, s); c.lineWidth = 1.5; c.stroke(); c.fill();
  }
  for (const z of Object.values(ZONE)) { z.fill = `rgba(${z.rgb},${z.fillA})`; z.c = z.rgb.split(',').map((v) => v / 255); }

  /* The soft part of the zone is drawn with WebGL on #ct-walls-gl: the edge vignette (it replaces
     the CSS shade once docked — one full-screen layer less), each echelon's ground tint (union of
     its circles + bridges through the stencil buffer, so overlaps never double the alpha) and the
     walls (a triangle strip per outline run, faded in the fragment shader — no bands). On the 2D
     canvas the tints and every wall slice were translucent concave fills, by far the costliest
     part of a frame. The GL layer renders below CSS resolution (it only holds soft gradients);
     the crisp outlines and captions stay on the 2D canvas. Without WebGL (or a stencil buffer),
     or after a context loss, everything is drawn in 2D. */
  const wallCv = document.getElementById('ct-walls-gl');
  let gl = null, glU = null, glData = new Float32Array(8192), gk = 0;
  (function initGL() {
    const g = wallCv && wallCv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: true });
    const prog = g && g.getContextAttributes().stencil && g.createProgram();
    if (prog) {
      const shader = (type, src) => { const s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s); g.attachShader(prog, s); };
      // vertex: x, y (hero px), t (0 ground → 1 top of a wall), colour rgb + alpha; vq: position in vignette units
      shader(g.VERTEX_SHADER, 'attribute vec2 p; attribute float t; attribute vec4 c; uniform vec2 sz; varying float vt; varying vec4 vc; varying vec2 vq; varying vec2 vp;'
        + 'void main() { vt = t; vc = c; vp = p; vq = (p - 0.5 * sz) / (vec2(0.85, 0.75) * sz); gl_Position = vec4(p.x / sz.x * 2.0 - 1.0, 1.0 - p.y / sz.y * 2.0, 0.0, 1.0); }');
      // mode 0: tint / wall (fades with t) · 1: the docked CSS vignette (ellipse 85 % × 75 %, transparent
      // at 45 % → 0.7 black at the edge) · 2: hatch — the pixel goes back onto the map plane (the inverse
      // of the tilt), so the "\" lines lie on the ground with the map; `ho` keeps them anchored to the world
      shader(g.FRAGMENT_SHADER, '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n'
        + `uniform float mode; uniform vec2 sz; uniform vec2 tl; uniform float ho; varying float vt; varying vec4 vc; varying vec2 vq; varying vec2 vp; const float PP = ${PERSP.toFixed(1)}, HS = ${HATCH.toFixed(1)};`
        + 'void main() { float a;'
        + ' if (mode > 1.5) { vec2 d = vp - 0.5 * sz; float Y = d.y * PP / (PP * tl.x + d.y * tl.y), X = d.x * (PP - Y * tl.y) / PP;'
        + '  float f = fract((X - Y + ho) / HS) * HS; a = vc.a * (1.0 - smoothstep(0.35, 1.25, min(f, HS - f))); }'
        + ' else if (mode > 0.5) a = 0.7 * clamp((length(vq) - 0.45) / 0.55, 0.0, 1.0);'
        + ' else a = vc.a * pow(max(1.0 - vt, 0.0), 1.6);'
        + ' gl_FragColor = vec4(vc.rgb * a, a); }');
      g.linkProgram(prog);
    }
    if (!prog || !g.getProgramParameter(prog, g.LINK_STATUS)) { if (wallCv) wallCv.style.display = 'none'; return; }
    g.useProgram(prog);
    g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
    const attr = (name, size, offset) => { const l = g.getAttribLocation(prog, name); g.enableVertexAttribArray(l); g.vertexAttribPointer(l, size, g.FLOAT, false, 28, offset); };
    attr('p', 2, 0); attr('t', 1, 8); attr('c', 4, 12);            // 7 floats per vertex
    g.enable(g.BLEND); g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA); g.clearColor(0, 0, 0, 0);
    glU = Object.fromEntries(['sz', 'mode', 'tl', 'ho'].map((n) => [n, g.getUniformLocation(prog, n)]));
    gl = g; hero.classList.add('has-gl');
    wallCv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); gl = null; wallCv.style.display = 'none'; hero.classList.remove('has-gl'); requestZone(); });
  })();
  const gput = (x, y, t, c, a) => {
    if (gk + 7 > glData.length) { const d = new Float32Array(glData.length * 2); d.set(glData); glData = d; }
    glData[gk++] = x; glData[gk++] = y; glData[gk++] = t; glData[gk++] = c[0]; glData[gk++] = c[1]; glData[gk++] = c[2]; glData[gk++] = a;
  };
  // one GL frame: the vignette; per echelon its tint and hatch (circle fans + bridge ladders set the
  // stencil, a quad over their box paints where it is set; the inner echelon's union is cut out of it
  // before the hatch, whose quad then clears it); then every wall in one strip
  function zoneGL(layers, P, rise) {
    gk = 0;
    const draws = [], BLACK = [0, 0, 0];
    const run = (kind, fill) => { const first = gk / 7; fill(); draws.push([kind, first, gk / 7 - first]); };
    const quad = (x0, y0, x1, y1, c, a) => { gput(x0, y0, 0, c, a); gput(x1, y0, 0, c, a); gput(x0, y1, 0, c, a); gput(x0, y1, 0, c, a); gput(x1, y0, 0, c, a); gput(x1, y1, 0, c, a); };
    // an echelon's union as triangles (overlaps don't matter: they only set the stencil); returns its box
    const union = (Lr) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const v = ([x, y]) => { gput(x, y, 0, BLACK, 0); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
      for (const C of Lr.circles) {
        const m = Math.max(40, Math.round(C.r / 4)), o = P(C.x, C.y, 0);
        let prev = P(C.x + C.r, C.y, 0);
        for (let i = 1; i <= m; i++) {
          const t = (i / m) * Math.PI * 2, q = P(C.x + Math.cos(t) * C.r, C.y + Math.sin(t) * C.r, 0);
          v(o); v(prev); v(q); prev = q;
        }
      }
      // a bridge is two fillet arcs whose k-th points face each other: a ladder of quads
      for (const b of Lr.E.bridges) {
        const q = b.map(([x, y]) => P(x, y, 0)), last = q.length - 1;
        for (let k = 0; k < q.length / 2 - 1; k++) { v(q[k]); v(q[k + 1]); v(q[last - k]); v(q[last - k]); v(q[k + 1]); v(q[last - k - 1]); }
      }
      return [x0, y0, x1, y1];
    };
    run('vig', () => quad(0, 0, W, H, BLACK, 0));
    for (const r of ['L', 'M', 'S']) {
      const Lr = layers[r]; if (!Lr) continue;
      let box;
      run('stencil', () => { box = union(Lr); });
      run('tint', () => quad(...box, ZONE[r].c, ZONE[r].fillA));
      if (layers[INNER[r]]) run('cut', () => union(layers[INNER[r]]));
      run('hatch', () => quad(...box, ZONE[r].c, ZONE[r].hatchA));
    }
    if (rise > 0.01) run('walls', () => {
      for (const r of ['L', 'M', 'S']) {
        const Lr = layers[r]; if (!Lr) continue;
        const c = ZONE[r].c, a = ZONE[r].wallA * rise, Hw = Lr.R * WALL_K * rise;
        for (const sg of Lr.E.segs) {
          const h = Hw * sg.g, pts = sg.pts, last = pts.length - 1;
          for (let i = 0; i <= last; i++) {
            const [gx, gy] = P(pts[i][0], pts[i][1], 0), [tx, ty] = P(pts[i][0], pts[i][1], h);
            if (i === 0) gput(gx, gy, 0, c, a);                      // degenerate triangles join the runs
            gput(gx, gy, 0, c, a); gput(tx, ty, 1, c, a);
            if (i === last) gput(tx, ty, 1, c, a);
          }
        }
      }
    });
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.bufferData(gl.ARRAY_BUFFER, glData.subarray(0, gk), gl.DYNAMIC_DRAW);
    gl.uniform2f(glU.sz, W, H);
    gl.uniform2f(glU.tl, Math.cos(tilt * RAD), Math.sin(tilt * RAD));
    const ho = W / 2 - H / 2 + vx - vy;
    gl.uniform1f(glU.ho, ((ho % HATCH) + HATCH) % HATCH);
    const stencil = (on, func, ref, op) => {
      gl.enable(gl.STENCIL_TEST); gl.colorMask(on, on, on, on); gl.stencilFunc(func, ref, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, op);
    };
    for (const [kind, first, count] of draws) {
      if (!count) continue;
      gl.uniform1f(glU.mode, kind === 'vig' ? 1 : kind === 'hatch' ? 2 : 0);
      if (kind === 'stencil') stencil(false, gl.ALWAYS, 1, gl.REPLACE);
      else if (kind === 'tint') stencil(true, gl.EQUAL, 1, gl.KEEP);
      else if (kind === 'cut') stencil(false, gl.ALWAYS, 0, gl.REPLACE);
      else if (kind === 'hatch') stencil(true, gl.EQUAL, 1, gl.ZERO);
      else { gl.disable(gl.STENCIL_TEST); gl.colorMask(true, true, true, true); }
      gl.drawArrays(kind === 'walls' ? gl.TRIANGLE_STRIP : gl.TRIANGLES, first, count);
    }
    gl.disable(gl.STENCIL_TEST);
  }

  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  // sample a parametric curve, keep the visible runs, refine each visible/hidden switch by bisection
  function traceVisible(out, at, hidden, t0, t1, n, g) {
    let run = null, prevT = t0, prevH = hidden(t0);
    if (!prevH) run = [at(t0)];
    for (let i = 1; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n, h = hidden(t);
      if (h !== prevH) {
        let a = prevT, b = t;
        for (let k = 0; k < 12; k++) { const m = (a + b) / 2; if (hidden(m) === prevH) a = m; else b = m; }
        const e = at((a + b) / 2);
        if (h) { run.push(e); if (run.length > 1) out.push({ pts: run, g }); run = null; } else run = [e];
      }
      if (!h) run.push(at(t));
      prevT = t; prevH = h;
    }
    if (run && run.length > 1) out.push({ pts: run, g });
  }
  function echelon(circles, f) {
    const n = circles.length, pairs = [], excl = circles.map(() => []);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const A = circles[i], B = circles[j], dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
      if (d < 1e-6 || d >= A.r + B.r + 2 * f || d + Math.min(A.r, B.r) <= Math.max(A.r, B.r)) continue;
      // fillet centres: at distance r + f from both centres
      const Ra = A.r + f, Rb = B.r + f, a = (Ra * Ra - Rb * Rb + d * d) / (2 * d), h2 = Ra * Ra - a * a;
      if (h2 <= 0) continue;
      const h = Math.sqrt(h2), ux = dx / d, uy = dy / d, px = A.x + a * ux, py = A.y + a * uy;
      const fil = [1, -1].map((s) => {
        const Fx = px - s * h * uy, Fy = py + s * h * ux;
        const Ta = [A.x + ((Fx - A.x) * A.r) / Ra, A.y + ((Fy - A.y) * A.r) / Ra];
        const Tb = [B.x + ((Fx - B.x) * B.r) / Rb, B.y + ((Fy - B.y) * B.r) / Rb];
        const b0 = Math.atan2(Ta[1] - Fy, Ta[0] - Fx), db = angDiff(Math.atan2(Tb[1] - Fy, Tb[0] - Fx), b0);   // short arc = facing the centres
        return { Fx, Fy, b0, db };
      });
      // the arcs of A and B facing each other between the tangent points are inside the bridge
      const half = (C, other, T) => { const th = Math.atan2(other.y - C.y, other.x - C.x); return [th, Math.abs(angDiff(Math.atan2(T[1] - C.y, T[0] - C.x), th))]; };
      const F0 = fil[0], Ta0 = [F0.Fx + Math.cos(F0.b0) * f, F0.Fy + Math.sin(F0.b0) * f], Tb0 = [F0.Fx + Math.cos(F0.b0 + F0.db) * f, F0.Fy + Math.sin(F0.b0 + F0.db) * f];
      excl[i].push(half(A, B, Ta0)); excl[j].push(half(B, A, Tb0));
      pairs.push({ i, j, fil });
    }
    const inOther = (x, y, s1, s2) => {
      for (let k = 0; k < n; k++) { if (k === s1 || k === s2) continue; const C = circles[k], dx = x - C.x, dy = y - C.y; if (dx * dx + dy * dy < (C.r - 0.3) * (C.r - 0.3)) return true; }
      return false;
    };
    const hiddenOnCircle = (i, t) => {
      const C = circles[i];
      if (inOther(C.x + Math.cos(t) * C.r, C.y + Math.sin(t) * C.r, i, -1)) return true;
      for (const [th, w] of excl[i]) if (Math.abs(angDiff(t, th)) < w) return true;
      return false;
    };
    const segs = [];
    circles.forEach((C, i) => traceVisible(segs, (t) => [C.x + Math.cos(t) * C.r, C.y + Math.sin(t) * C.r], (t) => hiddenOnCircle(i, t), 0, Math.PI * 2, Math.max(48, Math.round(C.r / 3)), C.g));
    for (const P of pairs) for (const F of P.fil) {
      const at = (t) => [F.Fx + Math.cos(F.b0 + F.db * t) * f, F.Fy + Math.sin(F.b0 + F.db * t) * f];
      traceVisible(segs, at, (t) => { const [x, y] = at(t); return inOther(x, y, P.i, P.j); }, 0, 1, Math.max(8, Math.round((f * Math.abs(F.db)) / 2)), Math.min(circles[P.i].g, circles[P.j].g));
    }
    // bridge polygons (between the two fillet arcs) for the union fill, oriented like the circles
    const bridges = pairs.map((P) => {
      const pts = [];
      const [F1, F2] = P.fil, m = 10;
      for (let k = 0; k <= m; k++) { const t = F1.b0 + (F1.db * k) / m; pts.push([F1.Fx + Math.cos(t) * f, F1.Fy + Math.sin(t) * f]); }
      for (let k = m; k >= 0; k--) { const t = F2.b0 + (F2.db * k) / m; pts.push([F2.Fx + Math.cos(t) * f, F2.Fy + Math.sin(t) * f]); }
      let area = 0; for (let k = 0; k < pts.length; k++) { const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % pts.length]; area += x1 * y2 - x2 * y1; }
      return area < 0 ? pts.reverse() : pts;
    });
    return { segs, bridges, hiddenOnCircle };
  }

  /* draw the whole zone in screen space: vignette + ground tints + walls on WebGL (or 2D),
     then outlines and captions on the 2D canvas */
  function drawZone(now) {
    const c = zctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, zoneCv.width, zoneCv.height);
    const all = points.concat(dying);
    let animating = false;
    for (const p of all) if (updateGrow(p, now)) animating = true;
    dying = dying.filter((p) => !p.gone);
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.lineJoin = 'round'; c.lineCap = 'round';
    const a = tilt * RAD, ca = Math.cos(a), sa = Math.sin(a), cx = W / 2, cy = H / 2;
    // depth is capped short of the eye: geometry far below the screen would otherwise pass behind
    // the camera and come out mirrored across the whole view (it stays off screen this way)
    const P = (x, y, h) => { const X = x - cx, Y = y - cy, z = Math.min(Y * sa + h * ca, PERSP * 0.85), k = PERSP / (PERSP - z); return [cx + X * k, cy + (Y * ca - h * sa) * k]; };
    const k = pxPerKm(), rise = Math.min(1, tilt / TILT), f = footprint();
    const layers = {};
    for (const r of ['L', 'M', 'S']) {
      // circles well clear of what the camera sees are skipped (with room for bridges to visible ones)
      const R = KM[r] * k, m = 2.5 * R + 50;
      const circles = all.map((p) => ({ x: p.x, y: p.y, r: R * p.g[r], g: p.g[r] }))
        .filter((C) => C.r > 0.5 && C.x > f.x0 - m && C.x < f.x1 + m && C.y > f.y0 - m && C.y < f.y1 + m);
      if (circles.length) layers[r] = { R, circles, E: echelon(circles, Math.min(22, Math.max(4, R * 0.18))) };
    }
    // 1. vignette, ground tints and walls on WebGL …
    if (gl) zoneGL(layers, P, rise);
    // … or the ground tints in 2D: circles + bridges in one non-zero fill per echelon (no double alpha)
    else for (const r of ['L', 'M', 'S']) {
      const Lr = layers[r]; if (!Lr) continue;
      c.beginPath();
      for (const C of Lr.circles) {
        const m = Math.max(40, Math.round(C.r / 4));
        for (let i = 0; i <= m; i++) { const t = (i / m) * Math.PI * 2, [x, y] = P(C.x + Math.cos(t) * C.r, C.y + Math.sin(t) * C.r, 0); i ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.closePath();
      }
      for (const b of Lr.E.bridges) { b.forEach(([bx, by], i) => { const [x, y] = P(bx, by, 0); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); }
      c.fillStyle = ZONE[r].fill; c.fill('nonzero');
    }
    // 2. outlines on the ground
    for (const r of ['L', 'M', 'S']) {
      const Lr = layers[r]; if (!Lr) continue;
      c.beginPath();
      for (const sg of Lr.E.segs) sg.pts.forEach(([sx, sy], i) => { const [x, y] = P(sx, sy, 0); i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.strokeStyle = noteHl === r ? ZONE[r].cap : ZONE[r].line; c.lineWidth = noteHl === r ? 2.4 : 1.2; c.stroke();
    }
    // 2b. effector launch sites, each echelon with its symbol: L ▲ scattered by the M ring, M ◆ by the
    // S ring, S ■ at the object itself; they spread out with the rings
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(0,0,0,0.9)';
    for (const p of all) {
      if (!p.sites || p.x < f.x0 - 200 || p.x > f.x1 + 200 || p.y < f.y0 - 200 || p.y > f.y1 + 200) continue;
      for (const r of ['L', 'M', 'S']) {
        const g = p.g[SITES[r].on || r]; if (g < 0.05) continue;
        c.globalAlpha = Math.min(1, g) * (noteHl && noteHl !== r ? 0.35 : 1); c.fillStyle = ZONE[r].cap;
        for (const st of p.sites[r]) {
          const d = st.km * k * g, [x, y] = P(p.x + Math.cos(st.a) * d, p.y + Math.sin(st.a) * d, 0);
          glyph(c, r, x, y, SITES[r].size); c.stroke(); c.fill();
        }
      }
    }
    c.globalAlpha = 1;
    // 3. without WebGL, the walls (tilted view) as stacked 2D bands: most colour at the ground, 0 in the air
    if (!gl && rise > 0.01) for (const r of ['L', 'M', 'S']) {
      const Lr = layers[r]; if (!Lr) continue;
      const Hw = Lr.R * WALL_K * rise, z = ZONE[r];
      for (const sg of Lr.E.segs) {
        const lv = [];
        for (let l = 0; l <= BANDS; l++) { const h = (Hw * sg.g * l) / BANDS; lv.push(sg.pts.map(([x, y]) => P(x, y, h))); }
        for (let b = 0; b < BANDS; b++) {
          const lo = lv[b], hi = lv[b + 1];
          c.beginPath(); c.moveTo(lo[0][0], lo[0][1]);
          for (let i = 1; i < lo.length; i++) c.lineTo(lo[i][0], lo[i][1]);
          for (let i = hi.length - 1; i >= 0; i--) c.lineTo(hi[i][0], hi[i][1]);
          c.closePath();
          c.fillStyle = `rgba(${z.rgb},${(z.wallA * Math.pow(1 - b / BANDS, 1.6) * rise).toFixed(3)})`; c.fill();
        }
      }
    }
    // 4. captions on the top edge of each ring (or of its wall), only where that ring is the outer edge
    c.font = '500 10px "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
    c.textAlign = 'center'; c.textBaseline = 'bottom'; c.lineWidth = 4;
    for (const r of ['L', 'M', 'S']) {
      const Lr = layers[r]; if (!Lr) continue;
      Lr.circles.forEach((C, i) => {
        if ((r === 'S' && Lr.R < 26) || C.g < 0.6 || Lr.E.hiddenOnCircle(i, -Math.PI / 2)) return;
        const [x, y] = P(C.x, C.y - C.r, Lr.R * WALL_K * rise * C.g);
        c.globalAlpha = Math.min(1, (C.g - 0.6) / 0.4);
        glyphLabel(c, r, `${r} · ${KM[r]} KM`, x, y - 5, ZONE[r].cap);
      });
    }
    c.globalAlpha = 1;
    // 5. leader lines from the active point's rings to the echelon cards
    if (drawLeaders(c, P, now)) animating = true;
    if (animating) requestZone();
  }

  /* ---------- Echelon callouts: a card per ring in a column on the side away from the active
     point; a leader line runs from the point's ring to its card ---------- */
  const notesEl = document.getElementById('ct-notes');
  const notes = {};                // r → { el, on, x, y }: the card edge facing the map, at header height (hero px)
  const NOTE_DELAY = { L: 500, M: 620, S: 740 }, NOTE_ANGLE = { L: -0.6, M: -0.3, S: 0 };   // as the CSS card delays · ring anchor (rad, from the side facing the cards)
  let notesRight = false, notesStale = true, noteHl = null, dockedAt = 0;
  if (notesEl) notesEl.querySelectorAll('.ct-note').forEach((el) => {
    const r = el.dataset.r; notes[r] = { el, on: false, x: 0, y: 0 };
    // hovering a card lights up its ring and line
    el.addEventListener('pointerenter', () => { noteHl = r; requestZone(); });
    el.addEventListener('pointerleave', () => { noteHl = null; requestZone(); });
  });
  function measureNotes() {
    // the column has a static transform, the cards an entry animation: column rect + card offsets
    const h = hero.getBoundingClientRect(), b = notesEl.getBoundingClientRect();
    for (const n of Object.values(notes)) {
      const el = n.el; n.on = el.offsetWidth > 0;
      n.x = b.left - h.left + el.offsetLeft + (notesRight ? 0 : el.offsetWidth); n.y = b.top - h.top + el.offsetTop + 25;
    }
    notesStale = false;
  }
  function drawLeaders(c, P, now) {
    if (!notesEl || !active || !hero.classList.contains('is-docked')) return false;
    const [sx] = P(active.x, active.y, 0);
    // the column switches sides when the active point comes near it (with hysteresis, so no flicker);
    // the points' name tags move to the other side with it
    const right = cityTask ? notesRight : notesRight ? sx < W * 0.6 : sx < W * 0.4;   // held while the camera flies to a city
    if (right !== notesRight) { notesRight = right; hero.classList.toggle('is-notes-right', right); notesEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: EASE }); notesStale = true; }
    if (notesStale) measureNotes();
    let fading = false;
    c.lineWidth = 1;
    for (const r of ['L', 'M', 'S']) {
      const n = notes[r], g = active.g[r];
      if (!n || !n.on || g < 0.05) continue;
      // lines come in with their cards
      const t = dockedAt ? Math.min(1, Math.max(0, (now - dockedAt - NOTE_DELAY[r]) / 600)) : 1;
      if (t < 1) fading = true;
      if (t <= 0) continue;
      const rad = KM[r] * pxPerKm() * g, a = right ? NOTE_ANGLE[r] : Math.PI - NOTE_ANGLE[r];
      const [ax, ay] = P(active.x + Math.cos(a) * rad, active.y + Math.sin(a) * rad, 0), kx = n.x + (right ? -28 : 28);
      c.globalAlpha = t * Math.min(1, g) * (noteHl === r ? 1 : noteHl ? 0.35 : 0.75);
      c.strokeStyle = c.fillStyle = ZONE[r].cap;
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(kx, n.y); c.lineTo(n.x, n.y); c.stroke();
      glyph(c, r, ax, ay, 3); c.fill();
      c.fillRect(n.x - (right ? 3 : 0), n.y - 1.5, 3, 3);
    }
    c.globalAlpha = 1;
    return fading;
  }

  /* ---------- Threat demo: what the rings are for ----------
     Waves of enemy attack drones come in from the hostile side towards a defence point. Crossing
     each ring a drone draws an interceptor of that echelon; a drone is "assigned" the echelon that
     stops it, the outer ones miss — so L takes some far out, M the leakers on the midline, S the
     last ones at the object. Positions live on the unit sphere (they stay put on the map while the
     camera moves); speeds are stylised. Its own canvas, redrawn each frame only while the docked
     hero is on screen; never with reduced motion. */
  const thrCv = document.getElementById('ct-threats'), tctx = thrCv && thrCv.getContext('2d');
  const THR = { speed: 15, spawnKm: 92, intK: 2.6, wave: 6800, stagger: 850, hitKm: 0.8 };   // km/s · km · × drone speed · ms · ms · km
  const ORDER = ['L', 'M', 'S'], THREAT_C = '#ff5b2e';
  let drones = [], ints = [], fx = [], thrTask = null, thrLast = 0, nextWave = 0, heroOnScreen = true;
  const unitOf = (p) => laea(p.lon, p.lat);
  const planeOf = (ux, uy) => [ux * S - minX - vx, maxY - uy * S - vy];
  function spawnWave(now) {
    if (!points.length) return;
    const tgt = Math.random() < 0.6 && active ? active : points[Math.floor(Math.random() * points.length)];
    // from the north-west round to the east-south-east of the target (RU / BY side), three abreast
    const b0 = (-25 + Math.random() * 120) * RAD, fates = ORDER.slice().sort(() => Math.random() - 0.5);
    fates.forEach((fate, i) => {
      const b = b0 + (i - 1) * 0.3, [tx, ty] = unitOf(tgt), d = THR.spawnKm / EARTH_KM;
      drones.push({ ux: tx + Math.sin(b) * d, uy: ty + Math.cos(b) * d, tgt, fate, born: now + i * THR.stagger, trail: [], tried: {} });
    });
  }
  function threatTick(now) {
    const on = !reduced && heroOnScreen && !document.hidden && hero.classList.contains('is-docked') && geo && tctx;
    if (!on) { drones = []; ints = []; fx = []; if (tctx) tctx.clearRect(0, 0, thrCv.width, thrCv.height); thrTask = null; return false; }
    const dt = Math.min(0.05, (now - (thrLast || now)) / 1000), step = (THR.speed * dt) / EARTH_KM; thrLast = now;
    if (now >= nextWave) { spawnWave(now); nextWave = now + THR.wave; }
    // drones home on their point (it may be dragged); each ring crossed launches that echelon's interceptor
    for (const D of drones) {
      if (now < D.born) continue;
      if (!points.includes(D.tgt)) D.tgt = active || points[0];
      const [tx, ty] = unitOf(D.tgt), dx = tx - D.ux, dy = ty - D.uy, dist = Math.hypot(dx, dy), km = dist * EARTH_KM;
      D.ux += (dx / dist) * step; D.uy += (dy / dist) * step; D.dir = [dx / dist, dy / dist];
      if (!D.tick || now - D.tick > 70) { D.trail.push([D.ux, D.uy]); if (D.trail.length > 16) D.trail.shift(); D.tick = now; }
      for (const r of ORDER) if (!D.tried[r] && km <= KM[r]) {
        // the echelon's launch site nearest to the drone fires
        D.tried[r] = true;
        let ox = tx, oy = ty, best = Infinity;
        for (const st of D.tgt.sites ? D.tgt.sites[r] : []) {
          const sx = tx + (Math.cos(st.a) * st.km) / EARTH_KM, sy = ty - (Math.sin(st.a) * st.km) / EARTH_KM, dd = Math.hypot(sx - D.ux, sy - D.uy);
          if (dd < best) { best = dd; ox = sx; oy = sy; }
        }
        ints.push({ ux: ox, uy: oy, ox, oy, D, r, kill: r === D.fate, born: now });
        fx.push({ ux: ox, uy: oy, r, launch: true, born: now });
      }
      if (km < 1) D.dead = true;                                      // never reached in practice: S always takes it
    }
    for (const I of ints) {
      const dx = I.D.ux - I.ux, dy = I.D.uy - I.uy, dist = Math.hypot(dx, dy);
      if (dist * EARTH_KM <= THR.hitKm || I.D.dead) {
        I.done = true;
        if (I.kill && !I.D.dead) { I.D.dead = true; fx.push({ ux: I.D.ux, uy: I.D.uy, r: I.r, kill: true, born: now }); }
        else fx.push({ ux: I.ux, uy: I.uy, r: I.r, kill: false, born: now });   // a miss: the drone flies on to the next ring
        continue;
      }
      const s = Math.min(dist, step * THR.intK); I.ux += (dx / dist) * s; I.uy += (dy / dist) * s;
    }
    drones = drones.filter((D) => !D.dead); ints = ints.filter((I) => !I.done); fx = fx.filter((F) => now - F.born < 1600);
    drawThreats(now);
    return true;
  }
  function drawThreats(now) {
    const c = tctx, f = footprint(), m = 160, k = pxPerKm(), fly = KM.L * k * WALL_K * 0.22;   // drones fly low inside the "dome"
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, thrCv.width, thrCv.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.lineCap = 'round'; c.lineJoin = 'round';
    // anything well off screen is skipped (things far below the screen would also pass behind the camera)
    const at = (ux, uy, h) => { const [x, y] = planeOf(ux, uy); return x < f.x0 - m || x > f.x1 + m || y < f.y0 - m || y > f.y1 + m ? null : proj(x, y, h); };
    // interceptors: a tracer from the point, rising to the drones' height, in the echelon colour
    for (const I of ints) {
      const o = at(I.ox, I.oy, 0), q = at(I.ux, I.uy, fly * Math.min(1, (now - I.born) / 500));
      if (!o || !q) continue;
      const g = c.createLinearGradient(o[0], o[1], q[0], q[1]); g.addColorStop(0, `rgba(${ZONE[I.r].rgb},0)`); g.addColorStop(1, ZONE[I.r].cap);
      c.strokeStyle = g; c.lineWidth = 1.4; c.beginPath(); c.moveTo(o[0], o[1]); c.lineTo(q[0], q[1]); c.stroke();
      glyph(c, I.r, q[0], q[1], 3.2); c.fillStyle = ZONE[I.r].cap; c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke(); c.fill();   // the head carries its echelon's symbol
    }
    // drones: fading trail, a shadow on the ground, a delta-wing silhouette heading where it flies
    for (const D of drones) {
      if (now < D.born) continue;
      const p = at(D.ux, D.uy, fly); if (!p) continue;
      const fade = Math.min(1, (now - D.born) / 600);
      c.globalAlpha = fade;
      if (D.trail.length > 1) {
        c.beginPath(); let started = false;
        for (const [ux, uy] of D.trail) { const q = at(ux, uy, fly); if (!q) continue; started ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); started = true; }
        c.lineTo(p[0], p[1]); c.strokeStyle = 'rgba(255,91,46,0.35)'; c.lineWidth = 1; c.setLineDash([2, 3]); c.stroke(); c.setLineDash([]);
      }
      const sh = at(D.ux, D.uy, 0);
      if (sh) { c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.ellipse(sh[0], sh[1], 4, 2, 0, 0, Math.PI * 2); c.fill(); }
      const a = D.dir ? at(D.ux + D.dir[0] * 1e-4, D.uy + D.dir[1] * 1e-4, fly) : null;
      const ang = a ? Math.atan2(a[1] - p[1], a[0] - p[0]) : 0;
      // a soft warning halo makes the small silhouette read as a threat at any zoom
      const halo = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], 18);
      halo.addColorStop(0, 'rgba(255,91,46,0.35)'); halo.addColorStop(1, 'rgba(255,91,46,0)');
      c.fillStyle = halo; c.beginPath(); c.arc(p[0], p[1], 18, 0, Math.PI * 2); c.fill();
      c.save(); c.translate(p[0], p[1]); c.rotate(ang + Math.PI / 2);
      c.beginPath(); c.moveTo(0, -10); c.lineTo(8.5, 7); c.lineTo(0, 3.5); c.lineTo(-8.5, 7); c.closePath();
      c.fillStyle = THREAT_C; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.lineWidth = 1.5; c.stroke(); c.fill();
      c.restore();
      c.globalAlpha = 1;
    }
    // launches: a ring at the site; hits: flash + shock ring + label in the echelon colour; misses: a small grey puff
    c.font = '600 9px "IBM Plex Mono", ui-monospace, monospace'; c.textAlign = 'center'; c.textBaseline = 'bottom';
    for (const F of fx) {
      const t = (now - F.born) / (F.kill ? 1600 : F.launch ? 500 : 700); if (t >= 1) continue;
      const p = at(F.ux, F.uy, F.launch ? 0 : fly); if (!p) continue;
      const e = 1 - Math.pow(1 - Math.min(1, t * 1.6), 3);
      if (F.launch) {
        // launch: a quick ring on the ground at the site
        c.globalAlpha = 1 - t; c.strokeStyle = ZONE[F.r].cap; c.lineWidth = 1.2;
        c.beginPath(); c.ellipse(p[0], p[1], 3 + t * 14, (3 + t * 14) * Math.cos(tilt * RAD), 0, 0, Math.PI * 2); c.stroke();
      } else if (F.kill) {
        c.globalAlpha = Math.max(0, 1 - t * 1.6);
        c.strokeStyle = ZONE[F.r].cap; c.lineWidth = 1.5; c.beginPath(); c.arc(p[0], p[1], 4 + e * 20, 0, Math.PI * 2); c.stroke();
        if (t < 0.12) { c.fillStyle = '#fff'; c.beginPath(); c.arc(p[0], p[1], 6 * (1 - t / 0.12) + 2, 0, Math.PI * 2); c.fill(); }
        c.globalAlpha = t < 0.7 ? 1 : (1 - t) / 0.3;
        glyphLabel(c, F.r, `${F.r} · HIT`, p[0], p[1] - 14 - t * 10, ZONE[F.r].cap);
      } else {
        c.globalAlpha = 1 - t; c.fillStyle = 'rgba(200,200,200,0.5)';
        c.beginPath(); c.arc(p[0], p[1], 2 + e * 6, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1;
    }
  }
  function startThreats(delay = 0) {
    if (reduced || !tctx || thrTask) return;
    thrLast = 0; nextWave = performance.now() + delay;
    thrTask = addTask(threatTick);
  }
  // only while the hero is visible: no work when the page is scrolled past it or the tab is hidden
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { heroOnScreen = es[es.length - 1].isIntersecting; if (heroOnScreen && hero.classList.contains('is-docked')) startThreats(400); }).observe(hero);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && hero.classList.contains('is-docked')) startThreats(400); });

  // effector launch sites around a point, as angle (plane, y down) + distance in km, so they move
  // with it: L effectors scattered near the M ring, M effectors near the S ring, S effectors in a small
  // cluster at the object itself (km = distance from it)
  const SITES = { L: { n: 6, on: 'M', size: 5 }, M: { n: 4, on: 'S', size: 4.2 }, S: { n: 3, km: 2.6, size: 3.6 } };
  function makeSites() {
    const out = {};
    for (const r of ['L', 'M', 'S']) {
      const { n, on, km } = SITES[r], a0 = Math.random() * Math.PI * 2;
      out[r] = Array.from({ length: n }, (_, i) => ({ a: a0 + ((i + (Math.random() - 0.5) * 0.6) * Math.PI * 2) / n, km: (on ? KM[on] : km) * (0.85 + Math.random() * 0.3) }));
    }
    return out;
  }

  /* ---------- Defence points (1…5) ---------- */
  const MAX_POINTS = 5;
  const tpl = document.getElementById('ct-obj-tpl');
  const center = hero.querySelector('.ct-center');
  const coordEl = document.getElementById('ct-coords');
  const hudName = document.getElementById('ct-hud-name');
  const hudCount = document.getElementById('ct-hud-count');
  const scaleBar = document.getElementById('ct-scale-bar');
  const scaleLbl = document.getElementById('ct-scale-lbl');
  const noticeEl = document.getElementById('ct-notice');
  const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
  let points = [], dying = [], active = null, seq = 0;

  function layoutScale() {
    const k = pxPerKm();
    // scale bar: the longest round distance that stays under ~110 px
    const km = [200, 100, 50, 25, 10, 5].find((d) => d * k <= 110) || 5;
    scaleBar.style.width = `${(km * k).toFixed(1)}px`; scaleLbl.textContent = `${km} km`;
    points.forEach(placeBtn);
    requestZone();
  }
  // shields live in screen space at the projected ground point; their label sits outside the L ring
  function placeBtn(p) {
    const [sx, sy] = proj(p.x, p.y, 0);
    p.btn.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
    const kz = PERSP / (PERSP - (p.y - H / 2) * Math.sin(tilt * RAD));
    const tx = Math.round(22 + KM.L * pxPerKm() * kz + 8);
    if (tx !== p.tagX) { p.tagX = tx; p.btn.style.setProperty('--tag-x', `${tx}px`); }
  }
  function setXY(p, x, y) { p.x = x; p.y = y; placeBtn(p); requestZone(); }
  // keep every point glued to its lon/lat while the map moves or zooms
  const syncPoints = () => points.forEach((p) => { const [x, y] = project(p.lon, p.lat); p.x = x; p.y = y; placeBtn(p); });

  function label() {
    const cnt = `${points.length}/${MAX_POINTS}`;
    if (hudCount && hudCount.textContent !== cnt) hudCount.textContent = cnt;   // the counter is off the HUD for now
    if (!active) return;
    const name = active.name ? active.name.toUpperCase() : 'CUSTOM POINT', c = `${active.lat.toFixed(2)}°N · ${active.lon.toFixed(2)}°E`;
    if (hudName.textContent !== name) hudName.textContent = name;
    if (coordEl.textContent !== c) coordEl.textContent = c;
  }
  function tagPoint(p) {
    const name = p.name ? p.name.toUpperCase() : 'POINT', num = `Defence point ${String(points.indexOf(p) + 1).padStart(2, '0')}`;
    if (p.tag !== name + num) { p.tag = name + num; p.btn.querySelector('b').textContent = name; p.btn.querySelector('em').textContent = num; }
    p.btn.setAttribute('aria-label', `Defence point ${p.name || ''} ${p.lat.toFixed(2)}°N ${p.lon.toFixed(2)}°E. Drag to move, click or press Delete to remove, arrow keys to nudge.`);
  }
  const relabelAll = () => points.forEach(tagPoint);
  function setActive(p) { active = p; points.forEach((q) => q.btn.classList.toggle('is-active', q === p)); label(); }

  let noticeTimer;
  function notice(text) {
    noticeEl.textContent = text;
    hero.classList.add('is-denied'); clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => hero.classList.remove('is-denied'), 1700);
  }
  // no snapping: a point near an oblast centre (≤ NEAR_KM on the ground) just takes its name
  const NEAR_KM = 15;
  function nearCity(lon, lat) {
    let best = null, bd = NEAR_KM;
    for (const [n, clon, clat] of CITIES) {
      const d = Math.hypot((clon - lon) * 111.32 * Math.cos(((clat + lat) / 2) * RAD), (clat - lat) * 111.2);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  // keep a dragged point inside the visible screen (works in the tilted view too)
  function clampPlane(x, y) {
    const [sx, sy] = proj(x, y, 0);
    const cx = Math.min(Math.max(sx, 24), W - 24), cy = Math.min(Math.max(sy, 96), H - 40);
    return cx === sx && cy === sy ? [x, y] : toPlane(cx, cy);
  }

  // ring grow / shrink: per-echelon scale factors animated on the ticker (S first, L last)
  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4), easeInCubic = (t) => t * t * t;
  function grow(p, delay = 0) {
    if (reduced) return;
    p.g = { L: 0, M: 0, S: 0 };
    p.anim = { from: 0, to: 1, start: performance.now() + delay, dur: 750, delays: { S: 0, M: 90, L: 180 }, ease: easeOutQuart };
    requestZone();
  }
  function updateGrow(p, now) {
    const A = p.anim;
    if (!A) return false;
    let running = false;
    for (const r of ['L', 'M', 'S']) {
      const t = Math.min(1, Math.max(0, (now - A.start - A.delays[r]) / A.dur));
      p.g[r] = A.from + (A.to - A.from) * A.ease(t);
      if (t < 1) running = true;
    }
    if (!running) { p.anim = null; if (A.to === 0) p.gone = true; }
    return running;
  }
  function addPoint(lon, lat, name, animate = true) {
    if (points.length >= MAX_POINTS) { notice(`Maximum ${MAX_POINTS} defence points`); return null; }
    const p = { id: ++seq, lon, lat, name, x: 0, y: 0, g: { L: 1, M: 1, S: 1 }, anim: null, sites: makeSites() };
    p.btn = tpl.content.firstElementChild.cloneNode(true);
    hero.insertBefore(p.btn, center);                                // above the zone canvas; creation order = stacking order
    bindPoint(p);
    points.push(p);
    const [x, y] = project(lon, lat); setXY(p, x, y);
    relabelAll(); setActive(p);
    if (animate) grow(p);
    return p;
  }
  function removePoint(p) {
    if (points.length <= 1) { notice('At least one defence point is required'); p.btn.animate([{ transform: p.btn.style.transform + ' translateX(-4px)' }, { transform: p.btn.style.transform + ' translateX(4px)' }, { transform: p.btn.style.transform }], { duration: 260 }); return; }
    points = points.filter((q) => q !== p);
    p.btn.remove();
    if (!reduced) {
      // its rings shrink away on the ticker (L first), merged contours of the others re-form live
      p.anim = { from: 1, to: 0, start: performance.now(), dur: 380, delays: { L: 0, M: 50, S: 100 }, ease: easeInCubic };
      dying.push(p);
    }
    relabelAll(); setActive(points[points.length - 1]);
    requestZone();
  }

  /* point gestures: press + move = drag (rings merge live) · short click = remove */
  let drag = null;
  const applyDrag = () => {
    if (!drag) return false;
    const { p, g } = drag, [x, y] = clampPlane(g.ox + drag.qx - g.px, g.oy + drag.qy - g.py);
    setXY(p, x, y);
    [p.lon, p.lat] = invert(p.x, p.y); p.name = nearCity(p.lon, p.lat);
    p.btn.classList.toggle('is-hostile', isHostile(p.x, p.y));
    tagPoint(p); label();
    return false;
  };
  function bindPoint(p) {
    let g = null;
    p.btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); p.btn.setPointerCapture(e.pointerId);
      heroRect = hero.getBoundingClientRect();
      const [px, py] = planeFromEvent(e);
      g = { x: e.clientX, y: e.clientY, px, py, ox: p.x, oy: p.y, lon: p.lon, lat: p.lat, name: p.name, moved: false };
      setActive(p);
    });
    p.btn.addEventListener('pointermove', (e) => {
      if (!g) return;
      if (!g.moved) { if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < 5) return; g.moved = true; hero.classList.add('is-dragging', 'is-touched'); p.btn.classList.add('is-dragging'); }
      const [qx, qy] = planeFromEvent(e);
      drag = { p, g, qx, qy }; addTask(applyDrag);              // applied once per frame
    });
    const end = (e) => {
      if (!g) return;
      const was = g; g = null; heroRect = null; hero.classList.remove('is-dragging'); p.btn.classList.remove('is-dragging', 'is-hostile');
      if (drag && drag.p === p) { applyDrag(); drag = null; }
      if (!was.moved) { if (e.type === 'pointerup') { hero.classList.add('is-touched'); removePoint(p); } return; }
      settle(p, was);
    };
    p.btn.addEventListener('pointerup', end); p.btn.addEventListener('pointercancel', end);
    p.btn.addEventListener('click', (e) => e.stopPropagation());
    p.btn.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removePoint(p); return; }
      const d = e.shiftKey ? 40 : 12, m = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
      if (!m) return;
      e.preventDefault(); hero.classList.add('is-touched'); setActive(p);
      if (!p.kb) p.kb = { lon: p.lon, lat: p.lat, name: p.name };
      const [x, y] = clampPlane(p.x + m[0], p.y + m[1]);
      setXY(p, x, y); [p.lon, p.lat] = invert(p.x, p.y); p.name = nearCity(p.lon, p.lat); tagPoint(p); label();
    });
    p.btn.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow') && p.kb) { const was = p.kb; p.kb = null; settle(p, was); } });
    p.btn.addEventListener('focus', () => setActive(p));
  }
  // after a move: the point stays where it was dropped; unavailable territory sends it back
  function settle(p, was) {
    p.name = nearCity(p.lon, p.lat);
    if (isHostile(p.x, p.y)) {
      notice('Unavailable territory');
      p.lon = was.lon; p.lat = was.lat; p.name = was.name;
      const [x, y] = project(p.lon, p.lat); setXY(p, x, y);
    }
    tagPoint(p); label();
  }
  // short click on the map: a new defence point
  function addAt(x, y) {
    if (points.length >= MAX_POINTS) { notice(`Maximum ${MAX_POINTS} defence points`); return; }
    if (isHostile(x, y)) { notice('Unavailable territory'); return; }
    const [lon, lat] = invert(x, y);
    addPoint(lon, lat, nearCity(lon, lat));
  }

  /* ---------- Zoom: − / slider / + (logarithmic), anchored on the active point when it is
     on screen (its rings stay put and grow), otherwise on the viewport centre ---------- */
  const zSlider = document.getElementById('ct-zoom');
  const toSlider = (z) => Math.round((Math.log(z / zMin) / Math.log(ZOOM_MAX / zMin)) * 100);
  const fromSlider = (v) => zMin * Math.pow(ZOOM_MAX / zMin, v / 100);
  const zoomAnchor = () => (active && active.x > 0 && active.x < W && active.y > 0 && active.y < H ? [active.x, active.y] : [W / 2, H / 2]);
  // ll: a fixed map point to put at (ax, ay) — a fly that also moves the camera passes it every frame
  function setZoom(z, ax, ay, ll) {
    if (ax === undefined) [ax, ay] = zoomAnchor();
    z = Math.min(ZOOM_MAX, Math.max(zMin, z));
    if ((!ll && Math.abs(z - zoom) < 1e-4) || !geo) return;
    if (introLines || raf) finishLines();
    const [lon, lat] = ll || invert(ax, ay);       // keep the point under the anchor fixed
    zoom = z; applyScale();
    const [wx, wy] = world(lon, lat); vx = wx - ax; vy = wy - ay; clampView();
    positionBase(); syncPoints(); layoutScale();
    const sv = toSlider(zoom); if (+zSlider.value !== sv) zSlider.value = sv;
    scheduleRender(90);
    // slider drag: between renders the map is scaled by CSS. Re-render at once when the camera
    // would see past the rendered margin, otherwise only when the scale has drifted noticeably
    const k = S / region.S;
    if (!flying && (!covers() || ((k < 0.8 || k > 1.25) && performance.now() - lastRender > 60))) renderRegion(true);
  }
  zSlider.addEventListener('input', () => setZoom(fromSlider(+zSlider.value)));

  // fly: smooth zoom with a pre-rendered destination; geometric interpolation, so the zoom
  // speed feels even; any user input stops it
  let flyTask = null;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  // render a fly's destination — target zoom around the zoom anchor, for the tilt the camera is
  // heading to — into the spare layer. A matching earlier preparation is reused, so the intro
  // can pay for it while the screen is still black.
  // dest: where the anchored map point ends up on the plane (default: it stays where it is)
  function prepareFly(target, deg = tiltGoal, dest = null) {
    const [ax, ay] = zoomAnchor(), [dx, dy] = dest || [ax, ay], key = [target, zoom, vx, vy, ax, ay, dx, dy, deg, W, H, rdpr].join();
    if (alt.prep === key) return;
    const [alon, alat] = invert(ax, ay), keep = { zoom, vx, vy, tiltGoal };
    zoom = target; tiltGoal = deg; applyScale();
    const [wx, wy] = world(alon, alat); vx = wx - dx; vy = wy - dy; clampView();
    // big zoom-ins get a wider pre-rendered area, so the crisp layer covers the screen sooner
    renderRegion(true, alt, target / keep.zoom > 1.6 ? 0.25 : 0.08);
    zoom = keep.zoom; tiltGoal = keep.tiltGoal; applyScale(); vx = keep.vx; vy = keep.vy;
    alt.prep = key;
  }
  // a hidden spare layer gives its memory back (tens of MB on large screens); the next fly re-allocates it
  const release = (L) => { L.cv.width = L.cv.height = 0; L.prep = null; };
  // dest (plane px): the anchor glides there during the fly — the intro uses it to bring the
  // defence point to the centre of the screen (the plane centre stays the screen centre when tilted)
  function flyTo(target, ms = 1800, onLand = null, dest = null) {
    stopFly();
    target = Math.min(ZOOM_MAX, Math.max(zMin, target));
    const [ax, ay] = zoomAnchor(), [dx, dy] = dest || [ax, ay], ll = invert(ax, ay);
    if (reduced || !geo || Math.abs(target - zoom) < 1e-4) { setZoom(target, dx, dy, ll); return; }
    if (introLines || raf) finishLines();
    prepareFly(target, tiltGoal, dest); alt.prep = null;   // the spare layer is about to become the map
    // whichever layer is being scaled DOWN goes on top: the destination when zooming in,
    // the current map when zooming out (the destination then fills the edges underneath)
    cur.cv.insertAdjacentElement(target > zoom ? 'afterend' : 'beforebegin', alt.cv);
    alt.cv.classList.add('is-on'); flying = true; positionBase();
    const z0 = zoom, start = performance.now();
    flyTask = addTask((now) => {
      const t = Math.min(1, (now - start) / ms);
      const e = easeInOut(t);
      setZoom(z0 * Math.pow(target / z0, e), ax + (dx - ax) * e, ay + (dy - ay) * e, ll);
      if (t < 1) return true;
      flyTask = null; land(); if (onLand) onLand();
      return false;
    });
  }
  // the pre-rendered layer becomes the map
  function land() {
    flying = false;
    [cur, alt] = [alt, cur]; region = cur.reg;
    alt.cv.classList.remove('is-on'); release(alt);
    positionBase();
    if (region.S !== S || !covers()) scheduleRender(60);
  }
  function stopFly() {
    if (flyTask) { tasks.delete(flyTask); flyTask = null; }
    if (!flying) return;
    flying = false; alt.cv.classList.remove('is-on'); release(alt);
    positionBase(); scheduleRender(40);
  }
  hero.addEventListener('pointerdown', stopFly, true);
  zSlider.addEventListener('pointerdown', stopFly); zSlider.addEventListener('keydown', stopFly);
  // ± buttons: a short fly with a pre-rendered destination (crisp at both ends)
  document.getElementById('ct-zoom-in').addEventListener('click', () => flyTo(zoom * ZOOM_STEP, 420));
  document.getElementById('ct-zoom-out').addEventListener('click', () => flyTo(zoom / ZOOM_STEP, 420));

  /* ---------- Map gestures: hold LMB to pan · short click adds a defence point ---------- */
  // both are switched off for now (decision of 2026-11-04); zoom and dragging / removing the existing
  // point keep working. Set to true to bring them back.
  const MAP_PAN = false, MAP_ADD = false;
  hero.classList.toggle('is-static', !MAP_PAN);
  let pp = null;
  // the region is re-rendered around the camera as soon as it would see past the margin
  const applyPan = () => { if (!covers()) renderRegion(true); positionBase(); syncPoints(); requestZone(); return false; };
  hero.addEventListener('pointerdown', (e) => {
    if ((!MAP_PAN && !MAP_ADD) || e.button !== 0 || e.target.closest('a, button, input, .ct-note') || !geo || !hero.classList.contains('is-docked')) return;
    heroRect = hero.getBoundingClientRect();
    const [px, py] = planeFromEvent(e);
    pp = { x: e.clientX, y: e.clientY, px, py, vx, vy, moved: false, id: e.pointerId };
  });
  hero.addEventListener('pointermove', (e) => {
    if (!pp || e.pointerId !== pp.id) return;
    if (!pp.moved) {
      if (Math.hypot(e.clientX - pp.x, e.clientY - pp.y) < 5) return;
      if (!MAP_PAN) { pp.moved = true; return; }                // a drag is just not a click then
      pp.moved = true; panState.active = true; hero.setPointerCapture(e.pointerId); hero.classList.add('is-panning', 'is-touched');
      if (introLines || raf) finishLines();
    }
    if (!MAP_PAN) return;
    const [qx, qy] = planeFromEvent(e);
    vx = pp.vx - (qx - pp.px); vy = pp.vy - (qy - pp.py); clampView();
    addTask(applyPan);                                        // applied once per frame
  });
  const endPan = (e) => {
    if (!pp || e.pointerId !== pp.id) return;
    const wasClick = !pp.moved; pp = null; panState.active = false; hero.classList.remove('is-panning');
    if (wasClick && MAP_ADD && e.type === 'pointerup') {
      hero.classList.add('is-touched'); addAt(...planeFromEvent(e));
    } else scheduleRender(60);                                // no-op unless the map is stale (e.g. a zoom right before)
    heroRect = null;
  };
  hero.addEventListener('pointerup', endPan); hero.addEventListener('pointercancel', endPan);

  /* ---------- City switcher: < KROPYVNYTSKYI · KYIV · LUTSK > ----------
     Picking a city flies the camera there and redeploys the defence point: the old rings fold at once,
     the new ones unfold on arrival. The flight follows the smooth zoom-pan path of van Wijk & Nuij (as
     d3.interpolateZoom): it heads straight for the city from the first frame and zooms out on the way as
     much as the distance asks, but never so far that the tilted view would run into the pan limits (they
     would push the camera sideways and back: the old "wrong way" wobble on long flights).
     The flight only moves three pre-rendered layers by CSS (the current map, a low-res overview of the
     whole way, the destination), so no frame of it waits for a map render. Inputs pause for 1.1-2.6 s. */
  // oblast centres, A–Z, wrapping round; left out of the switcher (client's decision): Donetsk, Luhansk and
  // Crimea (Simferopol, Sevastopol) — they stay labelled on the map
  const CITY_OFF = ['Donetsk', 'Luhansk', 'Simferopol', 'Sevastopol'];
  const CITY_SET = CITIES.map(([n]) => n).filter((n) => !CITY_OFF.includes(n)).sort();
  const citiesEl = document.getElementById('ct-cities');
  let cityIdx = CITY_SET.indexOf('Kyiv'), cityTask = null;
  const ovCv = document.createElement('canvas');
  ovCv.className = 'ct-base'; ovCv.setAttribute('aria-hidden', 'true');
  const ovL = mkLayer(ovCv);
  stage.insertBefore(ovCv, stage.firstChild);            // under both map layers
  // camera with this zoom, looking straight at a unit-sphere point (the plane centre = the screen centre when tilted)
  function placeCam(z, [ux, uy]) {
    zoom = z; applyScale();
    vx = ux * S - minX - W / 2; vy = maxY - uy * S - H / 2; clampView();
  }
  // smooth zoom-pan path (van Wijk & Nuij 2003, as d3.interpolateZoom); w = view width in unit-sphere units.
  // Returns its length S and at(s) -> [x, y, w] for 0 <= s <= S; rho sets how far it zooms out
  function zoomPath([ax, ay], w0, [bx, by], w1, rho) {
    const dx = bx - ax, dy = by - ay, d2 = dx * dx + dy * dy, rho2 = rho * rho, rho4 = rho2 * rho2;
    if (d2 < 1e-14) {
      const k = Math.log(w1 / w0) / rho;
      return { S: Math.abs(k), at: (s) => [ax, ay, w0 * Math.exp(rho * s * Math.sign(k))] };
    }
    const d1 = Math.sqrt(d2), b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1), b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1), ch = Math.cosh(r0);
    return {
      S: (r1 - r0) / rho,
      at: (s) => { const u = (w0 / (rho2 * d1)) * (ch * Math.tanh(rho * s + r0) - Math.sinh(r0)); return [ax + u * dx, ay + u * dy, (w0 * ch) / Math.cosh(rho * s + r0)]; },
    };
  }
  // can the camera look at unit point (x, y) with zoom z without the pan limits pushing it (a few px to spare)?
  function camFits(x, y, z, spare = 2) {
    const s = S0 * z, f = footprint(tiltGoal), e = spare / s;
    return z >= zMin - 1e-6 && x >= panB.x0 + (W / 2 - f.x0) / s + e && x <= panB.x1 - (f.x1 - W / 2) / s - e
      && y >= panB.y0 + (f.y1 - H / 2) / s + e && y <= panB.y1 + (f.y0 - H / 2) / s - e;
  }
  // the deepest zoom-out (rho up to 1.42, d3's default) whose whole path stays clear of the pan limits
  function flightPath(A, z0, B, z1) {
    const w0 = W / (S0 * z0), w1 = W / (S0 * z1), from = camFits(A[0], A[1], z0, 0) ? 1 : 10;   // a start already at a limit is let be
    const clear = (rho) => {
      const p = zoomPath(A, w0, B, w1, rho);
      for (let i = from; i < 64; i++) { const [x, y, w] = p.at((p.S * i) / 64); if (!camFits(x, y, W / (S0 * w))) return null; }
      return p;
    };
    let p = clear(1.42);
    if (!p) {
      let lo = 0.05, hi = 1.42;
      for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (clear(m)) lo = m; else hi = m; }
      p = clear(lo) || zoomPath(A, w0, B, w1, lo);
    }
    return p;
  }
  function renderCities(dir = 0) {
    if (!citiesEl) return;
    const n = CITY_SET.length, at = (k) => (cityIdx + k + n) % n;
    citiesEl.innerHTML = [-1, 0, 1].map((k) => `<button type="button" class="ct-cities__city${k ? '' : ' is-current'}" data-k="${k}"${k ? '' : ' aria-current="true"'}>${CITY_SET[at(k)]}</button>`).join('');
    if (dir && !reduced) citiesEl.animate([{ transform: `translateX(${dir * 28}px)`, opacity: 0.3 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: EASE });
  }
  // step: −1 the previous city (left), +1 the next one (right)
  function goCity(step) {
    if (!step || cityTask || flying || !geo || !hero.classList.contains('is-docked')) return;
    const n = CITY_SET.length, i = (((cityIdx + step) % n) + n) % n;
    const city = CITIES.find(([name]) => name === CITY_SET[i]); if (!city) return;
    cityIdx = i; renderCities(step);
    stopFly(); if (introLines || raf) finishLines();
    const [, lonB, latB] = city, z0 = zoom, z1 = ZOOM_MAX;
    const A = [(W / 2 + vx + minX) / S, (maxY - H / 2 - vy) / S], B = laea(lonB, latB);   // camera centres, unit sphere
    // the defence point moves: a new one at the city (rings folded until arrival), the old one folds away
    const old = active, p = addPoint(lonB, latB, city[0], false);
    if (!p) return;
    if (old) removePoint(old);
    drones = []; ints = []; fx = [];                          // the threat demo restarts at the new city
    if (reduced) { placeCam(z1, B); renderRegion(true); syncPoints(); layoutScale(); zSlider.value = toSlider(zoom); requestZone(); return; }
    p.g = { L: 0, M: 0, S: 0 };
    const path = flightPath(A, z0, B, z1), camAt = (t) => { const [x, y, w] = path.at(path.S * easeInOut(t)); return [W / (S0 * w), [x, y]]; };
    // pre-render: the destination into the spare layer; everything the camera sees on the way, at the
    // widest view of the path, into the overview layer
    const keepR = rdpr, ft = footprint(tiltGoal);
    let zLo = z0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i <= 48; i++) {
      const [z, [x, y]] = camAt(i / 48), s = S0 * z; zLo = Math.min(zLo, z);
      x0 = Math.min(x0, x + (ft.x0 - W / 2) / s); x1 = Math.max(x1, x + (ft.x1 - W / 2) / s);
      y0 = Math.min(y0, y - (ft.y1 - H / 2) / s); y1 = Math.max(y1, y - (ft.y0 - H / 2) / s);
    }
    placeCam(z1, B); renderRegion(true, alt, 0.12); alt.prep = null;
    placeCam(zLo, A);
    rdpr = Math.min(keepR, 0.5);                              // seen only in motion and from afar: half resolution, lite
    renderRegion(true, ovL, 0, true, { x: Math.floor(x0 * S - minX) - 40, y: Math.floor(maxY - y1 * S) - 40, w: Math.ceil((x1 - x0) * S) + 80, h: Math.ceil((y1 - y0) * S) + 80 });
    rdpr = keepR;
    placeCam(z0, A);
    cur.cv.insertAdjacentElement('afterend', alt.cv);
    alt.cv.classList.add('is-on'); ovCv.classList.add('is-on'); flying = true;
    hero.classList.add('is-travel');
    const ms = Math.min(2600, Math.max(1100, path.S * 1050)), start = performance.now();   // a longer way, a longer flight
    nextWave = start + ms + 1800;
    cityTask = addTask((now) => {
      const t = Math.min(1, (now - start) / ms), [z, c] = camAt(t);
      placeCam(z, c);
      positionLayer(cur); positionLayer(alt); positionLayer(ovL);
      syncPoints(); layoutScale(); if (dying.length) requestZone();   // the zone only changes while the old rings fold
      const sv = toSlider(zoom); if (+zSlider.value !== sv) zSlider.value = sv;
      if (t < 1) return true;
      // arrival: the destination layer becomes the map, the others give their memory back; the rings unfold
      cityTask = null; flying = false;
      [cur, alt] = [alt, cur]; region = cur.reg;
      alt.cv.classList.remove('is-on'); release(alt); ovCv.classList.remove('is-on'); release(ovL);
      positionBase(); if (region.S !== S || !covers()) scheduleRender(60);
      hero.classList.remove('is-travel');
      grow(p);
      return false;
    });
  }
  if (citiesEl) {
    renderCities();
    citiesEl.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) goCity(+b.dataset.k); });
    hero.querySelectorAll('.ct-cities__arrow').forEach((b) => b.addEventListener('click', () => goCity(+b.dataset.step)));
  }

  /* ---------- Layout / timeline ---------- */
  function buildDelays() {
    const [ox, oy] = world(DEFAULT_FOCUS.lon, DEFAULT_FOCUS.lat), maxD = Math.hypot(W, H);
    lines.forEach((L) => { L.delay = (Math.hypot(L.mid[0] - ox, L.mid[1] - oy) / maxD) * 1.5 + Math.random() * 0.15; });
  }
  function layout(withLines, keepView) {
    const keepCentre = keepView ? invert(W / 2, H / 2) : null;
    W = Math.round(hero.clientWidth); H = Math.round(hero.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    rdpr = Math.min(dpr, W < 900 ? 1 : 1.25);          // rendered-region resolution (memory-bound)
    lineCv.width = Math.round(W * dpr); lineCv.height = Math.round(H * dpr);
    zoneCv.width = Math.round(W * dpr); zoneCv.height = Math.round(H * dpr);
    if (thrCv) { thrCv.width = zoneCv.width; thrCv.height = zoneCv.height; }
    // the GL layer holds only soft gradients: 3/4 of CSS resolution is plenty (and 4× cheaper at 4K)
    if (wallCv) { wallCv.width = Math.round(W * 0.75); wallCv.height = Math.round(H * 0.75); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    fit();
    if (keepCentre) { const [wx, wy] = world(keepCentre[0], keepCentre[1]); vx = wx - W / 2; vy = wy - H / 2; clampView(); } else centreView();
    lines = buildLines(); buildDelays();
    renderRegion(withLines); syncPoints(); layoutScale(); label();
    zSlider.value = toSlider(zoom);
    notesStale = true;
  }

  // logo block: centred for the intro, then docked bottom centre (FLIP — only transform is animated)
  function dock(animate) {
    notesStale = true;
    if (!animate) { dockedAt = 0; hero.classList.add('is-docked'); return; }
    dockedAt = performance.now();
    const a = center.getBoundingClientRect();
    hero.classList.add('is-docked');
    const b = center.getBoundingClientRect();
    center.style.transformOrigin = '0 0';
    center.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width})` }, { transform: 'none' }],
      { duration: 900, easing: EASE }).onfinish = () => { center.style.transformOrigin = ''; };
    points.forEach((p, i) => grow(p, 300 + i * 120));
    startThreats(2200);                                             // the first wave once the rings and cards are in
  }

  let introTimer, dockTimer;
  function play() {
    hero.classList.add('is-ready');
    if (reduced) { dock(false); tiltTo(TILT); flyTo(ZOOM_MAX, 0, null, [W / 2, H / 2]); renderRegion(true); return; }
    if (tiltTask) { tasks.delete(tiltTask); tiltTask = null; }
    tiltGoal = 0; setTilt(0);
    cancelAnimationFrame(raf); clearTimeout(introTimer); clearTimeout(dockTimer); stopFly();
    // region without lines (unless layout() has just rendered exactly that); the lines draw in on
    // #ct-map, then get baked in
    if (region.lines || region.S !== S || !covers()) renderRegion(false);
    // the fly-in destination is rendered now, while the map is still black, not when the move starts
    prepareFly(ZOOM_MAX, TILT, [W / 2, H / 2]);
    introLines = true; lines = buildLines(); buildDelays();
    lineCv.style.visibility = '';
    ctx.setTransform(dpr, 0, 0, dpr, -vx * dpr, -vy * dpr); ctx.clearRect(vx, vy, W, H);
    hero.classList.remove('is-anim', 'is-docked'); void hero.offsetWidth; hero.classList.add('is-anim');
    t0 = performance.now(); raf = requestAnimationFrame(frame);
    // the logo docks, the map zooms in on the initial defence point (Kyiv) and the camera tilts
    // into pseudo-3D at the same moment — one combined move, same duration and easing
    // (the tilt goes first: the fly's destination is what the tilted camera will see)
    // … ending with the defence point right in the centre of the screen
    dockTimer = setTimeout(() => { dock(true); tiltTo(TILT, 1800); flyTo(ZOOM_MAX, 1800, null, [W / 2, H / 2]); }, 4300);
    // the final CSS frame equals the static state, so the class can go once the intro is done
    introTimer = setTimeout(() => hero.classList.remove('is-anim'), INTRO_MS);
  }

  // map data comes from assets/data/ukraine.js (a plain script, so file:// works too)
  if (window.CT_UKRAINE) {
    // with motion the intro draws the lines; with reduced motion they are baked in right away
    geo = window.CT_UKRAINE; buildUnit(); layout(reduced, false);
    addPoint(DEFAULT_FOCUS.lon, DEFAULT_FOCUS.lat, 'Kyiv', false);
    requestAnimationFrame(play);
  } else {
    hero.classList.add('is-ready', 'is-docked');
  }


  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (!geo || (Math.abs(hero.clientWidth - W) < 2 && Math.abs(hero.clientHeight - H) < 2)) return;
      cancelAnimationFrame(raf); raf = 0; introLines = false;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, lineCv.width, lineCv.height);
      lineCv.style.visibility = 'hidden';
      layout(true, true); hero.classList.remove('is-anim');
    }, 250);
  });

  /* ---------- Layers L / M / S ---------- */
  const layers = [...document.querySelectorAll('.ct-layer')];
  const wrap = document.getElementById('ct-layers');
  if (!layers.length) return;
  let curLayer = 0, cycle, inView = false, hover = false;
  const desktop = window.matchMedia('(min-width: 1000px)');
  const set = (i) => { curLayer = i; layers.forEach((l, k) => l.classList.toggle('is-active', k === i)); };
  const tick2 = () => { clearInterval(cycle); cycle = setInterval(() => { if (inView && !hover && desktop.matches && !reduced) set((curLayer + 1) % layers.length); }, 4500); };
  layers.forEach((l, i) => {
    l.addEventListener('mouseenter', () => set(i));
    l.addEventListener('focus', () => set(i));
    l.addEventListener('click', () => set(i));
  });
  wrap.addEventListener('mouseenter', () => { hover = true; });
  wrap.addEventListener('mouseleave', () => { hover = false; tick2(); });
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; }, { threshold: 0.35 }).observe(wrap);
  tick2();
})();

/* ==========================================================================
   Effectors: the site's product cards, filled from assets/js/data.js (the same data as the product
   pages, so a change there shows here too); which echelons a drone serves comes from the markup
   (data-ech). The L / M / S buttons dim the drones of the other echelons.
   ========================================================================== */
(function () {
  const grid = document.getElementById('ct-effs');
  if (!grid || !window.WIY || !WIY.bySlug) return;
  const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 12h17M14 6l6 6-6 6"/></svg>';
  const ECH = { L: 'Long range', M: 'Mid range', S: 'Self defence' };
  grid.querySelectorAll('[data-slug]').forEach((el) => {
    const p = WIY.bySlug(el.dataset.slug);
    if (!p) { el.remove(); return; }
    const tags = (p.status ? `<span class="tag${p.status === 'In service' ? ' tag--live' : ''}">${p.status}</span>` : '') + (p.nsn ? '<span class="tag">NATO NSN</span>' : '');
    const ech = el.dataset.ech.split(' ').map((r) => `<span><i class="ct-g ct-g--${r.toLowerCase()}"></i>${r} · ${ECH[r]}</span>`).join('');
    el.innerHTML = `<a class="card" href="product.html?p=${p.slug}">
      <div class="card__img"><div class="card__tags">${tags}</div><img src="${p.image}" alt="WIY ${p.name}" loading="lazy"></div>
      <div class="card__body">
        <div class="card__name">${p.name}${ARROW}</div>
        <div class="card__role">${p.role}</div>
        <div class="ct-eff__ech">${ech}</div>
        <div class="card__kpis">${p.kpis.slice(0, 3).map(([v, u, l]) => `<div><b>${v}${u ? ' ' + u : ''}</b>${l}</div>`).join('')}</div>
      </div>
    </a>`;
  });
  const btns = document.querySelectorAll('.ct-echf button');
  btns.forEach((b) => b.addEventListener('click', () => {
    grid.dataset.f = b.dataset.f;
    btns.forEach((x) => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
  }));
})();

/* ==========================================================================
   Launch platforms gallery: a tile's video (data-video) is created on first use and plays muted —
   on hover where there is a mouse, while the tile is well in view on touch screens; never with
   reduced motion. Tiles without a video show their render.
   ========================================================================== */
(function () {
  const gal = document.getElementById('ct-gal');
  if (!gal || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const tiles = [...gal.querySelectorAll('.ct-tile[data-video]')].filter((t) => t.dataset.video);
  if (!tiles.length) return;
  const video = (t) => {
    let v = t.querySelector('video');
    if (!v) {
      v = document.createElement('video');
      Object.assign(v, { muted: true, loop: true, playsInline: true, preload: 'none', src: t.dataset.video });
      v.setAttribute('aria-hidden', 'true');
      v.addEventListener('playing', () => v.classList.add('is-ready'), { once: true });
      t.querySelector('.ct-tile__media').append(v);
    }
    return v;
  };
  const play = (t, on) => { if (on) video(t).play().catch(() => {}); else { const v = t.querySelector('video'); if (v) v.pause(); } };
  if (window.matchMedia('(hover: hover)').matches) {
    tiles.forEach((t) => { t.addEventListener('mouseenter', () => play(t, true)); t.addEventListener('mouseleave', () => play(t, false)); });
  } else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => play(e.target, e.isIntersecting)), { threshold: 0.6 });
    tiles.forEach((t) => io.observe(t));
  }
})();
