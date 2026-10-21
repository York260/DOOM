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
  | { t: "bye"; why: string };

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
const CODE_CHARS = "ACDEFGHJKMNPQRTUVWXY3479";

export const netSupported = () => typeof RTCPeerConnection !== "undefined";

export class NetHost {
  peer: Peer;
  code: string;
  conns = new Map<number, DataConnection>();
  names = new Map<number, string>();
  private nextId = 1;
  onJoin: (id: number, name: string) => void = () => {};
  onLeave: (id: number) => void = () => {};
  onMsg: (id: number, m: Msg) => void = () => {};
  onReady: () => void = () => {};
  onError: (e: string) => void = () => {};

  constructor() {
    this.code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
    this.peer = new Peer(PREFIX + this.code);
    this.peer.on("open", () => this.onReady());
    this.peer.on("error", (e) => this.onError(String((e as { type?: string }).type ?? e)));
    this.peer.on("connection", (c) => {
      const id = this.nextId++;
      c.on("data", (d) => {
        const m = d as Msg;
        if (m.t === "hello") {
          if (this.conns.size >= 3) { c.send({ t: "bye", why: "房間已滿（最多四人）" } satisfies Msg); setTimeout(() => c.close(), 300); return; }
          this.conns.set(id, c); this.names.set(id, m.name.slice(0, 12) || `玩家${id + 1}`);
          c.send({ t: "welcome", id, code: this.code } satisfies Msg);
          this.onJoin(id, this.names.get(id)!);
        } else this.onMsg(id, m);
      });
      c.on("close", () => { if (this.conns.delete(id)) { this.onLeave(id); this.names.delete(id); } });
      c.on("error", () => { if (this.conns.delete(id)) { this.onLeave(id); this.names.delete(id); } });
    });
  }

  send(id: number, m: Msg) { const c = this.conns.get(id); if (c?.open) c.send(m); }
  broadcast(m: Msg) { for (const c of this.conns.values()) if (c.open) c.send(m); }
  close() { this.broadcast({ t: "bye", why: "主機關閉了房間" }); setTimeout(() => this.peer.destroy(), 200); }
}

export class NetGuest {
  peer: Peer;
  conn: DataConnection | null = null;
  id = -1;
  onWelcome: (id: number) => void = () => {};
  onMsg: (m: Msg) => void = () => {};
  onClose: (why: string) => void = () => {};

  constructor(code: string, name: string) {
    this.peer = new Peer();
    this.peer.on("error", (e) => this.onClose(String((e as { type?: string }).type ?? e) === "peer-unavailable" ? "找不到這個房間代碼" : "連線失敗"));
    this.peer.on("open", () => {
      const c = this.peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true });
      this.conn = c;
      c.on("open", () => c.send({ t: "hello", name } satisfies Msg));
      c.on("data", (d) => {
        const m = d as Msg;
        if (m.t === "welcome") { this.id = m.id; this.onWelcome(m.id); }
        else if (m.t === "bye") this.onClose(m.why);
        else this.onMsg(m);
      });
      c.on("close", () => this.onClose("和主機的連線中斷了"));
    });
  }

  send(m: Msg) { if (this.conn?.open) this.conn.send(m); }
  close() { this.peer.destroy(); }
}
