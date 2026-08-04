import fs from "fs"
import path from "path"

// 極簡 .env 讀取器（不依賴 dotenv 套件）：只給本機開發用，讀取專案根目錄的 .env 檔，
// 補進 process.env 裡目前還沒設定的變數（例如 GOOGLE_MAPS_API_KEY）。
// CI（GitHub Actions）沒有 .env 檔，直接用 workflow 設定的環境變數，這裡會是 no-op。
export function loadEnvFile(envPath: string = path.join(process.cwd(), ".env")) {
  if (!fs.existsSync(envPath)) return

  const lines = fs.readFileSync(envPath, "utf-8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const eqIndex = trimmed.indexOf("=")
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed
      .slice(eqIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, "")

    if (key && !(key in process.env)) {
      process.env[key] = value
    }
  }
}
