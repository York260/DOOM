// Balance probe: a simple bot plays the nights of a 3-night run several times.
// It guards the busiest door, presses the ability often and repairs doors.
// Usage: NODE_PATH=$(npm root -g) node tests/balance.mjs [runs] [rescued] [nights 3|7]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
import { resolve } from "node:path";

const runs = Number(process.argv[2] ?? 4);
const rescued = Number(process.argv[3] ?? 3);
const nights = Number(process.argv[4] ?? 3);
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const results = [];
for (let run = 0; run < runs; run++) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  await page.goto("file://" + resolve("dist/index.html"));
  await page.waitForTimeout(500);
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload(); await page.waitForTimeout(500);
  if (nights === 7) await page.click('#mode button[data-n="7"]');
  await page.click("#go"); await page.waitForTimeout(150); await page.click("#go"); await page.waitForTimeout(200);
  const res = await page.evaluate(async ({ rescued, run }) => {
    const g = window.__AT;
    const me = g.me;
    // eve: walk into the base with some supplies
    const bases = [[-48, -18], [46, -22], [50, 34]];
    const [bx, bz] = bases[run % 3];
    me.pack = { food: 4, power: 1, mat: 4 };
    me.x = bx; me.z = bz;
    g.update(0.05);
    g.debugSkipTo("quake");
    for (let i = 0; i < 200; i++) g.update(0.05);
    // rescue a few people straight into the base
    let k = 0;
    for (const n of g.npcs) if (k < rescued && (n.state === "waiting" || n.state === "following")) { n.state = "base"; n.x = g.base.core.x; n.z = g.base.core.z; k++; }
    const log = [];
    const bot = (dt) => {
      const b = g.base;
      // find the door with most bugs around it
      let best = null, bestN = -1;
      for (const d of b.doors) { let c = 0; g.swarm.query(d.x, d.z, 8, () => c++); if (d.hp <= 0) c += 3; if (c > bestN) { bestN = c; best = d; } }
      let inCore = 0; g.swarm.query(b.core.x, b.core.z, 6, () => inCore++);
      if (inCore * 1.5 > bestN) best = null;
      let tx = best ? best.x - best.nx * 1.6 : b.core.x + 1, tz = best ? best.z - best.nz * 1.6 : b.core.z;
      // fight the boss when it is at the base
      if (g.boss && g.boss.alive && Math.hypot(g.boss.x - b.core.x, g.boss.z - b.core.z) < 24) {
        const ax = b.core.x - g.boss.x, az = b.core.z - g.boss.z, al = Math.hypot(ax, az) || 1;
        tx = g.boss.x + (ax / al) * (g.boss.r + 1); tz = g.boss.z + (az / al) * (g.boss.r + 1);
      }
      const dx = tx - me.x, dz = tz - me.z, l = Math.hypot(dx, dz);
      me.inp.mx = l > 0.8 ? dx / l : 0; me.inp.mz = l > 0.8 ? dz / l : 0;
      bot.t = (bot.t ?? 0) - dt;
      let near = 0; g.swarm.query(me.x, me.z, 6, () => near++);
      if (bot.t <= 0 && (near > 2 || me.lastGlow > 0.6)) { me.inp.ab = true; bot.t = 1.4; }
      if (best && best.hp < best.max * 0.5 && Math.hypot(best.x - me.x, best.z - me.z) < 2.5) me.inp.it = true;
    };
    for (let night = 1; night <= g.nightsTotal; night++) {
      // a modest daytime haul, like a player who scavenges a little
      g.stash.mat += 6; g.stash.food += 2; g.stash.power += 1;
      g.debugSkipTo("night");
      for (let i = 0; i < 40 && g.phase === "day"; i++) g.update(0.05);
      me.x = g.base.core.x + 1; me.z = g.base.core.z;
      let minCore = 1e9, downs = 0, wasDown = false, steps = 0, broken = 0, minDoor = 1;
      const was = g.base.doors.map((d) => d.hp > 0);
      const startKills = Object.values(g.swarm.kills).reduce((a, b) => a + b, 0);
      while (g.phase === "night" && steps < 20 * 260) {
        bot(0.05); g.update(0.05); steps++;
        if (g.base) minCore = Math.min(minCore, g.base.core.hp / g.base.core.max);
        if (me.downed && !wasDown) downs++;
        g.base.doors.forEach((d, i) => { if (was[i] && d.hp <= 0) broken++; was[i] = d.hp > 0; minDoor = Math.min(minDoor, d.hp / d.max); });
        wasDown = me.downed;
      }
      // let the end-of-run timer play out
      for (let i = 0; i < 120 && (g.phase === "night" || g.phase === "day"); i++) g.update(0.05);
      const kills = Object.values(g.swarm.kills).reduce((a, b) => a + b, 0) - startKills;
      log.push({ night, phase: g.phase, sec: Math.round(steps * 0.05), base: g.base.def.name, minCore: +minCore.toFixed(2), broken, minDoor: +minDoor.toFixed(2), downs, kills, boss: g.boss ? Math.round(g.boss.hp) : null, stash: { ...g.stash }, people: g.npcs.filter((n) => n.state === "base").length, found: g.me.ab.foundCount, ab: g.me.ab.def.name });
      if (g.phase === "report") break;
      // morning: take the first card if affordable
      await new Promise((r) => setTimeout(r, 50));
      const card = document.querySelector(".card:not([disabled])"); if (card) card.click();
      document.querySelector("#go")?.click();
      for (let i = 0; i < 4; i++) g.update(0.05);
    }
    return { log, bossKilled: g.stats.bossKilled, phase: g.phase };
  }, { rescued, run });
  results.push(res);
  for (const l of res.log) console.log(`run ${run + 1} n${l.night} ${l.base} ${l.ab}(${l.found}) ${l.phase} ${l.sec}s core>=${l.minCore} doorsBroken=${l.broken} minDoor=${l.minDoor} downs=${l.downs} kills=${l.kills} boss=${l.boss} food=${l.stash.food} mat=${l.stash.mat} people=${l.people}`);
  await page.close();
}
const wins = results.filter((r) => r.bossKilled).length;
console.log(`boss killed in ${wins}/${runs} runs (rescued ${rescued})`);
await browser.close();
