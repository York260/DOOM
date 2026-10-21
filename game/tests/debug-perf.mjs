import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto("file://" + process.cwd() + "/dist/index.html");
await page.waitForTimeout(600);
await page.click("#go"); await page.waitForTimeout(200); await page.click("#go"); await page.waitForTimeout(300);
await page.evaluate(() => { const g = window.__AT; g.debugSkipTo("quake"); for (let i = 0; i < 200; i++) g.update(0.05); g.debugSkipTo("night"); for (let i = 0; i < 100 && g.phase === "day"; i++) g.update(0.05); });
for (let chunk = 0; chunk < 25; chunk++) {
  const r = await page.evaluate(() => {
    const g = window.__AT; const t0 = performance.now();
    for (let i = 0; i < 160 && g.phase === "night"; i++) { if (g.base) g.base.core.hp = g.base.core.max; g.update(0.05); }
    return { ms: Math.round(performance.now() - t0), phase: g.phase, nightT: Math.round(g.nightT), bugs: g.swarm.count(), n: g.swarm.n, q: g.spawnQueue.length };
  });
  console.log(JSON.stringify(r));
  if (r.phase !== "night") break;
}
await browser.close();
