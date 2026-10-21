# 《熄燈號之後》AFTER TAPS

> 專案代號：**DOOM**　｜　俯視角 3D 合作生存・1–4 人・一鍵異能・前夜囤貨＋七夜守城・帶著記憶重生

**一句話**：你只是來警察大學當演習志工的普通大學生。中午十二點，天會裂開。你知道，因為你已經死過一次。

---

## 立即試玩

- **手機或電腦瀏覽器**：https://claude.ai/artifact/Xq13Jtm6bhdVe4PM2ZjjbP （單人試玩版）
- **GitHub Pages**（開啟 Pages 之後）：`https://york260.github.io/DOOM/play/`
- **自己跑**：

  ```bash
  cd game
  npm install
  npm run dev     # 開發伺服器
  npm run build   # 產出 dist/index.html（單一檔案，可直接打開）
  ```

### 操作

| | 手機 | 電腦 |
|---|---|---|
| 移動 | 左半邊螢幕拖曳 | WASD／方向鍵 |
| 互動（撿、開箱、救人、修門、說話） | 右下角小按鈕 | E |
| 異能 | 右下角大按鈕 | 空白鍵 |
| 暫停 | 右上角 ‖ | Esc |

武器會自動攻擊。異能鍵外圈越亮，代表你越接近一個隱藏條件；在條件成立時按下去，異能就會進化。

### 開啟 GitHub Pages

1. 把這個分支合併進 `main`。
2. 到 GitHub 的 Settings → Pages，把 Source 設成「GitHub Actions」。
3. 之後每次推送到 `main`，`.github/workflows/pages.yml` 會自動建置並發布：首頁是介紹頁，`/play/` 是遊戲。

開發進度見 [`game/PROGRESS.md`](game/PROGRESS.md)。

## 目前版本：v2（重新定位）

v2 把設計收斂成：**上手三十秒，每一輪都不一樣，爽點只有兩個：異能和活下去。**

| 項目 | 內容 |
|---|---|
| 主角 | 一般大學生，到「國立鷹嶺警官學院」（去識別化的警察大學）擔任防災演習志工 |
| 視角 | 斜 45 度俯視角 3D |
| 操作 | 三顆鍵：移動（自動攻擊）、互動、異能 |
| 結構 | 前夜（07:30–12:00 囤貨）→ 12:00 交融波 → 七天七夜（白天搜刮、晚上守城）→ Boss |
| 失敗 | 重生回 07:30，帶著記憶；異能每輪重抽 |
| 異能 | 一鍵異能：三個隱藏條件，條件成立時按下就會進化；按鈕會發光提示你接近了 |
| 生存 | 玩家只有血和體力；據點只有糧、電、材、人四個數字 |
| 人數 | 單人或 1–4 人連線合作 |
| 一輪長度 | 約 70–80 分鐘（另有 35 分鐘的三夜模式） |
| 建議引擎 | Unity 6 |

| # | 文件 | 內容 |
|---|---|---|
| 00 | [重新定位](docs/v2/00-positioning.md) | v1 與 v2 的差異、主角為何在警大、演習角色卡、主修、玩法方向提案、核心循環、參考與差異 |
| 01 | [一輪的流程](docs/v2/01-loop.md) | 時間表、前夜（演習即教學）、交融波、白天與夜晚、記憶系統、重生、一輪範例 |
| 02 | [一鍵異能](docs/v2/02-one-button-ability.md) | 微光、隱藏條件、頓悟、共振、共鳴光、覺醒、過熱、10 種範例、共鳴、異化物品 |
| 03 | [生存與據點](docs/v2/03-survival-and-base.md) | 四個數字、五座據點、插槽式防線、夥伴、災害、七夜威脅、Boss、蟲族 |
| 04 | [連線與生存日誌](docs/v2/04-coop-and-survival-log.md) | 連線規格、倒地與失敗、生存日誌、結算報告、選配模式 |
| 05 | [開發計畫](docs/v2/05-dev-plan.md) | 範疇對照、技術選型、MVP、里程碑、前六週行動、KPI、風險 |

### 介紹網頁

[`site/index.html`](site/index.html) 是 v2 的手機版介紹頁（單一檔案，直接用瀏覽器打開即可）。內含一鍵異能試玩、演習角色卡抽卡、七夜重抽與熄燈號試聽。

## 封存：v1（警校生主角、3D 開放世界）

v1 的世界觀、舞台、真相層、結算報告與彩蛋仍是 v2 的素材庫，放在 [`docs/v1/`](docs/v1/)。

| # | 文件 |
|---|---|
| 00 | [五個問題・十項建議](docs/v1/00-questions-and-proposals.md) |
| 01 | [世界觀與舞台](docs/v1/01-world-and-setting.md) |
| 02 | [異能系統：知識鎖](docs/v1/02-abilities-knowledge-lock.md) |
| 03 | [核心玩法](docs/v1/03-core-gameplay.md) |
| 04 | [蝕群與異變生態](docs/v1/04-swarm-and-ecology.md) |
| 05 | [敘事、事件與難度](docs/v1/05-narrative-events-difficulty.md) |
| 06 | [多人連線](docs/v1/06-multiplayer.md) |
| 07 | [結算報告](docs/v1/07-end-report.md) |
| 08 | [成就・彩蛋・跨局成長](docs/v1/08-achievements-easter-eggs-meta.md) |
| 09 | [技術架構與執行計畫](docs/v1/09-tech-and-roadmap.md) |
| 10 | [序章試寫](docs/v1/10-prologue-sample.md) |
