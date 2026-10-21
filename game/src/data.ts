// Game content: abilities, role cards, majors, build cards, nights and text.

export type CondKey =
  | "water" | "rail" | "rain" | "gen" | "heart" | "still" | "hurt" | "shade" | "dark"
  | "ally" | "crowd" | "carry" | "field" | "fire" | "fed" | "doornight" | "dirt" | "inbase" | "broadcast";

export const COND_LABEL: Record<CondKey, string> = {
  water: "在水邊", rail: "碰到鐵欄杆", rain: "在雨中", gen: "在發電機旁", heart: "跑了很久、心跳最快時",
  still: "靜止三秒", hurt: "血量很低時", shade: "在陰影裡", dark: "在黑暗中", ally: "身邊有夥伴",
  crowd: "被一大群蟲包圍", carry: "背包快滿時", field: "在田徑場上", fire: "在火旁", fed: "剛吃過早餐",
  doornight: "夜裡守在據點門口", dirt: "站在泥土上", inbase: "在據點裡", broadcast: "在廣播室前",
};

export type Effect =
  | { k: "bolt"; dmg: number; chains: number; range: number }
  | { k: "nova"; dmg: number; r: number; knock: number; stun?: number }
  | { k: "field"; dps: number; r: number; dur: number; slow: number; heal?: number; at: "self" | "ahead" }
  | { k: "blink"; dist: number; carryAllies?: boolean; dmg?: number }
  | { k: "wall"; dps: number; len: number; dur: number }
  | { k: "buff"; kind: "melee" | "veil" | "stealth"; mult: number; dur: number }
  | { k: "heal"; amt: number; allies?: boolean }
  | { k: "pull"; r: number; dmg: number }
  | { k: "res"; res: "food" | "power" | "mat"; amt: number }
  | { k: "multi"; list: Effect[] };

export interface CondDef { key: CondKey; form: string; line: string; res: string; fx: Effect; star?: boolean }
export interface AbilityDef {
  id: string; name: string; src: string; color: number; css: string;
  spark: Effect; sparkText: string; strongText: string;
  conds: [CondDef, CondDef, CondDef];
  secret: { key: CondKey; riddle: string; title: string; line: string; fx: Effect };
}

export const ABILITIES: AbilityDef[] = [
  {
    id: "thunder", name: "逆雷", src: "雷", color: 0x9fd3ff, css: "#9fd3ff",
    spark: { k: "bolt", dmg: 18, chains: 1, range: 8 },
    sparkText: "一道細細的電弧從指尖跳出去。", strongText: "電弧變粗了，一次打穿好幾隻。",
    conds: [
      { key: "rail", form: "導雷", line: "你握住欄杆的那一刻，整排鐵欄杆都亮了。", res: "電流沿著金屬一路跳。", fx: { k: "bolt", dmg: 34, chains: 6, range: 10 } },
      { key: "rain", form: "連鎖閃電", line: "雨落下來的地方，都是你的。", res: "閃電沿著雨水一路跳。", fx: { k: "bolt", dmg: 40, chains: 10, range: 13 } },
      { key: "gen", form: "充電", line: "發電機的指針一路轉到底。今晚的燈不會熄了。", res: "據點的電又滿了。", star: true, fx: { k: "multi", list: [{ k: "res", res: "power", amt: 2 }, { k: "nova", dmg: 24, r: 5, knock: 3 }] } },
    ],
    secret: { key: "heart", riddle: "夔只在心跳最快的時候回頭。", title: "蒼淵雷獸「夔」", line: "你的心跳和雷聲，變成了同一個節拍。", fx: { k: "multi", list: [{ k: "nova", dmg: 220, r: 13, knock: 6, stun: 2 }, { k: "bolt", dmg: 60, chains: 16, range: 16 }] } },
  },
  {
    id: "rain", name: "懸雨", src: "水", color: 0x7fd0e8, css: "#7fd0e8",
    spark: { k: "bolt", dmg: 15, chains: 1, range: 8 },
    sparkText: "一顆水珠從掌心彈了出去。", strongText: "水珠變成一串，連續打了好幾下。",
    conds: [
      { key: "water", form: "懸停", line: "水窪裡的水，慢慢浮了起來。", res: "周圍的水停在半空，蟲慢得像在游泳。", fx: { k: "field", dps: 6, r: 6.5, dur: 7, slow: 0.65, at: "self" } },
      { key: "still", form: "水彈陣", line: "你停下來的時候，水也停下來等你。", res: "懸停的水珠一起射了出去。", fx: { k: "bolt", dmg: 30, chains: 8, range: 11 } },
      { key: "rain", form: "集雨", line: "每一滴雨都往據點的水桶裡落。", res: "據點多了乾淨的水。", star: true, fx: { k: "multi", list: [{ k: "res", res: "food", amt: 3 }, { k: "heal", amt: 20, allies: true }] } },
    ],
    secret: { key: "hurt", riddle: "雨師只在有人流血的時候現身。", title: "蒼淵「雨師」", line: "你的血停在半空中，變成了一面水盾。", fx: { k: "multi", list: [{ k: "heal", amt: 100, allies: true }, { k: "field", dps: 34, r: 11, dur: 9, slow: 0.7, at: "self" }] } },
  },
  {
    id: "shadow", name: "影步", src: "影", color: 0xb48cff, css: "#b48cff",
    spark: { k: "buff", kind: "veil", mult: 1, dur: 2.2 },
    sparkText: "你的身體變得半透明，蟲找不到你。", strongText: "半透明的時間變長了。",
    conds: [
      { key: "shade", form: "影中瞬移", line: "原來你一直都住在影子裡。", res: "你從一片陰影跳到另一片陰影。", fx: { k: "blink", dist: 11, dmg: 30 } },
      { key: "ally", form: "同行", line: "你拉著的那隻手，也一起沉進了影子。", res: "你把夥伴一起帶進了陰影。", fx: { k: "multi", list: [{ k: "blink", dist: 9, carryAllies: true }, { k: "heal", amt: 25, allies: true }] } },
      { key: "dark", form: "夜行", line: "黑暗的那一刻，整棟樓都變成了你的走廊。", res: "蟲群暫時看不見你。", star: true, fx: { k: "multi", list: [{ k: "buff", kind: "stealth", mult: 1, dur: 7 }, { k: "nova", dmg: 30, r: 5, knock: 2 }] } },
    ],
    secret: { key: "still", riddle: "夜行狸只在你停下來的時候追上你。", title: "蒼淵「夜行狸」", line: "所有的影子，同時轉過頭來看著你。", fx: { k: "nova", dmg: 140, r: 14, knock: 1, stun: 4 } },
  },
  {
    id: "gravity", name: "墜星", src: "重", color: 0xe0c97a, css: "#e0c97a",
    spark: { k: "nova", dmg: 12, r: 3.2, knock: 4 },
    sparkText: "身邊的蟲被推開了一點。", strongText: "推開的力道變大了。",
    conds: [
      { key: "crowd", form: "重力井", line: "牠們越多，就掉得越深。", res: "整群蟲被吸到同一點。", fx: { k: "pull", r: 10, dmg: 46 } },
      { key: "carry", form: "輕量化", line: "背包突然輕得像空的一樣。", res: "你可以背更多東西了。", star: true, fx: { k: "multi", list: [{ k: "res", res: "mat", amt: 4 }, { k: "nova", dmg: 26, r: 4, knock: 5 }] } },
      { key: "field", form: "衝擊坑", line: "跑道裂開了一個圓。", res: "落地的衝擊波震飛一圈。", fx: { k: "nova", dmg: 64, r: 7, knock: 8 } },
    ],
    secret: { key: "hurt", riddle: "負嶽只在你快站不住的時候，替你站著。", title: "蒼淵「負嶽」", line: "整片地面往你的方向傾斜。", fx: { k: "multi", list: [{ k: "pull", r: 17, dmg: 60 }, { k: "nova", dmg: 240, r: 8, knock: 10, stun: 1.5 }] } },
  },
  {
    id: "ember", name: "熔掌", src: "火", color: 0xff8a4c, css: "#ff8a4c",
    spark: { k: "buff", kind: "melee", mult: 1.8, dur: 3 },
    sparkText: "手掌發燙，下一擊帶著火。", strongText: "掌心的火燒得更久了。",
    conds: [
      { key: "fire", form: "火焰噴射", line: "火認得你。", res: "一道火焰往前噴了出去。", fx: { k: "field", dps: 40, r: 5, dur: 3.5, slow: 0.2, at: "ahead" } },
      { key: "rail", form: "燒紅的鐵", line: "你握過的鐵，都紅了。", res: "你的武器燒得通紅。", fx: { k: "buff", kind: "melee", mult: 3, dur: 12 } },
      { key: "fed", form: "灶火", line: "吃飽了，才有力氣煮飯。", res: "據點的廚房火力全開。", star: true, fx: { k: "multi", list: [{ k: "res", res: "food", amt: 4 }, { k: "buff", kind: "melee", mult: 2, dur: 8 }] } },
    ],
    secret: { key: "doornight", riddle: "畢方只替守門的人飛。", title: "蒼淵火鳥「畢方」", line: "一隻火鳥繞著據點飛了起來。", fx: { k: "multi", list: [{ k: "field", dps: 30, r: 12, dur: 20, slow: 0.3, at: "self" }, { k: "nova", dmg: 120, r: 9, knock: 5 }] } },
  },
  {
    id: "thorn", name: "荊棘", src: "木", color: 0x8fcf6a, css: "#8fcf6a",
    spark: { k: "wall", dps: 12, len: 3, dur: 4 },
    sparkText: "地上冒出一小叢刺。", strongText: "刺長得更長、更密了。",
    conds: [
      { key: "dirt", form: "荊棘牆", line: "土底下，一直有東西在等你。", res: "一整面刺牆從土裡竄出來。", fx: { k: "wall", dps: 28, len: 10, dur: 12 } },
      { key: "hurt", form: "吸血荊棘", line: "你的血滴下去，刺就喝。", res: "荊棘刺中的蟲替你回血。", fx: { k: "multi", list: [{ k: "field", dps: 22, r: 5, dur: 6, slow: 0.4, heal: 6, at: "self" }] } },
      { key: "inbase", form: "催熟", line: "菜園裡的芽，一夜長成了田。", res: "據點的糧食變多了。", star: true, fx: { k: "multi", list: [{ k: "res", res: "food", amt: 4 }, { k: "wall", dps: 18, len: 6, dur: 8 }] } },
    ],
    secret: { key: "rain", riddle: "建木只在雨裡抽芽。", title: "蒼淵「建木之芽」", line: "一棵樹從你腳下長到天上。", fx: { k: "multi", list: [{ k: "field", dps: 36, r: 9, dur: 18, slow: 0.5, heal: 8, at: "self" }, { k: "wall", dps: 30, len: 14, dur: 18 }] } },
  },
];

export interface RoleDef { id: string; tag: string; css: string; start: { x: number; z: number }; item: string; line: string; perk: string }
export const ROLES: RoleDef[] = [
  { id: "red", tag: "紅票・重傷患", css: "#c9503a", start: { x: 22, z: 54 }, item: "止血帶", line: "劇本上你要被抬走。交融波發生時，你正躺著。", perk: "倒地時會自動用止血帶站起來一次。" },
  { id: "yellow", tag: "黃票・骨折傷患", css: "#e9a640", start: { x: 44, z: 54 }, item: "夾板", line: "演習中你走路一跛一跛的。夾板其實可以拿來打。", perk: "近戰傷害 +40%。" },
  { id: "green", tag: "綠票・輕傷民眾", css: "#6bae9f", start: { x: 0, z: 30 }, item: "大背包", line: "最自由的開局。你可以第一個衝進福利社。", perk: "背包容量 +4。" },
  { id: "black", tag: "黑票・罹難者", css: "#dce1e6", start: { x: 18, z: -46 }, item: "白布", line: "你今天的工作是當屍體。", perk: "靜止不動時，蟲不會注意你。" },
  { id: "press", tag: "媒體記者", css: "#8ea3c4", start: { x: 3, z: 66 }, item: "相機", line: "你可以自由進出管制區。警校生會躲你的鏡頭。", perk: "拍下的弱點：對所有蟲傷害 +15%。" },
  { id: "loud", tag: "鬧事民眾", css: "#b88bd0", start: { x: -4, z: 38 }, item: "擴音器", line: "警校生一開始不太信任你。", perk: "異能範圍 +25%。" },
];

export interface MajorDef { id: string; name: string; perk: string }
export const MAJORS: MajorDef[] = [
  { id: "nurse", name: "護理", perk: "回血加倍，急救包效果加倍" },
  { id: "mech", name: "機械", perk: "修理與建設材料減半" },
  { id: "pe", name: "體育", perk: "移動速度 +12%，背包 +2" },
  { id: "chef", name: "餐飲", perk: "據點的糧食消耗減半" },
  { id: "ee", name: "電機", perk: "每天早上電 +1" },
  { id: "bio", name: "生科", perk: "每天早上糧 +2" },
];

export interface BuildCard { id: string; name: string; desc: string; cost: number }
export const BUILD_CARDS: BuildCard[] = [
  { id: "plank", name: "加固封板", desc: "所有入口的封板上限 +150，並且修好。", cost: 6 },
  { id: "spikes", name: "釘板陷阱", desc: "每個入口外面鋪一片釘板，蟲踩上去會受傷。", cost: 5 },
  { id: "turret", name: "滅火器砲台", desc: "在避難室旁架一台自動射擊的砲台。", cost: 8 },
  { id: "garden", name: "菜園", desc: "每天早上糧 +2。", cost: 5 },
  { id: "dynamo", name: "發電機改裝", desc: "每天早上電 +1。", cost: 5 },
  { id: "medbay", name: "醫護站", desc: "在據點裡會持續回血，倒地的人更快起來。", cost: 6 },
  { id: "tower", name: "瞭望台", desc: "守衛的射程與傷害 +50%。", cost: 6 },
  { id: "siren", name: "警車警笛", desc: "每一夜開始時，第一波蟲會先被引到別處十秒。", cost: 5 },
  { id: "lights", name: "探照燈", desc: "夜裡入口附近的蟲受到的傷害 +25%。需要電。", cost: 4 },
];

export interface NightDef { id: string; name: string; desc: string }
export const NIGHT_POOL: NightDef[] = [
  { id: "wings", name: "哨翅夜", desc: "會飛的蟲從天窗和窗戶進來。" },
  { id: "burrow", name: "穿岩夜", desc: "蟲從據點的地板下鑽上來。" },
  { id: "tank", name: "鐵殼夜", desc: "大型重甲蟲衝撞正門。" },
  { id: "adapt", name: "適應夜", desc: "牠們學會了你最常用的攻擊方式。" },
  { id: "leap", name: "彈刃夜", desc: "會跳的蟲越過拒馬，從縫隙撲進來。" },
];
export const NIGHT_FIRST: NightDef = { id: "swarm", name: "蝕蝨潮", desc: "裂隙只有針孔大小。蟲很小，但很多。" };
export const NIGHT_LAST: NightDef = { id: "boss", name: "天裂", desc: "裂隙完全打開。千眼之母現身。" };

export interface NpcDef { id: string; name: string; who: string; color: number; lines: { join: string; log: string[]; report: string } }
export const NAMED_NPCS: NpcDef[] = [
  { id: "doujiang", name: "杜子豪", who: "你的室友「豆漿」", color: 0xd9a35b, lines: { join: "我就知道跟著你準沒事。…應該吧。", log: ["豆漿說，他今天的異能又跟吃的有關。", "豆漿把最後一包科學麵分給了新來的人。"], report: "世界末日、我室友會異能。這兩件事我只預料到第一件。" } },
  { id: "chenyan", name: "陳硯", who: "警校四年級學長", color: 0x2f4a75, lines: { join: "我帶你們回去。跟緊。", log: ["陳硯整夜都沒睡，一直站在門口。", "陳硯說：「明天我去醫院。我一個人去就好。」"], report: "你們這些志工，比我想的還能打。" } },
  { id: "linzhixia", name: "林知夏", who: "警校鑑識系", color: 0x3a5c6e, lines: { join: "給我一隻完整的，我就告訴你牠的弱點。", log: ["林知夏在走廊解剖了一隻蟲，說牠的腿關節最脆。", "林知夏說：牠們的大腦不在身體裡。"], report: "我記錄了三天。最奇怪的不是蟲，是你。" } },
  { id: "xuan", name: "許安", who: "警校新生", color: 0x4a6aa0, lines: { join: "學長…學姊…謝謝你回來找我。", log: ["許安第一次一個人站哨。", "許安讓整座游泳池結了冰。他第一次笑了。"], report: "你說會回來，你真的回來了。" } },
  { id: "yan", name: "嚴振東", who: "區隊長", color: 0x22324a, lines: { join: "這不是演習。所有人，聽我的。", log: ["區隊長把點名簿翻到最後一頁，寫上了志工的名字。", "區隊長說：學生不能持槍。然後把槍交給了你。"], report: "這條規矩你們破了。…做得好。" } },
  { id: "fangqing", name: "方晴", who: "健康中心護理師", color: 0xe7e1d6, lines: { join: "躺好，不要動。", log: ["方晴用最後一捲紗布包好了所有人的傷口。"], report: "我的醫護站，三天沒有關過燈。" } },
];

export const GENERIC_NAMES = ["江以晴", "葉承恩", "沈若彤", "吳柏廷", "蔡宜君", "林冠宇", "張書維", "陳品妤", "黃郁婷", "王子翔", "劉怡安", "鄭宇辰"];

export const DRILL_STEPS = [
  { at: 450, text: "演習報到完成。到「升旗廣場」聽區隊長說明。", target: "plaza" },
  { at: 480, text: "疏散演練：在校園裡找到兩個物資箱，打開它們（互動鍵）。", target: "crates" },
  { at: 570, text: "封鎖演練：把東西搬進一座據點（射擊館、體育館或游泳池）。走進去就會自動卸貨。", target: "base" },
  { at: 640, text: "自由時間。中午十二點演習結束。", target: "free" },
];

export const OMENS = [
  { at: 690, text: "麻雀在田徑場上空一圈一圈地繞。" },
  { at: 705, text: "手機沒有訊號了。" },
  { at: 712, text: "地面在你腳下輕輕地哼了一聲。" },
];

export const HIVE_LINES = {
  melee: "牠用手打我們。我們學會了，長出更硬的殼。",
  ability: "牠身上有不屬於這個世界的東西。我們聞得到。我們會再來找它。",
  rescue: "牠為了一個碎片回頭。回頭的碎片很好抓。我們記住了。",
  still: "牠躺著不動，我們以為牠已經死了。牠不是。我們學會了，先咬不動的。",
  base: "牠們把自己關在盒子裡。盒子有門。門會壞。",
  win: "母親的眼睛閉上了。我們會換一雙眼睛，再來。",
  lose: "盒子打開了。溫血碎片很溫暖。下一次，我們會更早到。",
};

export const EPILOGUES = {
  win: [
    "第四天早上，雲台市的天空仍然留著一道淡淡的墨痕。鷹嶺警官學院在廢墟上重新升旗。點名的時候，區隊長把志工的名字也念了一遍。",
    "撤離的直升機在第五天中午降落在田徑場上。你最後看了一眼射擊館的鐵門，上面還留著你們畫的記號。",
  ],
  lose: [
    "演習的廣播一直響到電力耗盡。後來進來的搜救隊，在避難室的牆上找到了一行字。",
    "那一天的雲台市，很多人都沒有回家。但在校車上，你又醒了過來。",
  ],
  hook: [
    "但校車上，沒有人記得今天要演習。",
    "那天晚上，熄燈號沒有響。",
    "後山傳來了第二段號聲。吹號的人，用的是另一種節拍。",
  ],
};

export const RANKS = [
  { min: 90, name: "特任", letter: "S+" },
  { min: 78, name: "警監", letter: "S" },
  { min: 64, name: "警正", letter: "A" },
  { min: 50, name: "警佐", letter: "B" },
  { min: 36, name: "學員", letter: "C" },
  { min: 20, name: "新生", letter: "D" },
  { min: -1, name: "失聯", letter: "F" },
];

/** Facts the survival log remembers across loops. */
export const FACTS: Record<string, string> = {
  blackout: "10:15，行政大樓會停電一次，大約五分鐘。",
  safe: "福利社的密碼鎖箱子，密碼是 0742。",
  carrier: "交融波之後，拾骸者會從游泳池旁的排水口爬出來，拖走一個人。",
  firstnight: "第一夜，第一波蟲是從西邊的排水溝來的。",
  armory: "區隊長只相信說中過一件事的人。他身上有械彈庫的鑰匙。",
};
