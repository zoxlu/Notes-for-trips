// 通用圖片燈箱：點圖時原地開一個覆蓋層放大，不離開頁面，不用按瀏覽器的上一頁回來。
//
// 套用對象有三種，各自成一組、組內可翻頁：
//   1. 廁所平面圖（.note-restroom-maps，圖包在 <a> 裡）
//   2. 筆記封面圖（.note-cover-image，被 object-fit: cover 裁切過，
//      家人常看不出來可以點開看完整版，所以另外加了提示標籤）
//   3. 內文圖片（article 裡的 <img>）
// 前者的 <a> 在 JS 失效時仍可正常開圖；後兩者本來就只是 <img>。

type Slide = { src: string; caption: string }

let overlay: HTMLDivElement | null = null
let slides: Slide[] = []
let index = 0

function closeOverlay() {
  if (!overlay) return
  overlay.remove()
  overlay = null
  slides = []
  document.body.style.removeProperty("overflow")
  document.removeEventListener("keydown", onKeydown)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") closeOverlay()
  else if (e.key === "ArrowLeft") show(index - 1)
  else if (e.key === "ArrowRight") show(index + 1)
}

// 只在多張時循環，單張時什麼都不做
function show(next: number) {
  if (!overlay || slides.length === 0) return
  index = (next + slides.length) % slides.length
  const slide = slides[index]

  const img = overlay.querySelector("img")!
  img.src = slide.src
  img.alt = slide.caption
  overlay.classList.remove("zoomed") // 換圖時回到「符合螢幕」
  overlay.scrollTo({ top: 0, left: 0 })
  updateCaption()
}

function updateCaption() {
  if (!overlay) return
  const cap = overlay.querySelector<HTMLParagraphElement>(".restroom-lightbox-caption")!
  const zoomed = overlay.classList.contains("zoomed")
  const parts = [
    slides[index].caption,
    slides.length > 1 ? `${index + 1} / ${slides.length}` : "",
    zoomed ? "點圖縮回" : "點圖放大到原始尺寸",
  ].filter(Boolean)
  cap.textContent = parts.join("　·　")
}

function button(cls: string, label: string, text: string) {
  const b = document.createElement("button")
  b.className = cls
  b.type = "button"
  b.setAttribute("aria-label", label)
  b.textContent = text
  return b
}

function openOverlay(group: Slide[], start: number) {
  closeOverlay()
  slides = group
  index = start

  overlay = document.createElement("div")
  overlay.className = "restroom-lightbox"

  const close = button("restroom-lightbox-close", "關閉", "✕ 關閉")
  const prev = button("restroom-lightbox-nav prev", "上一張", "‹")
  const next = button("restroom-lightbox-nav next", "下一張", "›")
  const img = document.createElement("img")
  const cap = document.createElement("p")
  cap.className = "restroom-lightbox-caption"

  overlay.append(close, img, cap)
  if (slides.length > 1) overlay.append(prev, next)

  close.addEventListener("click", closeOverlay)
  prev.addEventListener("click", (e) => {
    e.stopPropagation()
    show(index - 1)
  })
  next.addEventListener("click", (e) => {
    e.stopPropagation()
    show(index + 1)
  })

  // 平面圖字很小，只「縮到符合螢幕」在手機上根本看不清廁所圖示，
  // 所以點圖可以切換成原始尺寸，這時覆蓋層本身可以捲動來看細節
  img.addEventListener("click", () => {
    overlay!.classList.toggle("zoomed")
    if (!overlay!.classList.contains("zoomed")) overlay!.scrollTo({ top: 0, left: 0 })
    updateCaption()
  })

  // 點圖片以外的背景就關掉
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay()
  })

  // 手機滑動翻頁；放大檢視時滑動要留給捲動用，所以不攔截
  let touchX: number | null = null
  overlay.addEventListener(
    "touchstart",
    (e) => {
      touchX = e.changedTouches[0]?.clientX ?? null
    },
    { passive: true },
  )
  overlay.addEventListener(
    "touchend",
    (e) => {
      if (touchX === null || overlay!.classList.contains("zoomed") || slides.length < 2) return
      const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX
      if (Math.abs(dx) > 50) show(dx < 0 ? index + 1 : index - 1)
      touchX = null
    },
    { passive: true },
  )

  document.body.append(overlay)
  document.body.style.overflow = "hidden"
  document.addEventListener("keydown", onKeydown)
  show(index)
}

function bindGroup(imgs: HTMLImageElement[], hrefOf: (el: HTMLImageElement) => string) {
  if (imgs.length === 0) return
  const group: Slide[] = imgs.map((el) => ({
    src: hrefOf(el),
    caption: el.closest("figure")?.querySelector("figcaption")?.textContent?.trim() || el.alt || "",
  }))

  imgs.forEach((el, i) => {
    // 圖片包在 <a> 裡（廁所平面圖）就綁在 <a> 上，否則綁在 <img> 本身
    const target: HTMLElement = el.closest("a") ?? el
    if (target.dataset.lightboxBound === "true") return
    target.dataset.lightboxBound = "true"
    target.classList.add("lightbox-zoomable")
    target.addEventListener("click", (e) => {
      // 使用者若刻意要開新分頁（Ctrl/⌘+點擊、中鍵）就不攔截
      if (e.metaKey || e.ctrlKey || e.shiftKey || (e as MouseEvent).button !== 0) return
      e.preventDefault()
      // 連 window 層的 SPA 路由都不要收到這個事件（另一道保險是 <a> 上的
      // data-router-ignore），否則它會自己導航到圖片網址
      e.stopPropagation()
      openOverlay(group, i)
    })
  })
}

function setup() {
  // 換頁時把殘留的燈箱收掉（Quartz 是 SPA 導航）
  closeOverlay()

  // 1. 廁所平面圖：同一區塊的各樓層算一組
  document.querySelectorAll<HTMLDivElement>(".note-restroom-maps").forEach((container) => {
    const imgs = Array.from(container.querySelectorAll<HTMLImageElement>(".note-restroom-map img"))
    bindGroup(imgs, (el) => el.closest("a")?.getAttribute("href") ?? el.src)
  })

  // 2. 封面圖：自成一組
  document.querySelectorAll<HTMLImageElement>(".note-cover-image").forEach((el) => {
    bindGroup([el], (i) => i.src)
  })

  // 3. 內文圖片：整篇算一組，可直接左右翻
  document.querySelectorAll<HTMLElement>("article").forEach((article) => {
    const imgs = Array.from(article.querySelectorAll<HTMLImageElement>("img")).filter((el) => {
      const a = el.closest("a")
      // 圖片若被包在「連到別處」的連結裡（例如外部網站），維持原本的連結行為
      return !a || a.getAttribute("href") === el.getAttribute("src")
    })
    bindGroup(imgs, (el) => el.src)
  })
}

document.addEventListener("nav", setup)
setup()
