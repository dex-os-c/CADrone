/* =====================================================================
   MEDVAYU H6 · app_ui1.js  (part 1)
   Helpers, evaluation context, SVG charts, Design and Physics widgets.
   Each widget is { el, update() }. Panels are lists of widgets.
   ===================================================================== */
const fmt = (x, d = 1) => (isFinite(x) ? x.toFixed(d) : '–');
const h = (html, cls = '', tag = 'div') => { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; return e; };
let toastT = 0;
function toast(msg, ms = 2400) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }

/* ---------- shared evaluation context, recomputed when conditions change ---------- */
let CTX = null, ctxDirty = true;
function ctx() {
  if (ctxDirty || !CTX) {
    const env = S.env;
    CTX = { hex: Phys.evaluate(Phys.VEH.hex, env), quad: Phys.evaluate(Phys.VEH.quad, env), hexNoTM: Phys.evaluate(Phys.VEH.hex, Object.assign({}, env, { thermal: false })) };
    ctxDirty = false;
  }
  return CTX;
}
const ALT_GRID = Array.from({ length: 31 }, (_, i) => i * 200);
let SWEEP = null;
function sweepAll() {
  if (SWEEP && !ctxDirty) return SWEEP;
  const env = S.env, ev = (v, e) => ALT_GRID.map(hh => Phys.evaluate(v, Object.assign({}, env, e, { h: hh })));
  SWEEP = { hex: ev(Phys.VEH.hex, {}), hexNo: ev(Phys.VEH.hex, { thermal: false }), quad: ev(Phys.VEH.quad, {}) };
  return SWEEP;
}

/* ---------- SVG line chart ---------- */
function lineChart(o) {
  const W = 380, H = 236, L = 46, R = 14, T = 16, B = 36, pw = W - L - R, ph = H - T - B;
  const xs = o.x, x0 = xs[0], x1 = xs[xs.length - 1];
  const all = o.series.flatMap(s => s.y).concat((o.hlines || []).map(l => l.y));
  let ymax = Math.max(...all), ymin = o.ymin !== undefined ? o.ymin : Math.min(0, ...all);
  const step = niceStep((ymax - ymin) / 4); ymax = Math.ceil(ymax / step) * step; ymin = Math.floor(ymin / step) * step;
  const X = v => L + (v - x0) / (x1 - x0) * pw, Y = v => T + (1 - (v - ymin) / (ymax - ymin)) * ph;
  let g = '';
  for (let v = ymin; v <= ymax + 1e-9; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:var(--c-grid)"/><text x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${fmtTick(v)}</text>`;
  for (let v = x0; v <= x1; v += 1000) g += `<line x1="${X(v)}" x2="${X(v)}" y1="${T}" y2="${T + ph}" style="stroke:var(--c-grid)"/><text x="${X(v)}" y="${H - B + 14}" text-anchor="middle">${v / 1000}</text>`;
  g += `<text x="${L + pw / 2}" y="${H - 4}" text-anchor="middle">${o.xlabel}</text><text transform="translate(11 ${T + ph / 2}) rotate(-90)" text-anchor="middle">${o.ylabel}</text>`;
  (o.hlines || []).forEach(l => { g += `<line x1="${L}" x2="${W - R}" y1="${Y(l.y)}" y2="${Y(l.y)}" style="stroke:${l.color}" stroke-width="1.4" stroke-dasharray="5 4"/><text x="${W - R - 2}" y="${Y(l.y) - 4}" text-anchor="end" style="fill:${l.color}">${l.label}</text>`; });
  o.series.forEach(s => {
    const d = s.y.map((v, i) => (i ? 'L' : 'M') + X(xs[i]).toFixed(1) + ' ' + Y(v).toFixed(1)).join('');
    if (s.fill) g += `<path d="${d}L${X(x1)} ${Y(ymin)}L${X(x0)} ${Y(ymin)}Z" style="fill:${s.color}" opacity=".10"/>`;
    g += `<path d="${d}" fill="none" style="stroke:${s.color}" stroke-width="2.4" stroke-linejoin="round" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/>`;
  });
  const hx = clamp(o.marker, x0, x1);
  g += `<line x1="${X(hx)}" x2="${X(hx)}" y1="${T}" y2="${T + ph}" style="stroke:var(--ink)" stroke-width="1" opacity=".55"/>`;
  o.series.forEach(s => { const v = interp(xs, s.y, hx); g += `<circle cx="${X(hx)}" cy="${Y(v)}" r="4" style="fill:${s.color};stroke:var(--surface2)" stroke-width="1.5"/>`; });
  g += `<line id="cx" x1="0" x2="0" y1="${T}" y2="${T + ph}" style="stroke:var(--ink)" stroke-width="1" stroke-dasharray="2 3" opacity="0"/><rect class="hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/>`;
  return { svg: `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.aria}">${g}</svg>`, X, L, pw, x0, x1 };
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))), n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
function fmtTick(v) { return Math.abs(v) >= 1000 ? (v / 1000) + 'k' : (Math.round(v * 10) / 10) + ''; }
function interp(xs, ys, x) { if (x <= xs[0]) return ys[0]; for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return lerp(ys[i - 1], ys[i], (x - xs[i - 1]) / (xs[i] - xs[i - 1])); return ys[ys.length - 1]; }
function chartWidget(title, build, unit) {
  const el = h('', 'card'); el.innerHTML = `<h3>${title}</h3><div class="cwrap"></div><div class="legend"></div><div class="note mono readout">Move over the chart to read values.</div>`;
  const wrap = $('.cwrap', el), leg = $('.legend', el), ro = $('.readout', el);
  function update() {
    const o = build(); const c = lineChart(o); wrap.innerHTML = c.svg;
    leg.innerHTML = o.series.map(s => `<span><i style="border-color:${s.color};${s.dash ? 'border-top-style:dashed' : ''}"></i>${s.label}</span>`).join('');
    const svg = $('svg', wrap), cx = $('#cx', svg), hit = $('.hit', svg);
    const move = e => { const r = svg.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * 380; const alt = clamp(c.x0 + (vx - c.L) / c.pw * (c.x1 - c.x0), c.x0, c.x1);
      cx.setAttribute('x1', c.X(alt)); cx.setAttribute('x2', c.X(alt)); cx.setAttribute('opacity', .8);
      ro.innerHTML = `<b>${fmt(alt, 0)} m</b> · ` + o.series.map(s => `${s.label.split(' ')[0]} ${fmt(interp(o.x, s.y, alt), 1)}${unit}`).join(' · '); };
    hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { cx.setAttribute('opacity', 0); });
  }
  return { el, update };
}
function enduranceChart() {
  return chartWidget('Altitude vs endurance (hover)', () => { const sw = sweepAll();
    return { x: ALT_GRID, xlabel: 'altitude, km', ylabel: 'endurance, min', marker: S.env.h, aria: 'Endurance against altitude for the H6, the H6 without the warming loop, and the reference quad',
      series: [{ label: 'H6 with warming loop', color: 'var(--c-hex)', y: sw.hex.map(e => e.endurance), fill: true }, { label: 'H6 loop off', color: 'var(--c-hex)', dash: '5 4', y: sw.hexNo.map(e => e.endurance) }, { label: 'Quad reference', color: 'var(--c-quad)', y: sw.quad.map(e => e.endurance) }] }; }, ' min');
}
function thrustChart() {
  return chartWidget('Altitude vs thrust margin', () => { const sw = sweepAll(), c = ctx(), need = (c.hex.mo.fReq * c.hex.v.n / c.hex.Wt - 1) * 100;
    return { x: ALT_GRID, xlabel: 'altitude, km', ylabel: 'thrust above hover weight, %', marker: S.env.h, ymin: 0, aria: 'Thrust margin against altitude for the H6 and the reference quad, with the margin the H6 needs to survive a motor loss',
      hlines: [{ y: need, label: 'H6 needs ' + fmt(need, 0) + '% for motor-out', color: 'var(--bad)' }],
      series: [{ label: 'H6 (6 rotors)', color: 'var(--c-hex)', y: sw.hex.map(e => (e.TW - 1) * 100), fill: true }, { label: 'Quad reference', color: 'var(--c-quad)', y: sw.quad.map(e => (e.TW - 1) * 100) }] }; }, ' %');
}

/* ---------- conditions card (shared by Physics, Flight, Compare, Present) ---------- */
const PRESETS = [['Sea level ISA', { h: 0, dT: 0 }], ['3000 m ISA', { h: 3000, dT: 0 }], ['5000 m, ISA −20', { h: 5000, dT: -20 }], ['6000 m, ISA −25', { h: 6000, dT: -25 }]];
function condWidget() {
  const el = h('', 'card'), defs = [
    ['h', 'Altitude (pressure altitude)', 0, 6000, 100, v => fmt(v, 0) + ' m'], ['dT', 'Temperature offset from ISA', -30, 15, 1, v => (v > 0 ? '+' : '') + v + ' °C'],
    ['payload', 'Payload', 0, 10, 0.5, v => fmt(v, 1) + ' kg'], ['battWh', 'Battery energy', 1200, 4000, 100, v => fmt(v, 0) + ' Wh']];
  el.innerHTML = `<h3>Conditions</h3>` + defs.map(d => `<div class="sl"><label for="c_${d[0]}">${d[1]}</label><output id="o_${d[0]}"></output><input type="range" id="c_${d[0]}" min="${d[2]}" max="${d[3]}" step="${d[4]}"></div>`).join('') +
    `<div class="row"><button class="btn sm" id="c_thermal" aria-pressed="true">Warming loop: on</button>${PRESETS.map((p, i) => `<button class="btn sm" data-pre="${i}">${p[0]}</button>`).join('')}</div><div class="note mono" id="c_air"></div>`;
  function setAll() { defs.forEach(d => { $('#c_' + d[0], el).value = S.env[d[0]]; $('#o_' + d[0], el).textContent = d[5](+S.env[d[0]]); }); const b = $('#c_thermal', el); b.setAttribute('aria-pressed', S.env.thermal); b.textContent = 'Warming loop: ' + (S.env.thermal ? 'on' : 'off');
    const a = ctx().hex.atm; $('#c_air', el).textContent = `T ${fmt(a.Tc, 1)} °C · p ${fmt(a.p / 1000, 1)} kPa · ρ ${fmt(a.rho, 3)} kg/m³ (σ ${fmt(a.sigma, 2)})`; }
  defs.forEach(d => $('#c_' + d[0], el).addEventListener('input', e => { S.env[d[0]] = +e.target.value; envChanged(); }));
  $('#c_thermal', el).addEventListener('click', () => { S.env.thermal = !S.env.thermal; envChanged(); });
  $$('[data-pre]', el).forEach(b => b.addEventListener('click', () => { Object.assign(S.env, PRESETS[+b.dataset.pre][1]); envChanged(); }));
  return { el, update: setAll };
}

/* ---------- Design tab widgets ---------- */
function partsWidget() {
  const el = h('', 'card'); el.innerHTML = `<h3>Parts</h3><div class="partlist">${PART_ORDER_UI.map(id => `<button class="pbtn" data-part="${id}" aria-pressed="false"><i style="background:${PARTS[id].color}"></i><span>${PARTS[id].name}</span><span class="eye" data-eye="${id}" role="switch" aria-label="Show ${PARTS[id].short}" aria-checked="true">●</span></button>`).join('')}</div><div class="note">Tap a part here or in the 3D view. The ● toggles visibility.</div>`;
  $$('.pbtn', el).forEach(b => b.addEventListener('click', e => { if (e.target.dataset.eye) { const id = e.target.dataset.eye, vis = S.hidden.has(id); setPartVisible(id, vis); e.target.style.opacity = vis ? .55 : .15; e.target.setAttribute('aria-checked', vis); return; } setSelected(S.selected === b.dataset.part ? null : b.dataset.part); }));
  return { el, update() { } };
}
function infoWidget() {
  const el = h('', 'card');
  function update() {
    const id = S.selected, mb = ctx().hex.mass;
    if (!id) { el.innerHTML = `<h3>Part details</h3><div class="note">Select a part to see its function, material, estimated mass and why it is designed this way.</div>`; return; }
    const P = PARTS[id], m = partMass(id, mb);
    el.innerHTML = `<div class="row" style="justify-content:space-between"><h2>${P.name}</h2><span class="tag">estimated</span></div>
      <div class="kv"><div class="kpi"><small>Quantity</small><b style="font-size:14px">${P.qty(Phys.VEH.hex)}</b></div><div class="kpi"><small>Est. mass</small><b>${fmt(m, 2)}<em>kg</em></b></div><div class="kpi"><small>Share of AUW</small><b>${fmt(m / mb.total * 100, 1)}<em>%</em></b></div></div>
      <div><h3>Function</h3><p>${P.fn}</p></div><div><h3>Material</h3><p>${P.material}</p></div><div><h3>Design reason</h3><p>${P.reason}</p></div>`;
  }
  return { el, update };
}
function massWidget() {
  const el = h('', 'card');
  function update() {
    const mb = ctx().hex.mass, rows = PART_ORDER_UI.filter(id => PARTS[id].mass.length).map(id => ({ id, m: partMass(id, mb) }));
    el.innerHTML = `<div class="row" style="justify-content:space-between"><h3>Mass budget</h3><b class="mono">${fmt(mb.total, 1)} kg AUW</b></div>
      <div style="display:flex;height:14px;border-radius:4px;overflow:hidden;border:1px solid var(--line2)">${rows.map(r => `<i title="${PARTS[r.id].short} ${fmt(r.m, 2)} kg" style="width:${r.m / mb.total * 100}%;background:${PARTS[r.id].color}"></i>`).join('')}</div>
      <div class="scroll-x"><table><tr><th>Part</th><th>kg</th><th>%</th></tr>${rows.sort((a, b) => b.m - a.m).map(r => `<tr><td><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${PARTS[r.id].color};margin-right:6px"></span>${PARTS[r.id].short}</td><td class="mono">${fmt(r.m, 2)}</td><td class="mono">${fmt(r.m / mb.total * 100, 1)}</td></tr>`).join('')}</table></div>
      <div class="note">Masses are estimates for this concept (physics.js). Replace them with CAD mass properties when the model is built.</div>`;
  }
  return { el, update };
}

/* ---------- Physics tab widgets ---------- */
function kpiWidget() {
  const el = h('', 'card');
  function update() {
    const c = ctx().hex, a = c.atm, need = c.mo.fReq * c.v.n / c.Wt;
    const moState = c.mo.status === 'ok' ? 'good' : 'bad', twState = c.TW >= need ? 'good' : c.TW >= 1 ? 'warn' : 'bad';
    const k = (l, v, u, cls = '') => `<div class="kpi ${cls}"><small>${l}</small><b>${v}<em>${u}</em></b></div>`;
    el.innerHTML = `<h3>Live results · H6</h3><div class="kv">
      ${k('Air density', fmt(a.rho, 3), 'kg/m³')}${k('Density ratio', fmt(a.sigma * 100, 0), '%')}${k('All-up mass', fmt(c.mass.total, 1), 'kg')}
      ${k('Hover power', fmt(c.Ptot / 1000, 2), 'kW')}${k('Per motor', fmt(c.Pmotor, 0), 'W')}${k('Hover speed', fmt(c.rpm, 0), 'rpm')}
      ${k('Tip Mach', fmt(c.mach, 2), '')}${k('Disk loading', fmt(c.DL, 1), 'N/m²')}${k('Pack temp', fmt(c.batt.Tcell, 1), '°C')}
      ${k('Capacity factor', fmt(c.batt.f, 2), '')}${k('Usable energy', fmt(c.usableWh, 0), 'Wh')}${k('Endurance', fmt(c.endurance, 1), 'min')}
      ${k('Thrust / weight', fmt(c.TW, 2), '', twState)}${k('Motor-out', c.mo.status === 'ok' ? 'HOLDS' : c.mo.status === 'saturated' ? 'LIMIT' : 'LOST', '', moState)}${k('Motor-out margin', fmt(c.mo.margin, 2), '×', moState)}</div>
      <div class="note">Motor-out: remove each rotor in turn, solve for thrust that holds weight with zero roll and pitch moment, compare the busiest rotor with its limit (${fmt(c.fmax.f, 1)} N, set by ${c.fmax.limit}). Worst case: rotor M${c.mo.rotor + 1}. Needs T/W ≥ ${fmt(need, 2)}.</div>`;
  }
  return { el, update };
}
function formulaWidget() {
  const el = h('', 'card'), A = Phys.A;
  function update() {
    const c = ctx().hex, a = c.atm, n = x => `<span class="n">${x}</span>`, o = $$('details', el).map(d => d.open);
    const blocks = [
      ['1 · ISA atmosphere', `T  = T0 − L·h  = 288.15 − 0.0065 × ${n(fmt(S.env.h, 0))} = ${n(fmt(a.Tstd, 2))} K  ${'<span class="c">(+ΔT ' + S.env.dT + ' → ' + fmt(a.T, 2) + ' K)</span>'}\np  = p0·(Tstd/T0)^(g/(R·L)) = ${n(fmt(a.p, 0))} Pa\nρ  = p / (R·T) = ${n(fmt(a.rho, 4))} kg/m³     σ = ρ/1.225 = ${n(fmt(a.sigma, 3))}\na  = √(γ·R·T) = ${n(fmt(a.a, 1))} m/s`],
      ['2 · Hover power (momentum theory)', `W      = m·g = ${fmt(c.mass.total, 2)} × 9.80665 = ${n(fmt(c.Wt, 1))} N\nA_tot  = n·π·(D/2)² = ${c.v.n} × π × ${fmt(c.R, 3)}² = ${n(fmt(c.Atot, 3))} m²\nDL     = W / A_tot = ${n(fmt(c.DL, 1))} N/m²\nv_i    = √(T_r / (2ρA)) = ${n(fmt(c.vi, 2))} m/s\nP_ideal= W^1.5 / √(2ρ·A_tot) = ${n(fmt(c.Pid, 0))} W\nP_elec = P_ideal / (FM·η_m·η_esc) = ${fmt(c.Pid, 0)} / (${A.FM} × ${A.etaMotor} × ${A.etaEsc}) = ${n(fmt(c.Pprop, 0))} W\nP_tot  = P_elec + P_aux(${c.v.pAux}) = ${n(fmt(c.Ptot, 0))} W\nV_tip  = √(T_r / (ρ·A·CT)) = ${n(fmt(c.tipV, 1))} m/s → ${n(fmt(c.rpm, 0))} rpm, Mach ${fmt(c.mach, 2)}`],
      ['3 · Battery warming and cold derating', `Q_loss  = P_elec·(1 − η_m·η_esc) = ${n(fmt(c.batt.lossMotEsc, 0))} W   (motors + ESCs)\nQ_pack  = P_elec·(1 − η_pack) = ${n(fmt(c.batt.Qself, 0))} W\nQ_in    = ${c.batt.managed ? 'α·Q_loss + Q_pack = ' + A.capture + ' × ' + fmt(c.batt.lossMotEsc, 0) + ' + ' + fmt(c.batt.Qself, 0) : 'Q_pack (loop off)'} = ${n(fmt(c.batt.Qin, 0))} W\nT_cell  = T_amb + Q_in/UA = ${fmt(a.Tc, 1)} + ${fmt(c.batt.Qin, 0)}/${c.batt.UA} → ${n(fmt(c.batt.Tcell, 1))} °C  ${'<span class="c">(capped at ' + A.TcellMax + ' °C by bypass)</span>'}\nf       = 1 − ${A.capSlope}·(25 − T_cell) = ${n(fmt(c.batt.f, 3))}   ${'<span class="c">(floor ' + A.capFloor + ')</span>'}`],
      ['4 · Endurance', `E_usable = E_batt × DoD × f = ${S.env.battWh} × ${A.dod} × ${fmt(c.batt.f, 3)} = ${n(fmt(c.usableWh, 0))} Wh\nt        = E_usable / P_tot × 60 = ${fmt(c.usableWh, 0)} / ${fmt(c.Ptot, 0)} × 60 = ${n(fmt(c.endurance, 1))} min`],
      ['5 · Thrust limit and thrust-to-weight', `T_pow  = (P_max·FM·η·√(2ρA))^(2/3) = ${n(fmt(c.fmax.byPower, 1))} N per rotor\nT_mach = ρ·A·CT·(M_max·a)² = ${n(fmt(c.fmax.byMach, 1))} N per rotor\nT_max  = min(T_pow, T_mach) = ${n(fmt(c.fmax.f, 1))} N  (${c.fmax.limit})\nT/W    = n·T_max / W = ${c.v.n} × ${fmt(c.fmax.f, 1)} / ${fmt(c.Wt, 1)} = ${n(fmt(c.TW, 2))}`],
      ['6 · Motor-out check', `For each failed rotor j (f_j = 0), find f ≥ 0 such that\n  Σ f_i = W        (lift)\n  Σ −z_i·f_i = 0   (roll moment)\n  Σ  x_i·f_i = 0   (pitch moment)\n  Σ s_i·k·f_i = 0  (yaw; dropped first if infeasible)\nwith k = Q/T = ${fmt(c.kyaw, 4)} m.  Pass if max f_i ≤ T_max.\nResult: busiest rotor ${n(fmt(c.mo.fReq, 1))} N vs limit ${fmt(c.fmax.f, 1)} N → margin ${n(fmt(c.mo.margin, 2) + '×')}`]
    ];
    el.innerHTML = `<h3>Formulas in use (live numbers)</h3>` + blocks.map((b, i) => `<details${o[i] ? ' open' : ''}><summary>${b[0]}</summary><div><div class="formula">${b[1]}</div></div></details>`).join('');
  }
  return { el, update };
}
function assumpWidget() {
  const el = h('', 'card'), A = Phys.A, orig = Object.assign({}, A);
  const defs = [['FM', 'Rotor figure of merit', 0.5, 0.85, 0.01, v => fmt(v, 2)], ['battSpecEnergy', 'Pack specific energy', 120, 300, 5, v => fmt(v, 0) + ' Wh/kg'], ['capture', 'Share of motor heat reaching the pack', 0, 0.6, 0.01, v => fmt(v * 100, 0) + ' %'], ['capSlope', 'Capacity loss per °C below 25 °C', 0, 0.015, 0.0005, v => fmt(v * 100, 2) + ' %'], ['pMotorMax', 'Per-motor power limit', 1000, 3500, 50, v => fmt(v, 0) + ' W']];
  el.innerHTML = `<details><summary>Edit key assumptions</summary><div>${defs.map(d => `<div class="sl"><label for="a_${d[0]}">${d[1]}</label><output id="ao_${d[0]}"></output><input type="range" id="a_${d[0]}" min="${d[2]}" max="${d[3]}" step="${d[4]}"></div>`).join('')}<div class="row"><button class="btn sm" id="a_reset">Reset to defaults</button></div><div class="note">These values are assumptions, not measured data. Change them to see how sensitive the result is.</div></div></details>`;
  function sync() { defs.forEach(d => { $('#a_' + d[0], el).value = A[d[0]]; $('#ao_' + d[0], el).textContent = d[5](A[d[0]]); }); }
  defs.forEach(d => $('#a_' + d[0], el).addEventListener('input', e => { A[d[0]] = +e.target.value; sync(); envChanged(); }));
  $('#a_reset', el).addEventListener('click', () => { Object.assign(A, orig); sync(); envChanged(); });
  return { el, update: sync };
}
