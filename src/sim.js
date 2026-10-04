/* =====================================================================
   MEDVAYU H6 · sim.js
   Rigid-body flight simulation (6 DOF) with a cascaded controller,
   control allocation, motor lag, skid contact and fault injection.
   World frame: x east, y up, z south. Body frame: x right, y up, z back,
   nose points to −z. Uses the global THREE for vector/quaternion math.
   ===================================================================== */
const SimCfg = {
  dt: 1 / 240,          // fixed physics step, s
  motorTau: 0.06,       // rotor thrust first-order lag, s (ASSUMED)
  fdiDelay: 0.20,       // time to detect a dead motor and re-allocate, s (ASSUMED)
  tiltMax: 25,          // maximum commanded tilt, degrees (sim limit)
  vMax: 10,             // maximum horizontal speed, m/s (sim limit, not a performance claim)
  climbMax: 3.0,        // maximum climb/descent rate, m/s (sim limit)
  cdA: { hex: 0.30, quad: 0.22 },   // drag area, m² (ASSUMED)
  angDamp: 0.8,         // aerodynamic angular damping, N·m·s/rad (ASSUMED)
  skidH: 0.42,          // body origin height above ground when landed, m (matches the 3D model)
  kp: 36, kd: 9.6,      // attitude loop (ωn ≈ 6 rad/s, ζ ≈ 0.8)
  kpYaw: 6, kdYaw: 4
};

class FlightSim {
  constructor(THREE, Phys) {
    this.T = THREE; this.P = Phys;
    this.wind = 0;                       // m/s, blowing toward +x/+z diagonal
    this.history = [];
    this.setVehicle(Phys.VEH.hex, Phys.DEFAULT_ENV);
  }

  /* Recompute mass, inertia and limits from the physics model */
  setVehicle(veh, env) {
    const P = this.P, V3 = this.T.Vector3;
    this.veh = veh; this.env = Object.assign({}, env);
    this.layout = P.layout(veh);
    this.ev = P.evaluate(veh, env);
    this.m = this.ev.mass.total;
    this.fmax = this.ev.fmax.f;
    this.k = this.ev.kyaw;
    // Inertia: rotor assemblies as point masses at the rotor positions, the rest as a compact core.
    const it = this.ev.mass.items;
    const mRot = (it.motors + it.esc + it.props + it.arms) / veh.n;
    const mCore = this.m - mRot * veh.n;
    let Ix = mCore * 0.05, Iz = mCore * 0.05, Iy = mCore * 0.045;   // core radius of gyration ≈ 0.22 m (ASSUMED)
    for (const r of this.layout) { Ix += mRot * r.z * r.z; Iz += mRot * r.x * r.x; Iy += mRot * (r.x * r.x + r.z * r.z); }
    this.I = new V3(Ix, Iy, Iz);
    this.contacts = [[0.42, -1, 0.6], [-0.42, -1, 0.6], [0.42, -1, -0.6], [-0.42, -1, -0.6]]
      .map(p => new V3(p[0], -SimCfg.skidH, p[2]));
    this.reset();
  }

  reset() {
    const T = this.T;
    this.t = 0;
    this.pos = new T.Vector3(0, SimCfg.skidH, 0);
    this.vel = new T.Vector3();
    this.q = new T.Quaternion();
    this.w = new T.Vector3();                       // body angular velocity, rad/s
    this.f = new Array(this.veh.n).fill(0);         // actual rotor thrust, N
    this.fc = new Array(this.veh.n).fill(0);        // commanded rotor thrust, N
    this.failed = new Set(); this.tFail = new Map();
    this.armed = false; this.mode = 'idle';
    this.altCmd = SimCfg.skidH; this.holdX = 0; this.holdZ = 0; this.yawCmd = 0;
    this.u = { fwd: 0, right: 0, up: 0, yaw: 0 };
    this.crashed = false; this.touch = 0; this.energyWh = 0; this.power = 0;
    this.history.length = 0; this._hAcc = 0; this.events = [];
    this.log('Ready on the pad');
  }

  log(msg) { this.events.push({ t: this.t, msg }); if (this.events.length > 30) this.events.shift(); }

  /* ---- commands ---- */
  setInputs(u) { Object.assign(this.u, u); }
  command(mode) {
    if (this.crashed) return;
    if (mode === 'takeoff') { this.armed = true; this.mode = 'takeoff'; this.altCmd = SimCfg.skidH + 20; this.holdX = this.pos.x; this.holdZ = this.pos.z; this.yawCmd = this._yaw(); this.log('Takeoff to 20 m'); }
    else if (mode === 'hover') { if (!this.armed) return; this.mode = 'hover'; this.altCmd = this.pos.y; this.holdX = this.pos.x; this.holdZ = this.pos.z; this.log('Hover, position hold'); }
    else if (mode === 'forward') { if (!this.armed) return; this.mode = 'forward'; this.altCmd = this.pos.y; this.log('Forward flight'); }
    else if (mode === 'land') { if (!this.armed) return; this.mode = 'land'; this.holdX = this.pos.x; this.holdZ = this.pos.z; this.log('Landing'); }
  }
  failMotor(i) {
    if (i < 0 || i >= this.veh.n || this.failed.has(i)) return;
    this.failed.add(i); this.tFail.set(i, this.t);
    this.log('Motor M' + (i + 1) + ' failed');
  }
  restoreMotors() { this.failed.clear(); this.tFail.clear(); this.log('Motors restored'); }
  detected() { const out = []; this.failed.forEach(i => { if (this.t - this.tFail.get(i) >= SimCfg.fdiDelay) out.push(i); }); return out; }

  _yaw() { const f = new this.T.Vector3(0, 0, -1).applyQuaternion(this.q); return Math.atan2(-f.x, -f.z); }
  _wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  /* ---- one fixed physics step ---- */
  step() {
    const T = this.T, V3 = T.Vector3, dt = SimCfg.dt, g = this.P.G0, m = this.m;
    const atm = this.P.isa(this.env.h + Math.max(this.pos.y - SimCfg.skidH, 0), this.env.dT);
    this.t += dt;

    /* 1. Guidance: stick and mode → desired velocity */
    const u = this.u, yaw = this._yaw();
    if (!this.armed && u.up > 0.2 && !this.crashed) { this.command('takeoff'); this.mode = 'manual'; this.altCmd = this.pos.y; }
    if (Math.abs(u.yaw) > 0.05) this.yawCmd -= u.yaw * 1.0 * dt;       // right stick = turn right = decreasing yaw angle
    else if (!this.armed) this.yawCmd = yaw;
    const cy = Math.cos(this.yawCmd), sy = Math.sin(this.yawCmd);
    const fwdD = new V3(-sy, 0, -cy), rightD = new V3(cy, 0, -sy);
    const manualH = Math.abs(u.fwd) > 0.05 || Math.abs(u.right) > 0.05;
    const vd = new V3();
    if (this.mode === 'forward' && !manualH) vd.copy(fwdD).multiplyScalar(8);
    if (manualH) { vd.addScaledVector(fwdD, u.fwd * SimCfg.vMax).addScaledVector(rightD, u.right * SimCfg.vMax); this.holdX = this.pos.x; this.holdZ = this.pos.z; if (this.mode !== 'land') this.mode = 'manual'; }
    else if (this.mode !== 'forward') {
      if (this.mode === 'manual' || this.mode === 'idle') { this.holdX = this.pos.x + this.vel.x * 0.8; this.holdZ = this.pos.z + this.vel.z * 0.8; if (this.armed) this.mode = this.mode === 'idle' ? 'idle' : 'hover'; }
      vd.set(THREE_clamp(1.0 * (this.holdX - this.pos.x), 3), 0, THREE_clamp(1.0 * (this.holdZ - this.pos.z), 3));
    }
    // vertical
    let vyd;
    if (Math.abs(u.up) > 0.05) { vyd = u.up * SimCfg.climbMax; this.altCmd = this.pos.y; if (this.mode === 'idle') this.mode = 'manual'; }
    else if (this.mode === 'land') { const agl = this.pos.y - SimCfg.skidH; vyd = -(agl > 4 ? 1.5 : 0.6); this.altCmd = this.pos.y; }
    else vyd = THREE_clamp(1.2 * (this.altCmd - this.pos.y), SimCfg.climbMax);
    if (this.mode === 'takeoff' && this.pos.y > this.altCmd - 0.4) { this.mode = 'hover'; this.altCmd = this.pos.y; this.holdX = this.pos.x; this.holdZ = this.pos.z; this.log('Hover reached'); }
    vd.y = vyd;

    /* 2. Velocity loop → desired thrust vector → desired attitude and collective */
    const up = new V3(0, 1, 0).applyQuaternion(this.q);
    const a = new V3(THREE_clamp(2.0 * (vd.x - this.vel.x), 4), THREE_clamp(3.0 * (vd.y - this.vel.y), 5), THREE_clamp(2.0 * (vd.z - this.vel.z), 4));
    const Fd = new V3(m * a.x, m * (a.y + g), m * a.z);
    const tilt = Math.atan2(Math.hypot(Fd.x, Fd.z), Fd.y), tiltMax = SimCfg.tiltMax * Math.PI / 180;
    if (tilt > tiltMax) { const s = Math.tan(tiltMax) * Fd.y / Math.hypot(Fd.x, Fd.z); Fd.x *= s; Fd.z *= s; }
    const bDes = Fd.clone().normalize();
    let Tcmd = Math.max(Fd.dot(up), 0);

    /* 3. Attitude loop → body torques */
    const eW = new V3().crossVectors(up, bDes);
    const eB = eW.applyQuaternion(this.q.clone().invert());
    const I = this.I;
    const tau = new V3(I.x * (SimCfg.kp * eB.x - SimCfg.kd * this.w.x), 0, I.z * (SimCfg.kp * eB.z - SimCfg.kd * this.w.z));
    tau.y = I.y * (SimCfg.kpYaw * this._wrap(this.yawCmd - yaw) - SimCfg.kdYaw * this.w.y);

    /* 4. Allocation (controller only knows about detected failures) */
    const n = this.veh.n;
    if (this.armed) {
      const al = this.P.allocate(this.layout, this.detected(), [Tcmd, tau.x, tau.y, tau.z], this.fmax, this.k);
      for (let i = 0; i < n; i++) this.fc[i] = al.f[i];
    } else this.fc.fill(0);

    /* 5. Motors: first-order lag; a failed motor loses thrust at once */
    const alpha = 1 - Math.exp(-dt / SimCfg.motorTau);
    let Ttot = 0, tauB = new V3(0, 0, 0), pw = 0;
    for (let i = 0; i < n; i++) {
      if (this.failed.has(i)) this.f[i] *= Math.exp(-dt / 0.03);
      else this.f[i] += (this.fc[i] - this.f[i]) * alpha;
      const r = this.layout[i], fi = this.f[i];
      Ttot += fi; tauB.x += -r.z * fi; tauB.z += r.x * fi; tauB.y += r.s * this.k * fi;
      pw += this.P.rotorPower(this.veh, atm, fi);
    }
    pw += this.armed ? this.veh.pAux : 0;
    this.power = pw; this.energyWh += pw * dt / 3600;

    /* 6. Forces */
    const Fw = new V3(0, Ttot, 0).applyQuaternion(this.q);
    Fw.y -= m * g;
    const windV = new V3(this.wind * 0.7071, 0, this.wind * 0.7071);
    const vrel = this.vel.clone().sub(windV), sp = vrel.length();
    Fw.addScaledVector(vrel, -0.5 * atm.rho * SimCfg.cdA[this.veh.id] * sp);
    // Skid contact: four spring-damper points with Coulomb-like friction
    const ks = m * g / 4 / 0.005, cd = 0.6 * 2 * Math.sqrt(ks * m / 4);
    const qInv = this.q.clone().invert(), wWorld = this._wWorld(); let touching = 0;
    for (const c of this.contacts) {
      const rw = c.clone().applyQuaternion(this.q), pwld = this.pos.clone().add(rw);
      if (pwld.y >= 0) continue;
      touching++;
      const vp = this.vel.clone().add(new V3().crossVectors(wWorld, rw));
      const Fy = Math.max(ks * (-pwld.y) - cd * vp.y, 0);
      const vh = Math.hypot(vp.x, vp.z), Fmu = Math.min(0.6 * Fy, 2000 * vh);
      const Fc = new V3(vh > 1e-6 ? -Fmu * vp.x / vh : 0, Fy, vh > 1e-6 ? -Fmu * vp.z / vh : 0);
      Fw.add(Fc);
      tauB.add(new V3().crossVectors(rw, Fc).applyQuaternion(qInv));
    }
    this.touch = touching;

    /* 7. Integrate (semi-implicit Euler) */
    const w = this.w, Iw = new V3(I.x * w.x, I.y * w.y, I.z * w.z), gyro = new V3().crossVectors(w, Iw);
    const dw = new V3((tauB.x - gyro.x - SimCfg.angDamp * w.x) / I.x, (tauB.y - gyro.y - SimCfg.angDamp * w.y) / I.y, (tauB.z - gyro.z - SimCfg.angDamp * w.z) / I.z);
    w.addScaledVector(dw, dt);
    const ang = w.length() * dt;
    if (ang > 1e-9) this.q.multiply(new T.Quaternion().setFromAxisAngle(w.clone().normalize(), ang)).normalize();
    this.vel.addScaledVector(Fw, dt / m);
    this.pos.addScaledVector(this.vel, dt);

    /* 8. Landing, disarm and crash logic */
    const tiltNow = Math.acos(Math.min(1, new V3(0, 1, 0).applyQuaternion(this.q).y)) * 180 / Math.PI;
    if (touching > 0 && this.armed && !this.crashed) {
      if (this._impact === undefined) this._impact = Math.abs(this.vel.y);
      if (this.mode === 'land' && Math.abs(this.vel.y) < 0.3 && this.pos.y < SimCfg.skidH + 0.05) { this._landT = (this._landT || 0) + dt; if (this._landT > 1) { this.armed = false; this.mode = 'idle'; this._landT = 0; this.log('Landed, motors off'); } }
      if (tiltNow > 70 && this.vel.length() < 2 && this.pos.y < 1) { this.crashed = true; this.armed = false; this.log('Airframe tipped over, reset to continue'); }
    } else { this._landT = 0; }
    if (this.pos.y > SimCfg.skidH + 1.5) this._impact = undefined;
    if (this.pos.y < SimCfg.skidH - 0.2 || (touching > 0 && this.vel.y < -4)) { if (!this.crashed) { this.crashed = true; this.armed = false; this.fc.fill(0); this.log('Hard impact, reset to continue'); } }

    this._hAcc += dt;
    if (this._hAcc >= 0.05) { this._hAcc = 0; this.history.push({ t: this.t, f: this.f.slice(), fc: this.fc.slice(), failed: [...this.failed], det: this.detected().length > 0 }); if (this.history.length > 240) this.history.shift(); }
  }

  _wWorld() { return this.w.clone().applyQuaternion(this.q); }

  advance(realDt) {
    const steps = Math.min(Math.round(realDt / SimCfg.dt), 20);
    for (let i = 0; i < steps; i++) this.step();
  }

  telemetry() {
    const V3 = this.T.Vector3, up = new V3(0, 1, 0).applyQuaternion(this.q);
    const yawDeg = ((-this._yaw() * 180 / Math.PI) % 360 + 360) % 360;
    const usable = this.ev.usableWh;
    return {
      agl: Math.max(this.pos.y - SimCfg.skidH, 0), speed: Math.hypot(this.vel.x, this.vel.z), vs: this.vel.y,
      tilt: Math.acos(Math.min(1, up.y)) * 180 / Math.PI, heading: yawDeg, power: this.power,
      soc: Math.max(0, 1 - this.energyWh / usable) * 100, energyWh: this.energyWh,
      mode: this.crashed ? 'down' : this.armed ? this.mode : 'on pad', armed: this.armed, crashed: this.crashed,
      failed: [...this.failed], detected: this.detected(), wz: this.w.y * 180 / Math.PI
    };
  }
}

function THREE_clamp(x, lim) { return Math.max(-lim, Math.min(lim, x)); }
if (typeof module !== 'undefined') module.exports = { FlightSim, SimCfg };
