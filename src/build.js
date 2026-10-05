const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const js = ['physics.js','sim.js','scene_mats.js','model.js','app_data.js','app_scene.js','app_ui1.js','app_ui2.js'].map(f => `/* ===== ${f} ===== */\n` + R(f)).join('\n');
const shell = R('shell.html');
fs.mkdirSync(path.join(__dirname, '../dist'), { recursive: true });
// production: CDN libraries, no document wrapper (the host adds it)
const prod = shell + `\n<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>\n<script>\n${js}\n</script>\n`;
fs.writeFileSync(path.join(__dirname, '../dist/index.html'), prod);
// local test page: full document, libraries from node_modules
const nm = path.join(__dirname, '../node_modules/three');
const test = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}html,body{margin:0}</style></head><body>` + shell.replace(/<link[^>]*fonts[^>]*>/g, '') + `\n<script src="file://${nm}/build/three.min.js"></script>\n<script src="file://${nm}/examples/js/controls/OrbitControls.js"></script>\n<script>\n${js}\n</script></body></html>`;
fs.writeFileSync(path.join(__dirname, '../dist/test.html'), test);
console.log('prod', (prod.length / 1024).toFixed(0) + ' KB', 'test', (test.length / 1024).toFixed(0) + ' KB');
