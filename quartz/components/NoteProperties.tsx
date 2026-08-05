import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { resolveRelative } from "../util/path"
// @ts-ignore
import styles from "./styles/noteproperties.scss"

const FIELD_LABEL: Record<string, string> = {
  station: "捷運站",
  district: "商圈",
  opening_hours: "營業時間",
  duration: "停留時間",
  meal_slot: "餐別",
  price_range: "價格",
  nights: "住宿天數",
  meal_plan: "餐食方案",
  transport_mode: "交通方式",
  cost: "費用",
  shared_by: "分享人",
  official_url: "官方網站",
  source_url: "來源網站",
  location: "地圖",
}

const FIELD_ORDER = [
  "shared_by",
  "station",
  "district",
  "opening_hours",
  "duration",
  "meal_slot",
  "price_range",
  "nights",
  "meal_plan",
  "transport_mode",
  "cost",
  "location",
  "official_url",
  "source_url",
]

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

const NoteProperties: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  const fm = fileData.frontmatter
  if (!fm || !fm.type) return null

  const items = FIELD_ORDER.map((key) => ({ key, value: fm[key] })).filter(
    (i) => i.value !== undefined && i.value !== null && i.value !== "",
  )

  if (items.length === 0) return null

  function renderSharedBy(rawValue: string) {
    // 支援 "[[繃皮蛇]]" 這種 wikilink 寫法，抓出裡面的名字
    const match = rawValue.match(/^\[\[(.+?)\]\]$/)
    const name = match ? match[1] : rawValue

    const targetPage = allFiles.find((f) => f.frontmatter?.title === name)
    if (!targetPage) {
      return <span class="note-property-value">{name}</span>
    }
    return <a href={resolveRelative(fileData.slug!, targetPage.slug!)}>{name}</a>
  }

  function renderFilterLink(filterKey: string, value: string) {
    const indexPath = resolveRelative(fileData.slug!, "index" as any)
    const href = indexPath + "?filterKey=" + filterKey + "&filterValue=" + encodeURIComponent(value)
    return (
      <span class="trip-property-link" data-target-href={href}>
        {value}
      </span>
    )
  }

  return (
    <ul class="note-properties">
      {items.map((item) => (
        <li class="note-property-item">
          <span class="note-property-label">{FIELD_LABEL[item.key]}</span>
          <span class="note-property-sep">：</span>
          {item.key === "shared_by" ? (
            renderSharedBy(String(item.value))
          ) : item.key === "station" ? (
            <>
              {renderFilterLink("station", String(item.value))}
              {Array.isArray(fm.lines) && (fm.lines as string[]).length > 0 && (
                <span class="trip-property-lines">
                  {" "}
                  {(fm.lines as string[]).map((l, i) => (
                    <>
                      {i > 0 && "、"}
                      {renderFilterLink("line", l)}
                    </>
                  ))}
                </span>
              )}
            </>
          ) : item.key === "district" ? (
            renderFilterLink("district", String(item.value))
          ) : item.key === "source_url" ? (
            <a href={String(item.value)} target="_blank" rel="noopener noreferrer">
              {(fm.source_label as string) || String(item.value)}
            </a>
          ) : item.key === "official_url" ? (
            <a href={String(item.value)} target="_blank" rel="noopener noreferrer">
              {getDomain(String(item.value))}
            </a>
          ) : item.key === "location" ? (
            <a
              href={
                "https://www.google.com/maps/search/?api=1&query=" +
                encodeURIComponent(String(item.value))
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              在 Google Maps 開啟
            </a>
          ) : (
            <span class="note-property-value">{String(item.value)}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

NoteProperties.css = styles

export default (() => NoteProperties) satisfies QuartzComponentConstructor
