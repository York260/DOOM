// Cross-loop memory, stored in this browser only.
export interface Meta {
  loop: number;
  facts: Record<string, boolean>;
  note: string;
  runs: number;
  best: string | null;
  seenAbilities: string[];
  nights: 3 | 7;
  muted: boolean;
  wins: number;
  relic: string | null;
}

const KEY = "aftertaps.meta.v1";

export function loadMeta(): Meta {
  const base: Meta = { loop: 1, facts: {}, note: "", runs: 0, best: null, seenAbilities: [], nights: 3, muted: false, wins: 0, relic: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    return { ...base, ...JSON.parse(raw) };
  } catch { return base; }
}

export function saveMeta(m: Meta) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage may be blocked */ }
}

export function resetMeta() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

const RUN_KEY = "aftertaps.run.v1";
export function saveRun(data: unknown) {
  try { localStorage.setItem(RUN_KEY, JSON.stringify(data)); } catch { /* storage may be blocked */ }
}
export function loadRun<T>(): T | null {
  try { const raw = localStorage.getItem(RUN_KEY); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
export function clearRun() {
  try { localStorage.removeItem(RUN_KEY); } catch { /* ignore */ }
}
