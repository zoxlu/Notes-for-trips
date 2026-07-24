import { pathToRoot, joinSegments } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"

const PageTitle: QuartzComponent = ({ fileData, cfg, displayClass }: QuartzComponentProps) => {
  const title = cfg?.pageTitle ?? i18n(cfg.locale).propertyDefaults.title
  const baseDir = pathToRoot(fileData.slug!)
  const logoPath = joinSegments(baseDir, "static/logo.png")
  return (
    <h2 class={classNames(displayClass, "page-title")}>
      <a href={baseDir}>
        <img src={logoPath} alt={title} width="200" class="page-title-logo" />
      </a>
    </h2>
  )
}

PageTitle.css = `
.page-title {
  margin: 0;
}
.page-title-logo {
  display: block;
  width: 100%;
  max-width: 200px;
  border-radius: 6px;
}
`

export default (() => PageTitle) satisfies QuartzComponentConstructor