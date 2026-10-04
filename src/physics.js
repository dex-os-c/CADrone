/* =====================================================================
   MEDVAYU H6 · physics.js
   Pure engineering model. No DOM, no THREE, so it can be unit-tested.
   Every number marked ASSUMED is a design assumption, not measured data.
   Replace them with datasheet / test values as the 3DEXPERIENCE model matures.
   ===================================================================== */
const Phys = (() => {
  const G0 = 9.80665;          // standard gravity, m/s²
  const RGAS = 287.058;        // specific gas constant of dry air, J/(kg·K)
  const GAMMA = 1.4;           // ratio of specific heats for air
  const RHO0 = 1.225;          // ISA sea-level density, kg/m³

  /* ---------- Assumptions (all printed in the UI) ---------- */
  const A = {
    FM: 0.70,            // rotor figure of merit in hover (ASSUMED; large low-solidity props)
    CT: 0.011,           // hover thrust coefficient T/(ρ·A·(ΩR)²) (ASSUMED)
    etaMotor: 0.90,      // motor efficiency at hover (ASSUMED)
    etaEsc: 0.95,        // ESC efficiency (ASSUMED)
    pMotorMax: 2000,     // continuous electrical power limit per motor, W (ASSUMED)
    machTipMax: 0.65,    // tip Mach limit for noise and compressibility (ASSUMED)
    battSpecEnergy: 200, // pack-level specific energy, Wh/kg (ASSUMED, Li-ion pack)
    dod: 0.80,           // usable depth of discharge, keeps a 20 % reserve (ASSUMED)
    packEff: 0.97,       // pack electrical efficiency; the 3 % loss heats the pack (ASSUMED)
    capture: 0.25,       // share of motor+ESC heat delivered to the battery loop (ASSUMED)
    UAins: 6,            // insulated pack heat-loss conductance, W/K (ASSUMED)
    UAopen: 12,          // uninsulated pack heat-loss conductance, W/K (ASSUMED)
    TcellMax: 30,        // controller bypasses the loop above this cell temp, °C (ASSUMED)
    capSlope: 0.0075,    // capacity lost per °C below 25 °C (ASSUMED generic Li-ion trend)
    capFloor: 0.40       // lowest capacity factor the model returns (ASSUMED)
  };

  /* ---------- Vehicle definitions (mass figures are ASSUMED estimates) ---------- */
  const VEH = {
    hex: {
      id: 'hex', name: 'MedVayu H6', n: 6, propD: 0.914, armR: 1.00,
      thermal: true, pAux: 80,
      mFrame: 2.8, mArm: 0.28, mMotor: 0.85, mEsc: 0.15, mProp: 0.20,
      mThermal: 0.9, mAvionics: 1.3, mSkids: 1.1, mPod: 2.2, mLatch: 0.4
    },
    quad: {
      id: 'quad', name: 'Reference quad', n: 4, propD: 0.610, armR: 0.55,
      thermal: false, pAux: 50,
      mFrame: 2.2, mArm: 0.22, mMotor: 0.85, mEsc: 0.15, mProp: 0.12,
      mThermal: 0, mAvionics: 1.2, mSkids: 0.9, mPod: 2.2, mLatch: 0.4
    }
  };

  const DEFAULT_ENV = { h: 3000, dT: 0, payload: 5, battWh: 2400, thermal: true };

  /* ---------- International Standard Atmosphere, troposphere (0–11 km) ---------- */
  // T = T0 − L·h ; p = p0·(T/T0)^(g/(R·L)) ; ρ = p/(R·T). dT shifts temperature only;
  // pressure stays on the ISA profile (pressure-altitude convention).
  function isa(h, dT = 0) {
    const T0 = 288.15, L = 0.0065, p0 = 101325;
    const Ts = T0 - L * h;
    const p = p0 * Math.pow(Ts / T0, G0 / (RGAS * L));
    const T = Ts + dT;
    const rho = p / (RGAS * T);
    return { h, Tstd: Ts, T, Tc: T - 273.15, p, rho, sigma: rho / RHO0, a: Math.sqrt(GAMMA * RGAS * T) };
  }

  /* ---------- Rotor layout. x right, z backward, y up (matches the 3D scene) ---------- */
  function layout(v) {
    const out = [], step = 360 / v.n, start = v.n === 6 ? 30 : 45;
    for (let i = 0; i < v.n; i++) {
      const th = (start + step * i) * Math.PI / 180;   // measured from nose, clockwise seen from above
      out.push({ i, th, x: v.armR * Math.sin(th), z: -v.armR * Math.cos(th), s: i % 2 === 0 ? 1 : -1 });
    }
    return out;
  }

  /* ---------- Mass budget, kg ---------- */
  function massBreakdown(v, env) {
    const it = {
      frame: v.mFrame, arms: v.n * v.mArm, motors: v.n * v.mMotor, esc: v.n * v.mEsc,
      props: v.n * v.mProp, battery: env.battWh / A.battSpecEnergy, thermal: v.thermal ? v.mThermal : 0,
      avionics: v.mAvionics, skids: v.mSkids, pod: v.mPod, latch: v.mLatch, payload: env.payload
    };
    let total = 0; for (const k in it) total += it[k];
    return { items: it, total };
  }

  /* ---------- Battery: cell temperature and capacity derating ---------- */
  function capacityFactor(Tc) { return Tc >= 25 ? 1 : Math.max(A.capFloor, 1 - A.capSlope * (25 - Tc)); }

  function battery(v, env, atm, Pprop) {
    const lossMotEsc = Pprop * (1 - A.etaMotor * A.etaEsc);   // waste heat from motors + ESCs, W
    const Qself = Pprop * (1 - A.packEff);                    // pack's own I²R heat, W
    const managed = v.thermal && env.thermal;
    let Qin, UA, Tcell;
    if (managed) { Qin = A.capture * lossMotEsc + Qself; UA = A.UAins; Tcell = Math.min(atm.Tc + Qin / UA, A.TcellMax); }
    else { Qin = Qself; UA = A.UAopen; Tcell = atm.Tc + Qin / UA; }
    return { managed, lossMotEsc, Qself, Qin, UA, Tcell, f: capacityFactor(Tcell) };
  }

  /* ---------- Per-rotor thrust limit ---------- */
  // Power limit:  P_el = T^1.5 / (√(2ρA)·FM·η)  →  T = (Pmax·FM·η·√(2ρA))^(2/3)
  // Tip-Mach limit: T = ρ·A·CT·(M·a)²
  function fmaxRotor(v, atm) {
    const Ar = Math.PI * Math.pow(v.propD / 2, 2), eta = A.etaMotor * A.etaEsc;
    const byPower = Math.pow(A.pMotorMax * A.FM * eta * Math.sqrt(2 * atm.rho * Ar), 2 / 3);
    const byMach = atm.rho * Ar * A.CT * Math.pow(A.machTipMax * atm.a, 2);
    return { f: Math.min(byPower, byMach), byPower, byMach, limit: byPower <= byMach ? 'motor power' : 'tip Mach' };
  }

  // Electrical power for one rotor producing thrust f (momentum theory)
  function rotorPower(v, atm, f) {
    const Ar = Math.PI * Math.pow(v.propD / 2, 2);
    return Math.pow(Math.max(f, 0), 1.5) / (Math.sqrt(2 * atm.rho * Ar) * A.FM * A.etaMotor * A.etaEsc);
  }

  // Reaction-torque ratio k = Q/T (m). From Q/T = CQ·R/CT with CQ = CP = CT^1.5/(√2·FM)
  function kYaw(v) { return (v.propD / 2) * Math.sqrt(A.CT) / (Math.SQRT2 * A.FM); }

  /* ---------- Control allocation ----------
     Unknown rotor thrusts f. Equations (rows): total thrust, roll-axis moment, yaw, pitch-axis moment.
       Σ f = T          Σ −z·f = τx          Σ s·k·f = τy          Σ x·f = τz
     Solved as damped weighted least squares (yaw has the lowest weight, so yaw is sacrificed first),
     then rotors outside [0, fmax] are clamped one at a time and the rest re-solved.            */
  function solve4(M, b) {
    const n = 4, a = M.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
      [a[c], a[p]] = [a[p], a[c]];
      const d = a[c][c] || 1e-12;
      for (let r = c + 1; r < n; r++) { const k = a[r][c] / d; for (let q = c; q <= n; q++) a[r][q] -= k * a[c][q]; }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) { let s = a[r][n]; for (let q = r + 1; q < n; q++) s -= a[r][q] * x[q]; x[r] = s / (a[r][r] || 1e-12); }
    return x;
  }

  function allocate(L, failed, cmd, fmax, k, wYaw = 0.15) {
    const n = L.length, W = [1, 1, wYaw, 1];
    const col = i => [1, -L[i].z, L[i].s * k, L[i].x];
    const lock = new Array(n).fill(null); for (const i of failed) lock[i] = 0;
    const f = new Array(n).fill(0);
    for (let it = 0; it <= n; it++) {
      const free = []; for (let i = 0; i < n; i++) if (lock[i] === null) free.push(i);
      // Bias toward even loading: solve for the deviation from an equal share of the thrust
      // command, so healthy rotors stay evenly loaded instead of some being switched off.
      const ref = free.length ? Math.max(cmd[0], 0) / free.length : 0;
      const b = cmd.slice();
      for (let i = 0; i < n; i++) if (lock[i] !== null) { const c = col(i); for (let r = 0; r < 4; r++) b[r] -= c[r] * lock[i]; }
      for (const i of free) { const c = col(i); for (let r = 0; r < 4; r++) b[r] -= c[r] * ref; }
      const cols = free.map(i => col(i).map((x, r) => x * W[r]));
      const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      for (const c of cols) for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) M[r][q] += c[r] * c[q];
      const tr = M[0][0] + M[1][1] + M[2][2] + M[3][3];
      for (let r = 0; r < 4; r++) M[r][r] += 1e-7 * tr + 1e-12;
      const y = solve4(M, b.map((x, r) => x * W[r]));
      free.forEach((i, kk) => { f[i] = ref + cols[kk].reduce((s, c, r) => s + c * y[r], 0); });
      let worst = -1, wv = 1e-9, wb = 0;
      for (const i of free) {
        const lo = -f[i], hi = f[i] - fmax, viol = Math.max(lo, hi);
        if (viol > wv) { wv = viol; worst = i; wb = lo > hi ? 0 : fmax; }
      }
      if (worst < 0) break;
      lock[worst] = wb; f[worst] = wb;
    }
    for (let i = 0; i < n; i++) f[i] = lock[i] !== null ? lock[i] : Math.min(Math.max(f[i], 0), fmax);
    const res = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) { const c = col(i); for (let r = 0; r < 4; r++) res[r] += c[r] * f[i]; }
    for (let r = 0; r < 4; r++) res[r] -= cmd[r];
    return { f, res };
  }

  /* ---------- Motor-out check at hover ----------
     For each rotor in turn: remove it, ask the allocator to hold weight with zero moments,
     record the largest thrust any remaining rotor must give.                              */
  function motorOut(v, Wt, fmax) {
    const L = layout(v), k = kYaw(v);
    const tolT = 0.005 * Wt, tolM = 0.005 * Wt * v.armR;
    let worst = null;
    for (let i = 0; i < v.n; i++) {
      const r = allocate(L, [i], [Wt, 0, 0, 0], Infinity, k);
      const fReq = Math.max(...r.f);
      const holds = Math.abs(r.res[0]) < tolT && Math.abs(r.res[1]) < tolM && Math.abs(r.res[3]) < tolM;
      const yawOK = Math.abs(r.res[2]) < tolM;
      let status;
      if (holds && yawOK) status = fReq <= fmax ? 'ok' : 'saturated';
      else if (holds) status = 'yaw-lost';
      else status = 'lost';
      const rank = { ok: 0, saturated: 1, 'yaw-lost': 2, lost: 3 }[status];
      if (!worst || rank > worst.rank || (rank === worst.rank && fReq > worst.fReq)) worst = { i, f: r.f, fReq, status, rank };
    }
    return { status: worst.status, fReq: worst.fReq, rotor: worst.i, f: worst.f,
             margin: (worst.status === 'ok' || worst.status === 'saturated') ? fmax / worst.fReq : 0 };
  }

  /* ---------- Full evaluation ---------- */
  function evaluate(v, env) {
    const atm = isa(env.h, env.dT);
    const mb = massBreakdown(v, env);
    const Wt = mb.total * G0;
    const R = v.propD / 2, Ar = Math.PI * R * R, Atot = v.n * Ar, eta = A.etaMotor * A.etaEsc;
    const Tr = Wt / v.n;
    const vi = Math.sqrt(Tr / (2 * atm.rho * Ar));                      // induced velocity at the disk
    const Pid = Math.pow(Wt, 1.5) / Math.sqrt(2 * atm.rho * Atot);      // ideal hover power
    const Pprop = Pid / (A.FM * eta);                                   // electrical power to rotors
    const Ptot = Pprop + v.pAux;
    const tipV = Math.sqrt(Tr / (atm.rho * Ar * A.CT));
    const rpm = tipV / R * 60 / (2 * Math.PI);
    const batt = battery(v, env, atm, Pprop);
    const usableWh = env.battWh * A.dod * batt.f;
    const endurance = usableWh / Ptot * 60;                             // minutes
    const fm = fmaxRotor(v, atm);
    const TW = v.n * fm.f / Wt;
    const mo = motorOut(v, Wt, fm.f);
    return { v, env, atm, mass: mb, Wt, R, Ar, Atot, Tr, vi, Pid, Pprop, Ptot, Pmotor: Pprop / v.n,
             DL: Wt / Atot, tipV, rpm, mach: tipV / atm.a, batt, usableWh, endurance,
             fmax: fm, TW, mo, kyaw: kYaw(v), eta };
  }

  function sweep(v, env, hs) {
    return hs.map(h => { const e = evaluate(v, Object.assign({}, env, { h })); return { h, e }; });
  }

  // Highest altitude (m) where cond(eval) stays true, scanning upward from sea level
  function ceiling(v, env, cond, hMax = 9000, step = 50) {
    let last = null;
    for (let h = 0; h <= hMax; h += step) {
      if (cond(evaluate(v, Object.assign({}, env, { h })))) last = h; else break;
    }
    return last;
  }

  const api = { A, VEH, DEFAULT_ENV, G0, RHO0, isa, layout, massBreakdown, capacityFactor, battery, fmaxRotor,
                rotorPower, kYaw, allocate, motorOut, evaluate, sweep, ceiling };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
