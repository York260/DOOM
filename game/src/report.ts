// Builds the end-of-loop report from what happened in the run.
import { COND_LABEL, EPILOGUES, HIVE_LINES, RANKS, type AbilityDef } from "./data";
import type { AbilityRuntime } from "./ability";
import type { ReportView } from "./ui";
import { esc } from "./ui";
import type { DmgSource } from "./swarm";

export interface RunStats {
  win: boolean; loop: number; nightsTotal: number; nightsSurvived: number;
  rescued: number; lost: number; seen: number;
  kills: Record<DmgSource, number>; killsTotal: number; bossKilled: boolean;
  roleTag: string; roleId: string; majorName: string;
  events: { t: string; text: string; w: number }[];
  quotes: { text: string; who: string }[];
  takenVoices: string[];
  stillKills: number;
  returnedForOthers: number;
}

export function buildReport(s: RunStats, ab: AbilityRuntime): ReportView {
  const d: AbilityDef = ab.def;
  const survive = Math.round((s.win ? 1 : s.nightsSurvived / s.nightsTotal) * 20);
  const protect = Math.min(25, Math.round((s.rescued * 25) / Math.max(5, s.seen)));
  const discover = Math.min(20, ab.foundCount * 5 + (ab.awake ? 5 : 0));
  const victory = Math.min(15, (s.bossKilled ? 10 : 0) + Math.min(5, Math.floor(s.killsTotal / 40)));
  const conduct = Math.max(0, 10 - s.lost * 2);
  const drama = Math.min(10, s.events.filter((e) => e.w >= 2).length * 2);
  const score = survive + protect + discover + victory + conduct + drama;
  const rank = RANKS.find((r) => score >= r.min)!;

  const titleRules: [boolean, string][] = [
    [ab.awake, `${d.secret.title.replace(/^蒼淵/, "")}選中的人`],
    [s.win && ab.foundCount === 0, "什麼都不知道，但活下來了"],
    [s.rescued >= 6, "背著所有人回來的志工"],
    [s.roleId === "black" && s.stillKills > 0, "躺著撐過第一夜的人"],
    [s.kills.ability > s.kills.melee * 1.5 && s.kills.ability > 20, `讓「${d.src}」說話的人`],
    [s.returnedForOthers >= 3, "一直回頭的人"],
    [ab.foundCount >= 2, `${d.conds[ab.found.findIndex(Boolean)]?.form ?? d.name}的志工`],
    [!s.win && s.nightsSurvived === 0, "第一天就倒下的志工"],
    [true, "拿著拖把的大學生"],
  ];
  const title = titleRules.find(([ok]) => ok)![1];

  const lines: string[] = [`<span>${esc(d.name)}（${esc(d.src)}）　真名：${ab.awake ? esc(d.secret.title) : "？？？"}</span>`];
  d.conds.forEach((c, i) => {
    const ok = ab.found[i];
    lines.push(`<span class="${ok ? "y" : "n"}">${ok ? "✔" : "✘"} ${esc(COND_LABEL[c.key])}　→ ${esc(c.form)}${c.star ? "　★據點" : ""}${ok && ab.foundAt[i] ? `（${esc(ab.foundAt[i]!)}）` : ""}</span>`);
  });
  lines.push(`<span class="${ab.awake ? "y" : "n"}">${ab.awake ? "✔" : "✘"} 祕密：${esc(COND_LABEL[d.secret.key])}　→ 覺醒</span>`);
  lines.push(`使用 ${ab.uses} 次`);
  if (!ab.awake && ab.foundCount === 3) lines.push(`<span class="n">謎語：${esc(d.secret.riddle)}</span>`);

  let missed: string | null = null;
  const mi = d.conds.findIndex((_, i) => !ab.found[i] && ab.nearMiss[i]);
  if (mi >= 0) missed = `你其實差一點：${ab.nearMiss[mi]}，你就${COND_LABEL[d.conds[mi].key]}。你沒有按下異能鍵。`;
  else if (!ab.awake && ab.secretMiss) missed = `你其實差一點：${ab.secretMiss}，你正好${COND_LABEL[d.secret.key]}。那是祕密條件。`;

  const events = s.events.slice().sort((a, b) => b.w - a.w).slice(0, 7).sort((a, b) => (a.t < b.t ? -1 : 1)).map((e) => ({ t: e.t, text: e.text }));

  const top = (Object.keys(s.kills) as DmgSource[]).sort((a, b) => s.kills[b] - s.kills[a])[0];
  const hive: string[] = [`樣本 ${String(s.loop).padStart(2, "0")}-${s.roleTag.slice(0, 1)}。溫血碎片。`];
  if (s.roleId === "black" && s.stillKills > 0) hive.push(HIVE_LINES.still);
  else if (top === "ability") hive.push(HIVE_LINES.ability);
  else hive.push(HIVE_LINES.melee);
  if (s.returnedForOthers >= 2) hive.push(HIVE_LINES.rescue);
  hive.push(HIVE_LINES.base);
  for (const v of s.takenVoices.slice(0, 1)) hive.push(`我們之中有一個新的聲音。「……${v}……」我們不懂這個聲音。我們會一直重複它，直到懂為止。`);
  hive.push(s.win ? HIVE_LINES.win : HIVE_LINES.lose);
  const threat = s.killsTotal > 250 ? "必須學習" : s.killsTotal > 120 ? "高" : s.killsTotal > 50 ? "中" : "低";
  const edible = s.rescued >= 4 ? "高（太在乎別人）" : s.kills.melee > 80 ? "低（太吵）" : "中";
  const mimic = s.returnedForOthers >= 2 ? "回頭" : ab.foundCount >= 2 ? "聽自己身體的聲音" : "跑";

  const epi = s.win ? EPILOGUES.win : EPILOGUES.lose;
  return {
    rank: rank.name, letter: rank.letter, score, title,
    who: `第 ${s.loop} 輪　${s.roleTag}　${s.majorName}系`,
    scores: [
      { k: "存活", v: survive, max: 20 }, { k: "守護", v: protect, max: 25 }, { k: "發掘", v: discover, max: 20 },
      { k: "戰果", v: victory, max: 15 }, { k: "品格", v: conduct, max: 10 }, { k: "戲劇", v: drama, max: 10 },
    ],
    reveal: lines.join("\n"), missed, events,
    quotes: s.quotes.slice(0, 3),
    hive: hive.join(""), hiveMeta: `威脅：${threat}｜可食用：${edible}｜值得模仿：${mimic}`,
    epilogue: [epi[s.loop % epi.length]], hook: EPILOGUES.hook[(s.loop + s.rescued) % EPILOGUES.hook.length],
    win: s.win, loop: s.loop,
  };
}
