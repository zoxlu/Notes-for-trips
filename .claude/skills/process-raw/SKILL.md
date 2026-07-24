---
name: process-raw
description: 處理 raw/ 裡尚未處理的素材，依照 CLAUDE.md 規則產生/更新 wiki 筆記，並自動分批、總結、commit。
---

依照 vault 根目錄 CLAUDE.md 的規則，處理 raw/ 裡尚未標記 `<!-- processed -->` 的素材：

1. 以每 5 個素材為一批，逐批處理，不要一次全部處理完才回報
2. 每個素材的類型判斷、筆記 schema、欄位命名、重複比對、衝突標記，一律照 CLAUDE.md 的規則，不要自己另外發明欄位或命名慣例
3. 所有檔案編輯直接用 Edit/Write 處理，不要設計 agent 式的檔案讀寫流程
4. 每完成一批：
   - 簡短總結這批新增/更新了哪些筆記、有沒有待確認的衝突
   - git add + commit，訊息簡短描述這批更動的筆記
5. 全部素材處理完後，重新產生 wiki/00-Index/ 底下所有 index 頁面 