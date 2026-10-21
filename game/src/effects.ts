// Short-lived visuals: lightning, rings, fields, thorns, particles, rain.
import * as THREE from "three";

interface Fx { obj: THREE.Object3D; t: number; dur: number; update?: (k: number, o: THREE.Object3D) => void }

const PCAP = 900;

export class Effects {
  private list: Fx[] = [];
  private pPos = new Float32Array(PCAP * 3);
  private pCol = new Float32Array(PCAP * 3);
  private pVel = new Float32Array(PCAP * 3);
  private pLife = new Float32Array(PCAP);
  private pNext = 0;
  private points: THREE.Points;
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  rainOn = false;

  constructor(private scene: THREE.Scene) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.45, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < PCAP; i++) this.pPos[i * 3 + 1] = -99;

    const RN = 500;
    this.rainPos = new Float32Array(RN * 6);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9fb8c8, transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false; this.rain.visible = false;
    scene.add(this.rain);
    for (let i = 0; i < RN; i++) this.resetDrop(i, 0, 0, true);
  }

  private add(obj: THREE.Object3D, dur: number, update?: Fx["update"]) {
    this.scene.add(obj);
    this.list.push({ obj, t: 0, dur, update });
  }

  bolt(pts: { x: number; z: number }[], color: number) {
    if (pts.length < 2) return;
    const v: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], seg = 5;
      for (let s = 0; s <= seg; s++) {
        const k = s / seg, j = s === 0 || s === seg ? 0 : 0.6;
        v.push(a.x + (b.x - a.x) * k + (Math.random() - 0.5) * j, 1.1 + (Math.random() - 0.5) * j, a.z + (b.z - a.z) * k + (Math.random() - 0.5) * j);
      }
    }
    for (let w = 0; w < 2; w++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(v.map((n, i) => (i % 3 === 1 ? n : n + (w ? (Math.random() - 0.5) * 0.25 : 0))), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: w ? 0xffffff : color, transparent: true, opacity: 1 }));
      this.add(line, 0.28, (k, o) => { ((o as THREE.Line).material as THREE.LineBasicMaterial).opacity = 1 - k; });
    }
    for (const p of pts.slice(1)) this.burst(p.x, p.z, color, 6, 3);
  }

  ring(x: number, z: number, r: number, color: number, dur = 0.45) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.25, z);
    this.add(m, dur, (k, o) => { const s = 0.2 * r + k * 0.8 * r; o.scale.set(s, s, s); ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k); });
  }

  /** A field disc that can follow something. Returns a handle with a stop(). */
  disc(x: number, z: number, r: number, color: number, dur: number, follow?: () => { x: number; z: number }) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.12, z);
    const edge = new THREE.Mesh(new THREE.RingGeometry(r * 0.96, r, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }));
    edge.position.z = 0.001; m.add(edge);
    this.add(m, dur, (k, o) => {
      if (follow) { const p = follow(); o.position.x = p.x; o.position.z = p.z; }
      const fade = k > 0.85 ? (1 - k) / 0.15 : 1;
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (0.18 + 0.06 * Math.sin(k * dur * 6)) * fade;
      (edge.material as THREE.MeshBasicMaterial).opacity = 0.7 * fade;
    });
  }

  spikes(x: number, z: number, ang: number, len: number, color: number, dur: number) {
    const g = new THREE.Group();
    const n = Math.max(3, Math.round(len * 1.6));
    const geo = new THREE.ConeGeometry(0.28, 1.4, 5);
    const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.3 });
    const px = -Math.sin(ang), pz = Math.cos(ang);
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : i / (n - 1) - 0.5;
      const c = new THREE.Mesh(geo, mat);
      c.position.set(x + px * k * len + (Math.random() - 0.5) * 0.5, 0.7, z + pz * k * len + (Math.random() - 0.5) * 0.5);
      c.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
      g.add(c);
    }
    this.add(g, dur, (k, o) => { const s = k < 0.08 ? k / 0.08 : k > 0.9 ? (1 - k) / 0.1 : 1; o.scale.set(1, Math.max(0.01, s), 1); });
  }

  burst(x: number, z: number, color: number, n = 10, speed = 5, y = 0.8) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.pNext; this.pNext = (this.pNext + 1) % PCAP;
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z;
      this.pVel[i * 3] = Math.cos(a) * s; this.pVel[i * 3 + 1] = 2 + Math.random() * 4; this.pVel[i * 3 + 2] = Math.sin(a) * s;
      this.pCol[i * 3] = c.r; this.pCol[i * 3 + 1] = c.g; this.pCol[i * 3 + 2] = c.b;
      this.pLife[i] = 0.4 + Math.random() * 0.4;
    }
  }

  private resetDrop(i: number, cx: number, cz: number, anyY: boolean) {
    const x = cx + (Math.random() - 0.5) * 70, z = cz + (Math.random() - 0.5) * 60, y = anyY ? Math.random() * 30 : 25 + Math.random() * 8;
    const p = this.rainPos;
    p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
    p[i * 6 + 3] = x - 0.15; p[i * 6 + 4] = y - 1.2; p[i * 6 + 5] = z + 0.1;
  }

  update(dt: number, cam: { x: number; z: number }) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.update?.(k, f.obj);
      if (f.t >= f.dur) {
        this.scene.remove(f.obj);
        f.obj.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mat = m.material as THREE.Material | undefined; mat?.dispose?.(); });
        this.list.splice(i, 1);
      }
    }
    for (let i = 0; i < PCAP; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      this.pVel[i * 3 + 1] -= 14 * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] = Math.max(0.05, this.pPos[i * 3 + 1] + this.pVel[i * 3 + 1] * dt);
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      if (this.pLife[i] <= 0) this.pPos[i * 3 + 1] = -99;
    }
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    this.rain.visible = this.rainOn;
    if (this.rainOn) {
      const p = this.rainPos, n = p.length / 6;
      for (let i = 0; i < n; i++) {
        p[i * 6 + 1] -= 34 * dt; p[i * 6 + 4] -= 34 * dt;
        p[i * 6] -= 4 * dt; p[i * 6 + 3] -= 4 * dt;
        if (p[i * 6 + 4] < 0 || Math.abs(p[i * 6] - cam.x) > 40 || Math.abs(p[i * 6 + 2] - cam.z) > 34) this.resetDrop(i, cam.x, cam.z, false);
      }
      (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}
