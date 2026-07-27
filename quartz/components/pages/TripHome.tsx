import { ComponentChildren } from "preact"
import { htmlToJsx } from "../../util/jsx"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import { resolveRelative } from "../../util/path"
import NotePropertiesConstructor from "../NoteProperties"
import ContentMetaConstructor from "../ContentMeta"
// @ts-ignore
import tripCardsScript from "../scripts/tripcards.inline"
// @ts-ignore
import styles from "../styles/tripcards.scss"
// @ts-ignore
import notePropertiesStyles from "../styles/noteproperties.scss"

const NotePropertiesComp = NotePropertiesConstructor()
const ContentMetaComp = ContentMetaConstructor()

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

const SCORE_VALUES = ["5", "4", "3", "2", "1", "0"]

/*
const STATUS_LABEL: Record<string, string> = {
  researching: "蒐集中",
  shortlisted: "候選",
  confirmed: "已確定",
  rejected: "已剔除",
}
*/

const TripHome: QuartzComponent = (props: QuartzComponentProps) => {
  const { fileData, tree, allFiles } = props

  // 只有首頁 (index.md) 顯示卡片式清單，其他頁面維持原本的文章渲染方式
  if (fileData.slug !== "index") {
    const content = htmlToJsx(fileData.filePath!, tree) as ComponentChildren
    const classes: string[] = (fileData.frontmatter?.cssclasses as string[]) ?? []
    const classString = ["popover-hint", ...classes].join(" ")
    return (
      <>
        <NotePropertiesComp {...props} />
        <ContentMetaComp {...props} />
        <article class={classString}>{content}</article>
      </>
    )
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
  /*
  const statuses = Array.from(
    new Set(tripPages.map((f) => f.frontmatter?.status as string).filter(Boolean)),
  ).sort()
  */
  const CATEGORY_TABS = [
    { key: "type", label: "類型" },
    { key: "station", label: "車站" },
    { key: "district", label: "商圈" },
    //{ key: "status", label: "確認狀態" },
    { key: "score", label: "興致指數" }
  ]

  const introContent = htmlToJsx(fileData.filePath!, tree) as ComponentChildren
  return (
    <div class="trip-home">
      <div class="trip-intro">{introContent}</div>
      <div class="trip-filters">
        <div class="trip-category-tabs">
          {CATEGORY_TABS.map((c, i) => (
            <button
              class={`trip-tab${i === 0 ? " active" : ""}`}
              data-category-tab={c.key}
            >
              {c.label}
            </button>
          ))}
          <button class="trip-reset" data-filter-key="all" data-filter-value="all">
            顯示全部
          </button>
        </div>

        <div class="trip-chip-panel" data-category-panel="type">
          {Object.entries(TYPE_META).map(([key, meta]) => (
            <button class="trip-chip" data-filter-key="type" data-filter-value={key}>
              {meta.icon} {meta.label}
            </button>
          ))}
        </div>
        <div class="trip-chip-panel" data-category-panel="station" hidden>
          {stations.map((s) => (
            <button class="trip-chip" data-filter-key="station" data-filter-value={s}>
              {s}
            </button>
          ))}
        </div>
        <div class="trip-chip-panel" data-category-panel="district" hidden>
          {districts.map((d) => (
            <button class="trip-chip" data-filter-key="district" data-filter-value={d}>
              {d}
            </button>
          ))}
        </div>
        <div class="trip-chip-panel" data-category-panel="score" hidden>
          {SCORE_VALUES.map((s) => (
            <button class="trip-chip" data-filter-key="score" data-filter-value={s}>
              {Number(s) > 0 ? "⭐".repeat(Number(s)) : "0（不感興趣）"}
            </button>
          ))}
        </div>       
      </div>
      <div class="trip-grid">
        {tripPages.map((page) => {
          const fm = page.frontmatter!
          const type = (fm.type as string) ?? "place"
          const meta = TYPE_META[type] ?? TYPE_META.place
          const priority = fm.priority as string | undefined
          const station = (fm.station as string) ?? ""
          const district = (fm.district as string) ?? ""
          const status = (fm.status as string) ?? ""
          const image = fm.image as string | undefined
          const score = (fm["興致指數"] as string) ?? ""
          return (
            <a
              class="trip-card"
              href={resolveRelative(fileData.slug!, page.slug!)}
              data-type={type}
              data-station={station}
              data-district={district}
              data-status={status}
              data-score={score}
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

//TripHome.css = styles
TripHome.css = [styles, notePropertiesStyles]
// @ts-ignore
TripHome.afterDOMLoaded = tripCardsScript

export default (() => TripHome) satisfies QuartzComponentConstructor