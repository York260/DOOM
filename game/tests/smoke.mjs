// Smoke test: boots the built game, plays through a fast-forwarded loop and
// takes screenshots. Usage: node tests/smoke.mjs [outDir]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright"); // global install: run with NODE_PATH=$(npm root -g)
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const out = process.argv[2] ?? "/tmp/at-shots";
mkdirSync(out, { recursive: true });
const file = "file://" + resolve("dist/index.html");
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g/.test(m.text())) errors.push("console: " + m.text()); });
await page.goto(file);
await page.waitForTimeout(800);
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
await shot("01-title");
await page.click("#go");
await page.waitForTimeout(300);
await shot("02-checkin");
await page.click("#go");
await page.waitForTimeout(1500);
await shot("03-eve");

// step the simulation directly (fast-forward), outside requestAnimationFrame
const step = (sec, extra = "") => page.evaluate(async ({ sec, extra }) => {
  const g = window.__AT;
  const n = Math.round(sec / 0.05);
  for (let i = 0; i < n; i++) { if (extra) (new Function("g", extra))(g); if (!g.ui.modalOpen && ["eve", "quake", "day", "night"].includes(g.phase)) g.update(0.05); }
  return { phase: g.phase, day: g.day, clock: g.clock, bugs: g.swarm.count(), hp: g.player.hp, base: g.base?.def.name ?? null, stash: g.stash, people: g.npcs.filter((n) => n.state === "base").length };
}, { sec, extra });

// walk to the yard and open crates, then haul to the range
const walk = (x, z) => page.evaluate(({ x, z }) => { const g = window.__AT; g.player.x = x; g.player.z = z; }, { x, z });
await walk(-30, 0);
for (let i = 0; i < 3; i++) await page.evaluate(() => { const g = window.__AT; g.input["interactQueued"] = true; g.update(0.05); });
await walk(-48, -18);
let s = await step(1);
console.log("after haul", JSON.stringify(s));
// try the ability before the quake
await page.evaluate(() => { window.__AT.input["abilityQueued"] = true; });
s = await step(200);
console.log("after eve", JSON.stringify(s));
await page.waitForTimeout(400);
await shot("04-quake");
s = await step(8);
console.log("day1", JSON.stringify(s));
// press ability a few times next to bugs
await walk(-10, -20);
for (let i = 0; i < 6; i++) { await page.evaluate(() => { window.__AT.input["abilityQueued"] = true; }); await step(0.6); }
await page.waitForTimeout(300);
await shot("05-day1");
// rescue anyone waiting: teleport player to them and interact, then bring to base
await page.evaluate(() => {
  const g = window.__AT;
  for (const n of g.npcs) if (n.state === "waiting") { g.player.x = n.x + 1; g.player.z = n.z; g.input["interactQueued"] = true; g.update(0.05); }
  if (g.base) { g.player.x = g.base.core.x + 2; g.player.z = g.base.core.z; }
});
s = await step(6);
console.log("rescued", JSON.stringify(s));
// fast forward to night 1
await page.evaluate(() => window.__AT.debugSkipTo("night"));
s = await step(2);
console.log("night1 start", JSON.stringify(s));
s = await step(30, "g.player.hp = Math.max(g.player.hp, 60)");
await page.waitForTimeout(300);
await shot("06-night1");
s = await step(200, "g.player.hp = Math.max(g.player.hp, 60)");
console.log("night1 end", JSON.stringify(s));
await page.waitForTimeout(300);
await shot("07-morning");
// pick a card and leave
if (await page.$(".card")) { await page.click(".card"); await page.click("#go"); }
s = await step(2);
console.log("day2", JSON.stringify(s));
// reload and continue from the morning save
await page.reload();
await page.waitForTimeout(800);
const cont = await page.$("#cont");
console.log("continue button:", !!cont);
if (cont) { await cont.click(); await page.waitForTimeout(500); }
s = await step(1);
console.log("restored", JSON.stringify(s));
// jump to the boss night
await page.evaluate(() => window.__AT.debugSkipTo("boss"));
s = await step(12, "g.player.hp = Math.max(g.player.hp, 60)");
console.log("boss night", JSON.stringify(s));
await page.waitForTimeout(300);
await shot("08-boss");
// finish the boss quickly
await page.evaluate(() => { const g = window.__AT; if (g.boss) g.boss.hp = 5; });
s = await step(12, "g.player.hp = Math.max(g.player.hp, 60); if (g.boss && g.boss.alive) { g.boss.hp -= 2; if (g.boss.hp<=0) g['damageBoss'](10,'melee'); }");
console.log("after boss", JSON.stringify(s));
await page.waitForTimeout(800);
await shot("09-report");
const hasReport = await page.$("text=重生");
console.log("report shown:", !!hasReport);
if (hasReport) { await page.click("#go"); await page.waitForTimeout(400); await shot("10-title2"); }
console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
await browser.close();
process.exit(errors.length ? 1 : 0);
