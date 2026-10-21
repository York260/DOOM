// The chosen stronghold: barricaded doors, the shelter core, generator,
// and morning build cards (spikes, turret, lights…).
import * as THREE from "three";
import { BaseDef, Box, doorPos, DOOR_W, rectBox } from "./world";
import { textSprite } from "./util";

export interface Door { i: number; x: number; z: number; nx: number; nz: number; box: Box; hp: number; max: number; mesh: THREE.Mesh; spikes: THREE.Mesh | null; broken: boolean }

export class Base {
  doors: Door[] = [];
  core: { x: number; z: number; hp: number; max: number };
  gen: { x: number; z: number };
  cards = new Set<string>();
  turretCd = 0;
  turretMesh: THREE.Mesh | null = null;
  light: THREE.PointLight;
  lit = false;
  group = new THREE.Group();
  box: Box;
  private coreMesh: THREE.Mesh;
  private coreLabel: THREE.Sprite;

  constructor(public def: BaseDef, scene: THREE.Scene) {
    scene.add(this.group);
    const r = def.rect;
    this.box = rectBox(r);
    this.core = { x: r.x, z: r.z, hp: 520, max: 520 };
    // generator in a corner away from the doors
    this.gen = { x: r.x - r.w / 2 + 2, z: r.z - r.d / 2 + 2 };
    def.doors.forEach((_, i) => {
      const p = doorPos(def, i);
      const horizWall = p.nz !== 0; // door in a north/south wall
      const box: Box = horizWall
        ? { minX: p.x - DOOR_W / 2, maxX: p.x + DOOR_W / 2, minZ: p.z - 0.5, maxZ: p.z + 0.5 }
        : { minX: p.x - 0.5, maxX: p.x + 0.5, minZ: p.z - DOOR_W / 2, maxZ: p.z + DOOR_W / 2 };
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(box.maxX - box.minX, 2.2, box.maxZ - box.minZ), new THREE.MeshLambertMaterial({ color: 0x8d6a45 }));
      mesh.position.set(p.x, 1.1, p.z);
      this.group.add(mesh);
      this.doors.push({ i, x: p.x, z: p.z, nx: p.nx, nz: p.nz, box, hp: 260, max: 260, mesh, spikes: null, broken: false });
    });
    // shelter core: cots and a lamp
    this.coreMesh = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 3), new THREE.MeshLambertMaterial({ color: 0x3b4a5c, emissive: 0x1a1206 }));
    this.coreMesh.position.set(this.core.x, 0.6, this.core.z); this.group.add(this.coreMesh);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd38a }));
    lamp.position.set(this.core.x, 1.6, this.core.z); this.group.add(lamp);
    this.coreLabel = textSprite("避難室", { size: 32, scale: 0.028 }); this.coreLabel.position.set(this.core.x, 2.8, this.core.z); this.group.add(this.coreLabel);
    const gen = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.1), new THREE.MeshLambertMaterial({ color: 0x4d6a4a }));
    gen.position.set(this.gen.x, 0.6, this.gen.z); this.group.add(gen);
    const gl = textSprite("發電機", { size: 28, scale: 0.024 }); gl.position.set(this.gen.x, 2.1, this.gen.z); this.group.add(gl);
    this.light = new THREE.PointLight(0xffd38a, 0, 26, 1.6);
    this.light.position.set(this.core.x, 4, this.core.z); this.group.add(this.light);
  }

  barricades() { return this.doors.map((d) => ({ box: d.box, hp: d.hp, ref: d.i })); }

  hitDoor(i: number, dmg: number): boolean {
    const d = this.doors[i];
    if (d.hp <= 0) return false;
    d.hp = Math.max(0, d.hp - dmg);
    if (d.hp <= 0 && !d.broken) { d.broken = true; return true; }
    return false;
  }

  repair(i: number, amt: number) {
    const d = this.doors[i];
    d.hp = Math.min(d.max, d.hp + amt);
    if (d.hp > 0) d.broken = false;
  }

  addCard(id: string) {
    this.cards.add(id);
    if (id === "plank") for (const d of this.doors) { d.max += 150; d.hp = d.max; d.broken = false; }
    if (id === "spikes") for (const d of this.doors) {
      if (d.spikes) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshLambertMaterial({ color: 0x5d4a3a }));
      m.rotation.x = -Math.PI / 2; m.position.set(d.x + d.nx * 2.4, 0.07, d.z + d.nz * 2.4);
      this.group.add(m); d.spikes = m;
    }
    if (id === "turret" && !this.turretMesh) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.4, 8), new THREE.MeshLambertMaterial({ color: 0xc23b2b }));
      t.position.set(this.core.x + 3, 0.7, this.core.z); this.group.add(t); this.turretMesh = t;
      const l = textSprite("砲台", { size: 26, scale: 0.022 }); l.position.set(this.core.x + 3, 2, this.core.z); this.group.add(l);
    }
  }

  inside(x: number, z: number) { return x > this.box.minX && x < this.box.maxX && z > this.box.minZ && z < this.box.maxZ; }

  render(time: number) {
    for (const d of this.doors) {
      d.mesh.visible = d.hp > 0;
      const k = d.hp / d.max;
      d.mesh.scale.y = 0.3 + 0.7 * k;
      d.mesh.position.y = 1.1 * d.mesh.scale.y;
      (d.mesh.material as THREE.MeshLambertMaterial).emissive.setHex(k < 0.35 ? 0x441100 : 0x000000);
    }
    const ck = this.core.hp / this.core.max;
    (this.coreMesh.material as THREE.MeshLambertMaterial).emissive.setHex(ck < 0.4 && Math.sin(time * 10) > 0 ? 0x661111 : 0x1a1206);
    if (this.turretMesh) this.turretMesh.rotation.y = time * 0.6;
  }
}
