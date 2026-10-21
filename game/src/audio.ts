// Tiny synthesized sound effects (no audio files).
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;
  private last = new Map<string, number>();

  unlock() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    try {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new C();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  }

  setMuted(m: boolean) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.35; }

  private ok(key: string, gap: number) {
    if (!this.ctx || this.muted) return false;
    const t = this.ctx.currentTime, l = this.last.get(key) ?? -1;
    if (t - l < gap) return false;
    this.last.set(key, t);
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0) {
    const c = this.ctx!, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master!); o.start(t); o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, hp = 800) {
    const c = this.ctx!, t = c.currentTime;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.master!); s.start(t);
  }

  hit() { if (this.ok("hit", 0.05)) { this.tone(180, 0.08, "square", 0.08, 0.5); } }
  kill() { if (this.ok("kill", 0.04)) { this.tone(520, 0.07, "triangle", 0.06, 0.4); } }
  hurt() { if (this.ok("hurt", 0.25)) { this.tone(110, 0.2, "sawtooth", 0.12, 0.6); } }
  pickup() { if (this.ok("pick", 0.05)) { this.tone(660, 0.06, "sine", 0.1); this.tone(990, 0.08, "sine", 0.08, 1, 0.05); } }
  ability(kind: string) {
    if (!this.ok("ab", 0.06)) return;
    if (kind === "bolt") { this.noise(0.18, 0.25, 2000); this.tone(900, 0.15, "sawtooth", 0.06, 0.3); }
    else if (kind === "nova" || kind === "pull") { this.tone(160, 0.35, "sine", 0.25, 0.4); this.noise(0.25, 0.12, 300); }
    else if (kind === "field") { this.tone(330, 0.5, "sine", 0.12, 1.5); }
    else if (kind === "blink") { this.tone(700, 0.18, "sine", 0.12, 0.2); }
    else if (kind === "wall") { this.noise(0.2, 0.15, 500); this.tone(240, 0.2, "triangle", 0.1, 0.7); }
    else this.tone(480, 0.15, "triangle", 0.12, 1.4);
  }
  discover() { if (!this.ctx || this.muted) return; [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.5, "triangle", 0.14, 1, i * 0.08)); }
  awaken() { if (!this.ctx || this.muted) return; [262, 392, 523, 784, 1046].forEach((f, i) => this.tone(f, 1.1, "sawtooth", 0.08, 1, i * 0.12)); this.noise(1.2, 0.2, 200); }
  bell() { if (!this.ctx || this.muted) return; [0, 0.9, 1.8].forEach((d) => { this.tone(392, 1.6, "sine", 0.22, 1, d); this.tone(784, 1.2, "sine", 0.06, 1, d); }); }
  alarm() { if (!this.ctx || this.muted) return; for (let i = 0; i < 4; i++) { this.tone(600, 0.45, "square", 0.08, 1.4, i * 0.5); } }
  quake() { if (!this.ctx || this.muted) return; this.tone(48, 2.8, "sine", 0.5, 0.7); this.noise(2.5, 0.25, 60); }
  door() { if (this.ok("door", 0.3)) this.tone(90, 0.25, "square", 0.1, 0.6); }
  ui() { if (this.ok("ui", 0.05)) this.tone(740, 0.05, "sine", 0.08); }
  taps() {
    if (!this.ctx || this.muted) return;
    const N: Record<string, number> = { G: 392, C: 523.25, E: 659.25, g: 783.99 };
    const song: [string, number][] = [["G", .42], ["G", .14], ["C", 1.3], ["G", .42], ["C", .14], ["E", 1.3], ["G", .42], ["C", .14], ["E", .55], ["G", .42], ["C", .14], ["E", .55], ["C", .42], ["E", .14], ["g", 1.4], ["E", .6], ["C", .6], ["G", 1.3], ["G", .42], ["G", .14], ["C", 2.2]];
    let t = 0;
    for (const [n, d] of song) { this.tone(N[n], d, "triangle", 0.12, 1, t); this.tone(N[n], d, "sawtooth", 0.025, 1, t); t += d + 0.06; }
  }
}
