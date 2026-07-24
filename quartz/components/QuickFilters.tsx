import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { resolveRelative } from "../util/path"
// @ts-ignore
import styles from "./styles/quickfilters.scss"

const QuickFilters: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const indexPath = resolveRelative(fileData.slug!, "index" as any)
  return (
    <a class="home-button" href={indexPath}>
      🏠 回首頁
    </a>
  )
}

QuickFilters.css = styles

export default (() => QuickFilters) satisfies QuartzComponentConstructor