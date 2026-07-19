# 名古屋家族旅行 — LLM Wiki 使用說明

這個 vault 採用 Karpathy 的 LLM Wiki 模式：您負責蒐集素材丟進 `raw/`，Claude Code 負責讀取、整理、產出結構化的 `wiki/`，Obsidian 只是您和家人的閱讀介面。

## 資料夾架構

```
NagoyaTrip-Vault/
├── CLAUDE.md            # Claude Code 的工作規則（核心，勿刪）
├── raw/                  # 只增不改：家人分享的原始素材貼在這裡
├── wiki/                 # Claude Code 產出的結構化筆記（家人主要瀏覽的地方）
│   ├── 00-Index/         # 篩選頁：By-Station / By-District / By-Meal / By-Type / By-Status
│   ├── Places/
│   ├── Food/
│   ├── Transport/
│   ├── Accommodation/
│   └── Activities/
├── outputs/               # 9-10月排定行程後，每日行程會產出在這裡
├── 01-Templates/          # 人類參考用的 schema 備份（Claude Code 主要依 CLAUDE.md 運作）
└── 04-Attachments/        # 截圖、圖片
```

## 日常使用流程

1. 家人在 LINE 分享連結/截圖/心得/YouTube影片,您把文字內容或連結貼成一個新的 `.md` 檔放進 `raw/`（檔名建議 `2026-07-18-由布院旅館推薦.md` 這種格式），截圖另存到 `04-Attachments/` 再在 raw 檔案裡用 `![[圖檔名]]` 引用。YouTube 連結可以直接貼網址,前提是已安裝 youtube-transcript MCP server(`claude mcp add --transport stdio youtube-transcript -- npx -y @kimtaeyoon83/mcp-server-youtube-transcript`),Claude Code 會自動抓逐字稿來分析；沒裝的話,建議自己先複製 YouTube 的逐字稿文字貼進去,單純網址 Claude Code 是看不到影片實際內容的。
2. 累積一批之後，在終端機切到這個資料夾，開 Claude Code，跟它說「請處理 raw/ 裡的新素材」。
3. Claude Code 會依照 `CLAUDE.md` 的規則，判斷類型、寫入 `wiki/`、更新所有 index 頁面，並回報有沒有發現衝突需要您確認。
4. 打開 Obsidian，點 `wiki/00-Index/Home.md` 就能看到目前所有整理好的內容，用 By-Station / By-District / By-Meal 隨時切換瀏覽方式。

## 9-10月排行程階段

到時候直接跟 Claude Code 說「開始排每日行程」，它會統計所有 `status: confirmed` 的項目，依區域和優先度分配到 Day1-Day7，產出 `outputs/Day-by-Day-Itinerary.md`。如果還有項目卡在 researching/shortlisted，它會主動列出來問您要不要納入。

## 發布成網站分享給家人

因為 index 頁面是 Claude Code 每次重新寫死的清單（不是即時 Dataview query），用 Quartz 發布成靜態網站時不需要額外裝 Dataview 轉譯 plugin，家人用手機瀏覽器打開連結就能看到跟 Obsidian 裡一樣的篩選頁面。等內容累積到一定程度，我可以再幫您設定 Quartz 發布的部分。

## 地圖瀏覽

如果想用地圖方式看所有景點/美食/住宿/活動，在 Obsidian 裝 **Map View** community plugin 即可，它會自動讀取每則筆記的 `location: 緯度,經度` 座標。每則筆記裡也有「🗺️ 在 Google Maps 開啟」的連結，不裝 plugin 也能點開手機地圖。

## 需要您手動維護的部分

- `raw/` 的素材蒐集（Claude Code 沒辦法直接讀 LINE）
- 定期呼叫 Claude Code 處理新素材（沒有自動排程，需要您主動觸發）
- Claude Code 標記「⚠️ 待確認」的衝突資訊，需要您親自判斷取捨
