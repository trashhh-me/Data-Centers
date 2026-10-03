#!/usr/bin/env node
// Checks content.json against the build brief. Exit code 1 if a hard rule fails.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(root, 'content.json'), 'utf8');
const C = JSON.parse(raw);
let fail = 0; const open = [];
const BANNED = /\b(TWh|kW|MW|UPS|CRAC|infrastructure|embodied|kWh|GW)\b/i;
const live = [];
C.movements.forEach(m => m.steps.forEach(s => { if (s.hold) open.push(`HELD ${s.id}: ${s.hold}`); else live.push(s); if (s.verify) open.push(`VERIFY ${s.id}: ${s.verify}`); }));
let ms = 0;
live.forEach(s => {
  const words = s.title.trim().split(/\s+/).length;
  if (words > 12) { console.log(`FAIL ${s.id}: ${words} words (max 12): ${s.title}`); fail = 1; }
  if (BANNED.test(s.title)) { console.log(`FAIL ${s.id}: technical term in title: ${s.title}`); fail = 1; }
  if (/\d/.test(s.title) && !s.source) { console.log(`FAIL ${s.id}: number on screen without a source tag`); fail = 1; }
  if (s.source && !s.drawer) { console.log(`FAIL ${s.id}: source tag without a drawer`); fail = 1; }
  if (s.drawer && !C.drawers[s.drawer]) { console.log(`FAIL ${s.id}: missing drawer ${s.drawer}`); fail = 1; }
  ms += s.wait ? 12000 : 6000;
});
Object.keys(C.drawers).forEach(k => C.drawers[k].blocks.forEach(b => { if (b.pending) open.push(`PENDING drawer ${k}: ${b.h}`); }));
const total = (ms + 8000 + 10000) / 1000;
const auto = live.reduce((a, s) => a + (s.wait ? 12 : 6), 0) + 18;
console.log(`${live.length} screens on the main path + 2 end screens`);
console.log(`Auto-advance, no taps: about ${(auto / 60).toFixed(1)} minutes (worst case, screens that wait for a tap use the full 12 s)`);
console.log(`Typical: ${((live.length * 6 + 18) / 60).toFixed(1)} minutes if the waiting screens are tapped through`);
const inline = path.join(root, 'content.inline.js');
if (!fs.existsSync(inline) || !fs.readFileSync(inline, 'utf8').includes(JSON.stringify(C))) { console.log('FAIL content.inline.js is out of date: run node tools/inline-content.js'); fail = 1; }
if (open.length) { console.log('\nOpen items before launch:'); open.forEach(o => console.log('  - ' + o)); }
process.exit(fail);
