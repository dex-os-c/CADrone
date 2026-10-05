/* =====================================================================
   MEDVAYU H6 · app_ui2.js  (part 2)
   Flight controls and HUD, compare table and race, guided tour, notes,
   tab manager, keyboard and touch input, boot.
   ===================================================================== */

/* ---------- input: keyboard + virtual sticks merge into one command vector ---------- */
const KEYS = new Set(), JOY = { L: { x: 0, y: 0 }, R: { x: 0, y: 0 } };
function readInput() {
  const k = c => KEYS.has(c) ? 1 : 0;
  const fwd = k('KeyW') - k('KeyS') + k('ArrowUp') - k('ArrowDown') + JOY.R.y, right = k('KeyD') - k('KeyA') + JOY.R.x;
  const up = k('Space') + k('KeyR') - k('ShiftLeft') - k('ShiftRight') - k('KeyF') + JOY.L.y, yaw = k('KeyE') - k('KeyQ') + k('ArrowRight') - k('ArrowLeft') + JOY.L.x;
  return { fwd: clamp(fwd, -1, 1), right: clamp(right, -1, 1), up: clamp(up, -1, 1), yaw: clamp(yaw, -1, 1) };
}
window.addEventListener('keydown', e => {
  if (e.target.matches && e.target.matches('input,select,textarea')) return;
  if (S.tab === 'present') { if (e.key === 'ArrowRight') { tourGo(S.tourStep + 1); e.preventDefault(); } if (e.key === 'ArrowLeft') { tourGo(S.tourStep - 1); e.preventDefault(); } return; }
  if (S.stage !== 'flight') return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  KEYS.add(e.code);
  if (e.code === 'KeyT') flightCmd('takeoff'); if (e.code === 'KeyH') flightCmd('hover'); if (e.code === 'KeyG') flightCmd('forward'); if (e.code === 'KeyL') flightCmd('land'); if (e.code === 'KeyX') failSelected();
});
window.addEventListener('keyup', e => KEYS.delete(e.code));
window.addEventListener('blur', () => KEYS.clear());
function joystick(el, store) {
  const knob = $('i', el); let id = null;
  const set = (x, y) => { store.x = x; store.y = y; knob.style.transform = `translate(${x * 34}px, ${-y * 34}px)`; };
  const mv = e => { const r = el.getBoundingClientRect(), dx = (e.clientX - r.left - r.width / 2) / 44, dy = -(e.clientY - r.top - r.height / 2) / 44, m = Math.hypot(dx, dy) || 1, k = Math.min(1, m) / m; set(dx * k, dy * k); };
  el.addEventListener('pointerdown', e => { id = e.pointerId; el.setPointerCapture(id); mv(e); e.preventDefault(); });
  el.addEventListener('pointermove', e => { if (e.pointerId === id) mv(e); });
  const end = e => { if (e.pointerId === id) { id = null; set(0, 0); } };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
joystick($('#joyL'), JOY.L); joystick($('#joyR'), JOY.R);

/* ---------- flight actions ---------- */
function flightCmd(c) { if (S.stage !== 'flight') return; if (c === 'reset') { resetFlight(); toast('Reset to the pad'); } else sim.command(c); }
function failSelected() { const sel = $('#f_motor'); const i = sel ? +sel.value : 0; if (!sim.armed) { toast('Take off first'); return; } sim.failMotor(i); toast('Motor M' + (i + 1) + ' failed'); }

function flightWidget() {
  const el = h('', 'card'), n6 = Array.from({ length: 6 }, (_, i) => `<option value="${i}">M${i + 1}</option>`).join('');
  el.innerHTML = `<h3>Flight simulation</h3>
    <div class="row"><button class="btn sm" data-veh="hex" aria-pressed="true">MedVayu H6</button><button class="btn sm" data-veh="quad" aria-pressed="false">Reference quad</button></div>
    <div class="row"><button class="btn pri" data-cmd="takeoff">Takeoff</button><button class="btn" data-cmd="hover">Hover</button><button class="btn" data-cmd="forward">Forward</button><button class="btn" data-cmd="land">Land</button><button class="btn" data-cmd="reset">Reset</button></div>
    <div class="row"><select id="f_motor" class="btn" aria-label="Motor to fail">${n6}</select><button class="btn warn" id="f_fail">Fail motor</button><button class="btn" id="f_restore">Restore motors</button></div>
    <div class="sl"><label for="f_wind">Wind (steady, towards +x/+z)</label><output id="f_windo">0 m/s</output><input type="range" id="f_wind" min="0" max="12" step="0.5" value="0"></div>
    <div class="note" id="f_msg"></div>
    <details><summary>Controls</summary><div><div class="keys"><kbd>W S</kbd><span>forward / back</span><kbd>A D</kbd><span>left / right</span><kbd>Q E</kbd><span>turn left / right</span><kbd>Space</kbd><span>climb</span><kbd>Shift</kbd><span>descend</span><kbd>T H G L</kbd><span>takeoff, hover, forward, land</span><kbd>X</kbd><span>fail selected motor</span></div><div class="note">On a phone or tablet, use the two sticks over the view: left for climb and turn, right for forward and sideways.</div></div></details>
    <div class="note">Physics: rigid body, six rotors with 60 ms lag, cascaded position, attitude and rate control, thrust allocation. The controller learns of a failure 0.2 s after it happens.</div>`;
  $$('[data-cmd]', el).forEach(b => b.addEventListener('click', () => flightCmd(b.dataset.cmd)));
  $$('[data-veh]', el).forEach(b => b.addEventListener('click', () => { S.flightVeh = b.dataset.veh; setStageMode('flight'); update(); buildBars(); }));
  $('#f_fail', el).addEventListener('click', failSelected); $('#f_restore', el).addEventListener('click', () => { sim.restoreMotors(); });
  $('#f_wind', el).addEventListener('input', e => { S.wind = +e.target.value; $('#f_windo', el).textContent = fmt(S.wind, 1) + ' m/s'; });
  function update() { $$('[data-veh]', el).forEach(b => b.setAttribute('aria-pressed', b.dataset.veh === S.flightVeh)); const n = Phys.VEH[S.flightVeh].n; $$('#f_motor option', el).forEach((o, i) => { o.hidden = i >= n; }); $('#f_msg', el).textContent = S.flightVeh === 'quad' ? 'Reference quad: four 610 mm props, no warming loop. Fail a motor and watch it tumble.' : 'Takeoff, then fail a motor in hover. Watch the bars: the five healthy rotors share the load.'; }
  return { el, update };
}

/* ---------- rotor thrust bars, history trace and flight HUD ---------- */
function buildBars() { const n = sim.veh.n; $('#rbars').innerHTML = Array.from({ length: n }, (_, i) => `<div class="rbar" data-i="${i}"><div class="trk"><div class="fil" style="height:0"></div><div class="cmd" style="bottom:0"></div></div><small>M${i + 1}</small></div>`).join(''); }
const HIST = $('#thrustHist'), hctx = HIST.getContext('2d'); let cssCache = { t: 0 };
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function drawHistory(s) {
  const w = HIST.width, hh = HIST.height; hctx.clearRect(0, 0, w, hh); const hist = s.history; if (hist.length < 2) return;
  const good = cssVar('--accent'), bad = cssVar('--bad'), n = s.veh.n;
  for (let i = 0; i < n; i++) { hctx.beginPath(); hist.forEach((p, k) => { const x = k / 239 * w, y = hh - 3 - clamp(p.f[i] / s.fmax, 0, 1.1) * (hh - 8); k ? hctx.lineTo(x, y) : hctx.moveTo(x, y); }); hctx.strokeStyle = s.failed.has(i) ? bad : good; hctx.globalAlpha = s.failed.has(i) ? 1 : 0.55; hctx.lineWidth = s.failed.has(i) ? 2 : 1.2; hctx.stroke(); }
  hctx.globalAlpha = 1;
}
function updateBars(s) {
  $$('#rbars .rbar').forEach((b, i) => { const dead = s.failed.has(i); b.classList.toggle('dead', dead); $('.fil', b).style.height = clamp(s.f[i] / s.fmax * 100, 0, 100) + '%'; $('.cmd', b).style.bottom = clamp(s.fc[i] / s.fmax * 100, 0, 100) + '%'; });
}
function updateFlightHud() {
  const t = sim.telemetry(), hud = $('#flightHud'), a = sim.ev.atm;
  const st = t.crashed ? 'DOWN' : t.failed.length ? (t.detected.length ? 'MOTOR OUT · REBALANCED' : 'MOTOR OUT · DETECTING') : t.mode.toUpperCase();
  hud.innerHTML = `<div class="full"><span>STATE</span><b style="color:${t.crashed || t.failed.length ? 'var(--bad)' : 'inherit'}">${st}</b></div><div><span>AGL</span><b>${fmt(t.agl, 1)} m</b></div><div><span>SPEED</span><b>${fmt(t.speed, 1)} m/s</b></div><div><span>V/S</span><b>${fmt(t.vs, 1)} m/s</b></div><div><span>HDG</span><b>${fmt(t.heading, 0)}°</b></div><div><span>TILT</span><b>${fmt(t.tilt, 0)}°</b></div><div><span>POWER</span><b>${fmt(t.power / 1000, 2)} kW</b></div><div><span>BATT</span><b>${fmt(t.soc, 1)} %</b></div><div><span>ρ</span><b>${fmt(a.rho, 2)}</b></div>`;
}

/* ---------- compare: table, reasons, race ---------- */
function cmpTableWidget() {
  const el = h('', 'card');
  function update() {
    const c = ctx(), H = c.hex, Q = c.quad, span = v => 2 * (v.armR + v.propD / 2);
    const rows = [['Rotors', H.v.n, Q.v.n, 0, null], ['Prop diameter, mm', H.v.propD * 1000, Q.v.propD * 1000, 0, null], ['Span, m', span(H.v), span(Q.v), 2, null], ['All-up mass, kg', H.mass.total, Q.mass.total, 1, null], ['Disk loading, N/m²', H.DL, Q.DL, 1, 'low'], ['Hover power, W', H.Ptot, Q.Ptot, 0, 'low'], ['Hover speed, rpm', H.rpm, Q.rpm, 0, 'low'], ['Tip Mach', H.mach, Q.mach, 2, 'low'], ['Pack temp, °C', H.batt.Tcell, Q.batt.Tcell, 1, null], ['Capacity factor', H.batt.f, Q.batt.f, 2, 'high'], ['Usable energy, Wh', H.usableWh, Q.usableWh, 0, 'high'], ['Endurance, min', H.endurance, Q.endurance, 1, 'high'], ['Thrust / weight', H.TW, Q.TW, 2, 'high']];
    const mo = r => r.mo.status === 'ok' ? 'holds hover' : r.mo.status === 'saturated' ? 'thrust-limited' : r.mo.status === 'yaw-lost' ? 'loses control' : 'loses control';
    el.innerHTML = `<h3>H6 vs plain quad · same battery, same pod, same payload</h3><div class="scroll-x"><table><tr><th>Metric</th><th>H6</th><th>Quad</th></tr>${rows.map(r => { const hw = r[4] === 'low' ? r[1] < r[2] : r[4] === 'high' ? r[1] > r[2] : false, qw = r[4] === 'low' ? r[2] < r[1] : r[4] === 'high' ? r[2] > r[1] : false; return `<tr><td>${r[0]}</td><td class="mono ${hw ? 'w' : ''}">${fmt(r[1], r[3])}</td><td class="mono ${qw ? 'w' : ''}">${fmt(r[2], r[3])}</td></tr>`; }).join('')}<tr><td>One motor fails in hover</td><td class="mono ${H.mo.status === 'ok' ? 'w' : ''}">${mo(H)}</td><td class="mono ${Q.mo.status === 'ok' ? 'w' : ''}">${mo(Q)}</td></tr></table></div><div class="note">Green marks the better value where better is clear. Pack temperature, mass and size are shown without a verdict.</div>`;
  }
  return { el, update };
}
function whyWidget() {
  const el = h('', 'card');
  function update() {
    const c = ctx(), H = c.hex, Q = c.quad, span = v => 2 * (v.armR + v.propD / 2);
    el.innerHTML = `<h3>Why this design wins</h3><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">
      <li><b>${fmt(H.Atot / Q.Atot, 1)}× the rotor disk area.</b> Hover power is ${fmt(H.Ptot, 0)} W against ${fmt(Q.Ptot, 0)} W (${fmt((1 - H.Ptot / Q.Ptot) * 100, 0)}% lower), because ideal power falls with the square root of disk area.</li>
      <li><b>More usable energy and less to spend it on.</b> Endurance ${fmt(H.endurance, 1)} min against ${fmt(Q.endurance, 1)} min at ${fmt(S.env.h, 0)} m (${H.endurance > Q.endurance ? '+' + fmt((H.endurance / Q.endurance - 1) * 100, 0) + '%' : fmt((H.endurance / Q.endurance - 1) * 100, 0) + '%'}).</li>
      <li><b>Warm battery.</b> With the loop the pack sits at ${fmt(H.batt.Tcell, 1)} °C (capacity factor ${fmt(H.batt.f, 2)}); the quad's pack is at ${fmt(Q.batt.Tcell, 1)} °C (${fmt(Q.batt.f, 2)}).</li>
      <li><b>Survives a motor loss.</b> H6: ${H.mo.status === 'ok' ? 'holds hover with the other five rotors' : 'cannot hold hover at these conditions'}. Quad: ${Q.mo.status === 'ok' ? 'holds hover' : 'cannot keep roll, pitch and lift together'}.</li>
      <li><b>Cost, stated plainly.</b> The H6 is ${fmt(H.mass.total - Q.mass.total, 1)} kg heavier and ${fmt(span(H.v) - span(Q.v), 1)} m wider, and has more parts to build and maintain.</li></ul>`;
  }
  return { el, update };
}
let race = { t: 0, failed: false };
function startRace() {
  stopRace(true); startCompareRace(); buildBars(); sim.altCmd = 0.42 + 6; sim2.altCmd = 0.42 + 6; race = { t: 0, failed: false };
  flyTo([0, 6.5, 17], [0, 3.2, 0], 1.4); toast('Both aircraft take off, then motor 1 fails on each');
}
function stopRace(keep) { simCmp.on = false; race = { t: 0, failed: false }; if (!keep) { setStageMode('compare'); setView('iso'); } }
function raceWidget() {
  const el = h('', 'card'); el.innerHTML = `<h3>Motor-out race</h3><div class="row"><button class="btn pri" id="r_run">Run race</button><button class="btn warn" id="r_fail">Fail motor 1 now</button><button class="btn" id="r_reset">Reset</button></div><div class="note">Both aircraft use the same controller design: detect the failure after 0.2 s, then redistribute thrust. Only the geometry differs.</div>`;
  $('#r_run', el).addEventListener('click', startRace);
  $('#r_fail', el).addEventListener('click', () => { if (!simCmp.on) { toast('Run the race first'); return; } failBoth(); });
  $('#r_reset', el).addEventListener('click', () => stopRace(false));
  return { el, update() { } };
}
function failBoth() { sim.failMotor(0); sim2.failMotor(0); race.failed = true; }
function updateCompareHud() {
  const hud = $('#flightHud'); if (!simCmp.on) { hud.innerHTML = `<div class="full"><span>Press “Run race”</span></div>`; return; }
  const row = (nm, s) => { const t = s.telemetry(); const st = t.crashed ? 'DOWN' : t.failed.length ? 'MOTOR OUT' : t.mode.toUpperCase(); return `<div class="full"><span>${nm}</span><b style="color:${t.crashed ? 'var(--bad)' : t.failed.length ? 'var(--warn)' : 'inherit'}">${st}</b></div><div><span>AGL</span><b>${fmt(t.agl, 1)} m</b></div><div><span>TILT</span><b>${fmt(t.tilt, 0)}°</b></div>`; };
  hud.innerHTML = row('H6', sim) + row('QUAD', sim2);
}

/* ---------- notes ---------- */
function notesWidget() {
  const el = h('', 'card');
  function update() {
    el.innerHTML = `<h3>Assumptions and limits</h3><div class="note">Every number on this page comes from the model below. “Assumed” means a design assumption to be replaced by a measured, simulated or datasheet value. Nothing here is a certified performance claim.</div>
      <div class="scroll-x"><table><tr><th>Item</th><th>Value</th><th></th></tr>${assumptionRows().map(r => `<tr><td>${r[0]}</td><td style="text-align:left;font-size:12px">${r[1]}</td><td><span class="tag">${r[2]}</span></td></tr>`).join('')}</table></div>
      <h3>What to model and simulate in 3DEXPERIENCE</h3><ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:8px">${PLAN_3DX.map(p => `<li><b>${p[0]}.</b> ${p[1]}</li>`).join('')}</ol>`;
  }
  return { el, update };
}

/* ---------- guided tour ---------- */
function tourWidget() {
  const el = h('', 'card step');
  function update() {
    const i = Math.max(S.tourStep, 0), st = TOUR[i];
    el.innerHTML = `<div class="row" style="justify-content:space-between"><h3>Guided tour · ${i + 1} of ${TOUR.length}</h3></div><h2>${st.title}</h2>${st.html(ctx())}
      <div class="dots">${TOUR.map((_, k) => `<button data-k="${k}" class="${k === i ? 'on' : k < i ? 'past' : ''}" aria-label="Step ${k + 1}"></button>`).join('')}</div>
      <div class="row"><button class="btn" id="t_prev" ${i === 0 ? 'disabled' : ''}>Back</button><button class="btn pri" id="t_next" ${i === TOUR.length - 1 ? 'disabled' : ''}>Next</button><span class="note">Arrow keys also work.</span></div>`;
    $('#t_prev', el).addEventListener('click', () => tourGo(i - 1)); $('#t_next', el).addEventListener('click', () => tourGo(i + 1));
    $$('.dots button', el).forEach(b => b.addEventListener('click', () => tourGo(+b.dataset.k)));
  }
  return { el, update };
}
function tourGo(i) {
  i = clamp(i, 0, TOUR.length - 1); const first = S.tourStep < 0; S.tourStep = i; const st = TOUR[i];
  stopRace(true); setStageMode(st.stage); S.labels = !!st.labels; $('#btnLabels').setAttribute('aria-pressed', S.labels);
  exTarget = st.explode; setSelected(st.select || null);
  if (st.stage === 'compare') { flyTo([0, 3.6, 10.5], [0, 0.6, 0], 1.1); if (st.race) setTimeout(() => { if (S.tourStep === i) startRace(); }, 900); }
  else setView(st.view);
  renderPanel();
}

/* ---------- widget registry and panels ---------- */
const WG = {}; const mk = (k, f) => WG[k] || (WG[k] = f());
const PANELS = {
  design: () => [mk('parts', partsWidget), mk('info', infoWidget), mk('mass', massWidget)],
  physics: () => [mk('cond', condWidget), mk('kpi', kpiWidget), mk('endc', enduranceChart), mk('thc', thrustChart), mk('form', formulaWidget), mk('ass', assumpWidget)],
  flight: () => [mk('cond', condWidget), mk('flight', flightWidget)],
  compare: () => [mk('cond', condWidget), mk('cmp', cmpTableWidget), mk('why', whyWidget), mk('race', raceWidget), mk('endc2', enduranceChart)],
  present: () => { const st = TOUR[Math.max(S.tourStep, 0)], ex = []; if (st.tab === 'physics') ex.push(mk('endc3', enduranceChart), mk('thc2', thrustChart)); if (st.tab === 'compare') ex.push(mk('cmp2', cmpTableWidget)); if (st.tab === 'notes') ex.push(mk('notes2', notesWidget)); return [mk('tour', tourWidget), ...ex, mk('cond', condWidget)]; },
  notes: () => [mk('notes', notesWidget)]
};
let current = [];
function renderPanel() { current = PANELS[S.tab](); const p = $('#panel'); p.replaceChildren(...current.map(w => w.el)); current.forEach(w => w.update()); if (S.tab !== 'design' || true) p.scrollTop = 0; }
function updateWidgets() { current.forEach(w => w.update()); }
function showTab(tab) {
  S.tab = tab; $$('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === tab));
  const stage = tab === 'flight' ? 'flight' : tab === 'compare' ? 'compare' : 'design';
  stopRace(true); KEYS.clear();
  if (tab === 'present') { if (S.tourStep < 0) { S.tourStep = 0; } tourGo(S.tourStep); return; }
  const changed = S.stage !== stage; if (changed || tab === 'flight') setStageMode(stage);
  if (changed && stage !== 'flight') { W.controls.maxDistance = 60; setView('iso', true); }
  else if (tab === 'compare') setView('iso'); if (tab === 'design' || tab === 'physics' || tab === 'notes') { if (S.stage === 'design' && tab !== 'physics' && tab !== 'notes') { /* keep camera */ } }
  renderPanel();
}
$$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

let envRaf = 0;
function envChanged() {
  ctxDirty = true; SWEEP = null;
  const a = ctx().hex.atm; $('#statusTxt').textContent = `${fmt(S.env.h, 0)} m · ${fmt(a.Tc, 0)} °C · ρ ${fmt(a.rho, 3)}`;
  if (S.stage === 'flight') { if (!sim.armed) resetFlight(); else { sim.env.h = S.env.h; sim.env.dT = S.env.dT; } }
  cancelAnimationFrame(envRaf); envRaf = requestAnimationFrame(updateWidgets);
}

/* ---------- stage controls ---------- */
$$('#viewbar [data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$('#btnLabels').addEventListener('click', () => { S.labels = !S.labels; $('#btnLabels').setAttribute('aria-pressed', S.labels); });
$('#btnWire').addEventListener('click', () => setWire(!S.wire));
$('#btnSpin').addEventListener('click', () => { S.spin = !S.spin; $('#btnSpin').setAttribute('aria-pressed', S.spin); });
$('#explode').addEventListener('input', e => { exTarget = null; S.explode = +e.target.value / 100; $('#explodeOut').textContent = Math.round(S.explode * 100) + '%'; });
S.hooks.push({
  onSelect() { if (S.tab === 'design' || S.tab === 'present') { if (WG.info) WG.info.update(); } },
  preStep(dt) {
    if (S.stage === 'flight') sim.setInputs(readInput());
    else if (S.stage === 'compare' && simCmp.on) { race.t += dt; if (!race.failed && race.t > 9) { failBoth(); toast('Motor 1 failed on both aircraft'); } }
  },
  onFrame(dt) {
    if (exTarget !== null) { S.explode += (exTarget - S.explode) * Math.min(1, dt * 3.5); if (Math.abs(S.explode - exTarget) < 0.002) { S.explode = exTarget; exTarget = null; } $('#explode').value = S.explode * 100; $('#explodeOut').textContent = Math.round(S.explode * 100) + '%'; }
    const f = frame % 4 === 0;
    if (S.stage === 'flight') { updateBars(sim); if (f) { updateFlightHud(); drawHistory(sim); } }
    else if (S.stage === 'compare' && f) { updateCompareHud(); if (simCmp.on) { updateBars(sim); drawHistory(sim); } }
    updateTags();
  },
  onTheme() { }
});
/* name tags above each aircraft in compare view */
const TAGS = ['MedVayu H6', 'Reference quad'].map(t => { const d = document.createElement('div'); d.className = 'plabel'; d.textContent = t; d.style.display = 'none'; $('#labelLayer').appendChild(d); return d; });
const _tp = new THREE.Vector3();
function updateTags() {
  const on = S.stage === 'compare' && !simCmp.on; TAGS.forEach((t, i) => { t.style.display = on ? 'block' : 'none'; if (!on) return; _tp.set((i ? 1 : -1) * CMP_X, 0.95, 0).project(W.camera); t.style.left = ((_tp.x * 0.5 + 0.5) * W.stage.clientWidth) + 'px'; t.style.top = ((-_tp.y * 0.5 + 0.5) * W.stage.clientHeight - 38) + 'px'; t.style.transform = 'translate(-50%,-50%)'; });
}

/* ---------- boot ---------- */
buildBars(); envChanged(); showTab('design');
if (location.hash === '#present') showTab('present');
