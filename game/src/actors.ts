// The player and NPC survivors (partners).
import * as THREE from "three";
import { textSprite } from "./util";
import type { NpcDef } from "./data";

function figure(vest: number, skin = 0xe2bfa0) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 1.1, 10), new THREE.MeshLambertMaterial({ color: vest }));
  body.position.y = 0.75; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 9), new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.55; g.add(head);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.2), new THREE.MeshLambertMaterial({ color: 0x1d2430 }));
  nose.position.set(0, 1.0, 0.36); g.add(nose);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; g.add(shadow);
  g.scale.setScalar(1.25);
  return { g, body, head };
}

export interface Pack { food: number; power: number; mat: number }

export class Player {
  x = 0; z = 0; vx = 0; vz = 0;
  hp = 100; maxHp = 100;
  speed = 6.2;
  facing = 0;
  moveT = 0; stillT = 0;
  downed = false; downT = 0;
  hurtT = 0;
  meleeCd = 0; meleeMult = 1; meleeBuffT = 0; meleeBonus = 1;
  veilT = 0; stealthT = 0;
  pack: Pack = { food: 0, power: 0, mat: 0 };
  carryCap = 12;
  medkits = 0;
  tourniquet = false;
  melee = "mop";
  ranged: string | null = null;
  ammo = 0;
  charm: { id: string; known: boolean } | null = null;
  readonly r = 0.45;
  mesh: THREE.Group;
  ring: THREE.Mesh;
  private body: THREE.Mesh;

  constructor(scene: THREE.Scene, vest = 0xe8762e) {
    const f = figure(vest);
    this.mesh = f.g; this.body = f.body;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32), new THREE.MeshBasicMaterial({ color: 0xe9a640, transparent: true, opacity: 0, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.05; this.mesh.add(this.ring);
    const mark = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
    mark.rotation.x = -Math.PI / 2; mark.position.y = 0.04; this.mesh.add(mark);
    const vestStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.12, 10), new THREE.MeshBasicMaterial({ color: 0xf3f0c8 }));
    vestStripe.position.y = 0.9; this.mesh.add(vestStripe);
    scene.add(this.mesh);
  }

  carried() { return this.pack.food + this.pack.power + this.pack.mat; }

  render(time: number, glow: number, color: string) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.facing;
    const bob = Math.hypot(this.vx, this.vz) > 0.5 ? Math.abs(Math.sin(time * 12)) * 0.08 : 0;
    this.mesh.position.y = bob;
    this.mesh.rotation.z = this.downed ? 1.4 : 0;
    const m = this.ring.material as THREE.MeshBasicMaterial;
    m.opacity = glow * (0.45 + 0.25 * Math.sin(time * 6));
    m.color.set(color);
    const bm = this.body.material as THREE.MeshLambertMaterial;
    bm.emissive.setHex(this.hurtT > 0 ? 0x661111 : this.veilT > 0 || this.stealthT > 0 ? 0x332255 : 0x000000);
    this.mesh.visible = !(this.stealthT > 0 && Math.sin(time * 20) > 0.6);
  }
}

export type NpcState = "waiting" | "following" | "base" | "carried" | "dead" | "taken" | "drill";

let NPC_ID = 0;

export class Npc {
  id = NPC_ID++;
  x: number; z: number;
  hp = 60; maxHp = 60;
  state: NpcState = "waiting";
  job: "guard" | "rest" = "rest";
  door = 0;
  shootCd = 0;
  rescueT = 0; // seconds left before they give up (daytime calls for help)
  name: string;
  who: string;
  def: NpcDef | null;
  readonly r = 0.42;
  mesh: THREE.Group;
  label: THREE.Sprite;
  marker: THREE.Sprite;
  savedDay = 0;

  constructor(scene: THREE.Scene, x: number, z: number, name: string, who: string, color: number, def: NpcDef | null) {
    this.x = x; this.z = z; this.name = name; this.who = who; this.def = def;
    const f = figure(color);
    this.mesh = f.g;
    this.label = textSprite(name, { size: 34, scale: 0.024 });
    this.label.position.y = 2.25; this.mesh.add(this.label);
    this.marker = textSprite("救命！", { size: 38, color: "#1a1206", bg: "#e9a640", scale: 0.03 });
    this.marker.position.y = 3.0; this.mesh.add(this.marker);
    scene.add(this.mesh);
  }

  render(time: number) {
    const gone = this.state === "dead" || this.state === "taken";
    this.mesh.visible = !gone;
    if (gone) return;
    this.mesh.position.set(this.x, this.state === "carried" ? 0.5 : 0, this.z);
    this.mesh.rotation.z = this.state === "carried" ? 1.4 : 0;
    this.marker.visible = this.state === "waiting";
    this.label.visible = this.state !== "base";
    if (this.marker.visible) this.marker.position.y = 3 + Math.sin(time * 5) * 0.15;
  }
}
