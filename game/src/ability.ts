// One-button ability: hidden conditions, glow, discovery, resonance,
// awakening and overheat. Effects are applied by the game.
import type { AbilityDef, CondKey, Effect } from "./data";
import { clamp } from "./util";

export interface CondState {
  dWater: number; dRail: number; dShade: number; dDirt: number; dFire: number; dField: number;
  dBroadcast: number; dGen: number; dDoor: number; dBase: number;
  raining: boolean; outdoors: boolean; dark: boolean; night: boolean;
  hpFrac: number; stillT: number; moveT: number; allyDist: number; crowd: number;
  carry: number; carryCap: number; inBase: boolean; fedT: number;
}

export function condTrue(k: CondKey, s: CondState): boolean {
  switch (k) {
    case "water": return s.dWater <= 0.4;
    case "rail": return s.dRail <= 1.5;
    case "rain": return s.raining && s.outdoors;
    case "gen": return s.dGen <= 2.6;
    case "heart": return s.moveT >= 8;
    case "still": return s.stillT >= 3;
    case "hurt": return s.hpFrac < 0.3;
    case "shade": return s.dShade <= 0.2;
    case "dark": return s.dark;
    case "ally": return s.allyDist <= 2.4;
    case "crowd": return s.crowd >= 10;
    case "carry": return s.carry >= Math.max(6, s.carryCap * 0.75);
    case "field": return s.dField <= 0;
    case "fire": return s.dFire <= 3;
    case "fed": return s.fedT <= 60;
    case "doornight": return s.night && s.dDoor <= 3.5;
    case "dirt": return s.dDirt <= 0;
    case "inbase": return s.inBase;
    case "broadcast": return s.dBroadcast <= 0;
  }
}

/** 0..1: how close the player is to making the condition true. */
export function condProx(k: CondKey, s: CondState): number {
  if (condTrue(k, s)) return 1;
  const near = (d: number, span: number) => clamp(1 - d / span, 0, 0.92);
  switch (k) {
    case "water": return near(s.dWater, 12);
    case "rail": return near(s.dRail - 1.5, 12);
    case "rain": return s.raining ? 0.6 : 0;
    case "gen": return near(s.dGen - 2.6, 16);
    case "heart": return clamp(s.moveT / 8, 0, 0.9);
    case "still": return clamp(s.stillT / 3, 0, 0.9);
    case "hurt": return clamp((1 - s.hpFrac) / 0.7, 0, 0.9) * 0.9;
    case "shade": return near(s.dShade, 10);
    case "dark": return s.night ? 0.55 : 0;
    case "ally": return near(s.allyDist - 2.4, 12);
    case "crowd": return clamp(s.crowd / 10, 0, 0.9);
    case "carry": return clamp(s.carry / Math.max(6, s.carryCap * 0.75), 0, 0.9);
    case "field": return near(s.dField, 16);
    case "fire": return s.dFire > 1e8 ? 0 : near(s.dFire - 3, 14);
    case "fed": return clamp(1 - (s.fedT - 60) / 90, 0, 0.9);
    case "doornight": return s.night ? near(s.dDoor - 3.5, 14) : 0;
    case "dirt": return near(s.dDirt, 14);
    case "inbase": return near(s.dBase, 20);
    case "broadcast": return near(s.dBroadcast, 14);
  }
}

export type PressKind = "spark" | "evolved" | "discover" | "resonance" | "awaken" | "ult" | "overload" | "locked";
export interface PressResult { kind: PressKind; idx: number; fx: Effect | null; mult: number; line?: string; title?: string; res?: string; star?: boolean }

export class AbilityRuntime {
  found: [boolean, boolean, boolean] = [false, false, false];
  foundAt: (string | null)[] = [null, null, null];
  awake = false; awakeAt: string | null = null;
  heat = 0; lock = 0; ultCd = 0;
  lastForm = -1;
  pressed = false;
  starDay = [-1, -1, -1];
  uses = 0;
  /** last moment a hidden condition was true but not yet discovered */
  nearMiss: (string | null)[] = [null, null, null];
  secretMiss: string | null = null;
  private heldT = [0, 0, 0, 0];

  constructor(public def: AbilityDef) {}

  get foundCount() { return this.found.filter(Boolean).length; }

  glow(s: CondState) {
    let g = 0;
    this.def.conds.forEach((c, i) => { if (!this.found[i]) g = Math.max(g, condProx(c.key, s)); });
    return g;
  }

  tick(dt: number, s: CondState, stamp: string) {
    this.heat = Math.max(0, this.heat - dt * 9);
    this.lock = Math.max(0, this.lock - dt);
    this.ultCd = Math.max(0, this.ultCd - dt);
    this.def.conds.forEach((c, i) => {
      if (this.found[i]) return;
      if (condTrue(c.key, s)) { this.heldT[i] += dt; if (this.heldT[i] > 1.2) this.nearMiss[i] = stamp; } else this.heldT[i] = 0;
    });
    if (!this.awake && this.foundCount === 3) {
      if (condTrue(this.def.secret.key, s)) { this.heldT[3] += dt; if (this.heldT[3] > 1.2) this.secretMiss = stamp; } else this.heldT[3] = 0;
    }
  }

  press(s: CondState, stamp: string, day: number): PressResult {
    if (this.lock > 0) return { kind: "locked", idx: -1, fx: null, mult: 0 };
    this.uses++;
    this.heat += 19;
    if (this.heat >= 100) {
      this.heat = 0; this.lock = 2.2;
      return { kind: "overload", idx: -1, fx: { k: "nova", dmg: 70, r: 7, knock: 6 }, mult: 1 };
    }
    const d = this.def;
    if (this.foundCount === 3 && condTrue(d.secret.key, s)) {
      if (!this.awake) {
        this.awake = true; this.awakeAt = stamp; this.ultCd = 45;
        return { kind: "awaken", idx: 3, fx: d.secret.fx, mult: 1, line: d.secret.line, title: d.secret.title };
      }
      if (this.ultCd <= 0) { this.ultCd = 45; return { kind: "ult", idx: 3, fx: d.secret.fx, mult: 1, title: d.secret.title }; }
    }
    for (let i = 0; i < 3; i++) {
      const c = d.conds[i];
      if (!condTrue(c.key, s)) continue;
      const starOk = !c.star || this.starDay[i] !== day;
      const fx = c.star && !starOk ? stripRes(c.fx) : c.fx;
      if (c.star && starOk) this.starDay[i] = day;
      if (!this.found[i]) {
        this.found[i] = true; this.foundAt[i] = stamp; this.lastForm = i;
        return { kind: "discover", idx: i, fx, mult: 1.3, line: c.line, title: c.form, res: c.res, star: c.star };
      }
      this.lastForm = i;
      return { kind: "resonance", idx: i, fx, mult: 3, title: c.form, res: c.res, star: c.star && starOk };
    }
    if (this.lastForm >= 0) {
      const c = d.conds[this.lastForm];
      return { kind: "evolved", idx: this.lastForm, fx: stripRes(c.fx), mult: 1, title: c.form };
    }
    return { kind: "spark", idx: -1, fx: d.spark, mult: this.pressed ? 1 : 1, line: d.sparkText };
  }
}

/** Remove base-resource parts of an effect (so they can't be farmed). */
function stripRes(fx: Effect): Effect {
  if (fx.k === "res") return { k: "nova", dmg: 16, r: 3.5, knock: 2 };
  if (fx.k === "multi") {
    const list = fx.list.filter((e) => e.k !== "res");
    return list.length ? { k: "multi", list } : { k: "nova", dmg: 16, r: 3.5, knock: 2 };
  }
  return fx;
}
