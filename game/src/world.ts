// The campus: static layout, collision, nav grid, flow fields and the
// "tags" that hidden ability conditions read (water, rail, shade, dirt…).
import * as THREE from "three";
import { mulberry32 } from "./rng";

export const MAP = { minX: -90, maxX: 90, minZ: -80, maxZ: 80 };

export interface Rect { x: number; z: number; w: number; d: number }
export interface Box { minX: number; maxX: number; minZ: number; maxZ: number }
export type Side = "n" | "s" | "e" | "w";

export interface BaseDef {
  id: "range" | "gym" | "pool";
  name: string;
  rect: Rect;
  doors: { side: Side; at: number }[];
  skylight: boolean;
  note: string;
}

export interface Landmark { id: string; name: string; rect: Rect; color: number; roof: number; h: number }

export const BASES: BaseDef[] = [
  { id: "range", name: "射擊館", rect: { x: -48, z: -18, w: 20, d: 12 }, doors: [{ side: "e", at: 0 }], skylight: false, note: "只有一個入口，牆最厚。" },
  { id: "gym", name: "綜合體育館", rect: { x: 46, z: -22, w: 24, d: 18 }, doors: [{ side: "w", at: 0 }, { side: "s", at: 0 }], skylight: true, note: "兩個入口，空間大，屋頂有天窗。" },
  { id: "pool", name: "游泳池", rect: { x: 50, z: 34, w: 22, d: 16 }, doors: [{ side: "n", at: 0 }, { side: "s", at: 0 }], skylight: false, note: "兩個入口，兩側有水道，小蟲過不了水。" },
];

export const LANDMARKS: Landmark[] = [
  { id: "admin", name: "行政大樓", rect: { x: -24, z: 46, w: 16, d: 10 }, color: 0xb7b0a2, roof: 0x5c6670, h: 7 },
  { id: "hall", name: "至善堂", rect: { x: 24, z: 46, w: 16, d: 12 }, color: 0xc2b9a8, roof: 0x7a5f4f, h: 8 },
  { id: "shop", name: "福利社", rect: { x: -14, z: 20, w: 10, d: 7 }, color: 0xc9c0ae, roof: 0x8a6a4a, h: 4 },
  { id: "clinic", name: "健康中心", rect: { x: 16, z: 20, w: 10, d: 7 }, color: 0xd3d0c8, roof: 0x6c7f86, h: 4 },
  { id: "dorm", name: "守四舍", rect: { x: -60, z: 30, w: 10, d: 26 }, color: 0xb4ab9b, roof: 0x5f5a52, h: 9 },
  { id: "library", name: "圖書館", rect: { x: -16, z: -56, w: 16, d: 12 }, color: 0xb9b2a4, roof: 0x4e5d6b, h: 7 },
  { id: "lab", name: "鑑識大樓", rect: { x: 18, z: -56, w: 14, d: 10 }, color: 0xc4c4be, roof: 0x55616a, h: 7 },
  { id: "class", name: "教學區", rect: { x: 52, z: 62, w: 18, d: 10 }, color: 0xbdb5a5, roof: 0x6b5c4e, h: 6 },
  { id: "museum", name: "校史館", rect: { x: -46, z: 64, w: 10, d: 8 }, color: 0xa99d88, roof: 0x4b3f36, h: 5 },
  { id: "booth", name: "衛哨亭", rect: { x: 7, z: 72, w: 4, d: 3 }, color: 0xcfc8b8, roof: 0x5a6670, h: 3 },
];

export const FIELD = { x: 0, z: -22, rx: 18, rz: 13 };
export const LAKE = { x: -64, z: -52, r: 11 };
export const YARD: Rect = { x: -30, z: 0, w: 14, d: 8 };
export const LOT: Rect = { x: 66, z: -60, w: 22, d: 16 };
export const GARDEN: Rect = { x: -44, z: 46, w: 10, d: 8 };
export const PLAZA: Rect = { x: 0, z: 40, w: 22, d: 14 };
export const FLAG = { x: 0, z: 40 };
export const BROADCAST = { x: -24, z: 52.5, r: 3 };
export const GATE = { x: 0, z: 74 };
export const RIFT = { x: FIELD.x, z: FIELD.z };

export const rectBox = (r: Rect, pad = 0): Box => ({
  minX: r.x - r.w / 2 - pad, maxX: r.x + r.w / 2 + pad, minZ: r.z - r.d / 2 - pad, maxZ: r.z + r.d / 2 + pad,
});
export const inRect = (r: Rect, x: number, z: number, pad = 0) =>
  Math.abs(x - r.x) <= r.w / 2 + pad && Math.abs(z - r.z) <= r.d / 2 + pad;

export function doorPos(b: BaseDef, i: number) {
  const d = b.doors[i], r = b.rect;
  switch (d.side) {
    case "e": return { x: r.x + r.w / 2, z: r.z + d.at, nx: 1, nz: 0 };
    case "w": return { x: r.x - r.w / 2, z: r.z + d.at, nx: -1, nz: 0 };
    case "n": return { x: r.x + d.at, z: r.z - r.d / 2, nx: 0, nz: -1 };
    default: return { x: r.x + d.at, z: r.z + r.d / 2, nx: 0, nz: 1 };
  }
}

const WALL_T = 0.8;
export const DOOR_W = 3.4;

function baseWalls(b: BaseDef): Box[] {
  const r = b.rect, hw = r.w / 2, hd = r.d / 2, out: Box[] = [];
  const sides: Side[] = ["n", "s", "e", "w"];
  for (const s of sides) {
    const horiz = s === "n" || s === "s";
    const len = horiz ? r.w : r.d;
    const gaps = b.doors.filter((d) => d.side === s).map((d) => d.at).sort((a, c) => a - c);
    let cur = -len / 2;
    const segs: [number, number][] = [];
    for (const g of gaps) { segs.push([cur, g - DOOR_W / 2]); cur = g + DOOR_W / 2; }
    segs.push([cur, len / 2]);
    for (const [a, c] of segs) {
      if (c - a < 0.05) continue;
      if (horiz) {
        const z = s === "n" ? r.z - hd : r.z + hd;
        out.push({ minX: r.x + a, maxX: r.x + c, minZ: z - WALL_T / 2, maxZ: z + WALL_T / 2 });
      } else {
        const x = s === "w" ? r.x - hw : r.x + hw;
        out.push({ minX: x - WALL_T / 2, maxX: x + WALL_T / 2, minZ: r.z + a, maxZ: r.z + c });
      }
    }
  }
  return out;
}

export interface Seg { ax: number; az: number; bx: number; bz: number }

function distToSeg(x: number, z: number, s: Seg) {
  const vx = s.bx - s.ax, vz = s.bz - s.az;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(x - (s.ax + vx * t), z - (s.az + vz * t));
}

export class World {
  solids: Box[] = [];
  walls = new Map<string, Box[]>();
  rails: Seg[] = [];
  shade: { x: number; z: number; r: number }[] = [];
  puddles: { x: number; z: number; r: number }[] = [];
  waterStrips: Box[] = [];
  barrels: { x: number; z: number }[] = [];
  drains: { x: number; z: number }[] = [];
  trees: { x: number; z: number; s: number }[] = [];
  cars: Box[] = [];
  group = new THREE.Group();
  puddleMeshes: THREE.Mesh[] = [];
  barrelFires: THREE.Mesh[] = [];
  firesLit = false;
  adminWindows: THREE.Mesh | null = null;

  // nav grid
  readonly cell = 2;
  readonly gw = Math.ceil((MAP.maxX - MAP.minX) / 2);
  readonly gh = Math.ceil((MAP.maxZ - MAP.minZ) / 2);
  blocked: Uint8Array;

  constructor(seed: number) {
    const r = mulberry32(seed ^ 0x5151);
    for (const l of LANDMARKS) this.solids.push(rectBox(l.rect));
    for (const b of BASES) this.walls.set(b.id, baseWalls(b));
    // cars in the driving lot
    for (let i = 0; i < 6; i++) {
      const cx = LOT.x - 8 + (i % 3) * 8, cz = LOT.z - 4 + Math.floor(i / 3) * 8;
      this.cars.push({ minX: cx - 1.2, maxX: cx + 1.2, minZ: cz - 2.3, maxZ: cz + 2.3 });
    }
    // pool side channels: water bugs avoid
    const p = BASES[2].rect;
    this.waterStrips.push({ minX: p.x - p.w / 2 - 4, maxX: p.x - p.w / 2 - 1, minZ: p.z - p.d / 2 - 1, maxZ: p.z + p.d / 2 + 1 });
    this.waterStrips.push({ minX: p.x + p.w / 2 + 1, maxX: p.x + p.w / 2 + 4, minZ: p.z - p.d / 2 - 1, maxZ: p.z + p.d / 2 + 1 });
    // rails: fence around the field and along the plaza road
    const fx = FIELD.x, fz = FIELD.z, rx = FIELD.rx + 2.5, rz = FIELD.rz + 2.5;
    const N = 24;
    for (let i = 0; i < N; i++) {
      if (i === 6 || i === 18) continue; // two gaps to walk in
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      this.rails.push({ ax: fx + Math.cos(a0) * rx, az: fz + Math.sin(a0) * rz, bx: fx + Math.cos(a1) * rx, bz: fz + Math.sin(a1) * rz });
    }
    this.rails.push({ ax: -4.2, az: 26, bx: -4.2, bz: 34 }, { ax: 4.2, az: 26, bx: 4.2, bz: 34 });
    this.rails.push({ ax: -36, az: -26, bx: -36, bz: -10 }); // fence beside the range
    // trees: avenue + back hill
    const avenue: [number, number][] = [];
    for (let z = -64; z <= 66; z += 9) { avenue.push([-6.5, z], [6.5, z]); }
    for (const [x, z] of avenue) {
      if (Math.abs(z - 8) < 5 || inRect(PLAZA, x, z, 1) || (z > -36 && z < -8)) continue;
      this.trees.push({ x, z, s: 0.9 + r() * 0.4 });
    }
    for (let i = 0; i < 150; i++) {
      const x = -88 + r() * 16, z = -78 + r() * 156;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 2) continue;
      this.trees.push({ x, z, s: 0.8 + r() * 0.7 });
    }
    for (let i = 0; i < 60; i++) {
      const x = -70 + r() * 140, z = -79 + r() * 9;
      this.trees.push({ x, z, s: 0.8 + r() * 0.6 });
    }
    for (const t of this.trees) if (r() < 0.5 || t.x < -72) this.shade.push({ x: t.x, z: t.z, r: 2.6 * t.s });
    // shade under the hall and admin colonnades
    this.shade.push({ x: -24, z: 52.2, r: 2.4 }, { x: 24, z: 53, r: 2.6 }, { x: -14, z: 24.5, r: 2 });
    // puddles
    const spots: [number, number][] = [[-3, 14], [8, 4], [-20, 8], [30, 8], [-50, 8], [2, 58], [-8, -40], [36, -44], [60, 12], [-40, -34], [20, 30], [-30, 30]];
    for (const [x, z] of spots) this.puddles.push({ x, z, r: 1.3 + r() * 0.8 });
    // barrels (lit after the quake)
    this.barrels.push({ x: YARD.x - 4, z: YARD.z + 2 }, { x: YARD.x + 5, z: YARD.z - 2 }, { x: LOT.x - 10, z: LOT.z + 7 }, { x: 30, z: -38 });
    // drains: where bugs crawl out
    this.drains.push(
      { x: FIELD.x - 14, z: FIELD.z - 12 }, { x: FIELD.x + 14, z: FIELD.z + 12 }, { x: FIELD.x + 16, z: FIELD.z - 10 }, { x: FIELD.x - 16, z: FIELD.z + 10 },
      { x: -84, z: 0 }, { x: 84, z: 6 }, { x: 0, z: -76 }, { x: -70, z: 70 }, { x: 80, z: 70 }, { x: 78, z: -76 }, { x: -82, z: -70 },
    );
    this.blocked = new Uint8Array(this.gw * this.gh);
    this.buildNav();
  }

  allStatic(): Box[] {
    const out = this.solids.concat(this.cars);
    for (const w of this.walls.values()) out.push(...w);
    return out;
  }

  private buildNav() {
    const boxes = this.allStatic();
    for (let gz = 0; gz < this.gh; gz++) for (let gx = 0; gx < this.gw; gx++) {
      const x = MAP.minX + (gx + 0.5) * this.cell, z = MAP.minZ + (gz + 0.5) * this.cell;
      let b = 0;
      if (gx === 0 || gz === 0 || gx === this.gw - 1 || gz === this.gh - 1) b = 1;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 0.5) b = 1;
      for (const o of boxes) if (x > o.minX - 0.7 && x < o.maxX + 0.7 && z > o.minZ - 0.7 && z < o.maxZ + 0.7) { b = 1; break; }
      this.blocked[gz * this.gw + gx] = b;
    }
  }

  cellOf(x: number, z: number) {
    const gx = Math.max(0, Math.min(this.gw - 1, Math.floor((x - MAP.minX) / this.cell)));
    const gz = Math.max(0, Math.min(this.gh - 1, Math.floor((z - MAP.minZ) / this.cell)));
    return gz * this.gw + gx;
  }

  /** BFS distance field from target points (in world units). */
  flowField(targets: { x: number; z: number }[]): Uint16Array {
    const N = this.gw * this.gh, dist = new Uint16Array(N).fill(65535), q = new Int32Array(N);
    let h = 0, t = 0;
    for (const p of targets) {
      const c = this.cellOf(p.x, p.z);
      if (dist[c] !== 0) { dist[c] = 0; q[t++] = c; }
    }
    const W = this.gw;
    while (h < t) {
      const c = q[h++], cx = c % W, cz = (c / W) | 0, nd = dist[c] + 1;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= this.gh) continue;
        const n = nz * W + nx;
        if (this.blocked[n] || dist[n] <= nd) continue;
        if (dx && dz && (this.blocked[cz * W + nx] || this.blocked[nz * W + cx])) continue;
        dist[n] = nd; q[t++] = n;
      }
    }
    return dist;
  }

  /** Direction to walk down a flow field from (x,z); null if unreachable. */
  flowDir(field: Uint16Array, x: number, z: number): { x: number; z: number } | null {
    const c = this.cellOf(x, z), W = this.gw, cx = c % W, cz = (c / W) | 0;
    let best = field[c], bx = 0, bz = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= this.gh) continue;
      const v = field[nz * W + nx];
      if (v < best) { best = v; bx = dx; bz = dz; }
    }
    if (best === 65535 || (!bx && !bz)) return null;
    const tx = MAP.minX + (cx + bx + 0.5) * this.cell, tz = MAP.minZ + (cz + bz + 0.5) * this.cell;
    const l = Math.hypot(tx - x, tz - z) || 1;
    return { x: (tx - x) / l, z: (tz - z) / l };
  }

  // ---------- tag queries (for ability conditions) ----------
  distWater(x: number, z: number, raining: boolean) {
    let d = Math.max(0, Math.hypot(x - LAKE.x, z - LAKE.z) - LAKE.r);
    for (const p of this.puddles) d = Math.min(d, Math.max(0, Math.hypot(x - p.x, z - p.z) - p.r * (raining ? 1.6 : 1)));
    for (const s of this.waterStrips) d = Math.min(d, boxDist(s, x, z));
    if (inRect(BASES[2].rect, x, z)) d = 0; // inside the pool hall
    return d;
  }
  distRail(x: number, z: number) {
    let d = 1e9;
    for (const s of this.rails) d = Math.min(d, distToSeg(x, z, s));
    return d;
  }
  distShade(x: number, z: number) {
    let d = 1e9;
    for (const s of this.shade) d = Math.min(d, Math.max(0, Math.hypot(x - s.x, z - s.z) - s.r));
    return d;
  }
  distDirt(x: number, z: number) {
    let d = boxDist(rectBox(GARDEN), x, z);
    d = Math.min(d, Math.max(0, x - -72)); // back hill
    return d;
  }
  distFire(x: number, z: number) {
    if (!this.firesLit) return 1e9;
    let d = 1e9;
    for (const b of this.barrels) d = Math.min(d, Math.hypot(x - b.x, z - b.z));
    return d;
  }
  distField(x: number, z: number) {
    const v = Math.hypot((x - FIELD.x) / FIELD.rx, (z - FIELD.z) / FIELD.rz);
    return Math.max(0, (v - 1) * FIELD.rz);
  }
  distBroadcast(x: number, z: number) { return Math.max(0, Math.hypot(x - BROADCAST.x, z - BROADCAST.z) - BROADCAST.r); }

  baseAt(x: number, z: number): BaseDef | null {
    for (const b of BASES) if (inRect(b.rect, x, z, -0.4)) return b;
    return null;
  }

  zoneName(x: number, z: number): string {
    const b = this.baseAt(x, z);
    if (b) return b.name;
    for (const l of LANDMARKS) if (inRect(l.rect, x, z, 4)) return l.name + "附近";
    if (this.distField(x, z) < 1) return "田徑場";
    if (inRect(PLAZA, x, z)) return "升旗廣場";
    if (inRect(YARD, x, z, 2)) return "演習器材區";
    if (inRect(LOT, x, z, 2)) return "駕訓場";
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 6) return "鏡湖";
    if (x < -72) return "後山";
    return "校園";
  }

  // ---------- rendering ----------
  build(scene: THREE.Scene) {
    const g = this.group;
    scene.add(g);
    const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c });
    const flat = (w: number, d: number, c: number, x: number, z: number, y = 0.01) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(c));
      m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); g.add(m); return m;
    };
    // ground and plateau edge
    flat(MAP.maxX - MAP.minX + 60, MAP.maxZ - MAP.minZ + 60, 0x2a3329, 0, 0, -0.05);
    flat(MAP.maxX - MAP.minX, MAP.maxZ - MAP.minZ, 0x46553e, 0, 0, 0);
    // roads
    flat(7, 156, 0x5b5e63, 0, 0, 0.02);
    flat(172, 7, 0x5b5e63, 0, 8, 0.021);
    flat(7, 40, 0x5b5e63, -48, -40, 0.02);
    flat(7, 30, 0x5b5e63, 46, -45, 0.02);
    flat(40, 6, 0x5b5e63, 30, 34, 0.022);
    flat(PLAZA.w, PLAZA.d, 0x6d6f73, PLAZA.x, PLAZA.z, 0.03);
    flat(YARD.w, YARD.d, 0x6a6150, YARD.x, YARD.z, 0.03);
    flat(LOT.w, LOT.d, 0x56595c, LOT.x, LOT.z, 0.03);
    flat(GARDEN.w, GARDEN.d, 0x5a4632, GARDEN.x, GARDEN.z, 0.03);
    // field: red track + green infield
    const track = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat(0x8a4a3c));
    track.rotation.x = -Math.PI / 2; track.scale.set(FIELD.rx, FIELD.rz, 1); track.position.set(FIELD.x, 0.03, FIELD.z); g.add(track);
    const infield = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat(0x4f6e45));
    infield.rotation.x = -Math.PI / 2; infield.scale.set(FIELD.rx - 3, FIELD.rz - 3, 1); infield.position.set(FIELD.x, 0.04, FIELD.z); g.add(infield);
    // lake
    const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r, 40), new THREE.MeshLambertMaterial({ color: 0x2f6a80, emissive: 0x0b2630 }));
    lake.rotation.x = -Math.PI / 2; lake.position.set(LAKE.x, 0.05, LAKE.z); g.add(lake);
    for (const s of this.waterStrips) flat(s.maxX - s.minX, s.maxZ - s.minZ, 0x3a7f97, (s.minX + s.maxX) / 2, (s.minZ + s.maxZ) / 2, 0.05);
    // puddles
    for (const p of this.puddles) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(p.r, 18), new THREE.MeshLambertMaterial({ color: 0x5f8796, transparent: true, opacity: 0.55 }));
      m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.045, p.z); g.add(m); this.puddleMeshes.push(m);
    }
    // landmark buildings
    for (const l of LANDMARKS) this.addBuilding(l.rect, l.h, l.color, l.roof, l.id === "admin");
    // bases: floor + walls, no roof so the inside is visible
    for (const b of BASES) {
      flat(b.rect.w, b.rect.d, b.id === "pool" ? 0x8fb3bd : 0x77736b, b.rect.x, b.rect.z, 0.035);
      if (b.id === "pool") flat(b.rect.w - 8, b.rect.d - 7, 0x3f8aa3, b.rect.x, b.rect.z, 0.04);
      for (const w of this.walls.get(b.id)!) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w.maxX - w.minX, 2.6, w.maxZ - w.minZ), mat(0x8e949b));
        m.position.set((w.minX + w.maxX) / 2, 1.3, (w.minZ + w.maxZ) / 2); g.add(m);
      }
    }
    // cars
    for (const c of this.cars) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(c.maxX - c.minX, 1.2, c.maxZ - c.minZ), mat(0xd8dde2));
      body.position.set((c.minX + c.maxX) / 2, 0.6, (c.minZ + c.maxZ) / 2); g.add(body);
      const top = new THREE.Mesh(new THREE.BoxGeometry(c.maxX - c.minX - 0.3, 0.6, 2.2), mat(0x2c3a4d));
      top.position.set(body.position.x, 1.5, body.position.z); g.add(top);
    }
    // rails
    const railMat = mat(0xaab4bd);
    for (const s of this.rails) {
      const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.12), railMat);
      m.position.set((s.ax + s.bx) / 2, 0.45, (s.az + s.bz) / 2);
      m.rotation.y = -Math.atan2(s.bz - s.az, s.bx - s.ax); g.add(m);
    }
    // trees (instanced)
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 3.4, 7), mat(0x2f5a36), this.trees.length);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.28, 1.4, 6), mat(0x5a4330), this.trees.length);
    const o = new THREE.Object3D();
    this.trees.forEach((t, i) => {
      o.position.set(t.x, 0.7 * t.s, t.z); o.scale.setScalar(t.s); o.updateMatrix(); trunk.setMatrixAt(i, o.matrix);
      o.position.set(t.x, 2.9 * t.s, t.z); o.updateMatrix(); crown.setMatrixAt(i, o.matrix);
    });
    g.add(crown, trunk);
    // flagpole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 9, 6), mat(0xd0d4d8));
    pole.position.set(FLAG.x, 4.5, FLAG.z); g.add(pole);
    // barrels
    for (const b of this.barrels) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.1, 10), mat(0x6b3b2a));
      m.position.set(b.x, 0.55, b.z); g.add(m);
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.2, 8), new THREE.MeshBasicMaterial({ color: 0xffa34a, transparent: true, opacity: 0.9 }));
      fire.position.set(b.x, 1.6, b.z); fire.visible = false; g.add(fire); this.barrelFires.push(fire);
    }
    // drains
    for (const d of this.drains) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), mat(0x1c1f22));
      m.rotation.x = -Math.PI / 2; m.position.set(d.x, 0.06, d.z); g.add(m);
    }
    // labels
    for (const l of LANDMARKS) this.addLabel(l.name, l.rect.x, l.h + 2.2, l.rect.z);
    for (const b of BASES) this.addLabel(b.name, b.rect.x, 4.2, b.rect.z - b.rect.d / 2 - 1);
    this.addLabel("田徑場", FIELD.x, 1.5, FIELD.z + FIELD.rz + 3.5);
    this.addLabel("鏡湖", LAKE.x, 1.5, LAKE.z);
    this.addLabel("演習器材區", YARD.x, 2.2, YARD.z - 5);
    this.addLabel("駕訓場", LOT.x, 2.2, LOT.z - 9);
    this.addLabel("升旗廣場", PLAZA.x, 1.5, PLAZA.z + 8);
    this.addLabel("菜園", GARDEN.x, 1.6, GARDEN.z);
  }

  private addBuilding(r: Rect, h: number, color: number, roof: number, isAdmin: boolean) {
    const g = this.group;
    const body = new THREE.Mesh(new THREE.BoxGeometry(r.w, h, r.d), new THREE.MeshLambertMaterial({ color }));
    body.position.set(r.x, h / 2, r.z); g.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(r.w + 0.6, 0.5, r.d + 0.6), new THREE.MeshLambertMaterial({ color: roof }));
    top.position.set(r.x, h + 0.25, r.z); g.add(top);
    // a strip of windows facing the camera (south)
    const win = new THREE.Mesh(new THREE.PlaneGeometry(r.w * 0.8, h * 0.35), new THREE.MeshBasicMaterial({ color: 0xe8d9a8, transparent: true, opacity: 0.35 }));
    win.position.set(r.x, h * 0.55, r.z + r.d / 2 + 0.02); g.add(win);
    if (isAdmin) this.adminWindows = win;
  }

  private addLabel(text: string, x: number, y: number, z: number) {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    const fs = 44;
    ctx.font = `700 ${fs}px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif`;
    const w = Math.ceil(ctx.measureText(text).width) + 28;
    c.width = w; c.height = fs + 24;
    ctx.font = `700 ${fs}px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif`;
    ctx.fillStyle = "rgba(10,15,23,.62)";
    ctx.beginPath(); ctx.roundRect(0, 0, w, c.height, 12); ctx.fill();
    ctx.fillStyle = "#e6e9ec"; ctx.textBaseline = "middle"; ctx.fillText(text, 14, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const k = 0.045; s.scale.set(w * k, c.height * k, 1); s.position.set(x, y, z); s.renderOrder = 5;
    this.group.add(s);
  }

  setRain(on: boolean) {
    for (const m of this.puddleMeshes) {
      m.scale.setScalar(on ? 1.6 : 1);
      (m.material as THREE.MeshLambertMaterial).opacity = on ? 0.75 : 0.55;
    }
  }
  lightFires(on: boolean) {
    this.firesLit = on;
    for (const f of this.barrelFires) f.visible = on;
  }
  tick(t: number) {
    if (this.firesLit) this.barrelFires.forEach((f, i) => { f.scale.y = 0.8 + 0.3 * Math.sin(t * 9 + i * 2); });
  }
}

export function boxDist(b: Box, x: number, z: number) {
  const dx = Math.max(b.minX - x, 0, x - b.maxX), dz = Math.max(b.minZ - z, 0, z - b.maxZ);
  return Math.hypot(dx, dz);
}

/** Push a circle out of a box. Returns true if it collided. */
export function resolveCircleBox(p: { x: number; z: number }, rad: number, b: Box): boolean {
  const cx = Math.max(b.minX, Math.min(p.x, b.maxX)), cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
  const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= rad * rad) return false;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2), k = (rad - d) / d;
    p.x += dx * k; p.z += dz * k;
  } else {
    // center inside the box: push out along the shortest axis
    const l = p.x - b.minX, r = b.maxX - p.x, t = p.z - b.minZ, bo = b.maxZ - p.z, m = Math.min(l, r, t, bo);
    if (m === l) p.x = b.minX - rad; else if (m === r) p.x = b.maxX + rad; else if (m === t) p.z = b.minZ - rad; else p.z = b.maxZ + rad;
  }
  return true;
}
