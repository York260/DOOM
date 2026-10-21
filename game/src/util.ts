import * as THREE from "three";

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

export function textSprite(text: string, opts: { size?: number; color?: string; bg?: string; scale?: number } = {}) {
  const fs = opts.size ?? 40;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const font = `700 ${fs}px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 24;
  c.width = w; c.height = fs + 20;
  ctx.font = font;
  if (opts.bg !== "none") {
    ctx.fillStyle = opts.bg ?? "rgba(10,15,23,.66)";
    ctx.beginPath(); ctx.roundRect(0, 0, w, c.height, 10); ctx.fill();
  }
  ctx.fillStyle = opts.color ?? "#e6e9ec"; ctx.textBaseline = "middle"; ctx.fillText(text, 12, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  const k = opts.scale ?? 0.032;
  s.scale.set(w * k, c.height * k, 1);
  s.renderOrder = 6;
  return s;
}

export function fmtClock(min: number) {
  const m = Math.floor(min) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h < 10 ? "0" : ""}${h}:${mm < 10 ? "0" : ""}${mm}`;
}

export function fmtDur(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = (n: number) => (n < 10 ? "0" : "") + n;
  return `${p(h)}:${p(m)}:${p(r)}`;
}

export const CN_NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五"];
export const cn = (n: number) => CN_NUM[n] ?? String(n);
