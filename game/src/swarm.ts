// The bug swarm: struct-of-arrays simulation + instanced rendering.
import * as THREE from "three";
import { World, Box, resolveCircleBox, MAP, RIFT } from "./world";

export const BUG = [
  { name: "蝕蝨", r: 0.38, speed: 3.8, hp: 12, dmg: 5, cd: 0.7, color: 0xd08a34, scale: 0.68, fly: false, biomass: 1 },
  { name: "哨翅", r: 0.42, speed: 5.4, hp: 12, dmg: 4, cd: 0.8, color: 0xe6cf7a, scale: 0.75, fly: true, biomass: 1 },
  { name: "拾骸者", r: 0.85, speed: 2.7, hp: 70, dmg: 6, cd: 1.0, color: 0x9a6c3a, scale: 1.25, fly: false, biomass: 3 },
  { name: "彈刃", r: 0.55, speed: 3.5, hp: 34, dmg: 12, cd: 1.2, color: 0xc4542e, scale: 0.85, fly: false, biomass: 2 },
  { name: "鐵殼", r: 1.15, speed: 1.9, hp: 210, dmg: 22, cd: 1.3, color: 0x6a5c4c, scale: 1.75, fly: false, biomass: 5 },
] as const;
export type BugType = 0 | 1 | 2 | 3 | 4;
export const MITE = 0, WING = 1, CARRIER = 2, LEAPER = 3, TANK = 4;

export type DmgSource = "melee" | "ability" | "ranged" | "trap" | "turret";

export interface Target { x: number; z: number; r: number; alive: boolean; kind: "player" | "npc" | "core"; ref: unknown; stealth?: boolean; shy?: boolean }

export interface SwarmEnv {
  world: World;
  huntField: Uint16Array | null;
  baseField: Uint16Array | null;
  night: boolean;
  baseRect: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
  skylight: boolean;
  targets: Target[];
  barricades: { box: Box; hp: number; ref: number }[];
  captives: { x: number; z: number; id: number }[]; // NPCs a carrier can grab
  lure: { x: number; z: number; t: number } | null;
  hitTarget(t: Target, dmg: number, bugType: BugType): void;
  hitBarricade(ref: number, dmg: number): void;
  carrierGrab(npcId: number): void;
  carrierDelivered(npcId: number): void;
  adaptSource: DmgSource | null;
}

const CAP = 520;

export class Swarm {
  n = 0;
  x = new Float32Array(CAP); z = new Float32Array(CAP);
  vx = new Float32Array(CAP); vz = new Float32Array(CAP);
  hp = new Float32Array(CAP); maxhp = new Float32Array(CAP);
  type = new Uint8Array(CAP);
  alive = new Uint8Array(CAP);
  cd = new Float32Array(CAP);
  stun = new Float32Array(CAP);
  slow = new Float32Array(CAP);
  flash = new Float32Array(CAP);
  leapT = new Float32Array(CAP);
  emerge = new Float32Array(CAP);
  captive = new Int16Array(CAP).fill(-1);
  wanderA = new Float32Array(CAP);
  lostT = new Float32Array(CAP); // time left without a target (veil/blink)
  hpScale = 1;
  kills: Record<DmgSource, number> = { melee: 0, ability: 0, ranged: 0, trap: 0, turret: 0 };
  killsByType = [0, 0, 0, 0, 0];
  meshes: THREE.InstancedMesh[] = [];
  private head: Int32Array; private next = new Int32Array(CAP);
  private hgw: number; private hgh: number; private readonly hc = 2.5;
  private tmp = new THREE.Object3D();
  private col = new THREE.Color();
  onDeath: (i: number, type: BugType, x: number, z: number) => void = () => {};

  constructor(scene: THREE.Scene) {
    this.hgw = Math.ceil((MAP.maxX - MAP.minX) / this.hc) + 1;
    this.hgh = Math.ceil((MAP.maxZ - MAP.minZ) / this.hc) + 1;
    this.head = new Int32Array(this.hgw * this.hgh).fill(-1);
    const geos: THREE.BufferGeometry[] = [
      new THREE.SphereGeometry(1, 7, 5).scale(0.9, 0.5, 1.25),
      new THREE.OctahedronGeometry(1).scale(1.4, 0.25, 0.8),
      new THREE.SphereGeometry(1, 8, 6).scale(0.9, 0.55, 1.3),
      new THREE.ConeGeometry(0.8, 1.8, 5).rotateX(Math.PI / 2).scale(1, 0.6, 1),
      new THREE.DodecahedronGeometry(1).scale(1.1, 0.6, 1.25),
    ];
    BUG.forEach((b, t) => {
      const m = new THREE.InstancedMesh(geos[t], new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: b.color, emissiveIntensity: 0.25 }), CAP);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0; m.frustumCulled = false;
      for (let i = 0; i < CAP; i++) m.setColorAt(i, new THREE.Color(b.color));
      scene.add(m); this.meshes.push(m);
    });
  }

  count() { let c = 0; for (let i = 0; i < this.n; i++) c += this.alive[i]; return c; }

  spawn(type: BugType, x: number, z: number, opts: { emerge?: number } = {}): number {
    let i = -1;
    for (let k = 0; k < this.n; k++) if (!this.alive[k]) { i = k; break; }
    if (i < 0) { if (this.n >= CAP) return -1; i = this.n++; }
    const b = BUG[type];
    this.x[i] = x; this.z[i] = z; this.vx[i] = 0; this.vz[i] = 0;
    this.type[i] = type; this.alive[i] = 1;
    this.hp[i] = this.maxhp[i] = b.hp * this.hpScale;
    this.cd[i] = Math.random() * b.cd; this.stun[i] = 0; this.slow[i] = 0; this.flash[i] = 0; this.leapT[i] = 0;
    this.emerge[i] = opts.emerge ?? 0; this.captive[i] = -1; this.wanderA[i] = Math.random() * 6.28; this.lostT[i] = 0;
    return i;
  }

  damage(i: number, amt: number, src: DmgSource, adapt: DmgSource | null): boolean {
    if (!this.alive[i]) return false;
    let a = amt;
    if (adapt && adapt === src) a *= 0.45;
    this.hp[i] -= a; this.flash[i] = 0.12;
    if (this.hp[i] <= 0) { this.kill(i, src); return true; }
    return false;
  }

  kill(i: number, src: DmgSource | null) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    if (src) { this.kills[src]++; this.killsByType[this.type[i]]++; }
    this.onDeath(i, this.type[i] as BugType, this.x[i], this.z[i]);
  }

  clear() { for (let i = 0; i < this.n; i++) this.alive[i] = 0; this.n = 0; this.head.fill(-1); }

  private rebuildHash() {
    this.head.fill(-1);
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      const c = this.hcell(this.x[i], this.z[i]);
      this.next[i] = this.head[c]; this.head[c] = i;
    }
  }
  private hcell(x: number, z: number) {
    const gx = Math.max(0, Math.min(this.hgw - 1, Math.floor((x - MAP.minX) / this.hc)));
    const gz = Math.max(0, Math.min(this.hgh - 1, Math.floor((z - MAP.minZ) / this.hc)));
    return gz * this.hgw + gx;
  }

  /** Visit live bugs within radius r of (x,z). */
  query(x: number, z: number, r: number, fn: (i: number, d: number) => void) {
    const g0x = Math.max(0, Math.floor((x - r - MAP.minX) / this.hc)), g1x = Math.min(this.hgw - 1, Math.floor((x + r - MAP.minX) / this.hc));
    const g0z = Math.max(0, Math.floor((z - r - MAP.minZ) / this.hc)), g1z = Math.min(this.hgh - 1, Math.floor((z + r - MAP.minZ) / this.hc));
    for (let gz = g0z; gz <= g1z; gz++) for (let gx = g0x; gx <= g1x; gx++) {
      for (let i = this.head[gz * this.hgw + gx]; i >= 0; i = this.next[i]) {
        if (!this.alive[i]) continue;
        const d = Math.hypot(this.x[i] - x, this.z[i] - z);
        if (d <= r + BUG[this.type[i]].r) fn(i, d);
      }
    }
  }

  nearest(x: number, z: number, r: number, exclude?: Set<number>): number {
    let best = -1, bd = 1e9;
    this.query(x, z, r, (i, d) => { if (exclude?.has(i)) return; if (d < bd) { bd = d; best = i; } });
    return best;
  }

  update(dt: number, env: SwarmEnv) {
    this.rebuildHash();
    const statics = env.world.allStatic();
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      const t = this.type[i] as BugType, b = BUG[t];
      this.flash[i] = Math.max(0, this.flash[i] - dt);
      this.cd[i] -= dt; this.lostT[i] -= dt;
      if (this.emerge[i] > 0) { this.emerge[i] -= dt; continue; }
      if (this.stun[i] > 0) { this.stun[i] -= dt; this.vx[i] *= 0.8; this.vz[i] *= 0.8; this.x[i] += this.vx[i] * dt; this.z[i] += this.vz[i] * dt; continue; }
      const x = this.x[i], z = this.z[i];

      // ---- choose where to go
      let dirX = 0, dirZ = 0, target: Target | null = null, td = 1e9;
      const canSee = this.lostT[i] <= 0;
      if (canSee) for (const tg of env.targets) {
        if (!tg.alive || tg.stealth) continue;
        const d = Math.hypot(tg.x - x, tg.z - z);
        if (tg.shy && d > 4) continue;
        if (d < td) { td = d; target = tg; }
      }
      const aggro = env.night ? 9 : (t === WING ? 22 : 15);
      if (t === CARRIER && this.captive[i] >= 0) {
        // drag the captive back to the rift
        const dx = RIFT.x - x, dz = RIFT.z - z, l = Math.hypot(dx, dz);
        if (l < 2.5) { env.carrierDelivered(this.captive[i]); this.captive[i] = -1; this.kill(i, null); continue; }
        dirX = dx / l; dirZ = dz / l;
        target = null;
      } else if (t === CARRIER && env.captives.length) {
        let best = -1, bd2 = 1e9;
        env.captives.forEach((c, k) => { const d = Math.hypot(c.x - x, c.z - z); if (d < bd2) { bd2 = d; best = k; } });
        const c = env.captives[best];
        if (bd2 < 1.6) { this.captive[i] = c.id; env.carrierGrab(c.id); }
        else { const l = bd2 || 1; dirX = (c.x - x) / l; dirZ = (c.z - z) / l; }
        target = null;
      } else if (env.lure && env.lure.t > 0 && Math.hypot(env.lure.x - x, env.lure.z - z) < 40 && !(target && td < 3)) {
        const dx = env.lure.x - x, dz = env.lure.z - z, l = Math.hypot(dx, dz) || 1; dirX = dx / l; dirZ = dz / l; target = null;
      } else if (target && (td < aggro || (env.night && target.kind !== "player"))) {
        const inBase = env.baseRect && x > env.baseRect.minX && x < env.baseRect.maxX && z > env.baseRect.minZ && z < env.baseRect.maxZ;
        if (td < 3.5 || b.fly || inBase) { dirX = (target.x - x) / (td || 1); dirZ = (target.z - z) / (td || 1); }
        else {
          const f = env.night && target.kind !== "player" ? env.baseField : env.huntField;
          const d = f ? env.world.flowDir(f, x, z) : null;
          if (d) { dirX = d.x; dirZ = d.z; } else { dirX = (target.x - x) / (td || 1); dirZ = (target.z - z) / (td || 1); }
        }
      } else if (env.night && env.baseField) {
        const d = env.world.flowDir(env.baseField, x, z);
        if (d) { dirX = d.x; dirZ = d.z; }
      } else {
        this.wanderA[i] += (Math.random() - 0.5) * dt * 2;
        dirX = Math.cos(this.wanderA[i]) * 0.35; dirZ = Math.sin(this.wanderA[i]) * 0.35;
      }

      // ---- leaper: lunge at close targets
      let speed = b.speed * (1 - this.slow[i]);
      this.slow[i] = Math.max(0, this.slow[i] - dt * 0.6);
      if (t === LEAPER) {
        if (this.leapT[i] > 0) { this.leapT[i] -= dt; speed = 11; }
        else if (target && td < 6 && this.cd[i] <= 0) { this.leapT[i] = 0.38; this.cd[i] = b.cd + 0.8; }
      }
      // water channels: small bugs crawl slowly
      if (!b.fly && (t === MITE || t === LEAPER)) for (const w of env.world.waterStrips) if (x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ) speed *= 0.25;

      // ---- separation
      let sx = 0, sz = 0;
      this.query(x, z, b.r + 0.9, (j, d) => {
        if (j === i || d < 1e-4) return;
        const rr = b.r + BUG[this.type[j]].r;
        if (d < rr) { const k = (rr - d) / rr; sx += ((x - this.x[j]) / d) * k; sz += ((z - this.z[j]) / d) * k; }
      });
      const desX = dirX * speed + sx * 3, desZ = dirZ * speed + sz * 3;
      const ease = Math.min(1, dt * (t === LEAPER && this.leapT[i] > 0 ? 20 : 8));
      this.vx[i] += (desX - this.vx[i]) * ease; this.vz[i] += (desZ - this.vz[i]) * ease;
      const p = { x: x + this.vx[i] * dt, z: z + this.vz[i] * dt };

      // ---- collisions
      const flyFree = b.fly && (!env.night || env.skylight || !env.baseRect);
      if (!flyFree) {
        if (!b.fly) for (const o of statics) resolveCircleBox(p, b.r, o);
        else for (const w of env.world.walls.values()) for (const o of w) resolveCircleBox(p, b.r, o);
        const leaping = t === LEAPER && this.leapT[i] > 0;
        for (const bar of env.barricades) {
          if (bar.hp <= 0 || leaping) continue;
          if (resolveCircleBox(p, b.r, bar.box) && this.cd[i] <= 0) {
            env.hitBarricade(bar.ref, b.dmg * (t === TANK ? 2.2 : 1)); this.cd[i] = b.cd;
          }
        }
      }
      p.x = Math.max(MAP.minX + 1, Math.min(MAP.maxX - 1, p.x));
      p.z = Math.max(MAP.minZ + 1, Math.min(MAP.maxZ - 1, p.z));
      this.x[i] = p.x; this.z[i] = p.z;

      // ---- attack
      if (target && this.cd[i] <= 0) {
        const d = Math.hypot(target.x - p.x, target.z - p.z);
        if (d < target.r + b.r + 0.35) { env.hitTarget(target, b.dmg, t); this.cd[i] = b.cd; }
      }
    }
  }

  render(time: number) {
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      const t = this.type[i], b = BUG[t], m = this.meshes[t], k = counts[t]++;
      const yaw = Math.atan2(this.vx[i], this.vz[i]);
      const em = this.emerge[i] > 0 ? Math.max(0.05, 1 - this.emerge[i]) : 1;
      let y = b.scale * 0.45;
      if (b.fly) y = 1.6 + Math.sin(time * 9 + i) * 0.2;
      if (t === LEAPER && this.leapT[i] > 0) y += 0.9;
      if (this.emerge[i] > 0) y -= (1 - em) * 0.8;
      this.tmp.position.set(this.x[i], y, this.z[i]);
      this.tmp.rotation.set(0, yaw, 0);
      const s = b.scale * em * (1 + this.flash[i] * 1.5) * (b.fly ? 1 + 0.15 * Math.sin(time * 30 + i) : 1);
      this.tmp.scale.set(s, s, s);
      this.tmp.updateMatrix();
      m.setMatrixAt(k, this.tmp.matrix);
      this.col.setHex(this.flash[i] > 0 ? 0xffffff : this.stun[i] > 0 ? 0x9fd3ff : b.color);
      m.setColorAt(k, this.col);
    }
    this.meshes.forEach((m, t) => { m.count = counts[t]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
  }
}
