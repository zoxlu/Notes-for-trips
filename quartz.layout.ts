import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"
import { FileTrieNode } from "./quartz/util/fileTrie"

const explorerFilterFn = (node: FileTrieNode) =>
  node.slugSegment !== "tags" && !(node.data?.tags ?? []).includes("hide-nav")

// NOTE: sortFn is serialized via .toString() and re-run client-side outside this
// module's scope, so it cannot reference outer closures — the order map must be
// declared inside the function body.
const explorerSortFn = (a: FileTrieNode, b: FileTrieNode) => {
  // manual order for "1. 分類瀏覽" entries; everything else falls back to alphabetical
  const explorerManualOrder: Record<string, number> = {
    "By-District": 1,
    "By-Line": 2,
    "By-Station": 3,
    "By-Type": 4,
    "By-Meal": 5,
    資訊來源清單: 6,
  }
  const aOrder = explorerManualOrder[a.slugSegment]
  const bOrder = explorerManualOrder[b.slugSegment]
  if (aOrder !== undefined && bOrder !== undefined) {
    return aOrder - bOrder
  }

  if ((!a.isFolder && !b.isFolder) || (a.isFolder && b.isFolder)) {
    return a.displayName.localeCompare(b.displayName, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  }

  if (!a.isFolder && b.isFolder) {
    return 1
  } else {
    return -1
  }
}

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [],
  footer: Component.Footer({
    links: {
      GitHub: "https://github.com/jackyzha0/quartz",
      "Discord Community": "https://discord.gg/cRFFHYye7t",
    },
  }),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    //Component.ContentMeta(),
    //Component.NoteProperties(),
    //Component.ContentMeta(),
    //Component.TagList(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
      ],
    }),
    Component.Flex({
      components: [{ Component: Component.Darkmode() }, { Component: Component.ReaderMode() }],
    }),
    //Component.QuickFilters(),
    //Component.Explorer(),
    Component.Explorer({
      folderClickBehavior: "collapse",
      filterFn: explorerFilterFn,
      sortFn: explorerSortFn,
    }),
  ],
  right: [
    //Component.Graph(),
    //Component.DesktopOnly(Component.TableOfContents()),
    //Component.Backlinks(),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.Breadcrumbs(), Component.ArticleTitle(), Component.ContentMeta()],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
      ],
    }),
    Component.Flex({
      components: [{ Component: Component.Darkmode() }],
    }),
    //Component.Explorer(),
    Component.Explorer({
      folderClickBehavior: "collapse",
      filterFn: explorerFilterFn,
      sortFn: explorerSortFn,
    }),
  ],
  right: [],
}
