// Performance probe: 300 bugs at night around the base.
// Reports simulation cost per step and render stats (draw calls, triangles).
// Usage: NODE_PATH=$(npm root -g) node tests/perf.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto("file://" + process.cwd() + "/dist/index.html");
await page.waitForTimeout(600);
await page.click("#go"); await page.waitForTimeout(200); await page.click("#go"); await page.waitForTimeout(300);
await page.evaluate(() => {
  const g = window.__AT; g.debugSkipTo("quake"); for (let i = 0; i < 200; i++) g.update(0.05);
  g.debugSkipTo("night"); for (let i = 0; i < 100 && g.phase === "day"; i++) g.update(0.05);
  const c = g.base.core;
  g.player.x = c.x + 2; g.player.z = c.z;
  for (let i = 0; i < 300; i++) { const a = Math.random() * 6.28, r = 12 + Math.random() * 25; g.swarm.spawn(i % 9 === 0 ? 3 : 0, c.x + Math.cos(a) * r, c.z + Math.sin(a) * r); }
});
const r = await page.evaluate(async () => {
  const g = window.__AT;
  const sim = [];
  for (let k = 0; k < 60; k++) {
    g.base.core.hp = g.base.core.max; g.player.hp = g.player.maxHp;
    const t0 = performance.now(); g.update(1 / 60); sim.push(performance.now() - t0);
  }
  sim.sort((a, b) => a - b);
  await new Promise((res) => setTimeout(res, 500));
  const info = g.renderer.info.render;
  const objs = []; g.scene.traverse((o) => { if (o.isMesh || o.isSprite || o.isPoints || o.isLineSegments) objs.push(o.type); });
  return { bugs: g.swarm.count(), simMedianMs: +sim[30].toFixed(2), simP95Ms: +sim[57].toFixed(2), calls: info.calls, triangles: info.triangles, drawables: objs.length, pixelRatio: g.renderer.getPixelRatio() };
});
console.log(JSON.stringify(r));
await browser.close();
