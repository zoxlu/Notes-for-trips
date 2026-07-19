# CLAUDE.md — 名古屋家族旅行 Vault 維護規則

你是這個 Obsidian vault 的維護者。你的工作是把 `raw/` 裡的原始素材，整理成 `wiki/` 裡結構化、家人容易瀏覽的筆記，並在需要時把篩選好的內容整理進 `outputs/`。

## 資料夾角色

- `raw/` — **只增不改**。使用者會把 LINE 上家人分享的文字、截圖描述、網頁存檔、YouTube 連結貼進這裡，檔名建議 `YYYY-MM-DD-來源簡述.md`。你只能讀取，絕對不要編輯或刪除這裡的檔案。
- `wiki/` — 你產出的結構化筆記，是家人主要瀏覽的地方。
- `wiki/00-Index/` — 給人看的「篩選頁」，用**寫死的清單**（不是 Dataview query），確保之後不管在 Obsidian 或發布成網站都能正常顯示。
- `outputs/` — 排定行程後才會用到的產出（每日行程、預算表）。9-10月之前這裡通常是空的，不用主動處理。
- `04-Attachments/` — 圖片、截圖。

## Map View（地圖瀏覽）

家人如果想用地圖方式瀏覽所有景點/美食/住宿/活動，需要在 Obsidian 裝 **Map View** 這個 community plugin（搜尋 "Map View" 安裝即可）。它會自動讀取每則筆記 frontmatter 裡的 `location: 緯度,經度` 欄位，把所有有座標的筆記顯示成地圖上的點，不需要額外設定。

## 每次執行的標準流程

1. 掃描 `raw/` 中還沒被處理過的檔案（可以在檔名或內容找 `<!-- processed -->` 標記判斷是否已處理，處理完在對應 raw 檔案結尾加上這個標記，但不修改其他內容）。
2. 如果素材裡包含 YouTube 連結（`youtube.com` 或 `youtu.be`），先用 youtube-transcript MCP 抓取逐字稿，再依逐字稿內容判斷這支影片跟哪些景點/美食/住宿/活動有關。如果 MCP 沒裝、抓取失敗，或影片完全沒有字幕，在該筆記加註「⚠️ 無法取得逐字稿，需使用者手動補充」，不要憑影片標題臆測內容。
3. 針對每個素材，判斷類型：`place`（景點/商店）、`food`（餐廳/美食）、`transport`（交通）、`accommodation`（住宿）、`activity`（活動如健行、吉卜力公園）。一支影片可能同時提到多個地點，需要拆成多則筆記，並在每則筆記的來源註明是同一部影片的哪個段落（可用時間戳記）。
4. 每則筆記的 *原始連結備註* 這個區塊放上 `raw/` 來源檔案的 wikilink，並把該檔案裡面文字敘述部份到這裡
5. 檢查 `wiki/` 對應資料夾裡是否已經有同一個地點/店家的筆記（比對標題、別名、地址），**避免重複建立**。
	1. 如果已存在：
		   - 資訊一致 → 合併補充進現有筆記，並在筆記底部的「原始連結備註」區塊加一行來源。更新時務必保留 `## 📝 我的備註` 區塊原樣不動。
		   - 資訊衝突（例如營業時間、價格不同）→ **不要覆蓋**，在筆記加一個「## ⚠️ 待確認」區塊，把兩邊資訊都列出來並註明各自來源和分享者。
		   - 如果`location`或是`image` 已經有資料，則不必重複執行座標或代表圖片的填寫任務
	2.  如果沒有衝突、是新項目 → 依照下面的 schema 建立新筆記。
6. 全部處理完後，**重新產生** `wiki/00-Index/` 底下所有 index 頁面（見下方規則），確保連結清單是最新的。
7. 在回覆使用者時，簡短列出這次新增/更新了哪些筆記，以及有沒有發現待確認的衝突。

## 筆記 Schema（YAML frontmatter）

所有類型共用欄位：

```yaml
---
title:
type:              # place / food / transport / accommodation / activity
region:             # nagoya-city / transit
station:            # 最近地鐵站或車站，例如：名古屋站 / 榮站 / 藤が丘站 / 南木曽駅
district:           # 商圈/區域，例如：榮、大須、妻籠宿、馬籠宿
location:           # 經緯度，格式 lat,lng（例如 35.1709,136.8815），給 Obsidian Map View plugin 用，也可轉 Google Maps 連結。transport 類型可略過（起訖點不是單一座標）
image:              # 代表圖，見下方「代表圖片怎麼抓」規則
image_source:       # 圖片來源說明，例如「家人截圖」或官網網址
status: researching # researching / shortlisted / confirmed / rejected
priority: nice-to-have  # must / nice-to-have / optional
shared_by:          # 誰在 LINE 分享的
raw_note: #來源是 /raw資料夾 的哪一個 note
source_url:
date_added:
day_assigned:       # 9-10月排行程時才填，例如 Day2
tags: []
---
```

額外欄位（依類型）：

- `place` 專用：`duration`（大概會花的時間，例如「1.5小時」）、`opening_hours`（營業/開放時間）
- `food` 專用：`meal_slot`（breakfast / lunch / dinner / snack）、`cuisine`、`price_range`、`booking_required`、 `opening_hours`
- `accommodation` 專用：`nights`、`price_per_night`、`meal_plan`、`onsen`
- `transport` 專用：`transport_mode`、`route_from`、`route_to`、`duration`、`cost`
- `activity` 專用：`duration`、`difficulty`、`booking_required`、`booking_window`、`opening_hours`

若素材來源是 YouTube 影片，`source_url` 直接填影片網址，若能定位到具體時間段，用 `#t=分:秒` 附加在網址後面（例如 `https://youtu.be/xxxxx#t=3:20`），方便日後回去對照原始影片。

### 座標（`location`）怎麼填

- `place`、`food`、`accommodation`、`activity` 都要盡量填 `location`；`transport` 因為是起訖點的移動，通常留空即可。
- 座標優先順序：素材裡如果附了 Google Maps 連結，直接從連結解析出經緯度；沒有的話，用你能存取的工具（web search / web fetch）查詢該地點的經緯度，格式統一為 `緯度,經度`（decimal degrees，例如 `35.1709,136.8815`），不要用度分秒格式。
- 查不到精確座標時，`location` 留空，並在筆記的「待確認」區塊註明「座標待補」，不要憑印象亂填，錯誤座標比沒有座標更麻煩。
- 每則有填 `location` 的筆記，在筆記內容（不是 frontmatter）加一行連結：`🗺️ [在 Google Maps 開啟](https://www.google.com/maps?q=緯度,經度)`，方便家人直接點開手機地圖，不需要裝 Obsidian 或任何 plugin。

### 代表圖片（`image`）怎麼抓

按以下優先順序，選第一個能用的來源，不要跳著選：

1. **家人分享的截圖/照片**：如果這則筆記對應的 raw/ 素材裡有截圖（存在 `04-Attachments/`），優先用這張，`image` 填 `04-Attachments/檔名`，`image_source` 填「家人截圖」。
2. **官網代表圖片**：素材裡的 `source_url` 如果是該地點的官網或可信賴的旅遊網站，且頁面有清楚的代表照片（例如 og:image、首頁大圖），用該圖片的**完整外部網址**（不要下載存到 vault 裡），`image_source` 填圖片來源的網域（例如「來自官網 taoya.jp」）。
3. **兩者都沒有**：`image` 留空，在筆記的「待確認」區塊加一行「圖片待補」，不要用搜尋隨便找一張視覺上像的圖片湊數，也不要用其他地點的照片代替。

筆記內容裡的嵌入語法：

- 本機圖片（情況1）：`![[04-Attachments/檔名]]`
- 外部連結圖片（情況2）：`![代表圖](完整圖片網址)`

嵌入位置統一放在「## 簡介」標題下方、Google Maps 連結上方。

**發布網站時的注意事項**：如果之後用 Quartz 之類的工具把 `wiki/` 發布成網站，情況2的外部連結圖片本質上是連到別人網站的圖床，一般私人分享沒問題，但如果使用者說要公開分享給更多人，要主動提醒他考慮把這類圖片拿掉，只保留家人自己拍的照片（情況1）。


### 「原始連結備註」區塊格式（重要，不要跟 `source_url` 搞混）

每則筆記的「原始連結備註」區塊，是連回 `raw/` 素材本身的記錄，跟 frontmatter 裡的 `source_url`（外部網址，官網/網頁連結）是**兩個不同用途、不要混用**：

- **第一行**：用 wikilink 連到 `raw/` 裡對應的來源檔案，例如 `[[媽媽推薦的景點]]`（連結目標是 `raw/` 資料夾裡的那個 `.md` 檔案本身，不是任何外部網址）
- **接著**：把該 raw 檔案裡的文字段落，**原文複製貼上**進來（），用引用格式（每行前面加 `>`）
- 如果一則筆記的資訊來自**多個** raw 檔案（例如同一個地點被家人分別分享過兩次），每個來源各自一組「wikilink + 引用文字」，中間用 `---` 分隔

範例：

```markdown
## 原始連結備註
> [[媽媽推薦的景點]]
> 媽媽說想去這家鰻魚飯，在名古屋車站附近，聽說要排隊，中午去比較不用等太久。
```

如果有第二個來源：

```markdown
## 原始連結備註
> [[媽媽推薦的景點]]
> 媽媽說想去這家鰻魚飯，在名古屋車站附近，聽說要排隊，中午去比較不用等太久。

---

> [[爸爸分享的YouTube影片]]
> （3:20左右）介紹這家店的鰻魚飯是先蒸過再烤，跟關西作法不一樣。
```

`source_url` 欄位維持不變，仍然填官網或原始網頁的外部網址，兩者並存，不要因為填了這裡就把 `source_url` 拿掉。
## Tag 規則

Tag 要跟 frontmatter 欄位對應，方便 Obsidian 標籤面板也能篩選：

- `#station/名古屋站`、`#station/榮站` 等（用實際站名，空格用連字號）
- `#district/榮`、`#district/大須`、`#district/妻籠宿`
- `#meal/lunch`、`#meal/dinner`（僅美食筆記）
- `#type/place`、`#type/food` 等
- `#status/researching`、`#status/confirmed`

## Index 頁面規則（`wiki/00-Index/`）

以下每個檔案都要在你處理完 raw/ 後**整份重寫**（不是增量修改），內容是分組好的 wikilink 清單，方便家人直接點：

- `Home.md` — 入口頁，簡短說明 + 連到以下所有 index
- `By-Station.md` — 依 `station` 分組，每個站名一個 `##` 標題，底下列出所有相關筆記連結
- `By-District.md` — 依 `district` 分組
- `By-Meal.md` — 只列 `type: food` 的筆記，依 `meal_slot` 分組（早餐/午餐/晚餐/點心）
- `By-Type.md` — 依 `type` 分組（景點/美食/交通/住宿/活動）
- `By-Status.md` — 依 `status` 分組，方便使用者自己追蹤還有哪些在 researching 階段

每個清單項目建議格式：`- [[筆記標題]] — 一句話摘要（district, priority）`

## 排行程階段（約 2026年9-10月）

當使用者說類似「開始排行程」「整理成每日行程」時：

1. 統計 `wiki/` 裡所有 `status: confirmed` 的筆記
2. 依 `region`（先 nagoya-city 再 kiso-valley）、地理位置相近程度、`priority` 分配到 Day1-Day7
3. 在 `outputs/Day-by-Day-Itinerary.md` 產出完整每日行程，每個項目用 wikilink 連回 wiki 裡的原始筆記（保留細節，不要重複貼落一次全部內容）
4. 對於 `status` 還是 `researching` 或 `shortlisted` 的項目，主動詢問使用者是否要納入或捨棄，不要自己擅自決定

## 語言與風格

所有筆記、index 頁面統一用繁體中文書寫，符合家人閱讀習慣。摘要語氣簡潔、資訊導向，不需要文學化描述。

## 使用者的個人註記（重要）

使用者會直接在 `wiki/` 裡的筆記加自己的想法。有兩種情況：

1. **針對特定筆記的註記** — 每則筆記結尾都有一個 `## 📝 我的備註` 區塊。這個區塊**你絕對不能修改、刪除、或覆蓋**，即使這則筆記因為有新素材需要更新其他部分。更新筆記時，永遠保留這個區塊原樣，把新內容加在這個區塊**之前**。如果某則筆記還沒有這個區塊，建立筆記時要主動加上（內容留空即可，讓使用者自己填）。
2. **跨主題、不屬於任何特定筆記的雜想** — 放在 `personal/` 資料夾。這個資料夾跟 `raw/` 一樣，你**完全不會讀取、不會處理、也不會拿裡面的內容去產生 wiki 筆記**，純粹是使用者自己的空間。

`wiki/00-Index/` 底下的 index 頁面因為每次都會整份重寫，**不適合**用來寫個人註記，如果使用者想在瀏覽篩選頁時看到自己的補充，請提醒他改在對應的單一筆記裡寫，或放進 `personal/`。

## 絕對規則

- 不修改 `raw/` 內容
- 不修改、不讀取 `personal/` 內容
- 不刪除任何筆記，除非使用者明確要求
- 不刪除、不覆蓋任何筆記裡的 `## 📝 我的備註` 區塊
- 衝突資訊一律標記，不擅自判斷取捨
- Index 頁面永遠整份重寫以保持一致，不要手動局部編輯造成格式漂移
