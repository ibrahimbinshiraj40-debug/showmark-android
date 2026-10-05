// আকৃতি চেনার অংশ: মাউসের দাগ থেকে তীর / গোল / চার কোনা / গোল-কোনা চার কোনা বের করে
(function (root) {
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

  function resample(pts, n) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
    if (L === 0) return pts.slice();
    const step = L / (n - 1), out = [pts[0].slice()];
    let acc = 0, prev = pts[0];
    for (let i = 1; i < pts.length; i++) {
      let cur = pts[i], d = dist(prev, cur);
      while (acc + d >= step && d > 0) {
        const t = (step - acc) / d;
        const q = [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t];
        out.push(q); prev = q; d = dist(prev, cur); acc = 0;
      }
      acc += d; prev = cur;
    }
    while (out.length < n) out.push(pts[pts.length - 1].slice());
    return out.slice(0, n);
  }

  // opts: { corners: 'auto'|'sharp'|'round', pen: bool, curved: bool (true হলে গোল/চার কোনা ছাড়া সব দাগ বাঁকা তীর হয়) }
  function analyze(raw, opts) {
    opts = opts || {};
    const pts = [raw[0]];
    for (let i = 1; i < raw.length; i++) if (dist(raw[i], pts[pts.length - 1]) > 0.5) pts.push(raw[i]);
    if (pts.length < 3) return null;
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
    if (L < 30) return null;
    const first = pts[0], last = pts[pts.length - 1], chord = dist(first, last);

    // সোজা দাগ -> তীর
    if (chord / L > 0.86 && chord >= 30) return { type: "arrow", x1: first[0], y1: first[1], x2: last[0], y2: last[1] };

    const rs = resample(pts, 72);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    rs.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    const w = x1 - x0, h = y1 - y0;

    // বন্ধ আকৃতি (শুরু আর শেষ কাছাকাছি)
    if (chord < 0.27 * L && w >= 18 && h >= 18) {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = w / 2, hh = h / 2;
      let e2 = 0;
      const nm = rs.map((p) => [(p[0] - cx) / hw, (p[1] - cy) / hh]);
      nm.forEach((q) => { e2 += Math.abs(Math.hypot(q[0], q[1]) - 1); });
      e2 /= nm.length;
      let d = 0;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((c) => {
        let m = 1e9;
        nm.forEach((q) => { m = Math.min(m, Math.hypot(q[0] - c[0], q[1] - c[1])); });
        d += m;
      });
      d /= 4;
      const dbg = { e2: e2, d: d };
      if (e2 < 0.2 && d > 0.3) {
        let rx = hw, ry = hh; const asp = w / h;
        if (asp > 0.85 && asp < 1.18) { rx = ry = (hw + hh) / 2; }
        return { type: "ellipse", cx: cx, cy: cy, rx: rx, ry: ry, dbg: dbg };
      }
      if (e2 < 0.34) {
        let round = d > 0.13;
        if (opts.corners === "sharp") round = false; else if (opts.corners === "round") round = true;
        return { type: "rect", x: x0, y: y0, w: w, h: h, r: round ? Math.min(w, h) * 0.24 : 0, dbg: dbg };
      }
    }
    if (opts.curved) return { type: "carrow", pts: resample(pts, Math.min(80, Math.max(8, pts.length))) };
    if (opts.pen !== false && pts.length > 4) return { type: "pen", pts: resample(pts, Math.min(60, pts.length)) };
    return null;
  }

  root.ShowMarkShapes = { analyze: analyze, resample: resample };
  if (typeof module !== "undefined") module.exports = root.ShowMarkShapes;
})(typeof window !== "undefined" ? window : globalThis);
