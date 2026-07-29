// 篩選狀態：以「群組」為單位記住各自選中的條件，
// 例如 { type: {key: "category", value: "文化古蹟"}, district: {key: "district", value: "名古屋站前"} }
// 群組名稱對應 .trip-chip-panel 的 data-category-panel（type / station / district / score）。
// 卡片顯示與否，是「所有作用中群組的條件」同時成立（AND），
// 同一個群組內任何時候最多只有一個條件生效（單選，符合現有 tab 底下按鈕的互動習慣）。
type FilterCondition = { key: string; value: string; label: string }
const activeFilters: Record<string, FilterCondition> = {}

function showPanel(category: string) {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".trip-tab")
  const panels = document.querySelectorAll<HTMLDivElement>(".trip-chip-panel")
  tabs.forEach((t) =>
    t.classList.toggle("active", t.getAttribute("data-category-tab") === category),
  )
  panels.forEach((p) => {
    if (p.getAttribute("data-category-panel") === category) {
      p.removeAttribute("hidden")
    } else {
      p.setAttribute("hidden", "")
    }
  })
}

function cardMatchesCondition(card: HTMLAnchorElement, condition: FilterCondition): boolean {
  const { key, value } = condition
  if (key === "category") {
    // place_category / food_category 陣列比對（data-categories 逗號分隔）
    return (card.getAttribute("data-categories") ?? "").split(",").filter(Boolean).includes(value)
  }
  // 其他 key（type/station/district/score）維持單值比對
  return card.getAttribute(`data-${key}`) === value
}

// 核心篩選：同時套用 activeFilters 裡「所有」群組的條件（AND），
// 沒有任何作用中群組時（activeFilters 是空物件）視為顯示全部。
function applyFilters() {
  const cards = document.querySelectorAll<HTMLAnchorElement>(".trip-card")
  const conditions = Object.values(activeFilters)
  cards.forEach((card) => {
    const matchesAll = conditions.every((condition) => cardMatchesCondition(card, condition))
    card.classList.toggle("trip-card-hidden", !matchesAll)
  })
}

// tab 文字旁的小圓點：只要該群組目前有作用中的篩選條件就顯示
function updateTabBadges() {
  document.querySelectorAll<HTMLButtonElement>(".trip-tab").forEach((tab) => {
    const group = tab.getAttribute("data-category-tab") ?? ""
    const badge = tab.querySelector<HTMLElement>(".trip-tab-badge")
    if (badge) {
      badge.hidden = !activeFilters[group]
    }
  })
}

// 常駐的「目前篩選條件」chip 列：不管切到哪個 tab 都固定顯示所有群組的選擇，
// 每個 chip 可以單獨點擊移除該群組的條件（不用切回對應的 tab 才能取消）。
function renderActiveFilterBar() {
  const bar = document.querySelector<HTMLElement>(".trip-active-filters")
  if (!bar) return
  bar.innerHTML = ""

  const groups = Object.keys(activeFilters)
  if (groups.length === 0) {
    bar.setAttribute("hidden", "")
    return
  }
  bar.removeAttribute("hidden")

  groups.forEach((group) => {
    const condition = activeFilters[group]
    const chip = document.createElement("button")
    chip.type = "button"
    chip.className = "trip-active-chip"
    chip.setAttribute("aria-label", `移除篩選條件：${condition.label}`)

    const labelSpan = document.createElement("span")
    labelSpan.textContent = condition.label
    const removeSpan = document.createElement("span")
    removeSpan.className = "trip-active-chip-remove"
    removeSpan.textContent = "✕"

    chip.appendChild(labelSpan)
    chip.appendChild(removeSpan)
    chip.addEventListener("click", () => clearGroupFilter(group))
    bar.appendChild(chip)
  })
}

// 每次篩選狀態變動後統一呼叫，確保卡片、tab 徽章、常駐 chip 列三者同步。
function syncUI() {
  applyFilters()
  updateTabBadges()
  renderActiveFilterBar()
  setResetActive(Object.keys(activeFilters).length > 0)
}

// 清掉單一群組的篩選條件（例如點常駐 chip 列的 ✕），其他群組維持原樣。
function clearGroupFilter(group: string) {
  delete activeFilters[group]
  document
    .querySelectorAll<HTMLButtonElement>(`.trip-chip-panel[data-category-panel="${group}"] .trip-chip`)
    .forEach((c) => c.classList.remove("active"))
  syncUI()
}

function setResetActive(isActive: boolean) {
  const resetBtn = document.querySelector<HTMLButtonElement>(".trip-reset")
  if (isActive) {
    resetBtn?.classList.add("active")
  } else {
    resetBtn?.classList.remove("active")
  }
}

// 找出某個 chip 屬於哪個群組（type/station/district/score），
// 判斷依據是它所在的 .trip-chip-panel 的 data-category-panel。
function getChipGroup(chip: HTMLButtonElement): string {
  const panel = chip.closest<HTMLElement>(".trip-chip-panel")
  return panel?.getAttribute("data-category-panel") ?? "unknown"
}

// 設定某個群組目前選中的條件，並只更新「該群組內」chip 的 active 樣式，
// 不影響其他群組已經選好的 chip 視覺狀態。
function setGroupFilter(group: string, key: string, value: string, label: string) {
  activeFilters[group] = { key, value, label }

  const panel = document.querySelector<HTMLElement>(
    `.trip-chip-panel[data-category-panel="${group}"]`,
  )
  panel?.querySelectorAll<HTMLButtonElement>(".trip-chip").forEach((c) => {
    const chipKey = c.getAttribute("data-filter-key")
    const chipValue = c.getAttribute("data-filter-value")
    c.classList.toggle("active", chipKey === key && chipValue === value)
  })

  syncUI()
}

// 全域重置：清掉所有群組的篩選狀態，回到顯示全部。
function resetAllFilters() {
  Object.keys(activeFilters).forEach((group) => delete activeFilters[group])
  document.querySelectorAll(".trip-chip").forEach((c) => c.classList.remove("active"))
  syncUI()
}

function setupTripCards() {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".trip-tab")
  const resetBtn = document.querySelector<HTMLButtonElement>(".trip-reset")
  const chips = document.querySelectorAll<HTMLButtonElement>(".trip-chip")
  const cards = document.querySelectorAll<HTMLAnchorElement>(".trip-card")

  if (cards.length > 0) {
    tabs.forEach((tab) => {
      if (tab.dataset.tripBound === "true") return
      tab.dataset.tripBound = "true"
      tab.addEventListener("click", () => {
        const category = tab.getAttribute("data-category-tab") ?? "type"
        showPanel(category)
      })
    })

    if (resetBtn && resetBtn.dataset.tripBound !== "true") {
      resetBtn.dataset.tripBound = "true"
      resetBtn.addEventListener("click", () => {
        resetAllFilters()
      })
    }

    chips.forEach((chip) => {
      if (chip.dataset.tripBound === "true") return
      chip.dataset.tripBound = "true"
      chip.addEventListener("click", () => {
        const key = chip.getAttribute("data-filter-key") ?? "all"
        const value = chip.getAttribute("data-filter-value") ?? "all"
        const group = getChipGroup(chip)

        if (key === "all") {
          // 該群組內的「顯示全部」（例如子分類頁籤裡如果也有一個群組內重置選項）：
          // 只清掉這個群組的條件，其他群組維持原樣。
          clearGroupFilter(group)
          return
        }

        const label = chip.textContent?.trim() ?? value
        setGroupFilter(group, key, value, label)
      })
    })

    // 首頁按鈕直接篩選具體數值，例如 /?filterKey=category&filterValue=美食名店
    const params = new URLSearchParams(window.location.search)
    const urlKey = params.get("filterKey")
    const urlValue = params.get("filterValue")
    if (urlKey && urlValue) {
      const matchingChip = Array.from(chips).find(
        (c) =>
          c.getAttribute("data-filter-key") === urlKey &&
          c.getAttribute("data-filter-value") === urlValue,
      )
      if (matchingChip) {
        const group = getChipGroup(matchingChip)
        const label = matchingChip.textContent?.trim() ?? urlValue
        showPanel(group)
        setGroupFilter(group, urlKey, urlValue, label)
      }
    } else {
      // 側邊欄快捷按鈕跳轉，只切換分類 tab，不預選特定數值
      const showCategory = params.get("showCategory")
      if (showCategory) {
        showPanel(showCategory)
      }
    }
  }

  // 側邊欄快捷連結：不管目前在哪一頁都綁定一次即可，點擊時永遠重新抓取當下畫面狀態
  document.querySelectorAll<HTMLAnchorElement>(".quick-filter-link").forEach((link) => {
    if (link.dataset.tripBound === "true") return
    link.dataset.tripBound = "true"
    link.addEventListener("click", (e) => {
      const url = new URL(link.href, window.location.href)
      if (url.pathname !== window.location.pathname) return
      // 已經在首頁上，直接處理，不整頁導航
      e.preventDefault()
      e.stopPropagation()
      const category = url.searchParams.get("showCategory")
      if (category) {
        showPanel(category)
      } else {
        resetAllFilters()
        showPanel("type")
      }
    })
  })
}

document.addEventListener("nav", setupTripCards)
setupTripCards()

// 商圈/捷運站的篩選連結：用純文字元素 + 手動 JS 跳轉，完全不用 <a> 標籤，
// 這樣 Quartz 的 SPA 機制（只找 <a> 標籤）從結構上就不可能接管這個點擊。
function setupPropertyLinks() {
  document.querySelectorAll<HTMLElement>(".trip-property-link").forEach((el) => {
    if (el.dataset.tripBound === "true") return
    el.dataset.tripBound = "true"
    el.addEventListener("click", () => {
      const target = el.dataset.targetHref
      if (target) {
        window.location.href = target
      }
    })
  })
}
document.addEventListener("nav", setupPropertyLinks)
setupPropertyLinks()