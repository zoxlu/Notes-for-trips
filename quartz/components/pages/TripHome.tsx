import { ComponentChildren } from "preact"
import { htmlToJsx } from "../../util/jsx"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import { resolveRelative } from "../../util/path"
// @ts-ignore
import tripCardsScript from "../scripts/tripcards.inline"
// @ts-ignore
import styles from "../styles/tripcards.scss"

type TypeMeta = { icon: string; bg: string; fg: string; label: string }

const TYPE_META: Record<string, TypeMeta> = {
  place: { icon: "🏯", bg: "#FAECE7", fg: "#993C1D", label: "景點" },
  food: { icon: "🍣", bg: "#FAEEDA", fg: "#854F0B", label: "美食" },
  accommodation: { icon: "🛌", bg: "#E6F1FB", fg: "#0C447C", label: "住宿" },
  activity: { icon: "🥾", bg: "#EAF3DE", fg: "#27500A", label: "活動" },
  transport: { icon: "🚃", bg: "#EFEFEF", fg: "#3A3A3A", label: "交通" },
}

const PRIORITY_LABEL: Record<string, string> = {
  must: "必去",
  "nice-to-have": "推薦",
  optional: "選項",
}

const TripHome: QuartzComponent = (props: QuartzComponentProps) => {
  const { fileData, tree, allFiles } = props

  // 只有首頁 (index.md) 顯示卡片式清單，其他頁面維持原本的文章渲染方式
  if (fileData.slug !== "index") {
    const content = htmlToJsx(fileData.filePath!, tree) as ComponentChildren
    const classes: string[] = (fileData.frontmatter?.cssclasses as string[]) ?? []
    const classString = ["popover-hint", ...classes].join(" ")
    return <article class={classString}>{content}</article>
  }

  const tripPages = allFiles.filter(
    (f) => !!f.frontmatter?.type && f.slug !== fileData.slug,
  )

  const stations = Array.from(
    new Set(tripPages.map((f) => f.frontmatter?.station as string).filter(Boolean)),
  ).sort()
  const districts = Array.from(
    new Set(tripPages.map((f) => f.frontmatter?.district as string).filter(Boolean)),
  ).sort()

  return (
    <div class="trip-home">
      <div class="trip-filters">
        <button class="trip-chip active" data-filter-key="all" data-filter-value="all">
          全部
        </button>
        {stations.map((s) => (
          <button class="trip-chip" data-filter-key="station" data-filter-value={s}>
            {s}
          </button>
        ))}
        {districts.map((d) => (
          <button class="trip-chip" data-filter-key="district" data-filter-value={d}>
            {d}
          </button>
        ))}
      </div>
      <div class="trip-grid">
        {tripPages.map((page) => {
          const fm = page.frontmatter!
          const type = (fm.type as string) ?? "place"
          const meta = TYPE_META[type] ?? TYPE_META.place
          const priority = fm.priority as string | undefined
          const station = (fm.station as string) ?? ""
          const district = (fm.district as string) ?? ""
          const image = fm.image as string | undefined

          return (
            <a
              class="trip-card"
              href={resolveRelative(fileData.slug!, page.slug!)}
              data-station={station}
              data-district={district}
            >
              <div class="trip-card-image" style={{ background: meta.bg }}>
                {image ? (
                  <img src={image} alt={fm.title as string} class="trip-card-img" />
                ) : (
                  <span class="trip-card-icon">{meta.icon}</span>
                )}
              </div>
              <div class="trip-card-body">
                <p class="trip-card-title">{fm.title as string}</p>
                <p class="trip-card-meta">{[station, district].filter(Boolean).join(" · ")}</p>
                {fm.opening_hours && <p class="trip-card-meta">{fm.opening_hours as string}</p>}
                {priority && (
                  <span class={`trip-pill trip-pill-${priority}`}>
                    {PRIORITY_LABEL[priority] ?? priority}
                  </span>
                )}
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}

TripHome.css = styles
// @ts-ignore
TripHome.afterDOMLoaded = tripCardsScript

export default (() => TripHome) satisfies QuartzComponentConstructor
