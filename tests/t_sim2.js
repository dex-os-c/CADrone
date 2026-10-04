global.THREE = require('three');
const Phys = require('../src/physics.js'); global.Phys = Phys;
const { FlightSim } = require('../src/sim.js');
function run(id, h, wind) {
  const s = new FlightSim(THREE, Phys); s.setVehicle(Phys.VEH[id], { ...Phys.DEFAULT_ENV, h }); s.wind = wind||0;
  const adv = sec => { for (let t=0;t<sec;t+=1/60) s.advance(1/60); };
  const out = []; let maxTilt=0, maxYaw=0, minAgl=1e9;
  const T = (label) => { const t = s.telemetry(); out.push(`${label.padEnd(12)} t=${s.t.toFixed(1).padStart(5)} agl=${t.agl.toFixed(1).padStart(5)} spd=${t.speed.toFixed(1)} vs=${t.vs.toFixed(2)} tilt=${t.tilt.toFixed(1)} yawrate=${t.wz.toFixed(0)} P=${t.power.toFixed(0)} soc=${t.soc.toFixed(1)} mode=${t.mode} f=[${s.f.map(x=>x.toFixed(0)).join(',')}]${s.crashed?' CRASHED':''}`); };
  s.command('takeoff'); adv(6); T('takeoff 6s'); adv(6); T('takeoff 12s'); adv(3); T('hover');
  s.command('forward'); adv(6); T('forward'); s.command('hover'); adv(6); T('stop');
  s.failMotor(0);
  for (let k=0;k<12;k++){ adv(0.25); const t=s.telemetry(); maxTilt=Math.max(maxTilt,t.tilt); maxYaw=Math.max(maxYaw,Math.abs(t.wz)); if(k==0||k==2||k==4||k==11) T('fail+'+((k+1)*0.25)); }
  adv(5); T('fail+8s');
  s.command('land'); for (let k = 0; k < 60 && s.armed && !s.crashed; k++) adv(1); T('landed');
  console.log('=== ' + id + ' @' + h + ' m, wind '+(wind||0)+' ===  maxTilt after fail '+maxTilt.toFixed(1)+'°, max yaw rate '+maxYaw.toFixed(0)+'°/s\n' + out.join('\n'));
}
run('hex', 3000); run('hex', 5000, 6); run('quad', 3000);
