import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { resolveRelative } from "../util/path"
import { CARD_TYPE_META } from "./tripTypeMeta"
// @ts-ignore
import styles from "./styles/notemap.scss"
// @ts-ignore
import script from "./scripts/notemap.inline"

// 只有這幾種類型有明確的「單一座標」，適合畫在地圖上；transport 是起訖點移動，不適用
const MAPPABLE_TYPES = ["place", "food", "accommodation", "supermarket"]

type LatLng = { lat: number; lng: number }

type NoteMapPoint = {
  title: string
  label: string
  href?: string
  lat: number
  lng: number
  icon: string
  fg: string
}

// 地圖上的圖示標籤優先用 map_label（太長的 title 手動取的簡稱），沒填就直接用 title
function mapLabel(fm: Record<string, unknown> | undefined): string {
  return (fm?.map_label as string) || (fm?.title as string) || ""
}

function parseLocation(raw: unknown): LatLng | undefined {
  if (typeof raw !== "string") return undefined
  const parts = raw.split(",").map((p) => Number(p.trim()))
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return undefined
  const [lat, lng] = parts
  return { lat, lng }
}

const NoteMap: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  // Google Maps JS API key 是公開金鑰（靠 Google Cloud Console 的 HTTP 網域限制保護，
  // 不是靠保密），從 GOOGLE_MAPS_API_KEY 環境變數讀進來，不會寫進原始碼／git 歷史
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return null

  const fm = fileData.frontmatter
  const type = fm?.type as string | undefined
  if (!fm || !type || !MAPPABLE_TYPES.includes(type)) return null

  const selfLoc = parseLocation(fm.location)
  if (!selfLoc) return null

  const selfMeta = CARD_TYPE_META[type] ?? CARD_TYPE_META.place
  const self: NoteMapPoint = {
    title: (fm.title as string) ?? "",
    label: mapLabel(fm),
    lat: selfLoc.lat,
    lng: selfLoc.lng,
    icon: selfMeta.icon,
    fg: selfMeta.fg,
  }

  // 載入全部有座標的筆記（不再限縮半徑內），縮小地圖就能看到全部地點的相對位置；
  // 數量不大（約 60~70 則），一次全部載入對地圖渲染不會有效能負擔，多的部分靠
  // 標記群聚（marker clustering）避免畫面被擠爆
  const others: NoteMapPoint[] = allFiles
    .filter((f) => f.slug !== fileData.slug)
    .flatMap((f): NoteMapPoint[] => {
      const otherType = f.frontmatter?.type as string | undefined
      if (!otherType || !MAPPABLE_TYPES.includes(otherType)) return []

      const loc = parseLocation(f.frontmatter?.location)
      if (!loc) return []

      const meta = CARD_TYPE_META[otherType] ?? CARD_TYPE_META.place
      return [
        {
          title: (f.frontmatter?.title as string) ?? "",
          label: mapLabel(f.frontmatter),
          href: resolveRelative(fileData.slug!, f.slug!),
          lat: loc.lat,
          lng: loc.lng,
          icon: meta.icon,
          fg: meta.fg,
        },
      ]
    })

  const payload = { apiKey, self, others }

  return (
    <div class="note-map-container" data-note-map={JSON.stringify(payload)}>
      <div class="note-map-canvas">
        <span class="note-map-placeholder">地圖載入中…</span>
      </div>
    </div>
  )
}

NoteMap.css = styles
// @ts-ignore
NoteMap.afterDOMLoaded = script

export default (() => NoteMap) satisfies QuartzComponentConstructor
