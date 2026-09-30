/**
 * Generates the demo site's raster images with a headless browser.
 *
 * hero.png           — deliberately oversized (2800px PNG with film grain, several MB).
 *                      This is a planted performance problem for WebGuardian to find.
 * hero-optimized.jpg — the same artwork at a sensible size/format, used by the fix.
 *
 * Usage: node demo-site/scripts/generate-images.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/images');

const scene = (w, h, grain) => `<!doctype html><html><body style="margin:0">
<canvas id="c" width="${w}" height="${h}"></canvas>
<script>
(() => {
const c = document.getElementById('c'); const x = c.getContext('2d');
const W = ${w}, H = ${h}, s = W / 1400;
let g = x.createLinearGradient(0, 0, W, H);
g.addColorStop(0, '#3b2416'); g.addColorStop(0.55, '#7a4a2a'); g.addColorStop(1, '#d8a46c');
x.fillStyle = g; x.fillRect(0, 0, W, H);
// warm light
let r = x.createRadialGradient(W*0.78, H*0.2, 10, W*0.78, H*0.2, W*0.55);
r.addColorStop(0, 'rgba(255,226,180,0.55)'); r.addColorStop(1, 'rgba(255,226,180,0)');
x.fillStyle = r; x.fillRect(0, 0, W, H);
// table
x.fillStyle = '#2a1a10'; x.fillRect(0, H*0.72, W, H*0.28);
// saucer
x.fillStyle = '#efe6dc'; x.beginPath(); x.ellipse(W*0.5, H*0.74, 300*s, 62*s, 0, 0, Math.PI*2); x.fill();
// cup body
x.fillStyle = '#fbf7f2'; x.beginPath();
x.moveTo(W*0.5-190*s, H*0.40); x.lineTo(W*0.5+190*s, H*0.40);
x.quadraticCurveTo(W*0.5+175*s, H*0.72, W*0.5, H*0.72);
x.quadraticCurveTo(W*0.5-175*s, H*0.72, W*0.5-190*s, H*0.40); x.fill();
// handle
x.strokeStyle = '#fbf7f2'; x.lineWidth = 34*s; x.beginPath(); x.arc(W*0.5+205*s, H*0.52, 62*s, -1.2, 1.3); x.stroke();
// coffee
x.fillStyle = '#4a2a17'; x.beginPath(); x.ellipse(W*0.5, H*0.40, 190*s, 40*s, 0, 0, Math.PI*2); x.fill();
x.fillStyle = '#c98b52'; x.beginPath(); x.ellipse(W*0.5, H*0.40, 120*s, 22*s, 0, 0, Math.PI*2); x.fill();
// steam
x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 12*s; x.lineCap = 'round';
for (const dx of [-60, 0, 60]) { x.beginPath(); x.moveTo(W*0.5+dx*s, H*0.33);
  x.bezierCurveTo(W*0.5+(dx-40)*s, H*0.25, W*0.5+(dx+40)*s, H*0.2, W*0.5+dx*s, H*0.1); x.stroke(); }
// beans
x.fillStyle = '#3a2112';
for (let i = 0; i < 26; i++) { const bx = (i*97 % 1400) * s, by = H*0.8 + ((i*53) % 160) * s;
  x.save(); x.translate(bx, by); x.rotate(i); x.beginPath(); x.ellipse(0, 0, 22*s, 14*s, 0, 0, Math.PI*2); x.fill(); x.restore(); }
if (${grain}) { const d = x.getImageData(0, 0, W, H); let seed = 7;
  for (let i = 0; i < d.data.length; i += 4) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; const n = (seed % 14) - 7;
    d.data[i] += n; d.data[i+1] += n; d.data[i+2] += n; }
  x.putImageData(d, 0, 0); }
})();
</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2800, height: 2000 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.setContent(scene(2800, 2000, true));
await page.locator('#c').screenshot({ path: path.join(out, 'hero.png'), type: 'png' });
await page.setViewportSize({ width: 1400, height: 1000 });
await page.setContent(scene(1400, 1000, false));
await page.locator('#c').screenshot({ path: path.join(out, 'hero-optimized.jpg'), type: 'jpeg', quality: 72 });
await browser.close();
console.log('Images written to', out);
