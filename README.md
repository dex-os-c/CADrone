# MedVayu H6 (CADrone)

High-altitude hexacopter with a modular medical payload pod, for the CADD Centre International Design Competition 2026 (eVTOL/Drones).

Status: work in progress. The interactive dashboard page is not assembled yet.

## What is here
- `src/physics.js`: ISA atmosphere, momentum-theory hover power, battery derating, motor-out check, control allocation
- `src/sim.js`: 6-DOF rigid-body flight sim with cascaded controller and motor-failure injection
- `src/scene_mats.js`: procedural textures, PBR materials, sky, terrain (Three.js r128)
- `tests/`: Node checks (`npm i three@0.128.0`, then `node tests/t_phys.js` and `node tests/t_sim2.js`)

All mass, efficiency and battery figures in `physics.js` are marked ASSUMED. Replace them with datasheet or test values.
