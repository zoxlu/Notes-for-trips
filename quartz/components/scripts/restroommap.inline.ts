// 廁所平面圖的燈箱：點縮圖時原地開一個覆蓋層放大，不離開頁面，
// 才不用按瀏覽器的上一頁回來。JS 失效時 <a> 仍會照原本的方式開新分頁。
//
// 同一則筆記的平面圖會被收成一組（例如名古屋市科學館 7 層、LACHIC 9 層），
// 在燈箱裡可以用左右箭頭／方向鍵／手機滑動直接翻頁，不用關掉再點開。

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

function setup() {
  // 換頁時把殘留的燈箱收掉（Quartz 是 SPA 導航）
  closeOverlay()

  document.querySelectorAll<HTMLDivElement>(".note-restroom-maps").forEach((container) => {
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>(".note-restroom-map a"))
    const group: Slide[] = links.map((a) => ({
      src: a.getAttribute("href") ?? "",
      caption: a.closest("figure")?.querySelector("figcaption")?.textContent?.trim() ?? "",
    }))

    links.forEach((a, i) => {
      if (a.dataset.lightboxBound === "true") return
      a.dataset.lightboxBound = "true"
      a.addEventListener("click", (e) => {
        // 使用者若刻意要開新分頁（Ctrl/⌘+點擊、中鍵）就不攔截
        if (e.metaKey || e.ctrlKey || e.shiftKey || (e as MouseEvent).button !== 0) return
        e.preventDefault()
        // 連 window 層的 SPA 路由都不要收到這個事件（另一道保險是 <a> 上的
        // data-router-ignore），否則它會自己導航到圖片網址
        e.stopPropagation()
        openOverlay(group, i)
      })
    })
  })
}

document.addEventListener("nav", setup)
setup()
