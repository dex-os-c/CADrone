# MedVayu H6 (CADrone)

High-altitude hexacopter with a modular medical payload pod, for the CADD Centre International Design Competition 2026 (eVTOL/Drones).

Single-page interactive dashboard: 3D model with exploded view and part details, live physics (ISA, momentum theory, battery derating, thrust-to-weight, endurance, motor-out check), flight simulation with motor failure, altitude charts, comparison against a plain quadcopter, and a guided tour.

## Layout
- `dist/index.html`: the built page (loads three.js r128 from a CDN)
- `src/physics.js`: engineering model (every assumption is marked ASSUMED)
- `src/sim.js`: 6-DOF rigid-body flight sim, controller, thrust allocation, fault injection
- `src/model.js`, `src/scene_mats.js`: procedural geometry, materials, textures
- `src/app_*.js`, `src/shell.html`: scene, UI, charts, tour and page shell
- `src/build.js`: concatenates the sources into `dist/`
- `tests/`: Node checks for the physics, sim and geometry (`npm i three@0.128.0`)

## Build
`node src/build.js` (writes `dist/index.html`; `dist/test.html` needs three in `node_modules`).

## Honest limits
Hover-only endurance, constant figure of merit, no battery voltage sag, no blade-element aerodynamics. All masses and efficiencies are estimates to be replaced by 3DEXPERIENCE results or datasheet values.
