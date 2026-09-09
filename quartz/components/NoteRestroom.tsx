import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
// @ts-ignore
import styles from "./styles/noterestroom.scss"

// nearby_restrooms 由 Places API 批次腳本寫進 frontmatter，欄位可能不齊全，全部當選填處理
type NearbyRestroom = {
  name?: string
  location?: string
  distance?: string
}

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function googleMapsHref(name: string, location: string): string {
  // 光傳座標 Google Maps 只會落一個沒有名字的圖釘，把名稱一起塞進 query 文字裡比較好認
  const query = [name, location].filter(Boolean).join(" ")
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query)
}

const NoteRestroom: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const fm = fileData.frontmatter
  if (!fm) return null

  const info = trimmedString(fm.restroom_info)
  const floormapUrl = trimmedString(fm.floormap_url)
  const nearby: NearbyRestroom[] = Array.isArray(fm.nearby_restrooms)
    ? (fm.nearby_restrooms as NearbyRestroom[]).filter((r) => r && trimmedString(r.name))
    : []

  if (!info && !floormapUrl && nearby.length === 0) return null

  const floormapLabel = /\.pdf($|\?)/i.test(floormapUrl) ? "查看官方地圖 PDF" : "查看官方樓層導覽"

  return (
    <section class="note-restroom">
      <p class="note-restroom-heading">🚻 廁所資訊</p>
      {info && <p class="note-restroom-text">{info}</p>}
      {floormapUrl && (
        <p class="note-restroom-link">
          <a href={floormapUrl} target="_blank" rel="noopener noreferrer">
            {floormapLabel} ↗
          </a>
        </p>
      )}
      {nearby.length > 0 && (
        <>
          <p class="note-restroom-subheading">附近公廁</p>
          <ul class="note-restroom-nearby">
            {nearby.map((r) => {
              const name = trimmedString(r.name)
              const location = trimmedString(r.location)
              const distance = trimmedString(r.distance)
              return (
                <li>
                  {location ? (
                    <a
                      href={googleMapsHref(name, location)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {name}
                    </a>
                  ) : (
                    <span>{name}</span>
                  )}
                  {distance && <span class="note-restroom-distance">{distance}</span>}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

NoteRestroom.css = styles

export default (() => NoteRestroom) satisfies QuartzComponentConstructor
