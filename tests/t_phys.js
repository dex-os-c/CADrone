const P = require('../src/physics.js');
const env = P.DEFAULT_ENV;
for (const h of [0,3000,5000,6000]) {
  for (const id of ['hex','quad']) {
    const e = P.evaluate(P.VEH[id], Object.assign({}, env, {h}));
    console.log(h, id, 'rho',e.atm.rho.toFixed(3),'m',e.mass.total.toFixed(1),'Pprop',e.Pprop.toFixed(0),'rpm',e.rpm.toFixed(0),'M',e.mach.toFixed(2),
      'Tcell',e.batt.Tcell.toFixed(1),'f',e.batt.f.toFixed(2),'end',e.endurance.toFixed(1),'TW',e.TW.toFixed(2),'lim',e.fmax.limit,
      'mo',e.mo.status, e.mo.margin.toFixed(2), 'fReq',e.mo.fReq.toFixed(1),'fmax',e.fmax.f.toFixed(1),'Pmot',e.Pmotor.toFixed(0));
  }
}
const noTM = P.evaluate(P.VEH.hex, Object.assign({}, env, {h:5000, thermal:false}));
console.log('hex noTM 5000', noTM.endurance.toFixed(1), noTM.batt.Tcell.toFixed(1));
console.log('ceil hex all TW>=1', P.ceiling(P.VEH.hex, env, e=>e.TW>=1), 'out', P.ceiling(P.VEH.hex, env, e=>e.mo.status==='ok'));
console.log('ceil quad all', P.ceiling(P.VEH.quad, env, e=>e.TW>=1), 'out', P.ceiling(P.VEH.quad, env, e=>e.mo.status==='ok'));
const e0 = P.evaluate(P.VEH.hex, {...env,h:0}); console.log('hex SL ISA check rho', e0.atm.rho, 'p', e0.atm.p, 'T', e0.atm.T);
console.log('hex motor-out f', e0.mo.f.map(x=>x.toFixed(1)).join(' '));
