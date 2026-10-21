// HUD and screens (title, check-in, morning, report, pause).
import type { Input } from "./input";
import { BUILD_CARDS, MAJORS, type BuildCard, type MajorDef, type RoleDef } from "./data";
import type { Meta } from "./meta";

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export interface ArrowMark { x: number; y: number; ang: number; label: string; tone: "" | "red" | "jade" | "steel" }

export interface ReportView {
  rank: string; letter: string; score: number; title: string; who: string;
  scores: { k: string; v: number; max: number }[];
  reveal: string; missed: string | null;
  events: { t: string; text: string }[];
  quotes: { text: string; who: string }[];
  hive: string; hiveMeta: string;
  epilogue: string[]; hook: string;
  win: boolean; loop: number;
}

export class UI {
  root: HTMLElement;
  private hud: HTMLElement;
  private dayEl: HTMLElement; private timeEl: HTMLElement; private phaseEl: HTMLElement; private cdEl: HTMLElement;
  private hpEl: HTMLElement; private objEl: HTMLElement; private suspEl: HTMLElement; private suspBar: HTMLElement;
  private resEls: Record<string, HTMLElement> = {};
  private packEl: HTMLElement;
  private gearEl: HTMLElement;
  private toastsEl: HTMLElement;
  private bossEl: HTMLElement; private bossBar: HTMLElement; private bossName: HTMLElement;
  private freezeEl: HTMLElement; private chapterEl: HTMLElement; private flashEl: HTMLElement; private vigEl: HTMLElement;
  private arrowsEl: HTMLElement; private arrowPool: HTMLElement[] = [];
  abBtn: HTMLButtonElement; itBtn: HTMLButtonElement;
  private abPips: HTMLElement[] = []; private heatCircle: SVGCircleElement;
  private modalEl: HTMLElement;
  private last = new Map<string, string>();
  onPause: () => void = () => {};

  constructor(root: HTMLElement, input: Input) {
    this.root = root;
    this.hud = h("div", "hud");
    root.appendChild(this.hud);

    const tl = h("div", "tl");
    const clock = h("div", "clock");
    this.dayEl = h("span", "day"); this.timeEl = h("span", "time"); this.phaseEl = h("span", "chip");
    clock.append(this.dayEl, this.timeEl, this.phaseEl);
    this.cdEl = h("div", "countdown"); this.cdEl.hidden = true;
    const hp = h("div", "hpbar"); this.hpEl = h("i"); hp.appendChild(this.hpEl);
    this.objEl = h("div", "objective"); this.objEl.hidden = true;
    this.suspEl = h("div", "susp", "可疑度 "); const sb = h("div", "bar"); this.suspBar = h("i"); sb.appendChild(this.suspBar); this.suspEl.appendChild(sb); this.suspEl.hidden = true;
    tl.append(clock, this.cdEl, hp, this.objEl, this.suspEl);
    this.hud.appendChild(tl);

    const tr = h("div", "tr");
    const top = h("div", "row"); top.style.gap = "6px"; top.style.alignItems = "flex-start";
    const res = h("div", "res");
    for (const [k, label] of [["food", "糧"], ["power", "電"], ["mat", "材"], ["people", "人"]] as const) {
      const s = h("span", "", `<b>${label}</b><em>0</em>`); this.resEls[k] = s; res.appendChild(s);
    }
    const pause = h("button", "pausebtn", "‖") as HTMLButtonElement; pause.type = "button"; pause.setAttribute("aria-label", "暫停");
    pause.addEventListener("click", () => this.onPause());
    top.append(res, pause);
    this.packEl = h("div", "pack");
    this.gearEl = h("div", "pack gear");
    tr.append(top, this.packEl, this.gearEl);
    this.hud.appendChild(tr);

    this.toastsEl = h("div", "toasts"); this.hud.appendChild(this.toastsEl);
    this.bossEl = h("div", "bossbar"); this.bossName = h("div"); const bb = h("div", "bar"); this.bossBar = h("i"); bb.appendChild(this.bossBar); this.bossEl.append(this.bossName, bb); this.bossEl.hidden = true; this.hud.appendChild(this.bossEl);
    this.arrowsEl = h("div", "arrows"); this.hud.appendChild(this.arrowsEl);
    this.vigEl = h("div", "vignette"); this.hud.appendChild(this.vigEl);
    this.freezeEl = h("div", "freeze"); this.freezeEl.appendChild(h("div")); this.hud.appendChild(this.freezeEl);
    this.chapterEl = h("div", "chapter", "<small></small><strong></strong>"); this.hud.appendChild(this.chapterEl);
    this.flashEl = h("div", "flash"); this.hud.appendChild(this.flashEl);

    const ctr = h("div", "controls");
    this.itBtn = h("button", "btn-it off", "互動<span class=keyhint>E</span>") as HTMLButtonElement; this.itBtn.type = "button";
    this.abBtn = h("button", "btn-ab", `？<span class="pips"><i></i><i></i><i></i><i class="s"></i></span>`) as HTMLButtonElement; this.abBtn.type = "button";
    this.abBtn.setAttribute("aria-label", "異能（空白鍵）");
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg"); svg.setAttribute("viewBox", "0 0 104 104");
    this.heatCircle = document.createElementNS(svgNS, "circle");
    this.heatCircle.setAttribute("cx", "52"); this.heatCircle.setAttribute("cy", "52"); this.heatCircle.setAttribute("r", "49");
    this.heatCircle.setAttribute("stroke-dasharray", "308"); this.heatCircle.setAttribute("stroke-dashoffset", "308");
    svg.appendChild(this.heatCircle); this.abBtn.appendChild(svg);
    this.abPips = Array.from(this.abBtn.querySelectorAll(".pips i")) as HTMLElement[];
    ctr.append(this.itBtn, this.abBtn);
    this.hud.appendChild(ctr);
    input.bindButton(this.abBtn, "ability");
    input.bindButton(this.itBtn, "interact");
    const hint = h("div", "deskhint", "移動 WASD／方向鍵　互動 E　異能 空白鍵　暫停 Esc");
    this.hud.appendChild(hint);

    this.modalEl = h("div", "modal"); this.modalEl.hidden = true; root.appendChild(this.modalEl);
  }

  private set(key: string, val: string, fn: () => void) { if (this.last.get(key) === val) return; this.last.set(key, val); fn(); }

  showHud(on: boolean) { this.hud.hidden = !on; }

  setClock(day: string, time: string, phase: string, tone: "" | "warm" | "night" | "red") {
    this.set("day", day, () => (this.dayEl.textContent = day));
    this.set("time", time, () => (this.timeEl.textContent = time));
    this.set("phase", phase + tone, () => { this.phaseEl.textContent = phase; this.phaseEl.className = "chip " + tone; });
  }
  setCountdown(t: string | null) {
    this.set("cd", t ?? "", () => { this.cdEl.hidden = !t; if (t) this.cdEl.textContent = "距離交融波 " + t; });
  }
  setHp(frac: number) { this.set("hp", frac.toFixed(3), () => (this.hpEl.style.width = `${Math.max(0, frac) * 100}%`)); }
  setObjective(t: string | null) { this.set("obj", t ?? "", () => { this.objEl.hidden = !t; if (t) this.objEl.textContent = t; }); }
  setSuspicion(v: number | null) { this.set("susp", v === null ? "" : v.toFixed(2), () => { this.suspEl.hidden = v === null; if (v !== null) this.suspBar.style.width = `${Math.min(1, v) * 100}%`; }); }
  setRes(r: { food: number; power: number; mat: number; people: number }, lowFood: boolean, carried: number, cap: number) {
    for (const k of ["food", "power", "mat", "people"] as const) {
      const v = String(Math.floor(r[k]));
      this.set("r" + k, v + (k === "food" && lowFood ? "!" : ""), () => { this.resEls[k].querySelector("em")!.textContent = v; this.resEls[k].classList.toggle("low", k === "food" && lowFood); });
    }
    this.set("pack", `${carried}/${cap}`, () => (this.packEl.textContent = `背包 ${carried}/${cap}`));
  }
  setGear(text: string) { this.set("gear", text, () => (this.gearEl.textContent = text)); }
  setAbility(glow: number, pips: boolean[], heat: number, face: string, color: string, locked: boolean) {
    this.abBtn.style.setProperty("--g", glow.toFixed(2));
    this.abBtn.classList.toggle("hot", glow >= 0.99);
    this.abBtn.classList.toggle("locked", locked);
    this.set("abc", color, () => this.abBtn.style.setProperty("--ab", color));
    this.set("abf", face, () => { this.abBtn.firstChild!.textContent = face; });
    pips.forEach((p, i) => this.abPips[i].classList.toggle("on", p));
    this.heatCircle.setAttribute("stroke-dashoffset", String(308 * (1 - Math.min(1, heat / 100))));
  }
  setInteract(label: string | null) {
    this.set("it", label ?? "", () => {
      this.itBtn.classList.toggle("off", !label);
      this.itBtn.innerHTML = `${esc(label ?? "互動")}<span class=keyhint>E</span>`;
    });
  }
  setBoss(frac: number | null, name = "") {
    this.bossEl.hidden = frac === null;
    if (frac !== null) { this.bossName.textContent = name; this.bossBar.style.width = `${Math.max(0, frac) * 100}%`; }
  }
  setHurt(on: boolean) { this.vigEl.classList.toggle("hurt", on); }

  toast(text: string, tone: "" | "warm" | "red" | "jade" | "hand" = "", ms = 3200) {
    const t = h("div", "toast " + tone); t.textContent = text;
    this.toastsEl.appendChild(t);
    while (this.toastsEl.children.length > 2) this.toastsEl.firstChild!.remove();
    setTimeout(() => t.remove(), ms);
  }
  freeze(line: string, sub: string, ms = 2200) {
    const d = this.freezeEl.firstChild as HTMLElement;
    d.innerHTML = `${esc(line)}<small>${esc(sub)}</small>`;
    this.freezeEl.classList.add("show");
    clearTimeout((this.freezeEl as unknown as { _t: number })._t);
    (this.freezeEl as unknown as { _t: number })._t = window.setTimeout(() => this.freezeEl.classList.remove("show"), ms);
  }
  chapter(small: string, big: string, ms = 2600) {
    (this.chapterEl.firstChild as HTMLElement).textContent = small;
    (this.chapterEl.lastChild as HTMLElement).textContent = big;
    this.chapterEl.classList.add("show");
    clearTimeout((this.chapterEl as unknown as { _t: number })._t);
    (this.chapterEl as unknown as { _t: number })._t = window.setTimeout(() => this.chapterEl.classList.remove("show"), ms);
  }
  flash() {
    this.flashEl.classList.add("on");
    requestAnimationFrame(() => requestAnimationFrame(() => this.flashEl.classList.remove("on")));
  }
  setArrows(list: ArrowMark[]) {
    while (this.arrowPool.length < list.length) {
      const a = h("div", "arrow", "<i></i><b></b>"); this.arrowsEl.appendChild(a); this.arrowPool.push(a);
    }
    this.arrowPool.forEach((a, i) => {
      const m = list[i];
      if (!m) { a.hidden = true; return; }
      a.hidden = false;
      a.style.left = `${m.x}px`; a.style.top = `${m.y}px`;
      a.className = "arrow " + m.tone;
      (a.firstChild as HTMLElement).style.setProperty("--a", `${m.ang}rad`);
      const b = a.lastChild as HTMLElement; if (b.textContent !== m.label) b.textContent = m.label;
    });
  }

  // ---------- screens ----------
  get modalOpen() { return !this.modalEl.hidden; }
  closeModal() { this.modalEl.hidden = true; this.modalEl.innerHTML = ""; }
  private open(inner: HTMLElement) { this.modalEl.innerHTML = ""; this.modalEl.appendChild(inner); this.modalEl.hidden = false; this.modalEl.scrollTop = 0; }

  showTitle(meta: Meta, onStart: (nights: 3 | 7) => void, onMute: (m: boolean) => void, onReset: () => void, cont: { label: string; go: () => void } | null = null, onCoop: (() => void) | null = null) {
    const p = h("div", "panel");
    let nights = meta.nights;
    const facts = Object.keys(meta.facts).length;
    p.innerHTML = `
      <div class="title-screen">
        <div class="vt">熄燈號之後</div>
        <div class="copy">
          <div class="logo-en">AFTER TAPS</div>
          <p class="tagline"><span>你只是來警察大學</span><span>當演習志工的普通大學生。</span><span>中午十二點，天會裂開。</span></p>
          <p class="muted">${meta.loop > 1 ? `第 ${meta.loop} 輪。你記得 ${facts} 件事。` : "第一輪。你什麼都不知道。"}</p>
          <div class="row"><span class="muted" style="font-size:13px">模式</span><div class="seg" id="mode"><button type="button" data-n="3">三夜（約 25 分鐘）</button><button type="button" data-n="7">七夜</button></div></div>
          ${cont ? `<button class="btn primary" id="cont" type="button" style="align-self:flex-start">${esc(cont.label)}</button>` : ""}
          <div class="row"><button class="btn ${cont ? "" : "primary"}" id="go" type="button">${cont ? "重新報到" : "報到"}</button>${onCoop ? `<button class="btn" id="coop" type="button">和朋友連線</button>` : ""}<button class="btn small" id="mute" type="button"></button></div>
          <p class="help"><b>手機</b>：左半邊拖曳移動，右下角兩顆按鈕：互動、異能。<br><b>電腦</b>：WASD／方向鍵移動，E 互動，空白鍵異能。<br>武器會自動攻擊。異能鍵越亮，代表你越接近一個隱藏條件。</p>
          ${meta.loop > 1 || meta.runs > 0 ? `<button class="btn small" id="reset" type="button" style="align-self:flex-start">清除所有記憶</button>` : ""}
        </div>
      </div>`;
    const seg = p.querySelector("#mode")!;
    const paint = () => seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(Number((b as HTMLElement).dataset.n) === nights)));
    paint();
    seg.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("button"); if (!b) return; nights = Number(b.dataset.n) as 3 | 7; paint(); });
    const mute = p.querySelector("#mute") as HTMLButtonElement;
    const paintMute = () => (mute.textContent = meta.muted ? "音效：關" : "音效：開");
    paintMute();
    mute.addEventListener("click", () => { meta.muted = !meta.muted; paintMute(); onMute(meta.muted); });
    p.querySelector("#go")!.addEventListener("click", () => onStart(nights));
    p.querySelector("#cont")?.addEventListener("click", () => { this.closeModal(); cont!.go(); });
    p.querySelector("#coop")?.addEventListener("click", () => onCoop?.());
    p.querySelector("#reset")?.addEventListener("click", (e) => {
      const b = e.currentTarget as HTMLButtonElement;
      if (b.dataset.armed) { onReset(); } else { b.dataset.armed = "1"; b.textContent = "再按一次確認清除"; }
    });
    this.open(p);
  }

  showCheckin(role: RoleDef, facts: string[], note: string, onPick: (major: MajorDef) => void) {
    const p = h("div", "panel");
    let picked: MajorDef = MAJORS[0];
    p.innerHTML = `
      <span class="eyebrow">07:30　報到</span>
      <h2>你抽到的演習角色卡</h2>
      <div class="rolecard" style="--tag:${role.css}"><div class="top"></div><div class="in">
        <span class="tag">演習角色卡</span><h3>${esc(role.tag)}</h3>
        <p class="hand">${esc(role.line)}</p>
        <p class="muted" style="font-size:14px">開局道具：${esc(role.item)}。${esc(role.perk)}</p>
      </div></div>
      ${facts.length ? `<div class="memo"><span class="eyebrow">生存日誌　記憶頁</span><ul>${facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>` : ""}
      ${note ? `<p class="muted">校車座椅背面，有人用原子筆寫了一行字：<span style="font-family:var(--hand);color:var(--amber);font-size:17px">「${esc(note)}」</span></p>` : ""}
      <h3>你的主修</h3>
      <div class="majors">${MAJORS.map((m, i) => `<button type="button" data-i="${i}"><b>${m.name}</b><span>${m.perk}</span></button>`).join("")}</div>
      <button class="btn primary" id="go" type="button">開始演習</button>`;
    const ms = p.querySelector(".majors")!;
    const paint = () => ms.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(MAJORS[Number((b as HTMLElement).dataset.i)] === picked)));
    paint();
    ms.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("button"); if (!b) return; picked = MAJORS[Number(b.dataset.i)]; paint(); });
    p.querySelector("#go")!.addEventListener("click", () => { this.closeModal(); onPick(picked); });
    this.open(p);
  }

  showMorning(day: number, lines: { text: string; hook?: boolean }[], res: { food: number; power: number; mat: number; people: number }, need: number, offer: BuildCard[], costMul: number, onDone: (cards: BuildCard[], matSpent: number) => void) {
    const p = h("div", "panel");
    const chosen = new Set<string>();
    let freeUsed: string | null = null;
    p.innerHTML = `
      <span class="eyebrow">第 ${day} 天　06:00</span>
      <h2>生存日誌</h2>
      <div class="diary">${lines.map((l) => `<p class="${l.hook ? "hook" : ""}">${esc(l.text)}</p>`).join("")}</div>
      <div class="stats">
        <div class="stat ${res.food < need ? "low" : ""}"><small>糧</small><b>${res.food}</b><i>今天要吃 ${need}</i></div>
        <div class="stat"><small>電</small><b>${res.power}</b></div>
        <div class="stat"><small>材</small><b id="mat">${res.mat}</b></div>
        <div class="stat"><small>人</small><b>${res.people}</b></div>
      </div>
      <h3>今天的建設</h3>
      <p class="muted" style="font-size:14px">免費選一張。其他的可以花「材」來蓋。</p>
      <div class="cards">${offer.map((c) => `<button type="button" class="card" data-id="${c.id}"><b>${c.name}</b><em></em><span>${c.desc}</span></button>`).join("")}</div>
      <button class="btn primary" id="go" type="button">出發</button>`;
    const matEl = p.querySelector("#mat")!;
    const cost = (c: BuildCard) => Math.ceil(c.cost * costMul);
    const spent = () => offer.filter((c) => chosen.has(c.id) && c.id !== freeUsed).reduce((s, c) => s + cost(c), 0);
    const paint = () => {
      const left = res.mat - spent();
      matEl.textContent = String(left);
      p.querySelectorAll(".card").forEach((b) => {
        const c = offer.find((o) => o.id === (b as HTMLElement).dataset.id)!;
        const on = chosen.has(c.id);
        b.setAttribute("aria-pressed", String(on));
        (b.querySelector("em") as HTMLElement).textContent = on ? (c.id === freeUsed ? "免費" : `−${cost(c)} 材`) : freeUsed ? `${cost(c)} 材` : "免費";
        (b as HTMLButtonElement).disabled = !on && !!freeUsed && cost(c) > left;
      });
    };
    paint();
    p.querySelector(".cards")!.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest(".card") as HTMLButtonElement | null; if (!b || b.disabled) return;
      const id = b.dataset.id!;
      if (chosen.has(id)) { chosen.delete(id); if (freeUsed === id) { freeUsed = [...chosen][0] ?? null; } }
      else { chosen.add(id); if (!freeUsed) freeUsed = id; }
      paint();
    });
    p.querySelector("#go")!.addEventListener("click", () => {
      this.closeModal();
      onDone(offer.filter((c) => chosen.has(c.id)), spent());
    });
    this.open(p);
  }

  showPause(onResume: () => void, isMuted: () => boolean, toggleMute: () => void, onQuit: () => void) {
    const p = h("div", "panel");
    p.innerHTML = `<span class="eyebrow">暫停</span><h2>喘口氣</h2>
      <div class="row"><button class="btn primary" id="r" type="button">繼續</button><button class="btn" id="m" type="button"></button><button class="btn" id="q" type="button">放棄這一輪</button></div>
      <p class="help">異能鍵外圈的光越亮，代表你越接近一個隱藏條件。三顆小燈是三個條件；虛線那顆是祕密。<br>連續按太快會過熱暴走。<br>據點的門被打破，蟲就會衝向避難室。避難室倒了，這一輪就結束。</p>`;
    const m = p.querySelector("#m") as HTMLButtonElement;
    const paint = () => (m.textContent = isMuted() ? "音效：關" : "音效：開");
    paint();
    m.addEventListener("click", () => { toggleMute(); paint(); });
    p.querySelector("#r")!.addEventListener("click", () => { this.closeModal(); onResume(); });
    p.querySelector("#q")!.addEventListener("click", (e) => {
      const b = e.currentTarget as HTMLButtonElement;
      if (b.dataset.armed) { this.closeModal(); onQuit(); } else { b.dataset.armed = "1"; b.textContent = "再按一次確認"; }
    });
    this.open(p);
  }

  showLobby(supported: boolean, lastName: string, onHost: (name: string) => void, onJoin: (name: string, code: string) => void, onBack: () => void) {
    const p = h("div", "panel");
    p.innerHTML = `
      <span class="eyebrow">連線合作　1–4 人</span>
      <h2>和朋友一起報名</h2>
      ${supported ? "" : `<p class="missed">這個環境不支援連線（例如在 Claude 的預覽裡）。請用 GitHub Pages 的版本開啟。</p>`}
      <label class="muted" for="nm" style="font-size:13px">你的名字</label>
      <input id="nm" class="field" maxlength="12" value="${esc(lastName)}" placeholder="例如：凌宇">
      <div class="row"><button class="btn primary" id="host" type="button" ${supported ? "" : "disabled"}>開一個房間</button></div>
      <div class="sec"><small>加入朋友的房間</small>
        <div class="row"><input id="code" class="field" maxlength="4" placeholder="四碼房號" style="max-width:9em;text-transform:uppercase"><button class="btn" id="join" type="button" ${supported ? "" : "disabled"}>加入</button></div>
        <p class="muted" id="msg" style="font-size:13px"></p>
      </div>
      <p class="help">主機負責跑整個遊戲，其他人的畫面跟著主機。每個人的異能都不一樣，連自己都不知道。<br>連線用的是瀏覽器之間的直接連線（WebRTC），房號由公用的配對伺服器轉介。</p>
      <button class="btn small" id="back" type="button" style="align-self:flex-start">返回</button>`;
    const nm = () => ((p.querySelector("#nm") as HTMLInputElement).value.trim() || "志工");
    p.querySelector("#host")!.addEventListener("click", () => onHost(nm()));
    p.querySelector("#join")!.addEventListener("click", () => {
      const code = (p.querySelector("#code") as HTMLInputElement).value.trim().toUpperCase();
      if (code.length !== 4) { (p.querySelector("#msg") as HTMLElement).textContent = "房號是四個字元。"; return; }
      (p.querySelector("#msg") as HTMLElement).textContent = "連線中……";
      onJoin(nm(), code);
    });
    p.querySelector("#back")!.addEventListener("click", () => onBack());
    this.open(p);
    return { setMsg: (t: string) => { const m = p.querySelector("#msg"); if (m) m.textContent = t; } };
  }

  showHostRoom(code: string, onStart: (nights: 3 | 7) => void, onClose: () => void) {
    const p = h("div", "panel");
    let nights: 3 | 7 = 3;
    p.innerHTML = `
      <span class="eyebrow">你的房間</span>
      <h2 style="font-family:var(--mono);font-size:44px;letter-spacing:.2em;color:var(--amber)">${esc(code)}</h2>
      <p class="muted">把這四個字告訴朋友，請他們按「和朋友連線」→ 輸入房號 → 加入。</p>
      <div class="sec"><small>已經在房間裡的人</small><ul class="events" id="list"></ul></div>
      <div class="row"><span class="muted" style="font-size:13px">模式</span><div class="seg" id="mode"><button type="button" data-n="3">三夜</button><button type="button" data-n="7">七夜</button></div></div>
      <div class="row"><button class="btn primary" id="go" type="button">大家一起報到</button><button class="btn small" id="close" type="button">關閉房間</button></div>`;
    const seg = p.querySelector("#mode")!;
    const paint = () => seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(Number((b as HTMLElement).dataset.n) === nights)));
    paint();
    seg.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("button"); if (!b) return; nights = Number(b.dataset.n) as 3 | 7; paint(); });
    p.querySelector("#go")!.addEventListener("click", () => onStart(nights));
    p.querySelector("#close")!.addEventListener("click", () => onClose());
    this.open(p);
    return { setNames: (names: string[]) => { const l = p.querySelector("#list"); if (l) l.innerHTML = names.map((n, i) => `<li><span>${i === 0 ? "主機" : `玩家 ${i + 1}`}</span>${esc(n)}</li>`).join(""); } };
  }

  showWait(title: string, text: string, onLeave: () => void) {
    const p = h("div", "panel");
    p.innerHTML = `<span class="eyebrow">連線中</span><h2>${esc(title)}</h2><p class="muted">${esc(text)}</p><button class="btn small" id="leave" type="button" style="align-self:flex-start">離開房間</button>`;
    p.querySelector("#leave")!.addEventListener("click", () => onLeave());
    this.open(p);
  }

  showMorningView(day: number, lines: { text: string; hook?: boolean }[]) {
    const p = h("div", "panel");
    p.innerHTML = `<span class="eyebrow">第 ${day} 天　06:00</span><h2>生存日誌</h2>
      <div class="diary">${lines.map((l) => `<p class="${l.hook ? "hook" : ""}">${esc(l.text)}</p>`).join("")}</div>
      <p class="muted">主機正在選擇今天的建設……</p>`;
    this.open(p);
  }

  showReport(r: ReportView, onRebirth: (note: string) => void) {
    const p = h("div", "panel");
    p.innerHTML = `
      <span class="eyebrow">第 ${r.loop} 輪　結算</span>
      <h2>${r.win ? "你們撐過來了" : "這一輪結束了"}</h2>
      <div class="medal-row"><div class="medal"><b>${esc(r.rank)}</b><span>${r.letter}・${r.score}</span></div>
        <div><small class="muted">${esc(r.who)}</small><h3 style="font-size:22px;font-weight:900;margin-top:4px">${esc(r.title)}</h3></div></div>
      <div class="scorebars">${r.scores.map((s) => `<div><span>${s.k}</span><span class="bar"><i style="width:${(s.v / s.max) * 100}%"></i></span><em>${s.v}/${s.max}</em></div>`).join("")}</div>
      <div class="sec"><small>異能揭曉</small><div class="reveal">${r.reveal}</div>${r.missed ? `<p class="missed">${esc(r.missed)}</p>` : ""}</div>
      ${r.events.length ? `<div class="sec"><small>重要事蹟</small><ul class="events">${r.events.map((e) => `<li><span>${esc(e.t)}</span>${esc(e.text)}</li>`).join("")}</ul></div>` : ""}
      ${r.quotes.length ? `<div class="sec"><small>倖存者的評價</small><div class="quotes">${r.quotes.map((q) => `<div><blockquote>${esc(q.text)}</blockquote><small>${esc(q.who)}</small></div>`).join("")}</div></div>` : ""}
      <div class="sec"><small>蟲族的評價</small><p class="hive">${esc(r.hive)}</p><p class="muted" style="font-family:var(--mono);font-size:12px">${esc(r.hiveMeta)}</p></div>
      <div class="sec"><small>後續</small><div class="epi">${r.epilogue.map((e) => `<p>${esc(e)}</p>`).join("")}<p class="hook">${esc(r.hook)}</p></div></div>
      <div class="sec"><small>給下一輪的記憶</small><textarea id="note" maxlength="30" placeholder="寫一句話給下一輪的自己（30 字以內）"></textarea></div>
      <button class="btn primary" id="go" type="button">重生</button>`;
    p.querySelector("#go")!.addEventListener("click", () => {
      const note = (p.querySelector("#note") as HTMLTextAreaElement).value.trim().slice(0, 30);
      this.closeModal(); onRebirth(note);
    });
    this.open(p);
  }
}

export const ALL_CARDS = BUILD_CARDS;
