import { Root as HTMLRoot, Element } from "hast"
import { visit } from "unist-util-visit"
import { QuartzTransformerPlugin } from "../types"
import { resolveImagePath } from "../../util/path"

// 筆記頁面現在會把 frontmatter 的 image 欄位另外畫成跟地圖並排的代表圖（見
// TripHome.tsx），如果內文（通常在「## 簡介」段落）也用 Obsidian 的 ![[...]]
// 語法嵌入同一張圖，畫面上就會出現兩次一模一樣的圖。這裡在內文渲染成 HTML 之後，
// 把跟 frontmatter.image 解析後路徑相同的 <img> 全部拿掉（可能不只一次，例如
// 引用區塊裡又貼一次），不影響內文裡其他不同的圖片
export const RemoveDuplicateCoverImage: QuartzTransformerPlugin = () => {
  return {
    name: "RemoveDuplicateCoverImage",
    htmlPlugins() {
      return [
        () => (tree: HTMLRoot, file) => {
          const image = file.data.frontmatter?.image as string | undefined
          const slug = file.data.slug
          if (!image || !slug) return

          const resolvedSrc = resolveImagePath(image, slug)

          visit(tree, "element", (node: Element, index, parent) => {
            if (
              node.tagName === "img" &&
              node.properties?.src === resolvedSrc &&
              parent &&
              typeof index === "number"
            ) {
              parent.children.splice(index, 1)
              return index
            }
          })

          // 圖片拿掉後，Obsidian embed 通常自己佔一個段落，留下的空 <p> 順便清掉
          visit(tree, "element", (node: Element, index, parent) => {
            const isEmptyParagraph =
              node.tagName === "p" &&
              node.children.every((child) => child.type === "text" && /^\s*$/.test(child.value))
            if (isEmptyParagraph && parent && typeof index === "number") {
              parent.children.splice(index, 1)
              return index
            }
          })
        },
      ]
    },
  }
}
