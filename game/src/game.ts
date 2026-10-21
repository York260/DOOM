// The game: phases (eve → quake → days and nights → boss → report → rebirth),
// combat, the swarm, the base and the one-button ability.
import * as THREE from "three";
import { World, BASES, BaseDef, RIFT, FIELD, LAKE, resolveCircleBox, MAP, rectBox, boxDist } from "./world";
import { Swarm, BUG, MITE, WING, CARRIER, LEAPER, TANK, type BugType, type Target, type DmgSource } from "./swarm";
import { Effects } from "./effects";
import { Player, Npc } from "./actors";
import { AbilityRuntime, condTrue, type CondState } from "./ability";
import { Input } from "./input";
import { UI, type ArrowMark } from "./ui";
import { Audio } from "./audio";
import { Base } from "./base";
import { loadMeta, saveMeta, resetMeta, saveRun, loadRun, clearRun, type Meta } from "./meta";
import { buildReport, type RunStats } from "./report";
import {
  ABILITIES, ROLES, MAJORS, BUILD_CARDS, NIGHT_POOL, NIGHT_FIRST, NIGHT_LAST, NAMED_NPCS, GENERIC_NAMES,
  OMENS, FACTS, WEAPONS, CHARMS, type Effect, type RoleDef, type MajorDef, type NightDef, type BuildCard,
} from "./data";
import { mulberry32, stream, pick, shuffle, irange, type Rng } from "./rng";
import { clamp, dist, fmtClock, fmtDur, cn, textSprite } from "./util";

type Phase = "title" | "checkin" | "eve" | "quake" | "day" | "night" | "morning" | "report";
type Weather = "clear" | "rain" | "blackout" | "spore";
const WEATHER_NAME: Record<Weather, string> = { clear: "晴", rain: "暴雨", blackout: "停電", spore: "孢子霧" };

interface Crate { x: number; z: number; kind: "food" | "mat" | "power" | "med" | "mix" | "safe" | "note" | "armory"; opened: boolean; mesh: THREE.Group; drill?: boolean }
interface Zone { x: number; z: number; r: number; dps: number; slow: number; heal: number; t: number; follow: boolean; color: number }
interface Thorn { ax: number; az: number; bx: number; bz: number; dps: number; t: number }
interface Boss { x: number; z: number; hp: number; max: number; r: number; mesh: THREE.Group; spawnCd: number; slamCd: number; windup: number; alive: boolean; eyes: THREE.Mesh[] }

interface RunSave {
  v: 1; loop: number; seed: number; nightsTotal: 3 | 7; day: number; roleId: string; majorId: string; abilityId: string;
  ab: { found: boolean[]; foundAt: (string | null)[]; awake: boolean; awakeAt: string | null; starDay: number[]; uses: number; nearMiss: (string | null)[]; secretMiss: string | null; pressed: boolean; lastForm: number };
  stash: { food: number; power: number; mat: number };
  base: { id: string; doors: { hp: number; max: number }[]; core: { x: number; z: number; hp: number; max: number }; cards: string[] };
  player: { x: number; z: number; hp: number; pack: { food: number; power: number; mat: number }; medkits: number; tourniquet: boolean; melee: string; ranged: string | null; ammo: number; charm: { id: string; known: boolean } | null; carryCap: number; speed: number; meleeBonus: number };
  npcs: { name: string; who: string; defId: string | null; color: number; state: string; hp: number; x: number; z: number; rescueT: number }[];
  crates: { x: number; z: number; kind: string; opened: boolean }[];
  nightPlan: string[];
  stats: { events: { t: string; text: string; w: number }[]; rescued: number; lost: number; seen: number; nightsSurvived: number; takenVoices: string[]; stillKills: number; returned: number };
  kills: Record<DmgSource, number>; runFacts: string[];
  flags: { codeKnown: boolean; hasKey: boolean; tapsOn: boolean; prophecy: boolean; carrierDone: boolean };
}

const EVE_START = 450, QUAKE = 720, DUSK = 1050, NIGHT = 1080;

const CRATE_SPOTS: { x: number; z: number; kind: Crate["kind"] }[] = [
  { x: -14, z: 25.5, kind: "food" }, { x: -18, z: 25.5, kind: "food" }, { x: 16, z: 25.5, kind: "med" }, { x: 12, z: 25.5, kind: "food" },
  { x: -34, z: -2, kind: "mat" }, { x: -30, z: 2, kind: "mat" }, { x: -26, z: -2, kind: "mat" }, { x: -33, z: 3, kind: "mat" },
  { x: 60, z: -60, kind: "power" }, { x: 70, z: -56, kind: "power" }, { x: 62, z: -51, kind: "power" },
  { x: -54, z: 45, kind: "mix" }, { x: -16, z: -47.5, kind: "mix" }, { x: 18, z: -49, kind: "mix" }, { x: 52, z: 55, kind: "mix" },
  { x: -46, z: 58, kind: "mix" }, { x: 24, z: 54, kind: "food" }, { x: -20, z: 54, kind: "mat" }, { x: -8, z: -30, kind: "mix" }, { x: 30, z: 4, kind: "mat" },
];

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: World;
  swarm: Swarm;
  fx: Effects;
  player: Player;
  input: Input;
  ui: UI;
  audio = new Audio();
  meta: Meta;

  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private pLight: THREE.PointLight;
  private riftLight: THREE.PointLight;
  private rift: THREE.Sprite;
  private riftGlow: THREE.Mesh;
  private camTarget = new THREE.Vector3();

  phase: Phase = "title";
  paused = false;
  seed = 1;
  rng: Rng = Math.random;
  nightsTotal: 3 | 7 = 3;
  day = 1;
  clock = EVE_START;
  dayT = 0;
  weather: Weather = "clear";
  role: RoleDef = ROLES[0];
  major: MajorDef = MAJORS[0];
  ability!: AbilityRuntime;
  npcs: Npc[] = [];
  crates: Crate[] = [];
  zones: Zone[] = [];
  thorns: Thorn[] = [];
  base: Base | null = null;
  eveBase: BaseDef | null = null;
  stash = { food: 4, power: 1, mat: 4 };
  boss: Boss | null = null;
  huntField: Uint16Array | null = null;
  baseField: Uint16Array | null = null;
  private huntT = 0;
  private spawnT = 0;
  private spawnQueue: { type: BugType; x: number; z: number; emerge?: number; t: number }[] = [];
  private timeScale = 1;
  private slowT = 0;
  private quakeT = 0;
  private nightT = 0;
  private nightDef: NightDef = NIGHT_FIRST;
  private nightPlan: NightDef[] = [];
  private waves: { at: number; done: boolean; spawn: () => void }[] = [];
  private adapt: DmgSource | null = null;
  private lure: { x: number; z: number; t: number } | null = null;
  private omenIdx = 0;
  private drillStep = 0;
  private drillCrates = 0;
  suspicion = 0;
  private prophecy = false;
  private hasKey = false;
  private codeKnown = false;
  private blackoutT = 0;
  private carrierDone = false;
  private reviveT = 0;
  private reviveCd = 0;
  private hurtFlashT = 0;
  private fedT = 0;
  private lastTime = 0;
  private interactTarget: (() => void) | null = null;
  private runFacts = new Set<string>();
  private stats = this.freshStats();
  private endT = -1;
  private warnedFull = false;
  private stealthStill = 0;
  private timers: { t: number; fn: () => void }[] = [];
  private later(t: number, fn: () => void) { this.timers.push({ t, fn }); }

  constructor(private root: HTMLElement) {
    this.meta = loadMeta();
    this.audio.setMuted(this.meta.muted);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.renderer = new THREE.WebGLRenderer({ antialias: dpr < 2, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(root.clientWidth, root.clientHeight);
    root.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x0a0f17);
    this.scene.fog = new THREE.Fog(0x0a0f17, 60, 150);
    this.camera = new THREE.PerspectiveCamera(50, root.clientWidth / root.clientHeight, 0.5, 400);
    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x3a3326, 1.0);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 1.4);
    this.sun.position.set(-30, 60, 20);
    this.scene.add(this.hemi, this.sun);
    this.pLight = new THREE.PointLight(0xffe2b0, 0, 24, 1.2);
    this.scene.add(this.pLight);
    this.riftLight = new THREE.PointLight(0xffb060, 0, 60, 1.2);
    this.riftLight.position.set(RIFT.x, 10, RIFT.z);
    this.scene.add(this.riftLight);

    this.world = new World(20261021);
    this.world.build(this.scene);
    this.swarm = new Swarm(this.scene);
    this.swarm.onDeath = (_i, t, x, z) => { this.fx.burst(x, z, BUG[t].color, t === TANK ? 26 : 9, 5); this.audio.kill(); };
    this.fx = new Effects(this.scene);
    this.player = new Player(this.scene);
    this.rift = this.makeRift();
    this.riftGlow = new THREE.Mesh(new THREE.CircleGeometry(7, 40), new THREE.MeshBasicMaterial({ color: 0xffa64a, transparent: true, opacity: 0.25, depthWrite: false }));
    this.riftGlow.rotation.x = -Math.PI / 2; this.riftGlow.position.set(RIFT.x, 0.08, RIFT.z); this.riftGlow.visible = false;
    this.scene.add(this.riftGlow);

    this.input = new Input(root);
    this.ui = new UI(root, this.input);
    this.ui.onPause = () => this.pause();
    window.addEventListener("keydown", (e) => { if (e.code === "Escape" || e.code === "KeyP") this.pause(); });
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("pointerdown", () => this.audio.unlock(), { once: false });
    window.addEventListener("keydown", () => this.audio.unlock());
    (window as unknown as { __AT: Game }).__AT = this;

    this.player.x = 0; this.player.z = 30;
    this.showTitle();
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  private freshStats() {
    return {
      events: [] as { t: string; text: string; w: number }[], rescued: 0, lost: 0, seen: 0, nightsSurvived: 0,
      takenVoices: [] as string[], stillKills: 0, returned: 0, bossKilled: false, rescuedIds: new Set<number>(),
    };
  }

  // ------------------------------------------------------------ setup
  private makeRift() {
    const c = document.createElement("canvas"); c.width = 512; c.height = 512;
    const ctx = c.getContext("2d")!;
    const R = mulberry32(742);
    const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    grad.addColorStop(0, "rgba(255,220,160,.55)"); grad.addColorStop(0.3, "rgba(107,174,159,.18)"); grad.addColorStop(1, "rgba(107,174,159,0)");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 512);
    const br = (x: number, y: number, a: number, len: number, dep: number) => {
      ctx.beginPath(); ctx.moveTo(x, y);
      let px = x, py = y, ang = a;
      for (let i = 0; i < 9; i++) { ang += (R() - 0.5) * 0.8; px += Math.cos(ang) * len / 9; py += Math.sin(ang) * len / 9; ctx.lineTo(px, py); }
      ctx.strokeStyle = `rgba(255,214,150,${0.9 - dep * 0.2})`; ctx.lineWidth = 6 - dep * 1.6; ctx.stroke();
      if (dep < 3) for (let k = 0; k < 2; k++) br(x + (px - x) * R(), y + (py - y) * R(), ang + (R() - 0.5) * 2, len * 0.45, dep + 1);
    };
    for (let i = 0; i < 9; i++) br(256, 256, (i / 9) * Math.PI * 2 + R() * 0.5, 210, 0);
    ctx.fillStyle = "rgba(255,240,210,.95)"; ctx.beginPath(); ctx.ellipse(256, 256, 10, 70, 0, 0, Math.PI * 2); ctx.fill();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.set(42, 42, 1); s.position.set(RIFT.x, 18, RIFT.z - 6); s.visible = false;
    this.scene.add(s);
    return s;
  }

  private resize() {
    const w = this.root.clientWidth, h = this.root.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  private showTitle() {
    this.phase = "title";
    this.ui.showHud(false);
    this.input.enabled = false;
    const save = loadRun<RunSave>();
    const cont = save && save.v === 1 && save.loop === this.meta.loop ? save : null;
    this.ui.showTitle(this.meta, (n) => { this.audio.unlock(); this.meta.nights = n; saveMeta(this.meta); clearRun(); this.beginCheckin(n); },
      (m) => { this.audio.setMuted(m); saveMeta(this.meta); },
      () => { resetMeta(); clearRun(); this.meta = loadMeta(); this.showTitle(); },
      cont ? { label: `繼續：第${cn(cont.day)}天早上（${cont.nightsTotal}夜模式）`, go: () => { this.audio.unlock(); this.restore(cont); } } : null);
  }

  private beginCheckin(n: 3 | 7) {
    this.nightsTotal = n;
    this.resetRun();
    this.phase = "checkin";
    const facts = Object.keys(this.meta.facts).filter((k) => this.meta.facts[k]).map((k) => FACTS[k]).filter(Boolean);
    this.ui.showCheckin(this.role, this.meta.loop > 1 ? facts : [], this.meta.note, (m) => { this.major = m; this.startEve(); });
  }

  private resetRun() {
    for (const n of this.npcs) this.scene.remove(n.mesh);
    for (const c of this.crates) this.scene.remove(c.mesh);
    if (this.base) this.scene.remove(this.base.group);
    if (this.boss) this.scene.remove(this.boss.mesh);
    this.npcs = []; this.crates = []; this.zones = []; this.thorns = []; this.base = null; this.eveBase = null; this.boss = null;
    this.swarm.clear(); this.swarm.hpScale = 1; this.swarm.kills = { melee: 0, ability: 0, ranged: 0, trap: 0, turret: 0 };
    this.seed = (Date.now() ^ (this.meta.loop * 7919)) >>> 0;
    this.rng = stream(this.seed, "run");
    const ar = stream(this.seed, "ability");
    let def = pick(ar, ABILITIES);
    if (this.meta.seenAbilities.length && def.id === this.meta.seenAbilities[this.meta.seenAbilities.length - 1]) def = pick(ar, ABILITIES);
    this.ability = new AbilityRuntime(def);
    this.role = pick(stream(this.seed, "role"), ROLES);
    this.day = 1; this.clock = EVE_START; this.dayT = 0; this.weather = "clear";
    this.stash = { food: 6, power: 1, mat: 4 };
    this.stats = this.freshStats();
    this.runFacts = new Set();
    this.suspicion = 0; this.prophecy = false; this.hasKey = false; this.codeKnown = !!this.meta.facts.safe;
    this.carrierDone = false; this.blackoutT = 0; this.tapsOn = false; this.tapsPlayed = -1; this.bossStun = 0; this.omenIdx = 0; this.drillStep = 0; this.drillCrates = 0;
    this.adapt = null; this.lure = null; this.endT = -1; this.spawnQueue = []; this.waves = []; this.timers = [];
    const p = this.player;
    p.hp = p.maxHp = 100; p.downed = false; p.pack = { food: 0, power: 0, mat: 0 }; p.medkits = 0; p.melee = this.role.id === "yellow" ? "bat" : "mop"; p.ranged = null; p.ammo = 0; p.charm = null;
    p.meleeMult = 1; p.meleeBuffT = 0; p.veilT = 0; p.stealthT = 0; p.moveT = 0; p.stillT = 0;
    this.rift.visible = false; this.riftGlow.visible = false; this.riftLight.intensity = 0;
    this.world.lightFires(false); this.world.setRain(false); this.fx.rainOn = false;
    if (this.world.adminWindows) this.world.adminWindows.visible = true;
    // night plan: first fixed, last boss, middle from the pool
    const pool = shuffle(stream(this.seed, "nights"), NIGHT_POOL);
    this.nightPlan = [NIGHT_FIRST];
    for (let i = 1; i < this.nightsTotal - 1; i++) this.nightPlan.push(pool[(i - 1) % pool.length]);
    this.nightPlan.push(NIGHT_LAST);
  }

  private startEve() {
    const p = this.player, r = this.role;
    p.x = r.start.x; p.z = r.start.z; p.facing = Math.PI;
    p.carryCap = 12 + (r.id === "green" ? 4 : 0) + (this.major.id === "pe" ? 2 : 0);
    p.speed = 6.2 * (this.major.id === "pe" ? 1.12 : 1);
    p.meleeBonus = r.id === "yellow" ? 1.4 : 1;
    p.melee = r.id === "yellow" ? "bat" : "mop";
    if (this.meta.relic === "badge") { p.charm = { id: "badge", known: true }; this.later(4, () => this.ui.toast("你的口袋裡，有一枚別人的校徽。上一輪的。", "jade", 4500)); }
    p.tourniquet = r.id === "red";
    p.medkits = this.major.id === "nurse" ? 1 : 0;
    // NPCs at their drill posts
    const add = (defId: string, x: number, z: number, state: Npc["state"]) => {
      const d = NAMED_NPCS.find((n) => n.id === defId)!;
      const n = new Npc(this.scene, x, z, d.name, d.who, d.color, d);
      n.state = state; this.npcs.push(n); return n;
    };
    add("doujiang", p.x + 1.5, p.z + 1.5, "following");
    add("yan", 0, 35, "drill");
    add("chenyan", -34, -14, "drill");
    add("linzhixia", 18, -49.5, "drill");
    add("xuan", 63, 46, "drill");
    add("fangqing", 16, 25, "drill");
    const gr = stream(this.seed, "npcs");
    const spots = shuffle(gr, [[-8, 14], [10, 30], [-40, 10], [40, 0], [-20, -40], [30, -40], [60, 20], [-50, 50], [0, 60], [-60, 0]]);
    shuffle(gr, GENERIC_NAMES).slice(0, 6).forEach((name, i) => {
      const [x, z] = spots[i];
      const cadet = gr() < 0.5;
      const n = new Npc(this.scene, x, z, name, cadet ? "警校生" : "演習志工", cadet ? 0x2f4a75 : 0xe8762e, null);
      n.state = "drill"; this.npcs.push(n);
    });
    for (const s of CRATE_SPOTS) this.addCrate(s.x, s.z, s.kind);
    this.addCrate(-9.5, 25.5, "safe");
    this.addCrate(-52.6, 22, "note");
    this.addCrate(-55, -22, "armory");
    this.phase = "eve";
    this.fedT = 0;
    this.ui.showHud(true);
    this.input.enabled = true; this.input.clear();
    this.ui.chapter(this.meta.loop > 1 ? `第 ${this.meta.loop} 輪　07:30` : "07:30", "防災演習日");
    if (this.meta.loop === 1) this.ui.toast("你和室友豆漿一起報名了警大的防災演習志工。", "hand", 5000);
    else this.ui.toast("你在校車上醒來。你記得：中午十二點，天會裂開。", "warm", 5000);
    this.ev("報到。演習角色卡：" + this.role.tag + "。", 0);
  }

  private addCrate(x: number, z: number, kind: Crate["kind"]) {
    const g = new THREE.Group();
    const locked = kind === "safe" || kind === "armory";
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, 0.8), new THREE.MeshLambertMaterial({ color: kind === "armory" ? 0x3d4a3a : 0xa07a4c }));
    body.position.y = 0.38; g.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.12, 0.86), new THREE.MeshLambertMaterial({ color: locked ? 0xc9503a : kind === "note" ? 0xe8e2cc : 0xe9a640, emissive: 0x2a1a05 }));
    lid.position.y = 0.8; lid.name = "lid"; g.add(lid);
    g.position.set(x, 0, z);
    g.rotation.y = (x * 13 + z * 7) % 1.2;
    this.scene.add(g);
    this.crates.push({ x, z, kind, opened: false, mesh: g });
  }

  // ------------------------------------------------------------ helpers
  private stamp() { return `第${cn(this.day)}天 ${fmtClock(this.clock)}`; }
  private ev(text: string, w: number) { this.stats.events.push({ t: this.stamp(), text, w }); }
  private learn(id: string) {
    if (!this.runFacts.has(id)) { this.runFacts.add(id); if (!this.meta.facts[id]) this.ui.toast("記憶頁多了一條：" + FACTS[id], "jade", 4200); }
  }
  private get night() { return this.phase === "night"; }
  private chosenBaseDef(): BaseDef | null { return this.base?.def ?? this.eveBase; }
  private people() { return this.npcs.filter((n) => n.state === "base").length; }
  private followers() { return this.npcs.filter((n) => n.state === "following"); }

  private condState(): CondState {
    const p = this.player, w = this.world;
    const b = this.base;
    const inBase = b ? b.inside(p.x, p.z) : !!w.baseAt(p.x, p.z);
    let dGen = 1e9;
    for (const bd of BASES) dGen = Math.min(dGen, dist(p.x, p.z, bd.rect.x - bd.rect.w / 2 + 2, bd.rect.z - bd.rect.d / 2 + 2));
    let dDoor = 1e9;
    if (b) for (const d of b.doors) dDoor = Math.min(dDoor, dist(p.x, p.z, d.x, d.z));
    const bdef = this.chosenBaseDef();
    let dBase = 1e9;
    if (bdef) dBase = boxDist(rectBox(bdef.rect), p.x, p.z); else for (const bd of BASES) dBase = Math.min(dBase, boxDist(rectBox(bd.rect), p.x, p.z));
    let allyDist = 1e9;
    for (const n of this.npcs) if (n.state === "following" || n.state === "base") allyDist = Math.min(allyDist, dist(p.x, p.z, n.x, n.z));
    let crowd = 0;
    this.swarm.query(p.x, p.z, 6, () => crowd++);
    const raining = this.weather === "rain" && this.phase !== "eve";
    const lit = !!(b && b.lit && inBase);
    const dark = (this.night && !lit) || (this.weather === "blackout" && inBase);
    return {
      dWater: w.distWater(p.x, p.z, raining), dRail: w.distRail(p.x, p.z), dShade: w.distShade(p.x, p.z), dDirt: w.distDirt(p.x, p.z),
      dFire: w.distFire(p.x, p.z), dField: w.distField(p.x, p.z), dBroadcast: w.distBroadcast(p.x, p.z), dGen, dDoor, dBase,
      raining, outdoors: !inBase, dark, night: this.night, hpFrac: p.hp / p.maxHp, stillT: p.stillT, moveT: p.moveT,
      allyDist, crowd, carry: p.carried(), carryCap: p.carryCap, inBase, fedT: this.fedT,
    };
  }

  // ------------------------------------------------------------ main loop
  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.slowT > 0) { this.slowT -= dt; this.timeScale = 0.12; } else this.timeScale = 1;
    const live = !this.paused && !this.ui.modalOpen && (this.phase === "eve" || this.phase === "quake" || this.phase === "day" || this.phase === "night");
    this.input.enabled = live;
    this.input.update();
    if (live) {
      dt *= this.timeScale;
      this.update(dt);
    }
    this.renderScene(now / 1000);
  }

  /** Advance the simulation (also used by tests). */
  update(dt: number) {
    for (let k = this.timers.length - 1; k >= 0; k--) { const tm = this.timers[k]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(k, 1); tm.fn(); } }
    this.updateClock(dt);
    this.updatePlayer(dt);
    this.updateNpcs(dt);
    this.updateCombat(dt);
    this.updateHunt(dt);
    this.updateSpawns(dt);
    if (this.base && this.base.cards.has("turret")) this.updateTurret(dt);
    this.swarm.update(dt, this.swarmEnv());
    if (this.boss) this.updateBoss(dt);
    this.updateZones(dt);
    this.updateAbility(dt);
    this.updateInteract();
    this.updateBell(dt);
    if (this.bellMark) { this.bellMark.t -= dt; if (this.bellMark.t <= 0) this.bellMark = null; }
    this.fx.update(dt, this.player);
    this.world.tick(performance.now() / 1000);
    this.checkEnd(dt);
  }

  private updateClock(dt: number) {
    this.dayT += dt;
    this.fedT += dt;
    if (this.phase === "eve") {
      const rate = (QUAKE - EVE_START) / (this.meta.loop > 1 ? 180 : 210);
      this.clock += dt * rate;
      this.updateEve();
      if (this.clock >= QUAKE) { this.clock = QUAKE; this.startQuake(); }
    } else if (this.phase === "quake") {
      this.quakeT += dt;
      if (this.quakeT > 5.5) this.startDay(true);
    } else if (this.phase === "day") {
      const rate = this.day === 1 ? (NIGHT - QUAKE) / 120 : (NIGHT - 360) / 200;
      const before = this.clock;
      this.clock += dt * rate;
      if (before < DUSK && this.clock >= DUSK) { this.audio.bell(); this.ui.toast("黃昏鐘響了。天黑前回到據點。", "warm", 4000); }
      if (this.day === 1 && !this.carrierDone && this.clock >= 820) this.carrierEvent();
      if (this.clock >= NIGHT) this.startNight();
    } else if (this.phase === "night") {
      this.nightT += dt;
      this.checkTaps();
      this.clock = NIGHT + clamp(this.nightT / 150, 0, 0.995) * 720;
      this.lure && (this.lure.t -= dt);
      for (const w of this.waves) if (!w.done && this.nightT >= w.at) { w.done = true; w.spawn(); }
      if (this.endT < 0) {
        const allSpawned = this.waves.every((w) => w.done) && this.spawnQueue.length === 0;
        const alive = this.swarm.count();
        const bossNight = this.nightDef.id === "boss";
        if (!bossNight && allSpawned && ((alive <= 2 && this.nightT > 70) || this.nightT > 200)) this.endNight();
      }
    }
  }

  private updateEve() {
    const loop1 = this.meta.loop === 1;
    // drill objectives (first loop) or memory objectives
    let obj: string | null;
    if (loop1) {
      const p = this.player;
      if (this.drillStep === 0 && (dist(p.x, p.z, 0, 38) < 9 || this.clock > 500)) { this.drillStep = 1; this.ui.toast("區隊長：「志工同學，今天的演習有三項：疏散、搬運、封鎖。」", "", 4500); }
      if (this.drillStep === 1 && this.drillCrates >= 2) { this.drillStep = 2; this.ui.toast("疏散演練完成。接著把物資搬進一座據點。", "", 3500); }
      if (this.drillStep === 2 && this.eveBase) { this.drillStep = 3; this.ui.toast("封鎖演練完成。自由時間。", "", 3500); }
      obj = ["到升旗廣場報到。區隊長在那裡。", "疏散演練：打開兩個物資箱（互動鍵）。", "封鎖演練：把物資搬進射擊館、體育館或游泳池。走進去就會卸貨。", "自由時間。中午十二點演習結束。"][this.drillStep];
    } else {
      obj = this.eveBase ? `囤貨中：${this.eveBase.name}。交融波前把東西搬進去。` : "囤貨、選一座據點、說服區隊長。";
    }
    this.ui.setObjective(obj);
    // 10:15 blackout at the admin building
    if (this.clock >= 615 && this.blackoutT === 0) {
      this.blackoutT = 1;
      if (this.world.adminWindows) this.world.adminWindows.visible = false;
      this.ui.toast("行政大樓停電了。", "", 3000);
      this.learn("blackout");
      if (this.prophecy) {
        this.hasKey = true; this.learn("armory");
        this.ui.toast("區隊長看著你很久，把械彈庫的鑰匙交給了你。", "warm", 5000);
        this.ev("預言說中了。區隊長把械彈庫的鑰匙交給你。", 2);
      }
    }
    if (this.blackoutT === 1 && this.clock >= 625) { this.blackoutT = 2; if (this.world.adminWindows) this.world.adminWindows.visible = true; }
    while (this.omenIdx < OMENS.length && this.clock >= OMENS[this.omenIdx].at) { this.ui.toast(OMENS[this.omenIdx].text, "hand", 4000); this.omenIdx++; }
  }

  private startQuake() {
    this.phase = "quake"; this.quakeT = 0; this.shake = 1.4;
    this.audio.alarm(); this.audio.quake();
    this.ui.flash();
    this.ui.chapter("12:00", "交融波", 4200);
    this.later(1.4, () => this.ui.freeze("廣播裡，區隊長說：「這不是演習。」", "第一章　天亮之前，再一次", 3600));
    this.rift.visible = true; this.riftGlow.visible = true; this.riftLight.intensity = 2.2;
    this.world.lightFires(true);
    this.ui.setObjective(null);
    // half the people collapse; everyone not with you now needs rescuing
    const r = stream(this.seed, "quake");
    for (const n of this.npcs) {
      if (n.state === "drill") { n.state = "waiting"; n.rescueT = 150 + r() * 120; this.stats.seen++; }
      else if (n.state === "following") this.stats.seen++;
    }
    if (this.eveBase) this.chooseBase(this.eveBase, true);
    for (let i = 0; i < 14; i++) {
      const d = this.world.drains[i % 4];
      this.queueSpawn(MITE, d.x + (r() - 0.5) * 3, d.z + (r() - 0.5) * 3, i * 0.15);
    }
    this.ev("十二點，天空裂開了。", 2);
  }

  private startDay(first: boolean) {
    this.phase = "day";
    this.dayT = 0;
    if (first) {
      this.clock = QUAKE;
      this.weather = this.rng() < 0.3 ? "rain" : "clear";
      this.ui.toast("你的手心在發燙。右下角的按鈕亮起了一個「？」。", "warm", 5000);
      if (!this.base) this.ui.setObjective("選一座據點：走進射擊館、體育館或游泳池。");
      else this.ui.setObjective("把人帶回據點。天黑之前，蟲會越來越多。");
    } else {
      this.clock = 360;
      const r = this.rng();
      this.weather = r < 0.35 ? "clear" : r < 0.6 ? "rain" : r < 0.8 ? "blackout" : "spore";
      this.ui.chapter(`第${cn(this.day)}天`, WEATHER_NAME[this.weather]);
      this.ui.setObjective("白天：出去搜刮、救人。黃昏鐘響前回到據點。");
      this.spawnRescues();
      this.spawnDailyCrates();
    }
    this.applyWeather();
  }

  private applyWeather() {
    const rain = this.weather === "rain";
    this.fx.rainOn = rain; this.world.setRain(rain);
    if (this.weather !== "clear") this.ui.toast(`今天的天氣：${WEATHER_NAME[this.weather]}。`, "", 3000);
  }

  private spawnRescues() {
    const r = this.rng;
    const n = 2 + (r() < 0.5 ? 1 : 0);
    const pool = GENERIC_NAMES.filter((g) => !this.npcs.some((x) => x.name === g));
    for (let i = 0; i < n && pool.length; i++) {
      let x = 0, z = 0;
      for (let k = 0; k < 30; k++) { x = MAP.minX + 10 + r() * (MAP.maxX - MAP.minX - 20); z = MAP.minZ + 10 + r() * (MAP.maxZ - MAP.minZ - 20); if (this.world.walkable(x, z) && dist(x, z, this.player.x, this.player.z) > 25) break; }
      const name = pool.splice(Math.floor(r() * pool.length), 1)[0];
      const cadet = r() < 0.5;
      const npc = new Npc(this.scene, x, z, name, cadet ? "警校生" : "演習志工", cadet ? 0x2f4a75 : 0xe8762e, null);
      npc.state = "waiting"; npc.rescueT = 110 + r() * 50; this.npcs.push(npc); this.stats.seen++;
    }
  }

  private spawnDailyCrates() {
    const r = this.rng;
    const kinds: Crate["kind"][] = ["food", "food", "mat", "mat", "power", "mix", "med"];
    for (let i = 0; i < 6; i++) {
      for (let k = 0; k < 30; k++) {
        const x = MAP.minX + 8 + r() * (MAP.maxX - MAP.minX - 16), z = MAP.minZ + 8 + r() * (MAP.maxZ - MAP.minZ - 16);
        if (!this.world.walkable(x, z)) continue;
        this.addCrate(x, z, pick(r, kinds)); break;
      }
    }
  }

  private bellT = 0;
  private updateBell(dt: number) {
    const p = this.player;
    if (p.charm?.id !== "bell") return;
    this.bellT -= dt;
    if (this.bellT > 0) return;
    this.bellT = 1;
    for (let i = 0; i < this.swarm.n; i++) {
      if (!this.swarm.alive[i] || this.swarm.type[i] !== CARRIER) continue;
      if (dist(p.x, p.z, this.swarm.x[i], this.swarm.z[i]) < 40) { this.revealCharm(); this.bellMark = { x: this.swarm.x[i], z: this.swarm.z[i], t: 1.2 }; this.audio.ui(); break; }
    }
  }
  private bellMark: { x: number; z: number; t: number } | null = null;

  private carrierEvent() {
    this.carrierDone = true;
    const r = stream(this.seed, "carrier");
    const same = r() < 0.8;
    const spot = same ? { x: 62, z: 48 } : pick(r, this.world.drains.slice(4));
    const i = this.swarm.spawn(CARRIER, spot.x, spot.z);
    if (i >= 0) this.ui.toast(same ? "游泳池旁的排水口，有東西爬了出來。" : "遠處的排水溝，有東西爬了出來。", "red", 4000);
    if (this.meta.facts.carrier && !same) this.ui.toast("記憶頁上那一條被劃掉了：這一輪不一樣。", "jade", 4000);
    this.learn("carrier");
  }

  private startNight() {
    if (!this.base) {
      let best = BASES[0], bd = 1e9;
      for (const b of BASES) { const d = boxDist(rectBox(b.rect), this.player.x, this.player.z); if (d < bd) { bd = d; best = b; } }
      this.chooseBase(best, false);
      this.ui.toast(`天黑了。你們躲進了最近的${best.name}。`, "warm", 4000);
    }
    this.phase = "night";
    this.nightT = 0; this.clock = NIGHT;
    const idx = this.day - 1;
    this.nightDef = this.nightPlan[Math.min(idx, this.nightPlan.length - 1)];
    if (this.day === this.nightsTotal) this.nightDef = NIGHT_LAST;
    this.ui.chapter(`第${cn(this.day)}夜`, this.nightDef.name, 3200);
    this.ui.toast(this.nightDef.desc, "", 4500);
    this.ui.setObjective("守住據點。門被打破就修理（互動鍵）。避難室倒了，這一輪就結束。");
    this.swarm.hpScale = 1 + 0.12 * idx;
    const b = this.base!;
    if (this.stash.power >= 1 && this.weather !== "blackout") { this.stash.power -= 1; b.lit = true; }
    else { b.lit = false; this.ui.toast(this.weather === "blackout" ? "停電了。今晚沒有燈。" : "沒有電了。今晚很黑。", "red", 4000); }
    if (b.cards.has("siren")) { const dx = b.def.rect.x > 0 ? -1 : 1; this.lure = { x: b.def.rect.x + dx * 34, z: b.def.rect.z, t: 12 }; this.ui.toast("警車警笛在遠處響了起來。", "", 3000); }
    this.adapt = null;
    if (this.nightDef.id === "adapt") {
      const k = this.swarm.kills;
      this.adapt = (["melee", "ability", "ranged"] as DmgSource[]).sort((a, c) => k[c] - k[a])[0];
      const name = { melee: "近戰", ability: "異能", ranged: "槍", trap: "陷阱", turret: "砲台" }[this.adapt];
      this.ui.toast(`牠們學會了。你最常用的「${name}」，今晚的傷害大幅降低。`, "red", 5000);
      this.ev(`第${cn(this.day)}夜，蟲族學會了抵抗你的${name}。`, 2);
    }
    this.buildWaves();
  }

  private buildWaves() {
    const n = this.day, id = this.nightDef.id, r = this.rng;
    const b = this.base!.def.rect;
    const far = this.world.drains.filter((d) => dist(d.x, d.z, b.x, b.z) > 22);
    const west = far.filter((d) => d.x < 0);
    const spawnAt = (type: BugType, count: number, src: { x: number; z: number }[], delayStep = 0.12) => {
      for (let i = 0; i < count; i++) { const d = src[i % src.length]; this.queueSpawn(type, d.x + (r() - 0.5) * 4, d.z + (r() - 0.5) * 4, i * delayStep); }
    };
    const base = 14 + n * 6;
    const firstSrc = id === "swarm" && r() < 0.8 && west.length ? west : far;
    if (id === "swarm") this.learn("firstnight");
    this.waves = [
      { at: 3, done: false, spawn: () => { spawnAt(MITE, Math.round(base * 0.8), firstSrc); this.ui.toast("第一波。", "red", 2000); } },
      { at: 38, done: false, spawn: () => { spawnAt(MITE, base, far); this.ui.toast("第二波。", "red", 2000); } },
      { at: 80, done: false, spawn: () => { spawnAt(MITE, Math.round(base * 1.3), far); if (n >= 2) spawnAt(LEAPER, n, far, 0.4); this.ui.toast("最後一波。", "red", 2400); } },
    ];
    const extra: Record<string, () => void> = {
      wings: () => { spawnAt(WING, 8 + n * 2, far, 0.2); },
      tank: () => { spawnAt(TANK, 1 + Math.floor(n / 2), far, 1.2); },
      leap: () => { spawnAt(LEAPER, 4 + n * 2, far, 0.3); },
      burrow: () => {
        const bx = b.x, bz = b.z;
        for (let i = 0; i < 6 + n * 2; i++) this.queueSpawn(i % 3 === 0 ? LEAPER : MITE, bx + (r() - 0.5) * (b.w - 4), bz + (r() - 0.5) * (b.d - 4), i * 0.3, 1.6);
        this.ui.toast("地板在震動。牠們從下面來了。", "red", 3500);
      },
      adapt: () => { spawnAt(MITE, base, far); },
      boss: () => { this.spawnBoss(); },
    };
    if (extra[id]) this.waves.push({ at: id === "boss" ? 6 : 50, done: false, spawn: extra[id] });
    if (id === "boss") {
      this.waves.push({ at: 60, done: false, spawn: () => { spawnAt(LEAPER, 6, far, 0.3); spawnAt(MITE, base, far); } });
      this.waves.push({ at: 110, done: false, spawn: () => { spawnAt(TANK, 2, far, 1); spawnAt(MITE, base, far); } });
    }
  }

  private queueSpawn(type: BugType, x: number, z: number, delay: number, emerge?: number) {
    this.spawnQueue.push({ type, x, z, t: delay, emerge });
  }

  private endNight() {
    this.endT = -1;
    // stragglers retreat at dawn
    for (let i = 0; i < this.swarm.n; i++) if (this.swarm.alive[i]) this.swarm.kill(i, null);
    this.spawnQueue = [];
    this.stats.nightsSurvived++;
    this.ev(`撐過了第${cn(this.day)}夜（${this.nightDef.name}）。`, 1);
    this.base!.lit = false;
    this.day++;
    this.phase = "morning";
    this.morning();
  }

  // ------------------------------------------------------------ morning
  private morning() {
    const b = this.base!;
    const people = this.people();
    let need = people + 1;
    if (this.major.id === "chef") need = Math.ceil(need / 2);
    const lines: { text: string; hook?: boolean }[] = [];
    const evToday = this.stats.events.filter((e) => e.w >= 1).slice(-2);
    for (const e of evToday) lines.push({ text: e.text });
    // a partner's line
    const named = this.npcs.filter((n) => (n.state === "base" || n.state === "following") && n.def);
    if (named.length) { const n = pick(this.rng, named); lines.push({ text: pick(this.rng, n.def!.lines.log) }); }
    let gain = { food: 0, power: 0 };
    if (this.major.id === "ee") gain.power += 1;
    if (this.player.charm?.id === "battery") { gain.power += 1; this.revealCharm(); }
    if (this.major.id === "bio") gain.food += 2;
    if (b.cards.has("garden")) gain.food += 2;
    if (b.cards.has("dynamo")) gain.power += 1;
    if (this.npcs.some((n) => n.state === "base" && n.def?.id === "doujiang")) gain.food += 1;
    this.stash.food += gain.food; this.stash.power += gain.power;
    this.stash.food -= need;
    if (this.stash.food < 0) {
      this.stash.food = 0;
      const leaving = this.npcs.filter((n) => n.state === "base" && !n.def);
      const who = leaving[0] ?? this.npcs.find((n) => n.state === "base");
      if (who) { who.state = "dead"; this.stats.lost++; lines.push({ text: `糧食不夠了。${who.name}半夜離開了據點，沒有說要去哪裡。` }); }
    } else lines.push({ text: `早餐吃掉了 ${need} 份糧。還剩 ${this.stash.food} 份，電 ${this.stash.power}，材 ${this.stash.mat}。` });
    for (const d of b.doors) b.repair(d.i, d.max * 0.25);
    b.core.hp = Math.min(b.core.max, b.core.hp + b.core.max * 0.5);
    this.player.hp = this.player.maxHp; this.player.downed = false;
    const next = this.day === this.nightsTotal ? NIGHT_LAST : this.nightPlan[Math.min(this.day - 1, this.nightPlan.length - 1)];
    const hooks: Record<string, string> = {
      wings: "天花板上，有翅膀拍動的聲音。", burrow: "晚上的時候，地板下有東西在敲。", tank: "遠處傳來很重的腳步聲，像有人在拖一台車。",
      adapt: "林知夏說：牠們的殼，跟前天的不一樣。", leap: "拒馬上有新的刮痕，高度比人還高。", boss: "天上的裂縫，今天早上又寬了一點。", swarm: "",
    };
    if (hooks[next.id]) lines.push({ text: hooks[next.id], hook: true });
    const owned = b.cards;
    const offer = shuffle(this.rng, BUILD_CARDS.filter((c) => !owned.has(c.id))).slice(0, 3);
    this.input.enabled = false;
    this.ui.showMorning(this.day, lines, { ...this.stash, people }, need, offer, this.major.id === "mech" ? 0.5 : 1, (cards: BuildCard[], spent: number) => {
      this.stash.mat -= spent;
      for (const c of cards) { b.addCard(c.id); this.ui.toast(`蓋好了：${c.name}`, "jade", 2500); }
      this.fedT = 0;
      saveRun(this.snapshot());
      this.startDay(false);
    });
  }

  // ------------------------------------------------------------ base
  private chooseBase(def: BaseDef, quiet: boolean) {
    if (this.base) return;
    this.base = new Base(def, this.scene);
    this.baseField = this.world.flowField([this.base.core]);
    if (!quiet) this.ui.toast(`${def.name}成了你們的據點。`, "jade", 3500);
    this.ev(`選擇${def.name}作為據點。`, 1);
    if (this.phase !== "eve") this.ui.setObjective("把人帶回據點。天黑之前，蟲會越來越多。");
  }

  private deposit() {
    const p = this.player, pk = p.pack;
    if (!pk.food && !pk.power && !pk.mat) return;
    this.stash.food += pk.food; this.stash.power += pk.power; this.stash.mat += pk.mat;
    const parts = [pk.food && `糧+${pk.food}`, pk.power && `電+${pk.power}`, pk.mat && `材+${pk.mat}`].filter(Boolean).join("　");
    this.ui.toast(`卸貨：${parts}`, "jade", 2200);
    this.audio.pickup();
    p.pack = { food: 0, power: 0, mat: 0 };
    this.warnedFull = false;
  }

  // ------------------------------------------------------------ player
  private updatePlayer(dt: number) {
    const p = this.player, inp = this.input;
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.veilT = Math.max(0, p.veilT - dt); p.stealthT = Math.max(0, p.stealthT - dt);
    p.meleeBuffT = Math.max(0, p.meleeBuffT - dt); if (p.meleeBuffT <= 0) p.meleeMult = 1;
    this.reviveCd = Math.max(0, this.reviveCd - dt);
    if (p.downed) {
      p.vx = p.vz = 0;
      // a partner nearby helps you up
      const helper = this.npcs.find((n) => (n.state === "following" || n.state === "base") && dist(n.x, n.z, p.x, p.z) < 7);
      if (helper && this.reviveCd <= 0) {
        this.reviveT += dt;
        if (this.reviveT > 3.5) { p.downed = false; p.hp = p.maxHp * 0.35; this.reviveT = 0; this.reviveCd = 50; this.ui.toast(`${helper.name}把你扶了起來。`, "jade", 2500); this.stats.returned++; }
      }
      return;
    }
    let mx = inp.moveX, mz = inp.moveZ;
    const moving = Math.hypot(mx, mz) > 0.1;
    if (moving) { p.facing = Math.atan2(mx, mz); p.moveT += dt; p.stillT = 0; }
    else { p.stillT += dt; p.moveT = Math.max(0, p.moveT - dt * 3); }
    let speed = p.speed * (p.carried() > p.carryCap * 0.75 ? 0.85 : 1);
    for (const w of this.world.waterStrips) if (p.x > w.minX && p.x < w.maxX && p.z > w.minZ && p.z < w.maxZ) speed *= 0.6;
    p.vx = mx * speed; p.vz = mz * speed;
    const pos = { x: p.x + p.vx * dt, z: p.z + p.vz * dt };
    for (const o of this.world.allStatic()) resolveCircleBox(pos, p.r, o);
    if (Math.hypot(pos.x - LAKE.x, pos.z - LAKE.z) < LAKE.r) { const a = Math.atan2(pos.z - LAKE.z, pos.x - LAKE.x); pos.x = LAKE.x + Math.cos(a) * LAKE.r; pos.z = LAKE.z + Math.sin(a) * LAKE.r; }
    p.x = clamp(pos.x, MAP.minX + 1.5, MAP.maxX - 1.5); p.z = clamp(pos.z, MAP.minZ + 1.5, MAP.maxZ - 1.5);
    // regen in base with a med bay, and slowly anywhere during the day
    const inBase = this.base?.inside(p.x, p.z);
    const regen = (inBase && this.base!.cards.has("medbay") ? 4 : this.phase === "eve" ? 3 : 0.6) * (this.major.id === "nurse" ? 2 : 1);
    p.hp = Math.min(p.maxHp, p.hp + regen * dt);
    if (p.medkits > 0 && p.hp < p.maxHp * 0.25) { p.medkits--; p.hp = Math.min(p.maxHp, p.hp + (this.major.id === "nurse" ? 80 : 45)); this.ui.toast("你用掉了一個急救包。", "jade", 2000); }
    // unload at the base
    const bAt = this.world.baseAt(p.x, p.z);
    if (bAt) {
      if (this.phase === "eve") { if (this.eveBase !== bAt) { this.eveBase = bAt; if (p.carried()) this.ui.toast(`你把東西搬進了${bAt.name}。這裡會是你們的據點。`, "jade", 3500); } this.deposit(); }
      else if (!this.base && this.phase !== "quake") { this.chooseBase(bAt, false); this.deposit(); }
      else if (this.base && this.base.def === bAt) this.deposit();
    }
    if (this.role.id === "black" && p.stillT > 1.5) this.stealthStill += dt; else this.stealthStill = 0;
  }

  private hurtPlayer(dmg: number) {
    const p = this.player;
    if (p.downed || this.phase === "eve") return;
    if (p.charm?.id === "umbrella") { dmg *= 0.7; this.revealCharm(); }
    this.shake = Math.max(this.shake, 0.25);
    p.hp -= dmg; p.hurtT = 0.25; this.hurtFlashT = 0.35;
    this.audio.hurt();
    if (p.hp <= 0) {
      if (p.tourniquet) { p.tourniquet = false; p.hp = p.maxHp * 0.4; this.ui.toast("你綁上了止血帶，撐著站了起來。", "warm", 3000); this.ev("用演習的止血帶救了自己一命。", 2); return; }
      p.hp = 0; p.downed = true; this.reviveT = 0;
      if (p.carried()) { this.ui.toast("你倒下了。背包裡的東西散了一地。", "red", 3500); p.pack = { food: 0, power: 0, mat: 0 }; }
      else this.ui.toast("你倒下了。", "red", 3000);
      this.ev("倒下了。", 1);
    }
  }

  // ------------------------------------------------------------ NPCs
  private updateNpcs(dt: number) {
    const p = this.player;
    let fi = 0;
    for (const n of this.npcs) {
      if (n.state === "dead" || n.state === "taken") continue;
      if (n.state === "waiting" && this.phase !== "eve") {
        n.rescueT -= dt;
        if (n.rescueT <= 0) {
          n.state = "taken"; this.stats.lost++;
          if (n.def) this.stats.takenVoices.push(n.name);
          this.ui.toast(`${n.name}的求救聲停了。`, "red", 3500);
          this.ev(`${n.name}沒有等到救援。`, 2);
        }
      }
      if (n.state === "following") {
        const ang = p.facing + Math.PI + (fi - 1) * 0.6; fi++;
        const tx = p.x + Math.sin(ang) * 2.2, tz = p.z + Math.cos(ang) * 2.2;
        this.moveNpc(n, tx, tz, p.speed * 0.98, dt, 0.6);
        if (this.base && this.base.inside(n.x, n.z)) this.joinBase(n);
      } else if (n.state === "base" && this.base) {
        const b = this.base;
        const guards = this.npcs.filter((x) => x.state === "base");
        const gi = guards.indexOf(n);
        const door = b.doors[gi % b.doors.length];
        const slot = Math.floor(gi / b.doors.length);
        const side = slot % 2 ? 1 : -1;
        const along = { x: -door.nz, z: door.nx };
        const tx = door.x - door.nx * 2.2 + along.x * side * (0.9 + slot * 0.4), tz = door.z - door.nz * 2.2 + along.z * side * (0.9 + slot * 0.4);
        this.moveNpc(n, tx, tz, 4, dt, 0.3);
        n.shootCd -= dt;
        if (n.shootCd <= 0 && (this.night || this.swarm.count() > 0)) {
          const tower = b.cards.has("tower") ? 1.5 : 1;
          const range = 7.5 * tower;
          const ti = this.swarm.nearest(n.x, n.z, range);
          if (ti >= 0) {
            let dmg = 8 * tower * (n.def?.id === "chenyan" ? 1.6 : 1) * (this.npcs.some((x) => x.state === "base" && x.def?.id === "yan") ? 1.2 : 1);
            dmg *= this.dmgBonus(this.swarm.x[ti], this.swarm.z[ti]);
            this.fx.bolt([{ x: n.x, z: n.z }, { x: this.swarm.x[ti], z: this.swarm.z[ti] }], 0xcfd6dd);
            this.swarm.damage(ti, dmg, "turret", this.adapt);
            n.shootCd = 0.9;
          } else if (this.boss && dist(n.x, n.z, this.boss.x, this.boss.z) < range + this.boss.r) {
            this.damageBoss(6 * tower, "turret");
            this.fx.bolt([{ x: n.x, z: n.z }, { x: this.boss.x, z: this.boss.z }], 0xcfd6dd);
            n.shootCd = 0.9;
          }
        }
        n.hp = Math.min(n.maxHp, n.hp + dt * (b.cards.has("medbay") ? 3 : 0.5));
      } else if (n.state === "carried") {
        let found = false;
        for (let i = 0; i < this.swarm.n; i++) if (this.swarm.alive[i] && this.swarm.captive[i] === n.id) { n.x = this.swarm.x[i]; n.z = this.swarm.z[i]; found = true; break; }
        if (!found) { n.state = "waiting"; n.rescueT = Math.max(n.rescueT, 40); this.ui.toast(`${n.name}被放下了！快去救他。`, "warm", 3000); this.stats.returned++; }
      }
    }
  }

  private moveNpc(n: Npc, tx: number, tz: number, speed: number, dt: number, stopAt: number) {
    const dx = tx - n.x, dz = tz - n.z, l = Math.hypot(dx, dz);
    if (l < stopAt) return;
    const s = Math.min(l, speed * dt * (l > 8 ? 1.3 : 1));
    const pos = { x: n.x + (dx / l) * s, z: n.z + (dz / l) * s };
    for (const o of this.world.allStatic()) resolveCircleBox(pos, n.r, o);
    n.x = pos.x; n.z = pos.z;
    n.mesh.rotation.y = Math.atan2(dx, dz);
  }

  private joinBase(n: Npc) {
    n.state = "base";
    if (!this.stats.rescuedIds.has(n.id)) { this.stats.rescuedIds.add(n.id); this.stats.rescued++; }
    this.ui.toast(`${n.name}加入了據點。`, "jade", 2500);
    if (n.def) this.ev(`${n.name}（${n.who}）加入了據點。`, 1);
  }

  private hurtNpc(n: Npc, dmg: number) {
    n.hp -= dmg;
    if (n.hp <= 0 && n.state !== "dead") {
      n.state = "dead"; this.stats.lost++;
      this.ui.toast(`${n.name}倒下了。`, "red", 3500);
      this.ev(`${n.name}沒有撐住。`, 2);
    }
  }

  // ------------------------------------------------------------ swarm glue
  private swarmEnv() {
    const p = this.player;
    const targets: Target[] = [];
    const stealth = p.stealthT > 0 || p.veilT > 0 || (this.role.id === "black" && p.stillT > 1.5);
    const shy = p.charm?.id === "cloth" && this.night;
    if (shy && this.nightT > 5) this.revealCharm();
    if (!p.downed && this.phase !== "eve") targets.push({ x: p.x, z: p.z, r: p.r, alive: true, kind: "player", ref: p, stealth, shy });
    for (const n of this.npcs) if (n.state === "following" || n.state === "base" || n.state === "waiting") targets.push({ x: n.x, z: n.z, r: n.r, alive: true, kind: "npc", ref: n });
    if (this.base && this.night) targets.push({ x: this.base.core.x, z: this.base.core.z, r: 2, alive: true, kind: "core", ref: this.base });
    const captives = this.npcs.filter((n) => n.state === "waiting").map((n) => ({ x: n.x, z: n.z, id: n.id }));
    const b = this.base;
    return {
      world: this.world, huntField: this.huntField, baseField: this.baseField, night: this.night,
      baseRect: b ? b.box : null, skylight: !!b?.def.skylight, targets,
      barricades: b ? b.barricades() : [], captives, lure: this.lure, adaptSource: this.adapt,
      hitTarget: (t: Target, dmg: number) => {
        if (t.kind === "player") this.hurtPlayer(dmg);
        else if (t.kind === "npc") this.hurtNpc(t.ref as Npc, dmg);
        else if (t.kind === "core" && this.base) { this.base.core.hp -= dmg; if (Math.random() < 0.2) this.audio.door(); }
      },
      hitBarricade: (ref: number, dmg: number) => {
        if (!this.base) return;
        this.audio.door();
        if (this.base.hitDoor(ref, dmg)) { this.ui.toast("有一扇門被打破了！", "red", 2500); this.ev("據點的門被打破了。", 1); }
      },
      carrierGrab: (id: number) => { const n = this.npcs.find((x) => x.id === id); if (n) { n.state = "carried"; this.ui.toast(`拾骸者抓走了${n.name}！`, "red", 3500); } },
      carrierDelivered: (id: number) => {
        const n = this.npcs.find((x) => x.id === id);
        if (n) { n.state = "taken"; this.stats.lost++; if (n.def) this.stats.takenVoices.push(n.name); this.ui.toast(`${n.name}被拖進了裂隙。`, "red", 4000); this.ev(`${n.name}被拖進了裂隙。`, 3); }
      },
    };
  }

  private updateHunt(dt: number) {
    this.huntT -= dt;
    if (this.huntT > 0) return;
    this.huntT = 0.35;
    const t = [{ x: this.player.x, z: this.player.z }];
    for (const n of this.npcs) if (n.state === "following" || n.state === "waiting") t.push({ x: n.x, z: n.z });
    this.huntField = this.world.flowField(t);
  }

  private updateSpawns(dt: number) {
    for (let k = this.spawnQueue.length - 1; k >= 0; k--) {
      const s = this.spawnQueue[k];
      s.t -= dt;
      if (s.t <= 0) { this.swarm.spawn(s.type, s.x, s.z, { emerge: s.emerge }); this.spawnQueue.splice(k, 1); }
    }
    if (this.phase !== "day") return;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    const d = this.day;
    this.spawnT = Math.max(4, (d === 1 ? 8 : 7.5) - d * 0.5);
    if (this.swarm.count() > 30 + d * 10) return;
    const p = this.player, r = this.rng;
    const cands = this.world.drains.filter((x) => { const dd = dist(x.x, x.z, p.x, p.z); return dd > 22 && dd < 60; });
    const src = cands.length ? pick(r, cands) : pick(r, this.world.drains);
    const size = irange(r, 2, 3) + d;
    for (let i = 0; i < size; i++) {
      let type: BugType = MITE;
      const q = r();
      if (d >= 2 && q < 0.18) type = WING; else if (d >= 3 && q < 0.3) type = LEAPER;
      this.queueSpawn(type, src.x + (r() - 0.5) * 3, src.z + (r() - 0.5) * 3, i * 0.2);
    }
    if (d >= 2 && r() < 0.18 && this.npcs.some((n) => n.state === "waiting")) this.queueSpawn(CARRIER, src.x, src.z, 1);
  }

  private dmgBonus(x: number, z: number) {
    let m = 1;
    if (this.role.id === "press") m *= 1.15;
    if (this.npcs.some((n) => n.state === "base" && n.def?.id === "linzhixia")) m *= 1.1;
    if (this.base && this.base.lit && this.base.cards.has("lights") && this.night) for (const d of this.base.doors) if (dist(x, z, d.x, d.z) < 6) { m *= 1.25; break; }
    return m;
  }

  // ------------------------------------------------------------ combat
  private meleeT = 0;
  private updateCombat(dt: number) {
    const p = this.player;
    if (p.downed || this.phase === "eve" || this.phase === "quake") return;
    this.meleeT -= dt;
    if (this.meleeT > 0) return;
    const mw = WEAPONS[p.melee] ?? WEAPONS.mop;
    const rw = p.ranged && p.ammo > 0 ? WEAPONS[p.ranged] : null;
    // melee first if something is right next to you, otherwise shoot
    let w = mw;
    let i = this.swarm.nearest(p.x, p.z, mw.reach);
    let bossNear = !!(this.boss && this.boss.alive && dist(p.x, p.z, this.boss.x, this.boss.z) < mw.reach + this.boss.r);
    if (i < 0 && !bossNear && rw) {
      w = rw;
      i = this.swarm.nearest(p.x, p.z, rw.reach);
      bossNear = !!(this.boss && this.boss.alive && dist(p.x, p.z, this.boss.x, this.boss.z) < rw.reach + this.boss.r);
    }
    if (i < 0 && !bossNear) return;
    const tx = i >= 0 ? this.swarm.x[i] : this.boss!.x, tz = i >= 0 ? this.swarm.z[i] : this.boss!.z;
    if (Math.hypot(this.input.moveX, this.input.moveZ) < 0.1) p.facing = Math.atan2(tx - p.x, tz - p.z);
    const charm = p.charm?.id === "badge" ? 1.1 : 1;
    const dmg = w.dmg * (w.ranged ? 1 : p.meleeBonus * p.meleeMult) * charm * this.dmgBonus(tx, tz);
    const src: DmgSource = w.ranged ? "ranged" : "melee";
    this.meleeT = w.cd;
    if (w.ranged) {
      p.ammo--;
      if (w.slow) { this.fx.burst(tx, tz, w.color, 6, 2, 1); this.swarm.query(tx, tz, 2.2, (j) => { this.swarm.slow[j] = Math.max(this.swarm.slow[j], w.slow); if (j !== i) this.hitBug(j, dmg * 0.5, src); }); }
      else this.fx.bolt([{ x: p.x, z: p.z }, { x: tx, z: tz }], w.color);
      if (p.ammo === 0) { this.ui.toast(`${w.name}用完了。`, "", 2500); p.ranged = null; }
    } else {
      this.fx.ring(p.x + Math.sin(p.facing) * 0.9, p.z + Math.cos(p.facing) * 0.9, 1.4, p.meleeMult > 1 ? 0xff8a4c : w.color, 0.18);
    }
    this.audio.hit();
    if (p.charm?.id === "badge" && !p.charm.known) this.revealCharm();
    if (i >= 0) {
      if (!w.ranged && w.cleave) { // hit everything right in front of you
        const cx = p.x + Math.sin(p.facing) * 1.1, cz = p.z + Math.cos(p.facing) * 1.1;
        this.swarm.query(cx, cz, 1.3, (j) => { if (j !== i) this.hitBug(j, dmg * w.cleave, src); });
      }
      if (w.slow) this.swarm.slow[i] = Math.max(this.swarm.slow[i], w.slow);
      this.hitBug(i, dmg, src);
    } else this.damageBoss(dmg, src);
  }

  private revealCharm() {
    const c = this.player.charm;
    if (!c || c.known) return;
    c.known = true;
    const d = CHARMS.find((x) => x.id === c.id)!;
    this.ui.toast(`${d.reveal}（${d.name}）`, "jade", 5000);
    this.ev(`發現了異化物的祕密：${d.name}。`, 2);
  }

  private hitBug(i: number, dmg: number, src: DmgSource) {
    const t = this.swarm.type[i];
    const killed = this.swarm.damage(i, dmg, src, this.adapt);
    if (killed && this.stealthStill > 0) this.stats.stillKills++;
    if (killed && t === CARRIER) this.ev("打倒了一隻拾骸者。", 1);
    return killed;
  }

  // ------------------------------------------------------------ boss
  private spawnBoss() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(3.2, 18, 12), new THREE.MeshLambertMaterial({ color: 0x4a2238, emissive: 0x2a0a1a }));
    body.scale.set(1, 0.7, 1.2); body.position.y = 2.2; g.add(body);
    const eyes: THREE.Mesh[] = [];
    for (let i = 0; i < 14; i++) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb54a }));
      const a = (i / 14) * Math.PI * 2, y = 2.4 + Math.sin(i * 1.7) * 0.8;
      e.position.set(Math.cos(a) * 2.9, y, Math.sin(a) * 3.3); g.add(e); eyes.push(e);
    }
    for (let i = 0; i < 8; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.08, 4.2, 5), new THREE.MeshLambertMaterial({ color: 0x2e1424 }));
      const a = (i / 8) * Math.PI * 2;
      leg.position.set(Math.cos(a) * 3.2, 1.2, Math.sin(a) * 3.2); leg.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8); g.add(leg);
    }
    const label = textSprite("千眼之母", { size: 40, color: "#f0a08f", scale: 0.04 }); label.position.y = 6.6; g.add(label);
    g.position.set(RIFT.x, 0, RIFT.z);
    this.scene.add(g);
    const max = 2600 * (this.nightsTotal === 7 ? 1.6 : 1);
    this.boss = { x: RIFT.x, z: RIFT.z, hp: max, max, r: 3.4, mesh: g, spawnCd: 4, slamCd: 3, windup: 0, alive: true, eyes };
    this.audio.quake(); this.ui.flash();
    this.ui.freeze("裂隙完全打開了。天上，有一千隻眼睛同時睜開。", "千眼之母", 3200);
    this.ev("千眼之母從裂隙裡爬了出來。", 3);
  }

  private updateBoss(dt: number) {
    const b = this.boss!;
    if (!b.alive) return;
    if (this.bossStun > 0) { this.bossStun -= dt; return; }
    const base = this.base!;
    const half = b.hp < b.max * 0.5;
    const sp = half ? 1.9 : 1.3;
    const d = this.baseField ? this.world.flowDir(this.baseField, b.x, b.z) : null;
    const p = this.player;
    const pd = dist(p.x, p.z, b.x, b.z);
    let dx = d ? d.x : 0, dz = d ? d.z : 0;
    if (!p.downed && pd < 12) { dx = (p.x - b.x) / pd; dz = (p.z - b.z) / pd; }
    const pos = { x: b.x + dx * sp * dt, z: b.z + dz * sp * dt };
    for (const o of this.world.solids) resolveCircleBox(pos, b.r * 0.8, o);
    // crush barricades and the shelter
    for (const door of base.doors) if (door.hp > 0 && boxDist(door.box, pos.x, pos.z) < b.r) { if (base.hitDoor(door.i, 70 * dt)) this.ui.toast("千眼之母撞破了門！", "red", 2500); resolveCircleBox(pos, b.r * 0.8, door.box); }
    for (const w of this.world.walls.get(base.def.id)!) resolveCircleBox(pos, b.r * 0.8, w);
    b.x = pos.x; b.z = pos.z;
    if (dist(b.x, b.z, base.core.x, base.core.z) < b.r + 2.5) base.core.hp -= 22 * dt;
    b.spawnCd -= dt;
    if (b.spawnCd <= 0) {
      b.spawnCd = half ? 4.5 : 6;
      for (let i = 0; i < (half ? 6 : 4); i++) { const a = Math.random() * 6.28; this.queueSpawn(half && i % 3 === 0 ? LEAPER : MITE, b.x + Math.cos(a) * 4.5, b.z + Math.sin(a) * 4.5, i * 0.15); }
    }
    b.slamCd -= dt;
    if (b.windup > 0) {
      b.windup -= dt;
      if (b.windup <= 0) {
        this.fx.ring(b.x, b.z, 7, 0xff6a4a, 0.5); this.audio.ability("nova"); this.shake = Math.max(this.shake, 0.7);
        if (!p.downed && dist(p.x, p.z, b.x, b.z) < 7) { this.hurtPlayer(28); const l = Math.max(0.1, dist(p.x, p.z, b.x, b.z)); p.x += ((p.x - b.x) / l) * 3; p.z += ((p.z - b.z) / l) * 3; }
        for (const n of this.npcs) if ((n.state === "base" || n.state === "following") && dist(n.x, n.z, b.x, b.z) < 7) this.hurtNpc(n, 20);
      }
    } else if (b.slamCd <= 0 && pd < 7.5) { b.windup = 1.1; b.slamCd = half ? 3.5 : 5; this.fx.disc(b.x, b.z, 7, 0xff4a2a, 1.1); }
  }

  private damageBoss(dmg: number, src: DmgSource) {
    const b = this.boss;
    if (!b || !b.alive) return;
    b.hp -= dmg * (this.adapt === src ? 0.45 : 1);
    this.fx.burst(b.x, b.z, 0xffb54a, 3, 4, 3);
    if (b.hp <= 0) {
      b.alive = false; b.hp = 0;
      this.stats.bossKilled = true;
      this.fx.burst(b.x, b.z, 0xffb54a, 120, 12, 3); this.fx.ring(b.x, b.z, 18, 0xffd38a, 1.2);
      this.audio.awaken(); this.ui.flash();
      this.ui.freeze("千眼之母的眼睛，一隻一隻地閉上了。", "第七章　七十二小時後的早晨", 4000);
      this.ev("千眼之母倒下了。", 3);
      for (let i = 0; i < this.swarm.n; i++) if (this.swarm.alive[i]) this.swarm.kill(i, null);
      this.spawnQueue = [];
      this.scene.remove(b.mesh);
      this.endT = 4.5;
    }
  }

  // ------------------------------------------------------------ zones & turret
  private updateZones(dt: number) {
    const p = this.player;
    for (let k = this.zones.length - 1; k >= 0; k--) {
      const z = this.zones[k];
      z.t -= dt;
      if (z.follow) { z.x = p.x; z.z = p.z; }
      if (z.t <= 0) { this.zones.splice(k, 1); continue; }
      this.swarm.query(z.x, z.z, z.r, (i) => { if (z.dps) this.hitBug(i, z.dps * dt, "ability"); this.swarm.slow[i] = Math.max(this.swarm.slow[i], z.slow); });
      if (this.boss && dist(z.x, z.z, this.boss.x, this.boss.z) < z.r + this.boss.r) this.damageBoss(z.dps * dt, "ability");
      if (z.heal) {
        if (dist(p.x, p.z, z.x, z.z) < z.r) p.hp = Math.min(p.maxHp, p.hp + z.heal * dt);
        for (const n of this.npcs) if ((n.state === "base" || n.state === "following") && dist(n.x, n.z, z.x, z.z) < z.r) n.hp = Math.min(n.maxHp, n.hp + z.heal * dt);
      }
    }
    for (let k = this.thorns.length - 1; k >= 0; k--) {
      const t = this.thorns[k];
      t.t -= dt;
      if (t.t <= 0) { this.thorns.splice(k, 1); continue; }
      const mx = (t.ax + t.bx) / 2, mz = (t.az + t.bz) / 2, half = Math.hypot(t.bx - t.ax, t.bz - t.az) / 2 + 1;
      this.swarm.query(mx, mz, half, (i) => {
        const x = this.swarm.x[i], z = this.swarm.z[i];
        const vx = t.bx - t.ax, vz = t.bz - t.az, l2 = vx * vx + vz * vz || 1;
        const u = clamp(((x - t.ax) * vx + (z - t.az) * vz) / l2, 0, 1);
        if (Math.hypot(x - (t.ax + vx * u), z - (t.az + vz * u)) < 1.3) { this.hitBug(i, t.dps * dt, "ability"); this.swarm.slow[i] = Math.max(this.swarm.slow[i], 0.6); }
      });
    }
    // spikes at the doors
    if (this.base && this.base.cards.has("spikes")) for (const d of this.base.doors) {
      const sx = d.x + d.nx * 2.4, sz = d.z + d.nz * 2.4;
      this.swarm.query(sx, sz, 1.8, (i) => this.hitBug(i, 10 * dt, "trap"));
    }
  }

  private updateTurret(dt: number) {
    const b = this.base!;
    b.turretCd -= dt;
    if (b.turretCd > 0) return;
    const tx = b.core.x + 3, tz = b.core.z;
    const i = this.swarm.nearest(tx, tz, 12);
    if (i >= 0) {
      this.fx.bolt([{ x: tx, z: tz }, { x: this.swarm.x[i], z: this.swarm.z[i] }], 0xffffff);
      this.hitBug(i, 14 * this.dmgBonus(this.swarm.x[i], this.swarm.z[i]), "turret"); this.swarm.slow[i] = 0.5;
      b.turretCd = 0.7;
    } else if (this.boss && this.boss.alive && dist(tx, tz, this.boss.x, this.boss.z) < 12 + this.boss.r) {
      this.damageBoss(12, "turret"); b.turretCd = 0.7;
    }
  }

  // ------------------------------------------------------------ ability
  private updateAbility(dt: number) {
    const ab = this.ability;
    const s = this.condState();
    const active = this.phase !== "eve" && this.phase !== "quake";
    if (active) ab.tick(dt, s, this.stamp());
    let glow = active && !this.player.downed ? ab.glow(s) : 0;
    if (this.player.charm?.id === "coin" && glow > 0) { glow = Math.min(1, glow * 1.5); if (glow > 0.6) this.revealCharm(); }
    const face = !active ? "－" : ab.foundCount > 0 ? ab.def.src : "？";
    const color = ab.pressed ? ab.def.css : "#e9a640";
    this.ui.setAbility(glow, [...ab.found, ab.awake], ab.heat, face, color, ab.lock > 0 || !active);
    this.lastGlow = glow;
    if (!this.input.takeAbility()) return;
    if (!active) { this.ui.toast(this.phase === "eve" ? "什麼都沒有發生。現在還不是時候。" : "……", "hand", 2000); return; }
    if (this.player.downed) return;
    const res = ab.press(s, this.stamp(), this.day);
    if (res.kind === "locked") return;
    const first = !ab.pressed;
    ab.pressed = true;
    const radiusMul = this.role.id === "loud" ? 1.25 : 1;
    if (res.kind === "overload") {
      this.ui.toast("過熱了！異能暴走，往四面八方亂射。", "red", 2500);
      this.applyFx(res.fx!, 1, 0xff6a4a, radiusMul);
      this.hurtPlayer(8);
      for (const n of this.npcs) if ((n.state === "following" || n.state === "base") && dist(n.x, n.z, this.player.x, this.player.z) < 7) this.hurtNpc(n, 12);
      return;
    }
    this.applyFx(res.fx!, res.mult, ab.def.color, radiusMul);
    if (res.kind === "discover") {
      this.slowT = 1.3;
      this.audio.discover();
      this.ui.freeze(res.line!, `頓悟　${res.title}${res.star ? "　★" : ""}`, 2600);
      this.ev(`頓悟：${res.title}。${res.line}`, 3);
      if (ab.foundCount === 3) this.later(2.6, () => this.ui.toast(`生存日誌多了一句話：「${ab.def.secret.riddle}」`, "hand", 6000));
    } else if (res.kind === "awaken") {
      this.slowT = 1.8; this.shake = 1;
      this.audio.awaken(); this.ui.flash();
      this.ui.freeze(res.line!, `覺醒　${res.title}`, 3600);
      this.ev(`覺醒：${res.title}。`, 3);
    } else if (res.kind === "resonance") {
      this.ui.toast(`共振 ×3：${res.title}`, "warm", 1600);
    } else if (res.kind === "ult") {
      this.ui.toast(res.title!, "warm", 1600);
    } else if (first && res.kind === "spark") {
      this.ui.toast(ab.def.sparkText, "hand", 3500);
      this.ev("第一次按下了異能鍵。" + ab.def.sparkText, 1);
    }
  }
  lastGlow = 0;

  private applyFx(fx: Effect, mult: number, color: number, rMul: number) {
    const p = this.player;
    switch (fx.k) {
      case "multi": for (const e of fx.list) this.applyFx(e, mult, color, rMul); return;
      case "bolt": {
        const hit = new Set<number>();
        const pts = [{ x: p.x, z: p.z }];
        let cx = p.x, cz = p.z, range = fx.range * rMul;
        for (let c = 0; c < fx.chains; c++) {
          const i = this.swarm.nearest(cx, cz, c === 0 ? range : 6.5 * rMul, hit);
          if (i < 0) break;
          hit.add(i); cx = this.swarm.x[i]; cz = this.swarm.z[i]; pts.push({ x: cx, z: cz });
          this.hitBug(i, fx.dmg * mult * this.dmgBonus(cx, cz), "ability");
        }
        if (this.boss && this.boss.alive && dist(p.x, p.z, this.boss.x, this.boss.z) < range + this.boss.r && hit.size < fx.chains) { pts.push({ x: this.boss.x, z: this.boss.z }); this.damageBoss(fx.dmg * mult, "ability"); }
        if (pts.length < 2) pts.push({ x: p.x + Math.sin(p.facing) * 4, z: p.z + Math.cos(p.facing) * 4 });
        this.fx.bolt(pts, color);
        this.audio.ability("bolt");
        return;
      }
      case "nova": {
        const r = fx.r * rMul;
        this.swarm.query(p.x, p.z, r, (i, d) => {
          this.hitBug(i, fx.dmg * mult * this.dmgBonus(p.x, p.z), "ability");
          if (this.swarm.alive[i]) {
            const l = Math.max(0.1, d);
            this.swarm.vx[i] += ((this.swarm.x[i] - p.x) / l) * fx.knock * 3; this.swarm.vz[i] += ((this.swarm.z[i] - p.z) / l) * fx.knock * 3;
            if (fx.stun) this.swarm.stun[i] = Math.max(this.swarm.stun[i], fx.stun);
          }
        });
        if (this.boss && dist(p.x, p.z, this.boss.x, this.boss.z) < r + this.boss.r) this.damageBoss(fx.dmg * mult, "ability");
        this.fx.ring(p.x, p.z, r, color, 0.5); this.fx.burst(p.x, p.z, color, 20, 8);
        this.audio.ability("nova");
        return;
      }
      case "field": {
        const ahead = fx.at === "ahead";
        const x = ahead ? p.x + Math.sin(p.facing) * (fx.r * 0.9) : p.x, z = ahead ? p.z + Math.cos(p.facing) * (fx.r * 0.9) : p.z;
        const r = fx.r * rMul;
        this.zones.push({ x, z, r, dps: fx.dps * mult, slow: fx.slow, heal: fx.heal ?? 0, t: fx.dur, follow: !ahead, color });
        this.fx.disc(x, z, r, color, fx.dur, ahead ? undefined : () => ({ x: this.player.x, z: this.player.z }));
        this.audio.ability("field");
        return;
      }
      case "blink": {
        const mv = Math.hypot(this.input.moveX, this.input.moveZ) > 0.1;
        const dx = mv ? this.input.moveX : Math.sin(p.facing), dz = mv ? this.input.moveZ : Math.cos(p.facing);
        const l = Math.hypot(dx, dz) || 1;
        const ox = p.x, oz = p.z;
        let nx = p.x, nz = p.z;
        for (let s = 0.5; s <= fx.dist; s += 0.5) {
          const tx = p.x + (dx / l) * s, tz = p.z + (dz / l) * s;
          const probe = { x: tx, z: tz };
          let hitWall = false;
          for (const o of this.world.allStatic()) if (resolveCircleBox(probe, p.r, o)) { hitWall = true; break; }
          if (hitWall || tx < MAP.minX + 2 || tx > MAP.maxX - 2 || tz < MAP.minZ + 2 || tz > MAP.maxZ - 2) break;
          nx = tx; nz = tz;
        }
        p.x = nx; p.z = nz;
        this.swarm.query(ox, oz, 9, (i) => (this.swarm.lostT[i] = 2.5));
        if (fx.carryAllies) for (const n of this.followers()) { n.x = nx + (Math.random() - 0.5) * 2; n.z = nz + (Math.random() - 0.5) * 2; }
        this.fx.ring(ox, oz, 2.5, color, 0.4); this.fx.ring(nx, nz, 3, color, 0.4); this.fx.burst(nx, nz, color, 16, 6);
        if (fx.dmg) this.swarm.query(nx, nz, 3.5, (i) => this.hitBug(i, fx.dmg! * mult, "ability"));
        this.audio.ability("blink");
        return;
      }
      case "wall": {
        const cx = p.x + Math.sin(p.facing) * 2.6, cz = p.z + Math.cos(p.facing) * 2.6;
        const px = -Math.cos(p.facing), pz = Math.sin(p.facing);
        const len = fx.len * rMul;
        this.thorns.push({ ax: cx - px * len / 2, az: cz - pz * len / 2, bx: cx + px * len / 2, bz: cz + pz * len / 2, dps: fx.dps * mult, t: fx.dur });
        this.fx.spikes(cx, cz, p.facing, len, color, fx.dur);
        this.audio.ability("wall");
        return;
      }
      case "buff": {
        if (fx.kind === "melee") { p.meleeMult = Math.max(p.meleeMult, fx.mult * (mult >= 3 ? 1.5 : 1)); p.meleeBuffT = Math.max(p.meleeBuffT, fx.dur); this.fx.ring(p.x, p.z, 2, color, 0.4); }
        else if (fx.kind === "veil") { p.veilT = fx.dur * (mult >= 3 ? 2 : 1); this.swarm.query(p.x, p.z, 12, (i) => (this.swarm.lostT[i] = fx.dur)); this.fx.ring(p.x, p.z, 3, color, 0.5); }
        else { p.stealthT = fx.dur; this.swarm.query(p.x, p.z, 16, (i) => (this.swarm.lostT[i] = fx.dur)); this.fx.ring(p.x, p.z, 5, color, 0.6); }
        this.audio.ability("buff");
        return;
      }
      case "heal": {
        p.hp = Math.min(p.maxHp, p.hp + fx.amt * Math.min(mult, 1.5));
        if (fx.allies) for (const n of this.npcs) if ((n.state === "following" || n.state === "base") && dist(n.x, n.z, p.x, p.z) < 9) n.hp = Math.min(n.maxHp, n.hp + fx.amt);
        this.fx.burst(p.x, p.z, 0x8fffc0, 14, 3);
        return;
      }
      case "pull": {
        const r = fx.r * rMul;
        this.swarm.query(p.x, p.z, r, (i, d) => {
          const k = 0.65;
          this.swarm.x[i] += (p.x - this.swarm.x[i]) * k * Math.min(1, 3 / Math.max(1, d)) + (p.x - this.swarm.x[i]) * 0.3;
          this.swarm.z[i] += (p.z - this.swarm.z[i]) * k * Math.min(1, 3 / Math.max(1, d)) + (p.z - this.swarm.z[i]) * 0.3;
          this.swarm.stun[i] = Math.max(this.swarm.stun[i], 0.7);
          this.hitBug(i, fx.dmg * mult, "ability");
        });
        this.fx.ring(p.x, p.z, r, color, 0.6); this.fx.disc(p.x, p.z, 2.5, color, 0.7);
        this.audio.ability("pull");
        return;
      }
      case "res": {
        this.stash[fx.res] += fx.amt;
        const name = { food: "糧", power: "電", mat: "材" }[fx.res];
        this.ui.toast(`據點的${name} +${fx.amt}`, "jade", 2500);
        return;
      }
    }
  }

  // ------------------------------------------------------------ interaction
  private updateInteract() {
    const p = this.player;
    this.interactTarget = null;
    let label: string | null = null;
    if (!p.downed) {
      let bestD = 2.3;
      const consider = (d: number, l: string, fn: () => void) => { if (d < bestD) { bestD = d; label = l; this.interactTarget = fn; } };
      // doors
      if (this.base && this.phase !== "eve") for (const d of this.base.doors) {
        if (d.hp >= d.max) continue;
        const cost = this.major.id === "mech" ? 1 : 2;
        consider(dist(p.x, p.z, d.x, d.z) - 0.4, `修理（${cost} 材）`, () => {
          if (this.stash.mat < cost) { this.ui.toast("據點的材不夠了。", "red", 2000); return; }
          this.stash.mat -= cost; this.base!.repair(d.i, 90); this.fx.burst(d.x, d.z, 0xc9a06a, 10, 4); this.audio.pickup();
        });
      }
      for (const c of this.crates) {
        if (c.opened) continue;
        const locked = (c.kind === "safe" && !this.codeKnown) || (c.kind === "armory" && !this.hasKey);
        consider(dist(p.x, p.z, c.x, c.z), locked ? "上鎖了" : c.kind === "safe" ? "輸入密碼" : "打開", () => this.openCrate(c, locked));
      }
      for (const n of this.npcs) {
        const d = dist(p.x, p.z, n.x, n.z);
        if (n.state === "waiting") consider(d - 0.3, "救援", () => this.rescue(n));
        else if (n.state === "drill") consider(d - 0.2, n.def?.id === "yan" && this.canProphesy() ? "預言" : "說話", () => this.talk(n));
      }
      if (!this.tapsOn && this.phase !== "night") consider(this.world.distBroadcast(p.x, p.z) + 0.6, this.knowsTaps() ? "恢復熄燈號" : "廣播系統", () => this.broadcast());
      if (!label && p.medkits > 0 && p.hp < p.maxHp * 0.7) { label = "急救"; this.interactTarget = () => { p.medkits--; p.hp = Math.min(p.maxHp, p.hp + (this.major.id === "nurse" ? 80 : 45)); this.ui.toast("用掉了一個急救包。", "jade", 1800); }; }
    }
    this.ui.setInteract(label);
    if (this.input.takeInteract() && this.interactTarget) { this.interactTarget(); this.audio.ui(); }
  }

  private tapsOn = false;
  private tapsPlayed = -1;
  private knowsTaps() { return !!this.meta.facts.taps || this.runFacts.has("taps"); }
  private broadcast() {
    if (!this.knowsTaps()) {
      this.learn("taps");
      this.ui.toast("廣播系統的排程表上，22:30 的熄燈號被人刪掉了。刪除日期是三天前。", "hand", 5500);
      this.ev("發現熄燈號的排程被刪掉了。", 2);
      return;
    }
    this.tapsOn = true;
    this.ui.toast("你重新設定了 22:30 的熄燈號。", "warm", 4000);
    this.ev("恢復了熄燈號的排程。", 2);
  }
  private checkTaps() {
    if (this.phase !== "night" || this.clock < 1350 || this.tapsPlayed === this.day) return;
    this.tapsPlayed = this.day;
    if (!this.tapsOn) { this.ui.toast("22:30。廣播喇叭沙沙地響了一聲，然後就安靜了。", "hand", 4000); return; }
    this.audio.taps();
    for (let i = 0; i < this.swarm.n; i++) if (this.swarm.alive[i]) { this.swarm.stun[i] = Math.max(this.swarm.stun[i], 5); }
    if (this.boss && this.boss.alive) { this.boss.windup = 0; this.boss.slamCd = 6; this.bossStun = 5; }
    this.ui.freeze("熄燈號響了。所有的蟲，同時停了下來。", "22:30　熄燈號", 4200);
    this.ev("22:30，熄燈號響起，蟲群停了下來。", 3);
  }
  private bossStun = 0;
  private shake = 0;

  private canProphesy() { return !!this.meta.facts.blackout && !this.prophecy && this.clock < 615 && this.phase === "eve"; }

  private talk(n: Npc) {
    if (n.def?.id === "yan") {
      if (this.canProphesy()) { this.prophecy = true; this.ui.toast("你對區隊長說：「十點十五分，行政大樓會停電。」他沒理你。", "warm", 4500); this.ev("對區隊長說出了預言。", 1); return; }
      this.ui.toast(this.prophecy ? "區隊長：「……我在看時間。」" : "區隊長：「志工同學，演習期間不要離開指定區域。」", "", 3000);
      return;
    }
    const lines: Record<string, string> = {
      chenyan: "陳硯：「學弟妹，這裡是射擊館，演習不會用到真槍。放心。」",
      linzhixia: "林知夏：「你也覺得今天的鳥很奇怪嗎？」",
      xuan: "許安：「我、我是新生……演習要做什麼？」",
      fangqing: "方晴：「演習傷患請到體育館報到。你的傷票掉了喔。」",
    };
    this.ui.toast(n.def ? lines[n.def.id] ?? `${n.name}向你點了點頭。` : `${n.name}：「今天好熱。演習快點結束吧。」`, "", 3000);
  }

  private rescue(n: Npc) {
    n.state = "following";
    this.ui.toast(n.def ? `${n.name}：「${n.def.lines.join}」` : `${n.name}跟上了你。`, n.def ? "hand" : "jade", 3200);
    this.ev(`救起了${n.name}。`, n.def ? 2 : 1);
    this.stats.returned++;
  }

  private openCrate(c: Crate, locked: boolean) {
    const p = this.player;
    if (locked) { this.ui.toast(c.kind === "safe" ? "是個密碼鎖。四位數。" : "械彈庫的櫃子。需要鑰匙。", "", 2500); return; }
    if (this.phase === "eve") {
      if (this.meta.loop === 1 && this.drillStep <= 1 && this.drillCrates < 2) this.drillCrates++;
      else if (c.kind !== "note") {
        this.suspicion += 0.12;
        if (this.suspicion >= 1) {
          this.suspicion = 0.4;
          this.ui.toast("演習人員把你帶到健康中心「休息」了三十分鐘。", "red", 4500);
          p.x = 16; p.z = 26; this.clock = Math.min(QUAKE - 1, this.clock + 30);
          this.ev("太可疑了，被帶去健康中心休息。", 1);
          return;
        }
      }
    }
    const r = this.rng;
    const room = p.carryCap - p.carried();
    let got = "";
    const add = (k: "food" | "power" | "mat", n: number) => {
      const take = Math.min(n, p.carryCap - p.carried());
      p.pack[k] += take;
      if (take > 0) got += `${{ food: "糧", power: "電", mat: "材" }[k]}+${take} `;
      return take;
    };
    if (room <= 0 && !["note", "armory", "med"].includes(c.kind)) {
      if (!this.warnedFull) this.ui.toast("背包滿了。先回據點卸貨。", "", 2500);
      this.warnedFull = true; return;
    }
    switch (c.kind) {
      case "food": add("food", irange(r, 2, 3)); break;
      case "mat": add("mat", irange(r, 3, 4)); break;
      case "power": add("power", irange(r, 1, 2)); break;
      case "med": p.medkits++; got = "急救包 "; add("food", 1); break;
      case "mix": { const q = r(); if (q < 0.25) { p.medkits++; got = "急救包 "; } else if (q < 0.5) add("food", 2); else if (q < 0.8) add("mat", 3); else add("power", 1); break; }
      case "safe": add("food", 8); this.learn("safe"); this.ev("打開了福利社的密碼鎖箱子。", 1); break;
      case "note": this.codeKnown = true; this.learn("safe"); this.ui.toast("一張紙條：「福利社的鎖：0742」", "hand", 4500); got = "紙條"; break;
      case "armory": p.ranged = "pistol"; p.ammo = WEAPONS.pistol.ammo; got = `制式手槍（${p.ammo} 發）`; this.ev("用區隊長的鑰匙打開了械彈庫。", 2); this.ui.toast("拿到了手槍：沒有蟲貼近時，會自動射擊遠處的蟲。", "warm", 3500); break;
    }
    if (this.phase !== "eve" && ["mix", "mat", "power", "med", "food"].includes(c.kind)) {
      const q = r();
      const wpool: Record<string, string[]> = { mat: ["axe", "bat"], power: ["nail"], med: ["ext"], mix: ["axe", "nail", "ext", "bat"], food: ["bat"] };
      if (q < 0.16) {
        const wid = pick(r, wpool[c.kind]);
        const w = WEAPONS[wid];
        if (w.ranged) { p.ranged = wid; p.ammo = w.ammo; } else p.melee = wid;
        got += `${w.name} `;
        this.ui.toast(w.ranged ? `換上了${w.name}（${w.ammo} 發）。沒有蟲貼近時會自動射擊。` : `換上了${w.name}。`, "warm", 3000);
      } else if (q < 0.27 && (c.kind === "mix" || c.kind === "food")) {
        const owned = p.charm?.id;
        const d = pick(r, CHARMS.filter((x) => x.id !== owned));
        p.charm = { id: d.id, known: false };
        got += `${d.look} `;
        this.ui.toast(`撿到：${d.look}。它有點奇怪。`, "hand", 4000);
        this.ev(`撿到了${d.look}。`, 1);
      }
    }
    c.opened = true;
    const lid = c.mesh.getObjectByName("lid"); if (lid) { lid.position.set(0.3, 0.6, 0.5); lid.rotation.x = -1.1; }
    if (got) this.ui.toast("拿到：" + got.trim(), "", 1800);
    this.audio.pickup();
  }

  // ------------------------------------------------------------ end of run
  private checkEnd(dt: number) {
    if (this.phase !== "night" && this.phase !== "day") return;
    if (this.base && this.base.core.hp <= 0 && this.endT < 0) {
      this.base.core.hp = 0;
      this.ui.freeze("避難室的燈，熄了。", "這一輪結束了", 3500);
      this.ev("避難室被攻破了。", 3);
      this.audio.alarm();
      this.endT = 4;
      this.lost = true;
    }
    if (this.endT >= 0) { this.endT -= dt; if (this.endT < 0) this.finish(!this.lost && this.stats.bossKilled); }
  }
  private lost = false;

  private finish(win: boolean) {
    this.phase = "report";
    clearRun();
    this.input.enabled = false;
    if (win) this.stats.nightsSurvived = this.nightsTotal;
    const quotes: { text: string; who: string }[] = [];
    for (const n of this.npcs) {
      if (!n.def) continue;
      if (n.state === "base" || n.state === "following") quotes.push({ text: n.def.lines.report, who: `${n.name}，${n.who}` });
      else if (n.state === "taken") quotes.push({ text: "……", who: `${n.name}（被拖進了裂隙）` });
    }
    const st: RunStats = {
      win, loop: this.meta.loop, nightsTotal: this.nightsTotal, nightsSurvived: this.stats.nightsSurvived,
      rescued: this.stats.rescued, lost: this.stats.lost, seen: this.stats.seen,
      kills: this.swarm.kills, killsTotal: Object.values(this.swarm.kills).reduce((a, b) => a + b, 0), bossKilled: this.stats.bossKilled,
      roleTag: this.role.tag, roleId: this.role.id, majorName: this.major.name,
      events: this.stats.events, quotes, takenVoices: this.stats.takenVoices, stillKills: this.stats.stillKills, returnedForOthers: this.stats.returned,
    };
    const view = buildReport(st, this.ability);
    // remember
    for (const f of this.runFacts) this.meta.facts[f] = true;
    this.meta.runs++; if (win) this.meta.wins++;
    this.meta.seenAbilities.push(this.ability.def.id);
    this.saveMetaSoon();
    this.ui.showReport(view, (note) => {
      this.meta.note = note;
      this.meta.loop++;
      saveMeta(this.meta);
      this.lost = false;
      this.showTitle();
    });
  }
  private saveMetaSoon() { saveMeta(this.meta); }

  private snapshot(): RunSave {
    const p = this.player, ab = this.ability, b = this.base!;
    return {
      v: 1, loop: this.meta.loop, seed: this.seed, nightsTotal: this.nightsTotal, day: this.day,
      roleId: this.role.id, majorId: this.major.id, abilityId: ab.def.id,
      ab: { found: [...ab.found], foundAt: [...ab.foundAt], awake: ab.awake, awakeAt: ab.awakeAt, starDay: [...ab.starDay], uses: ab.uses, nearMiss: [...ab.nearMiss], secretMiss: ab.secretMiss, pressed: ab.pressed, lastForm: ab.lastForm },
      stash: { ...this.stash },
      base: { id: b.def.id, doors: b.doors.map((d) => ({ hp: d.hp, max: d.max })), core: { ...b.core }, cards: [...b.cards] },
      player: { x: p.x, z: p.z, hp: p.hp, pack: { ...p.pack }, medkits: p.medkits, tourniquet: p.tourniquet, melee: p.melee, ranged: p.ranged, ammo: p.ammo, charm: p.charm ? { ...p.charm } : null, carryCap: p.carryCap, speed: p.speed, meleeBonus: p.meleeBonus },
      npcs: this.npcs.filter((n) => n.state !== "dead").map((n) => ({ name: n.name, who: n.who, defId: n.def?.id ?? null, color: (n.mesh.children[0] as THREE.Mesh & { material: THREE.MeshLambertMaterial }).material.color.getHex(), state: n.state, hp: n.hp, x: n.x, z: n.z, rescueT: n.rescueT })),
      crates: this.crates.map((c) => ({ x: c.x, z: c.z, kind: c.kind, opened: c.opened })),
      nightPlan: this.nightPlan.map((n) => n.id),
      stats: { events: this.stats.events, rescued: this.stats.rescued, lost: this.stats.lost, seen: this.stats.seen, nightsSurvived: this.stats.nightsSurvived, takenVoices: this.stats.takenVoices, stillKills: this.stats.stillKills, returned: this.stats.returned },
      kills: { ...this.swarm.kills }, runFacts: [...this.runFacts],
      flags: { codeKnown: this.codeKnown, hasKey: this.hasKey, tapsOn: this.tapsOn, prophecy: this.prophecy, carrierDone: this.carrierDone },
    };
  }

  private restore(s: RunSave) {
    this.nightsTotal = s.nightsTotal;
    this.resetRun();
    this.seed = s.seed;
    this.rng = stream(s.seed, "run" + s.day);
    this.role = ROLES.find((r) => r.id === s.roleId) ?? ROLES[0];
    this.major = MAJORS.find((m) => m.id === s.majorId) ?? MAJORS[0];
    const def = ABILITIES.find((a) => a.id === s.abilityId) ?? ABILITIES[0];
    const ab = new AbilityRuntime(def);
    ab.found = s.ab.found as [boolean, boolean, boolean]; ab.foundAt = s.ab.foundAt; ab.awake = s.ab.awake; ab.awakeAt = s.ab.awakeAt;
    ab.starDay = s.ab.starDay; ab.uses = s.ab.uses; ab.nearMiss = s.ab.nearMiss; ab.secretMiss = s.ab.secretMiss; ab.pressed = s.ab.pressed; ab.lastForm = s.ab.lastForm;
    this.ability = ab;
    this.day = s.day;
    this.stash = { ...s.stash };
    const p = this.player;
    Object.assign(p, { x: s.player.x, z: s.player.z, hp: s.player.hp, medkits: s.player.medkits, tourniquet: s.player.tourniquet, melee: s.player.melee, ranged: s.player.ranged, ammo: s.player.ammo, charm: s.player.charm, carryCap: s.player.carryCap, speed: s.player.speed, meleeBonus: s.player.meleeBonus });
    p.pack = { ...s.player.pack };
    const bdef = BASES.find((b) => b.id === s.base.id)!;
    this.chooseBase(bdef, true);
    for (const c of s.base.cards) this.base!.addCard(c);
    s.base.doors.forEach((d, i) => { const door = this.base!.doors[i]; if (door) { door.max = d.max; door.hp = d.hp; door.broken = d.hp <= 0; } });
    this.base!.core.hp = s.base.core.hp; this.base!.core.max = s.base.core.max;
    for (const n of s.npcs) {
      const d = n.defId ? NAMED_NPCS.find((x) => x.id === n.defId) ?? null : null;
      const npc = new Npc(this.scene, n.x, n.z, n.name, n.who, n.color, d);
      npc.state = n.state as Npc["state"]; npc.hp = n.hp; npc.rescueT = n.rescueT;
      if (npc.state === "base") this.stats.rescuedIds.add(npc.id);
      this.npcs.push(npc);
    }
    for (const c of s.crates) {
      this.addCrate(c.x, c.z, c.kind as Crate["kind"]);
      if (c.opened) { const cr = this.crates[this.crates.length - 1]; cr.opened = true; const lid = cr.mesh.getObjectByName("lid"); if (lid) { lid.position.set(0.3, 0.6, 0.5); lid.rotation.x = -1.1; } }
    }
    this.nightPlan = s.nightPlan.map((id) => [NIGHT_FIRST, NIGHT_LAST, ...NIGHT_POOL].find((n) => n.id === id)!).filter(Boolean);
    Object.assign(this.stats, s.stats);
    this.swarm.kills = { ...s.kills };
    for (const f of s.runFacts) this.runFacts.add(f);
    this.codeKnown = s.flags.codeKnown; this.hasKey = s.flags.hasKey; this.tapsOn = s.flags.tapsOn; this.prophecy = s.flags.prophecy; this.carrierDone = s.flags.carrierDone;
    this.rift.visible = true; this.riftGlow.visible = true; this.riftLight.intensity = 1.2;
    this.world.lightFires(true);
    this.ui.showHud(true);
    this.input.clear();
    this.fedT = 0;
    this.startDay(false);
    this.ui.toast("從第" + cn(this.day) + "天早上繼續。", "jade", 3000);
  }

  pause() {
    if (this.ui.modalOpen || !["eve", "quake", "day", "night"].includes(this.phase)) return;
    this.paused = true;
    this.ui.showPause(() => { this.paused = false; }, () => this.meta.muted, () => { this.meta.muted = !this.meta.muted; this.audio.setMuted(this.meta.muted); saveMeta(this.meta); },
      () => { this.paused = false; this.finish(false); });
  }

  // ------------------------------------------------------------ render
  private renderScene(t: number) {
    const p = this.player;
    // camera
    // keep roughly the same width of ground in view on phones and desktops
    const aspect = this.camera.aspect, tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const camDist = clamp((aspect < 1 ? 14 : 21) / (tanH * aspect), 30, 66), pitch = 0.98;
    const hgt = camDist * Math.sin(pitch), back = camDist * Math.cos(pitch);
    this.camTarget.lerp(new THREE.Vector3(p.x, 0, p.z + 1), 0.12);
    this.shake = Math.max(0, this.shake - 0.016 * 2);
    const sk = this.shake * this.shake * 1.6;
    this.camera.position.set(this.camTarget.x + (Math.random() - 0.5) * sk, hgt + (Math.random() - 0.5) * sk, this.camTarget.z + back + (Math.random() - 0.5) * sk);
    this.camera.lookAt(this.camTarget.x, 0, this.camTarget.z);
    // light by time of day
    const m = ((this.clock % 1440) + 1440) % 1440;
    let day = 1;
    if (m < 330 || m > 1110) day = 0; else if (m < 420) day = (m - 330) / 90; else if (m > 1020) day = (1110 - m) / 90;
    if (this.phase === "title" || this.phase === "checkin") day = 0.85;
    const dusk = m > 960 && m < 1110 ? Math.sin(((m - 960) / 150) * Math.PI) : 0;
    const spore = this.weather === "spore" && this.phase === "day";
    const rain = this.weather === "rain" && this.phase === "day";
    this.hemi.intensity = 0.5 + day * 0.62 - (rain ? 0.15 : 0);
    this.sun.intensity = 0.35 + day * (rain ? 0.35 : 0.95);
    if (day < 0.3) this.sun.color.setHex(0x8fa6d6); else this.sun.color.setHSL(0.09, 0.6 * dusk + 0.2, 0.75);
    this.hemi.color.setHex(day < 0.3 ? 0x7d8fc0 : 0xcfe0ff); this.hemi.groundColor.setHex(day < 0.3 ? 0x1c1e28 : 0x3a3326);
    const fog = this.scene.fog as THREE.Fog;
    const fogCol = spore ? new THREE.Color(0x3a4a33) : new THREE.Color().setHSL(0.6, 0.35, 0.05 + day * 0.12);
    fog.color.copy(fogCol); (this.scene.background as THREE.Color).copy(fogCol);
    fog.near = spore ? camDist - 14 : camDist + (day > 0.5 ? 30 : 4); fog.far = spore ? camDist + 14 : camDist + (day > 0.5 ? 130 : 46);
    this.pLight.intensity = (1 - day) * 3.2;
    this.pLight.position.set(p.x, 4, p.z);
    if (this.base) { this.base.light.intensity = this.base.lit ? 3 : 0; this.base.render(t); }
    (this.rift.material as THREE.SpriteMaterial).opacity = 0.45 + (1 - day) * 0.55;
    if (this.rift.visible) { this.riftLight.intensity = 1.1 + Math.sin(t * 2) * 0.3; (this.riftGlow.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(t * 3) * 0.06; }
    // actors
    p.render(t, this.lastGlow, this.ability?.pressed ? this.ability.def.css : "#e9a640");
    for (const n of this.npcs) n.render(t);
    if (this.boss && this.boss.alive) {
      this.boss.mesh.position.set(this.boss.x, Math.sin(t * 2) * 0.15, this.boss.z);
      this.boss.mesh.rotation.y = t * 0.2;
      this.boss.eyes.forEach((e, i) => (e.visible = this.boss!.windup > 0 ? Math.sin(t * 30 + i) > 0 : Math.sin(t * 1.3 + i * 2.1) > -0.7));
    }
    this.swarm.render(t);
    this.renderer.render(this.scene, this.camera);
    this.updateHud();
  }

  private updateHud() {
    if (this.phase === "title" || this.phase === "checkin" || this.phase === "report") return;
    const p = this.player;
    const label = this.phase === "eve" ? "前夜" : this.phase === "quake" ? "交融波" : this.phase === "night" ? `第${cn(this.day)}夜` : this.phase === "morning" ? "早晨" : WEATHER_NAME[this.weather];
    const tone = this.phase === "night" ? "night" : this.phase === "quake" ? "red" : this.phase === "eve" ? "" : this.weather === "clear" ? "" : "warm";
    this.ui.setClock(`第${cn(this.day)}天`, fmtClock(this.clock), label, tone);
    this.ui.setCountdown(this.phase === "eve" && this.meta.loop > 1 ? fmtDur(((QUAKE - this.clock) / (QUAKE - EVE_START)) * 4.5 * 3600) : null);
    this.ui.setHp(p.hp / p.maxHp);
    this.ui.setSuspicion(this.phase === "eve" && this.suspicion > 0 ? this.suspicion : null);
    const need = this.people() + 1;
    this.ui.setRes({ ...this.stash, people: this.people() }, this.stash.food < need, p.carried(), p.carryCap);
    const charm = p.charm ? CHARMS.find((x) => x.id === p.charm!.id)! : null;
    this.ui.setGear([WEAPONS[p.melee].name, p.ranged ? `${WEAPONS[p.ranged].name} ${p.ammo}` : "", p.medkits ? `急救包×${p.medkits}` : "", charm ? (p.charm!.known ? charm.name : charm.look + "？") : ""].filter(Boolean).join("｜"));
    this.ui.setBoss(this.boss && this.boss.alive ? this.boss.hp / this.boss.max : null, "千眼之母");
    if (this.boss && this.boss.alive) this.ui.setObjective(null);
    this.hurtFlashT = Math.max(0, this.hurtFlashT - 0.016);
    this.ui.setHurt(this.hurtFlashT > 0 || (p.hp / p.maxHp < 0.25 && !p.downed) || p.downed);
    // arrows to things off screen
    const marks: ArrowMark[] = [];
    const w = this.root.clientWidth, h = this.root.clientHeight;
    const v = new THREE.Vector3();
    const add = (x: number, z: number, label: string, tone: ArrowMark["tone"]) => {
      v.set(x, 1, z).project(this.camera);
      let sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
      const inside = v.z < 1 && sx > 30 && sx < w - 30 && sy > 90 && sy < h - 60;
      if (inside) return;
      const cx = w / 2, cy = h / 2;
      let dx = sx - cx, dy = sy - cy;
      if (v.z > 1) { dx = -dx; dy = -dy; }
      const k = Math.min((w / 2 - 34) / Math.abs(dx || 1e-3), (h / 2 - 96) / Math.abs(dy || 1e-3));
      sx = cx + dx * k; sy = cy + dy * k;
      marks.push({ x: sx, y: sy, ang: Math.atan2(dx, -dy), label, tone });
    };
    const b = this.chosenBaseDef();
    if (b && !(this.base?.inside(p.x, p.z))) add(b.rect.x, b.rect.z, "據點", "jade");
    if (!b && (this.phase !== "eve" || this.drillStep === 2)) for (const bd of BASES) add(bd.rect.x, bd.rect.z, bd.name, "steel");
    if (this.phase === "eve" && this.drillStep === 0) add(0, 36, "區隊長", "");
    const waiting = this.npcs.filter((n) => n.state === "waiting" && this.phase !== "eve").sort((a, c) => dist(a.x, a.z, p.x, p.z) - dist(c.x, c.z, p.x, p.z)).slice(0, 3);
    for (const n of waiting) add(n.x, n.z, `${n.name} ${Math.ceil(n.rescueT)}s`, "red");
    if (this.boss && this.boss.alive) add(this.boss.x, this.boss.z, "千眼之母", "red");
    if (this.bellMark && p.charm?.known) add(this.bellMark.x, this.bellMark.z, "拾骸者", "red");
    this.ui.setArrows(marks.slice(0, 8));
  }

  // ------------------------------------------------------------ test hooks
  debugSkipTo(phase: "quake" | "night" | "boss") {
    if (phase === "quake" && this.phase === "eve") this.clock = QUAKE - 0.5;
    if (phase === "night" && (this.phase === "day")) this.clock = NIGHT - 0.5;
    if (phase === "boss") { this.day = this.nightsTotal; if (this.phase === "day") this.clock = NIGHT - 0.5; }
  }
  debugCond(): CondState { return this.condState(); }
  debugTrue(k: Parameters<typeof condTrue>[0]) { return condTrue(k, this.condState()); }
}

export { FIELD };
