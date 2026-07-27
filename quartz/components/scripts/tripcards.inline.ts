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

function applyFilter(key: string, value: string) {
  const cards = document.querySelectorAll<HTMLAnchorElement>(".trip-card")
  if (key === "all") {
    cards.forEach((card) => card.classList.remove("trip-card-hidden"))
    return
  }
  cards.forEach((card) => {
    const cardValue = card.getAttribute(`data-${key}`)
    if (cardValue === value) {
      card.classList.remove("trip-card-hidden")
    } else {
      card.classList.add("trip-card-hidden")
    }
  })
}

function setResetActive(isActive: boolean) {
  const resetBtn = document.querySelector<HTMLButtonElement>(".trip-reset")
  if (isActive) {
    resetBtn?.classList.add("active")
  } else {
    resetBtn?.classList.remove("active")
  }
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
        document.querySelectorAll(".trip-chip").forEach((c) => c.classList.remove("active"))
        applyFilter("all", "all")
        setResetActive(false)
      })
    }

    chips.forEach((chip) => {
      if (chip.dataset.tripBound === "true") return
      chip.dataset.tripBound = "true"
      chip.addEventListener("click", () => {
        document.querySelectorAll(".trip-chip").forEach((c) => c.classList.remove("active"))
        chip.classList.add("active")
        const key = chip.getAttribute("data-filter-key") ?? "all"
        const value = chip.getAttribute("data-filter-value") ?? "all"
        applyFilter(key, value)
        setResetActive(key !== "all")
      })
    })

    // 首頁按鈕直接篩選具體數值，例如 /?filterKey=type&filterValue=food
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
        showPanel(urlKey)
        document.querySelectorAll(".trip-chip").forEach((c) => c.classList.remove("active"))
        matchingChip.classList.add("active")
        applyFilter(urlKey, urlValue)
        setResetActive(true)
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
        document.querySelectorAll(".trip-chip").forEach((c) => c.classList.remove("active"))
        applyFilter("all", "all")
        setResetActive(false)
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