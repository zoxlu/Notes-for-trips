import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { resolveImagePath } from "../util/path"
// @ts-ignore
import styles from "./styles/noterestroom.scss"

// nearby_restrooms 由 Places API 批次腳本寫進 frontmatter，欄位可能不齊全，全部當選填處理
type NearbyRestroom = {
  name?: string
  location?: string
  distance?: string
  place_id?: string
}

// 官方平面圖，存在 04-Attachments/。只收錄圖上真的有標廁所圖示的圖
type FloormapImage = {
  label?: string
  file?: string
}

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function googleMapsHref(location: string, placeId: string): string {
  // query 只能放「座標」或「地點名稱」其中一種，兩者混在一起 Google Maps 會當成
  // 一整串文字去搜而找不到東西。這裡固定用座標（圖釘落點一定正確），地點名稱與
  // 資訊卡則交給 query_place_id 帶出來；沒有 place_id 時就只落一個座標圖釘。
  const base =
    "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(location.trim())
  return placeId ? base + "&query_place_id=" + encodeURIComponent(placeId) : base
}

const NoteRestroom: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const fm = fileData.frontmatter
  if (!fm) return null

  const info = trimmedString(fm.restroom_info)
  const floormapUrl = trimmedString(fm.floormap_url)
  const floormapSource = trimmedString(fm.floormap_source)
  const nearby: NearbyRestroom[] = Array.isArray(fm.nearby_restrooms)
    ? (fm.nearby_restrooms as NearbyRestroom[]).filter((r) => r && trimmedString(r.name))
    : []
  const maps: FloormapImage[] = Array.isArray(fm.floormap_images)
    ? (fm.floormap_images as FloormapImage[]).filter((m) => m && trimmedString(m.file))
    : []

  if (!info && !floormapUrl && nearby.length === 0 && maps.length === 0) return null

  const floormapLabel = /\.pdf($|\?)/i.test(floormapUrl) ? "查看官方地圖 PDF" : "查看官方樓層導覽"

  return (
    <section class="note-restroom">
      <p class="note-restroom-heading">🚻 廁所資訊</p>
      {info && <p class="note-restroom-text">{info}</p>}
      {maps.length > 0 && (
        <>
          <div class="note-restroom-maps">
            {maps.map((m) => {
              const src = resolveImagePath(trimmedString(m.file), fileData.slug!)
              const label = trimmedString(m.label)
              return (
                <figure class="note-restroom-map">
                  {/* 點圖直接開原圖，手機上才放得大看清楚廁所圖示 */}
                  <a href={src} target="_blank" rel="noopener noreferrer">
                    <img src={src} alt={`${fm.title as string} ${label} 平面圖`} loading="lazy" />
                  </a>
                  {label && <figcaption>{label}</figcaption>}
                </figure>
              )
            })}
          </div>
          <p class="note-restroom-caption">
            點圖可開啟原圖放大
            {floormapSource && `（平面圖${floormapSource}）`}
          </p>
        </>
      )}
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
              const placeId = trimmedString(r.place_id)
              return (
                <li>
                  {location ? (
                    <a
                      href={googleMapsHref(location, placeId)}
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
