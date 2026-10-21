// Co-op over WebRTC (PeerJS). The host runs the whole simulation; guests
// send their inputs and render the snapshots the host sends back.
import Peer, { type DataConnection } from "peerjs";

export type Msg =
  | { t: "hello"; name: string }
  | { t: "welcome"; id: number; code: string }
  | { t: "input"; mx: number; mz: number; ab: number; it: number }
  | { t: "major"; id: string }
  | { t: "snap"; s: unknown; bugs: ArrayBuffer }
  | { t: "ev"; e: NetEvent }
  | { t: "lobby"; names: string[] }
  | { t: "bye"; why: string }
  | { t: "ping" };

export type NetEvent =
  | { k: "toast"; text: string; tone: string; ms: number; to?: number }
  | { k: "freeze"; line: string; sub: string; ms: number }
  | { k: "chapter"; small: string; big: string; ms: number }
  | { k: "flash" }
  | { k: "fx"; f: string; a: number[] }
  | { k: "sfx"; name: string; arg?: string }
  | { k: "start"; role: string; to: number; seed: number; nights: number; ability: string }
  | { k: "morning"; day: number; lines: { text: string; hook?: boolean }[] }
  | { k: "report"; to: number; view: unknown }
  | { k: "title" };

const PREFIX = "aftertaps-v1-";
/** drop a peer after this long without any message (closed tabs don't always fire "close") */
const TIMEOUT = 12000;
export const FAIL_HINT = "連不上配對伺服器。如果你是在 Claude 的預覽頁裡開的，請改用 GitHub Pages 的版本。";
const CODE_CHARS = "ACDEFGHJKMNPQRTUVWXY3479";

export const netSupported = () => typeof RTCPeerConnection !== "undefined";

/** Optional custom signaling server: ?peer=host:port (used by tests and self-hosting). */
function peerOpts(): Record<string, unknown> {
  try {
    const v = new URLSearchParams(location.search).get("peer");
    if (!v) return {};
    const [host, port] = v.split(":");
    return { host, port: Number(port) || 9000, path: "/", secure: false, config: { iceServers: [] } };
  } catch { return {}; }
}

export class NetHost {
  peer: Peer;
  code: string;
  conns = new Map<number, DataConnection>();
  names = new Map<number, string>();
  ready = false;
  private nextId = 1;
  private seen = new Map<number, number>();
  private beat: ReturnType<typeof setInterval>;
  onJoin: (id: number, name: string) => void = () => {};
  onLeave: (id: number) => void = () => {};
  onMsg: (id: number, m: Msg) => void = () => {};
  onReady: () => void = () => {};
  onError: (e: string) => void = () => {};

  constructor() {
    this.code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
    this.peer = new Peer(PREFIX + this.code, peerOpts());
    this.peer.on("open", () => { this.ready = true; this.onReady(); });
    setTimeout(() => { if (!this.ready) this.onError("timeout"); }, 15000);
    this.peer.on("error", (e) => this.onError(String((e as { type?: string }).type ?? e)));
    this.peer.on("connection", (c) => {
      const id = this.nextId++;
      c.on("data", (d) => {
        const m = d as Msg;
        this.seen.set(id, Date.now());
        if (m.t === "ping") return;
        if (m.t === "hello") {
          if (this.conns.size >= 3) { c.send({ t: "bye", why: "房間已滿（最多四人）" } satisfies Msg); setTimeout(() => c.close(), 300); return; }
          this.conns.set(id, c); this.names.set(id, m.name.slice(0, 12) || `玩家${id + 1}`);
          c.send({ t: "welcome", id, code: this.code } satisfies Msg);
          this.onJoin(id, this.names.get(id)!);
        } else this.onMsg(id, m);
      });
      c.on("close", () => this.drop(id));
      c.on("error", () => this.drop(id));
    });
    this.beat = setInterval(() => {
      this.broadcast({ t: "ping" });
      const now = Date.now();
      for (const id of [...this.conns.keys()]) if (now - (this.seen.get(id) ?? now) > TIMEOUT) { this.conns.get(id)?.close(); this.drop(id); }
    }, 2000);
  }

  private drop(id: number) {
    if (!this.conns.delete(id)) return;
    this.names.delete(id); this.seen.delete(id);
    this.onLeave(id);
  }

  send(id: number, m: Msg) { const c = this.conns.get(id); if (c?.open) c.send(m); }
  broadcast(m: Msg) { for (const c of this.conns.values()) if (c.open) c.send(m); }
  close() { clearInterval(this.beat); this.broadcast({ t: "bye", why: "主機關閉了房間" }); setTimeout(() => this.peer.destroy(), 200); }
}

export class NetGuest {
  peer: Peer;
  conn: DataConnection | null = null;
  id = -1;
  private seen = Date.now();
  private beat: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  onWelcome: (id: number) => void = () => {};
  onMsg: (m: Msg) => void = () => {};
  onClose: (why: string) => void = () => {};

  constructor(code: string, name: string) {
    this.peer = new Peer(peerOpts());
    this.peer.on("error", (e) => {
      // after joining, signaling hiccups don't matter: the data channel keeps working
      if (this.id >= 0) return;
      this.lost(String((e as { type?: string }).type ?? e) === "peer-unavailable" ? "找不到這個房間代碼。" : FAIL_HINT);
    });
    setTimeout(() => { if (this.id < 0) this.lost("連線逾時。請確認房號，或請主機重開房間。"); }, 15000);
    this.peer.on("open", () => {
      const c = this.peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true });
      this.conn = c;
      c.on("open", () => c.send({ t: "hello", name } satisfies Msg));
      c.on("data", (d) => {
        const m = d as Msg;
        this.seen = Date.now();
        if (m.t === "ping") return;
        if (m.t === "welcome") {
          this.id = m.id; this.onWelcome(m.id);
          this.beat = setInterval(() => {
            this.send({ t: "ping" });
            if (Date.now() - this.seen > TIMEOUT) this.lost("和主機的連線中斷了");
          }, 2000);
        }
        else if (m.t === "bye") this.lost(m.why);
        else this.onMsg(m);
      });
      c.on("close", () => this.lost("和主機的連線中斷了"));
    });
  }

  private lost(why: string) {
    if (this.closed) return;
    this.closed = true;
    if (this.beat) clearInterval(this.beat);
    this.onClose(why);
  }

  send(m: Msg) { if (this.conn?.open) this.conn.send(m); }
  close() { this.closed = true; if (this.beat) clearInterval(this.beat); this.peer.destroy(); }
}
