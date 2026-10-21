// Debug helper: reach the first morning, save, reload, continue.
import { createRequire } from "node:module";
import { appendFileSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const LOG = process.env.LOG ?? "/tmp/at-debug.log";
writeFileSync(LOG, "");
const log = (...a) => appendFileSync(LOG, [new Date().toISOString().slice(11, 19), ...a].join(" ") + "\n");
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => log("pageerror", e.message, e.stack));
log("launched");
await page.goto("file://" + process.cwd() + "/dist/index.html");
await page.waitForTimeout(600);
await page.click("#go"); await page.waitForTimeout(200); await page.click("#go"); await page.waitForTimeout(300);
log("started");
await page.evaluate(() => { const g = window.__AT; g.debugSkipTo("quake"); for (let i = 0; i < 200; i++) g.update(0.05); });
log("quake done");
await page.evaluate(() => { const g = window.__AT; g.debugSkipTo("night"); for (let i = 0; i < 100 && g.phase === "day"; i++) g.update(0.05); });
log("night start", await page.evaluate(() => window.__AT.phase));
for (let c = 0; c < 30; c++) {
  const ph = await page.evaluate(() => { const g = window.__AT; for (let i = 0; i < 160 && g.phase === "night"; i++) { if (g.base) g.base.core.hp = g.base.core.max; g.update(0.05); } return g.phase; });
  if (ph !== "night") { log("phase", ph); break; }
}
await page.click(".card"); await page.click("#go");
await page.waitForTimeout(200);
const raw = await page.evaluate(() => localStorage.getItem("aftertaps.run.v1"));
log("save bytes", raw?.length);
await page.reload(); await page.waitForTimeout(600);
log("reloaded");
const res = await page.evaluate(() => {
  const g = window.__AT;
  const s = JSON.parse(localStorage.getItem("aftertaps.run.v1"));
  try { g["restore"](s); } catch (e) { return "restore threw: " + e.message + "\n" + e.stack; }
  return { phase: g.phase, day: g.day, npcs: g.npcs.length, base: g.base?.def.name };
});
log("after restore", JSON.stringify(res));
const t = await page.evaluate(() => { const g = window.__AT; const t0 = performance.now(); try { for (let i = 0; i < 20; i++) g.update(0.05); } catch (e) { return "update threw " + e.message + e.stack; } return performance.now() - t0; });
log("20 updates", t);
await browser.close();
