/* =====================================================================
   MEDVAYU H6 · app_data.js
   Part descriptions, guided-tour script, assumption and 3DEXPERIENCE text.
   Part masses are NOT stored here: they come from Phys.massBreakdown().
   Materials and geometry are design choices for this concept, not tested data.
   ===================================================================== */
const PARTS = {
  props: { name: 'Large low-RPM propellers', short: 'Props', color: '#38c6cf', mass: ['props'],
    qty: v => v.n + ' (' + v.n / 2 + ' CW + ' + v.n / 2 + ' CCW)',
    fn: 'Convert motor torque into thrust. Two-blade, tapered, twisted blades with the largest disk the arm layout allows.',
    material: 'Carbon-fibre / epoxy blades, anodised aluminium hub (design choice).',
    reason: 'Hover power scales with 1/√(disk area). A bigger disk lowers disk loading, so each newton of thrust costs less power, and the rotor turns slower, which keeps tip Mach moderate in thin air.' },
  motors: { name: 'Low-KV outrunner motors', short: 'Motors', color: '#0a8189', mass: ['motors'],
    qty: v => v.n,
    fn: 'Drive the propellers directly (no gearbox). Each motor is a heat source that feeds the battery warming loop.',
    material: 'Aluminium bell and stator carrier, copper windings, neodymium magnets (design choice).',
    reason: 'A low-KV motor matches a large, slow propeller without a gearbox, which removes a failure point. Its winding loss becomes useful heat in cold air.' },
  arms: { name: 'Carbon-fibre arms', short: 'Arms', color: '#3a4a56', mass: ['arms'],
    qty: v => v.n,
    fn: 'Hold each motor at the correct radius and carry thrust and torque loads into the frame.',
    material: 'Carbon-fibre / epoxy tube, about 44 mm OD in this model, aluminium root clamps.',
    reason: 'High stiffness-to-weight keeps the structure light. The arm radius is set so neighbouring props clear each other, and it also fixes the moment arms used by the motor-out controller.' },
  esc: { name: 'Electronic speed controllers', short: 'ESCs', color: '#6a7a86', mass: ['esc'],
    qty: v => v.n,
    fn: 'Convert pack DC into three-phase drive for each motor. One per motor, so one failed ESC takes out one rotor only.',
    material: 'Aluminium heat-spreader on a PCB (design choice).',
    reason: 'One ESC per motor isolates faults. ESC losses are also heat that the thermal loop can collect.' },
  thermal: { name: 'Waste-heat battery warming loop', short: 'Thermal loop', color: '#ff7a2f', mass: ['thermal'],
    qty: v => v.thermal ? v.n + ' motor loops + 1 cold plate' : 'none',
    fn: 'A liquid loop picks up heat from each motor and ESC, runs inward along the arms, and warms the battery through a cold plate. A bypass stops heating above 30 °C.',
    material: 'Thin-wall tubing, aluminium cold plate, small circulation pump (design choice).',
    reason: 'Li-ion capacity falls in cold air. At altitude the motors waste more power exactly when the air is coldest, so reusing that heat protects usable energy at almost no energy cost.' },
  frame: { name: 'Carbon sandwich frame', short: 'Frame', color: '#1e2a33', mass: ['frame'],
    qty: v => '2 plates + 6 standoffs',
    fn: 'Central hub: joins arms, battery, avionics, pod latches and skids.',
    material: 'Carbon-fibre plates, aluminium standoffs (design choice).',
    reason: 'A twin-plate sandwich is stiff, light, easy to inspect and gives a clear mounting plane for the battery above and the pod below.' },
  avionics: { name: 'Flight controller and sensors', short: 'Avionics', color: '#0c5a3a', mass: ['avionics'],
    qty: v => '1 stack + GNSS mast',
    fn: 'Estimates attitude, runs the position and attitude loops, detects a dead motor and re-allocates thrust across the healthy rotors.',
    material: 'Multilayer PCBs in a vibration-isolated stack (design choice).',
    reason: 'Motor-out tolerance is mostly software: the controller must know each rotor\'s position and limits to redistribute thrust within a fraction of a second.' },
  battery: { name: 'Top-mounted battery pack', short: 'Battery', color: '#232c33', mass: ['battery'],
    qty: v => '1',
    fn: 'Stores the flight energy and supplies all six motors.',
    material: 'Li-ion cells in a flame-retardant housing; pack-level 200 Wh/kg is an assumption.',
    reason: 'On top, the pack stays in the clean air above the rotors, is easy to swap, and keeps the underside free for the pod. It also sits over the cold plate for direct warming.' },
  pod: { name: 'Modular medical pod', short: 'Pod', color: '#e8eef1', mass: ['pod', 'latch'],
    qty: v => '1 shell',
    fn: 'Streamlined enclosure under the hub that holds a payload cassette and shields it from airflow and weather.',
    material: 'Moulded composite shell with a polycarbonate window (design choice).',
    reason: 'A standard pod interface lets the same aircraft carry blood products, an AED kit, medicines or a casualty-care kit. Mounting it low keeps the centre of gravity close to the rotor plane.' },
  payload: { name: 'Payload cassette', short: 'Cassette', color: '#0f9aa0', mass: ['payload'],
    qty: v => '1 slide-out unit',
    fn: 'Carries the actual medical load. It slides out of the rear of the pod and can be loaded at the clinic while the aircraft is already on its next sortie.',
    material: 'Insulated composite box (design choice). Payload mass is the "Payload" slider.',
    reason: 'A cassette separates loading from flying: hospitals load it, the aircraft just carries it. Different cassettes can add cooling, oxygen or a sample-return tray.' },
  latch: { name: 'Pod quick-release latches', short: 'Latches', color: '#ff7a2f', mass: [],
    qty: v => '4',
    fn: 'Lock the pod to the frame and release it by hand.',
    material: 'Aluminium body with stainless pin (design choice).',
    reason: 'Tool-free swapping is what makes the pod modular in practice. Four latches give a redundant load path. Their mass is included with the pod in the budget.' },
  skids: { name: 'Carbon skid landing gear', short: 'Skids', color: '#3a4a56', mass: ['skids'],
    qty: v => '2 runners + 4 struts',
    fn: 'Support the aircraft on the ground and absorb touchdown loads on rough or sloped sites.',
    material: 'Carbon-fibre tube runners and struts with rubber feet (design choice).',
    reason: 'Skids are simpler and lighter than wheels or articulated legs and work on uneven ground. The wide stance gives rollover margin.' }
};
const PART_ORDER_UI = ['props', 'motors', 'arms', 'esc', 'thermal', 'frame', 'avionics', 'battery', 'pod', 'payload', 'latch', 'skids'];

/* Order of pod-related mass: the budget has separate pod and latch items. */
function partMass(id, mb) { return PARTS[id].mass.reduce((s, k) => s + (mb.items[k] || 0), 0); }

/* ---------- Guided tour. html(ctx) returns the talking points with live numbers. ---------- */
const f1 = x => x.toFixed(1), f0 = x => x.toFixed(0), f2 = x => x.toFixed(2);
const TOUR = [
  { title: 'The problem', stage: 'design', view: 'iso', explode: 0, select: null,
    html: c => `<ul><li>The brief asks for a high-altitude electric aircraft for life-saving and transport work.</li>
      <li>At <b>${f0(S.env.h)} m</b> standard-atmosphere air is <b>${f0(c.hex.atm.sigma * 100)}%</b> as dense as at sea level. Rotors make less thrust per rev.</li>
      <li>Cold air also cuts battery capacity. A plain quad at the same point has about <b>${f0(c.quad.batt.f * 100)}%</b> of rated capacity, in this model.</li></ul>` },
  { title: 'Our answer: MedVayu H6', stage: 'design', view: 'iso', explode: 0, select: null,
    html: c => `<ul><li>Hexacopter, six large carbon props, skid gear.</li><li>Battery on top, modular medical pod underneath.</li>
      <li>Three innovations: <b>large low-RPM props</b>, <b>battery warmed by motor waste heat</b>, <b>motor-out fault tolerance</b>.</li>
      <li>All-up mass in this model: <b>${f1(c.hex.mass.total)} kg</b> with ${f0(S.env.payload)} kg of payload.</li></ul>` },
  { title: 'Anatomy', stage: 'design', view: 'iso', explode: 1, select: null, labels: true,
    html: c => `<ul><li>Drag the Exploded slider. Every part has a label; tap one for its function, material, mass and design reason.</li>
      <li>Mass budget total: <b>${f1(c.hex.mass.total)} kg</b>. Battery is the largest single item at <b>${f1(c.hex.mass.items.battery)} kg</b>.</li></ul>` },
  { title: 'Large low-RPM propellers', stage: 'design', view: 'front', explode: 0.55, select: 'props',
    html: c => `<ul><li>Prop diameter <b>${f0(c.hex.v.propD * 1000)} mm</b> against <b>${f0(c.quad.v.propD * 1000)} mm</b> on the reference quad.</li>
      <li>Disk loading <b>${f1(c.hex.DL)} N/m²</b> against <b>${f1(c.quad.DL)}</b>.</li>
      <li>Hover power in this model: <b>${f0(c.hex.Ptot)} W</b> against <b>${f0(c.quad.Ptot)} W</b>.</li>
      <li>Hover speed <b>${f0(c.hex.rpm)} rpm</b>, tip Mach <b>${f2(c.hex.mach)}</b>.</li></ul>` },
  { title: 'Battery warmed by waste heat', stage: 'design', view: 'iso', explode: 0.7, select: 'thermal',
    html: c => `<ul><li>Heat from motors and ESCs is carried along the arms to a cold plate under the battery.</li>
      <li>Ambient <b>${f1(c.hex.atm.Tc)} °C</b>. Pack temperature with the loop: <b>${f1(c.hex.batt.Tcell)} °C</b>; without: <b>${f1(c.hexNoTM.batt.Tcell)} °C</b>.</li>
      <li>Usable capacity factor <b>${f2(c.hex.batt.f)}</b> against <b>${f2(c.hexNoTM.batt.f)}</b>. That is <b>${f1(c.hex.endurance)} min</b> against <b>${f1(c.hexNoTM.endurance)} min</b> of hover.</li>
      <li>Depends on an assumed ${f0(Phys.A.capture * 100)}% heat capture. We will verify it in thermal simulation.</li></ul>` },
  { title: 'Motor-out fault tolerance', stage: 'compare', view: 'iso', explode: 0, select: null, race: true,
    html: c => `<ul><li>The race on the stage fails motor 1 on both aircraft at the same moment.</li>
      <li>The hexacopter has six rotors. With one gone the controller shifts thrust to the other five and holds hover.</li>
      <li>Needs <b>${f1(c.hex.mo.fReq)} N</b> from the busiest rotor against <b>${f1(c.hex.fmax.f)} N</b> available (margin <b>${f2(c.hex.mo.margin)}×</b>).</li>
      <li>The four-rotor reference cannot cancel yaw and roll together after a failure. In the sim it tumbles.</li></ul>` },
  { title: 'Modular medical pod', stage: 'design', view: 'side', explode: 0.8, select: 'payload',
    html: c => `<ul><li>One standard pod, swappable cassettes: blood products, AED kit, medicines, sample return.</li>
      <li>Cassette slides out of the rear and is loaded while the aircraft flies another sortie.</li>
      <li>Four tool-free latches hold the pod. Payload in this model: <b>${f0(S.env.payload)} kg</b>.</li></ul>` },
  { title: 'Altitude performance', stage: 'design', view: 'iso', explode: 0, select: null, tab: 'physics',
    html: c => `<ul><li>Charts on the right update with the sliders: endurance and thrust margin against altitude.</li>
      <li>At <b>${f0(S.env.h)} m</b>: thrust-to-weight <b>${f2(c.hex.TW)}</b>, motor-out needs <b>${f2(c.hex.mo.fReq * c.hex.v.n / c.hex.Wt)}</b>.</li>
      <li>Move the altitude slider to see where the margin runs out.</li></ul>` },
  { title: 'Why not a plain quad?', stage: 'compare', view: 'iso', explode: 0, select: null, tab: 'compare',
    html: c => `<ul><li>Hover power <b>${f0((1 - c.hex.Ptot / c.quad.Ptot) * 100)}%</b> lower.</li>
      <li>Endurance <b>${f1(c.hex.endurance)} min</b> against <b>${f1(c.quad.endurance)} min</b> at ${f0(S.env.h)} m.</li>
      <li>Thrust-to-weight <b>${f2(c.hex.TW)}</b> against <b>${f2(c.quad.TW)}</b>.</li>
      <li>Hex survives a motor loss: <b>${c.hex.mo.status === 'ok' ? 'yes' : 'no'}</b>. Quad: <b>${c.quad.mo.status === 'ok' ? 'yes' : 'no'}</b>.</li></ul>` },
  { title: 'Validation plan', stage: 'design', view: 'iso', explode: 0.4, select: null, tab: 'notes',
    html: c => `<ul><li>This page is a concept calculator with stated assumptions. It is not a certified performance claim.</li>
      <li>Next, in 3DEXPERIENCE: model the parts, run structural, thermal and flow studies, then replace each assumption with a simulated or datasheet value.</li>
      <li>The Notes tab lists every assumption and the modelling plan.</li></ul>` }
];

/* ---------- Notes: assumptions (values read live from the model) and the 3DEXPERIENCE plan ---------- */
function assumptionRows() {
  const A = Phys.A;
  return [
    ['Atmosphere', 'ISA troposphere (0–11 km). ΔT shifts temperature only; pressure stays on the ISA profile.', 'standard'],
    ['Figure of merit FM', A.FM + ' in hover for all rotors', 'assumed'],
    ['Thrust coefficient CT', A.CT + ' (sets hover rpm and tip speed)', 'assumed'],
    ['Motor / ESC efficiency', (A.etaMotor * 100) + '% / ' + (A.etaEsc * 100) + '%', 'assumed'],
    ['Per-motor power limit', A.pMotorMax + ' W continuous', 'assumed'],
    ['Tip Mach limit', A.machTipMax, 'assumed'],
    ['Pack specific energy', A.battSpecEnergy + ' Wh/kg at pack level', 'assumed'],
    ['Usable depth of discharge', (A.dod * 100) + '% (20% reserve)', 'assumed'],
    ['Cold capacity loss', (A.capSlope * 100).toFixed(2) + '% per °C below 25 °C, floor ' + (A.capFloor * 100) + '%', 'assumed'],
    ['Heat captured by loop', (A.capture * 100) + '% of motor + ESC loss; pack insulated conductance ' + A.UAins + ' W/K, uninsulated ' + A.UAopen + ' W/K; bypass above ' + A.TcellMax + ' °C', 'assumed'],
    ['Component masses', 'Per-part masses in physics.js (frame, arms, motors 0.85 kg, ESC 0.15 kg, props, pod 2.2 kg, ...)', 'assumed'],
    ['Reference quad', '610 mm props, 4 motors, same battery, same pod and payload, no warming loop', 'assumed'],
    ['Hover only', 'Endurance uses hover power. Forward-flight power, climb, wind and reserve policy are not modelled.', 'limit'],
    ['Rotor aerodynamics', 'Momentum theory with a constant figure of merit. No blade-element, ground effect, or rotor-rotor interference.', 'limit'],
    ['Battery', 'No voltage sag, no rate-dependent capacity, no ageing. Temperature is a steady-state estimate.', 'limit'],
    ['Motor-out', 'Control allocation on a rigid body. Failure detected after 0.2 s. Motor response lag 0.06 s. Yaw is sacrificed first.', 'assumed'],
    ['Flight sim', 'Rigid body, quadratic drag, spring-damper skids. Speed and tilt limits are sim limits, not performance claims.', 'limit']
  ];
}
const PLAN_3DX = [
  ['Parts and assembly', 'Model every part in the Parts view with the materials shown here; assemble with arm, battery and pod constraints; add motion for pod slide-out and an exploded drawing.'],
  ['Mass properties', 'Assign materials, read mass, centre of gravity and inertia, compare against the budget; check CG stays inside the skid footprint with each payload.'],
  ['Structural (arm and frame)', 'Static analysis of an arm with thrust and torque at the motor mount; frame under hover and under the motor-out load case; skid drop load.'],
  ['Thermal', 'Steady and transient study of motor and ESC heat into the loop and cold plate at cold-air conditions; check the 30 °C bypass behaviour.'],
  ['Fluid flow (CFD)', 'Flow around the pod and arms in hover downwash; prop-to-arm clearance; check the battery sits outside prop wake.'],
  ['Fatigue / vibration', 'Modal analysis of the arm with motor mass to keep the first mode away from rotor rpm.'],
  ['Validation and justification', 'Replace every ASSUMED value with a simulated or datasheet value; keep a table of assumption, source and result.']
];
