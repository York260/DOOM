// Keyboard + touch input. Touch: a floating joystick on the left half of the
// screen, and two buttons (ability, interact) that the HUD draws.

export class Input {
  moveX = 0;
  moveZ = 0;
  private keys = new Set<string>();
  private abilityQueued = false;
  private interactQueued = false;
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joyVec = { x: 0, y: 0 };
  touchMode = false;
  enabled = true;
  readonly joyBase: HTMLDivElement;
  readonly joyKnob: HTMLDivElement;

  constructor(private root: HTMLElement) {
    this.joyBase = document.createElement("div");
    this.joyBase.className = "joy-base";
    this.joyKnob = document.createElement("div");
    this.joyKnob.className = "joy-knob";
    this.joyBase.appendChild(this.joyKnob);
    root.appendChild(this.joyBase);

    window.addEventListener("keydown", (e) => {
      if (e.repeat && (e.code === "Space" || e.code === "KeyE")) return;
      const k = e.code;
      this.keys.add(k);
      if (!this.enabled) return;
      if (k === "Space" || k === "KeyJ" || k === "KeyK") { this.abilityQueued = true; e.preventDefault(); }
      if (k === "KeyE" || k === "Enter" || k === "KeyF") this.interactQueued = true;
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());

    const zone = document.createElement("div");
    zone.className = "joy-zone";
    root.appendChild(zone);
    zone.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && !this.touchMode) return;
      this.touchMode = true;
      document.body.classList.add("touch");
      this.joyId = e.pointerId;
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.joyVec = { x: 0, y: 0 };
      this.joyBase.style.left = `${e.clientX}px`;
      this.joyBase.style.top = `${e.clientY}px`;
      this.joyBase.classList.add("on");
      this.joyKnob.style.transform = "translate(-50%,-50%)";
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.joyId) return;
      const R = 52;
      let dx = e.clientX - this.joyOrigin.x, dy = e.clientY - this.joyOrigin.y;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
      this.joyVec = { x: dx / R, y: dy / R };
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null; this.joyVec = { x: 0, y: 0 };
      this.joyBase.classList.remove("on");
    };
    zone.addEventListener("pointerup", end);
    zone.addEventListener("pointercancel", end);
    window.addEventListener("touchstart", () => { this.touchMode = true; document.body.classList.add("touch"); }, { passive: true, once: true });
  }

  bindButton(el: HTMLElement, kind: "ability" | "interact") {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      if (kind === "ability") this.abilityQueued = true; else this.interactQueued = true;
    });
  }

  update() {
    let x = 0, z = 0;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) z -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) z += 1;
    if (this.joyId !== null) { x = this.joyVec.x; z = this.joyVec.y; }
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    if (l < 0.12) { x = 0; z = 0; }
    if (!this.enabled) { x = 0; z = 0; }
    this.moveX = x; this.moveZ = z;
  }

  takeAbility() { const v = this.abilityQueued; this.abilityQueued = false; return v; }
  takeInteract() { const v = this.interactQueued; this.interactQueued = false; return v; }
  clear() { this.abilityQueued = false; this.interactQueued = false; }
}
