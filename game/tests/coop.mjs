// Co-op test: two browser contexts, one hosts and one joins over WebRTC.
// Needs a PeerJS signaling server; pass it as PEER=host:port (default 127.0.0.1:9000).
// Usage: PEER=127.0.0.1:9000 node tests/coop.mjs [outDir]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright"); // global install: run with NODE_PATH=$(npm root -g)
import { mkdirSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const out = process.argv[2] ?? "/tmp/at-coop";
mkdirSync(out, { recursive: true });
const LOG = process.env.LOG;
const log = (...a) => { const t = a.join(" "); console.log(t); if (LOG) appendFileSync(LOG, t + "\n"); };
const peer = process.env.PEER ?? "127.0.0.1:9000";
const url = "file://" + resolve("dist/index.html") + "?peer=" + peer;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const open = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|stun|ICE|WebSocket/i.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
  await page.goto(url);
  await page.waitForTimeout(800);
  return page;
};
const fail = async (why) => { log("FAIL:", why); log("ERRORS:", errors.join("\n") || "none"); await browser.close(); process.exit(1); };

const A = await open("host");
const B = await open("guest");

// host opens a room
await A.click("#coop");
await A.fill("#nm", "阿凌");
await A.click("#host");
await A.waitForSelector("#list", { timeout: 15000 }).catch(() => fail("host room never opened"));
const code = (await A.textContent(".panel h2")).trim();
log("room code", code);

// guest joins
await B.click("#coop");
await B.fill("#nm", "小周");
await B.fill("#code", code);
await B.click("#join");
await B.waitForFunction(() => window.__AT.mode === "guest", null, { timeout: 20000 }).catch(() => fail("guest never got welcome"));
await A.waitForFunction(() => window.__AT.players.length === 2, null, { timeout: 10000 }).catch(() => fail("host never saw the guest"));
log("host list:", (await A.textContent("#list")).replace(/\s+/g, " "));
await A.screenshot({ path: `${out}/01-host-room.png` });

// host starts: check-in, pick major
await A.click("#go");
await A.waitForTimeout(300);
await A.click("#go");
// guest gets its own check-in
await B.waitForSelector("#go", { timeout: 10000 }).catch(() => fail("guest check-in never showed"));
await B.waitForTimeout(300);
await B.click("#go");
await A.waitForFunction(() => window.__AT.players[1].ready, null, { timeout: 10000 }).catch(() => fail("host never got guest major"));
await B.waitForTimeout(800);
await B.screenshot({ path: `${out}/02-guest-eve.png` });

const state = (p) => p.evaluate(() => {
  const g = window.__AT;
  return { mode: g.mode, phase: g.phase, day: g.day, clock: Math.round(g.clock), bugs: g.swarm.count(), players: g.players.map((p) => `${p.name}@${p.x.toFixed(1)},${p.z.toFixed(1)} hp${Math.round(p.hp)}${p.downed ? " down" : ""}`), npcs: g.npcs.length, base: g.base?.def.name ?? null };
});
log("host", JSON.stringify(await state(A)));
log("guest", JSON.stringify(await state(B)));

// guest walks right: hold D for a second, host should see the guest move
const before = await A.evaluate(() => window.__AT.players[1].x);
await B.keyboard.down("KeyD");
await B.waitForTimeout(1200);
await B.keyboard.up("KeyD");
await B.waitForTimeout(400);
const after = await A.evaluate(() => window.__AT.players[1].x);
log("guest moved on host:", before.toFixed(2), "→", after.toFixed(2));
if (!(after > before + 1)) await fail("guest input did not reach the host");

// host fast-forwards the simulation in chunks so the guest keeps receiving snapshots
const step = async (sec, extra = "") => {
  for (let s = 0; s < sec; s += 2) {
    await A.evaluate(({ extra }) => {
      const g = window.__AT;
      for (let i = 0; i < 40; i++) { if (extra) (new Function("g", extra))(g); if (["eve", "quake", "day", "night"].includes(g.phase)) g.update(0.05); }
    }, { extra });
    await A.waitForTimeout(30);
  }
  return state(A);
};
await A.evaluate(() => window.__AT.debugSkipTo("quake"));
let s = await step(10);
log("after quake", JSON.stringify(s));
await B.waitForTimeout(600);
log("guest", JSON.stringify(await state(B)));
await B.screenshot({ path: `${out}/03-guest-day.png` });

// guest presses the ability next to bugs (teleport guest player on host next to a bug)
await A.evaluate(() => { const g = window.__AT; const i = g.swarm.nearest(g.players[0].x, g.players[0].z, 200); if (i >= 0) { g.players[1].x = g.swarm.x[i] + 1; g.players[1].z = g.swarm.z[i]; } });
for (let i = 0; i < 4; i++) { await B.keyboard.press("Space"); await B.waitForTimeout(250); await step(1); }
const abHost = await A.evaluate(() => ({ pressed: window.__AT.players[1].ab.pressed, uses: window.__AT.players[1].ab.uses }));
log("guest ability on host:", JSON.stringify(abHost));
if (!abHost.pressed) await fail("guest ability press did not reach the host");

// night 1 with both players alive
await A.evaluate(() => window.__AT.debugSkipTo("night"));
await step(1);
await A.evaluate(() => { const g = window.__AT; g.players.forEach((p, i) => { p.x = g.base.core.x + 1 + i; p.z = g.base.core.z; }); });
s = await step(4);
log("night start", JSON.stringify(s));
s = await step(40, "for (const p of g.players) p.hp = Math.max(p.hp, 60); if (g.base) g.base.core.hp = Math.max(g.base.core.hp, 200)");
await B.waitForTimeout(500);
const gs = await state(B);
log("guest at night", JSON.stringify(gs));
await B.screenshot({ path: `${out}/04-guest-night.png` });
await A.screenshot({ path: `${out}/05-host-night.png` });
if (gs.phase !== "night") await fail("guest is not in the night phase");

// downed guest gets revived by the host
await A.evaluate(() => { const g = window.__AT; const p = g.players[1]; p.downed = true; p.hp = 0; g.players[0].x = p.x + 0.8; g.players[0].z = p.z; });
await step(1);
const label = await A.evaluate(() => window.__AT.players[0].interactLabel);
log("host interact label near downed guest:", label);
await A.evaluate(() => { window.__AT.input["interactQueued"] = true; });
await A.waitForTimeout(200);
await step(1);
const down = await A.evaluate(() => window.__AT.players[1].downed);
log("guest still downed:", down);
if (down) await fail("revive did not work");

s = await step(200, "for (const p of g.players) p.hp = Math.max(p.hp, 60); if (g.base) g.base.core.hp = Math.max(g.base.core.hp, 200)");
log("night end", JSON.stringify(s));
await B.waitForTimeout(800);
const morningGuest = await B.evaluate(() => document.querySelector(".panel h2")?.textContent ?? null);
log("guest morning screen:", morningGuest);
await B.screenshot({ path: `${out}/06-guest-morning.png` });
// host leaves the morning
if (await A.$(".card")) await A.click(".card");
await A.click("#go");
s = await step(2);
log("day2", JSON.stringify(s));
await B.waitForTimeout(600);
const g2 = await state(B);
log("guest day2", JSON.stringify(g2), "modal", await B.evaluate(() => window.__AT.ui.modalOpen));

// a third friend joins mid-run, then drops out
const C = await open("late");
await C.click("#coop");
await C.fill("#nm", "阿哲");
await C.fill("#code", code);
await C.click("#join");
await C.waitForSelector("#go", { timeout: 20000 }).catch(() => fail("late joiner never got a check-in"));
await C.click("#go");
await step(2);
const three = await A.evaluate(() => window.__AT.players.map((p) => p.name));
log("players after late join:", three.join(","));
if (three.length !== 3) await fail("late joiner not added");
await C.waitForTimeout(500);
await C.screenshot({ path: `${out}/07a-late-joiner.png` });
await C.context().close();
await A.waitForFunction(() => window.__AT.players.length === 2, null, { timeout: 25000 }).catch(() => fail("host never noticed the late joiner leaving"));
await step(2);
log("players after drop:", (await A.evaluate(() => window.__AT.players.map((p) => p.name))).join(","));

// boss night: kill the boss directly
await A.evaluate(() => window.__AT.debugSkipTo("boss"));
s = await step(12, "for (const p of g.players) p.hp = Math.max(p.hp, 60); if (g.base) g.base.core.hp = Math.max(g.base.core.hp, 200)");
log("boss night", JSON.stringify(s));
await B.waitForTimeout(600);
await B.screenshot({ path: `${out}/07-guest-boss.png` });
const guestBoss = await B.evaluate(() => !!window.__AT.boss);
log("guest sees boss:", guestBoss);
await A.evaluate(() => { const g = window.__AT; if (g.boss) g.damageBoss(1e9, "melee"); });
s = await step(8);
log("after boss", JSON.stringify(s));
await B.waitForTimeout(1000);
const guestReport = await B.evaluate(() => ({ phase: window.__AT.phase, title: document.querySelector(".report h1, .report h2, .panel h1")?.textContent ?? null, modal: window.__AT.ui.modalOpen }));
log("guest report:", JSON.stringify(guestReport));
await B.screenshot({ path: `${out}/08-guest-report.png` });
await A.screenshot({ path: `${out}/09-host-report.png` });
if (guestReport.phase !== "report") await fail("guest never got the report");

// host leaves: guest should get kicked back to the title
await A.evaluate(() => { const g = window.__AT; g.host.close(); });
await B.waitForFunction(() => window.__AT.mode === "solo", null, { timeout: 10000 }).catch(() => fail("guest did not notice host leaving"));
log("guest back to solo after host closed");

log("ERRORS:", errors.join("\n") || "none");
await browser.close();
process.exit(errors.length ? 1 : 0);
