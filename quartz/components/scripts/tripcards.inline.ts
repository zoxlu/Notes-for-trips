function setupTripCards() {
  const chips = document.querySelectorAll<HTMLButtonElement>(".trip-chip")
  const cards = document.querySelectorAll<HTMLAnchorElement>(".trip-card")
  if (chips.length === 0 || cards.length === 0) return

  function applyFilter(key: string, value: string) {
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

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("active"))
      chip.classList.add("active")
      const key = chip.getAttribute("data-filter-key") ?? "all"
      const value = chip.getAttribute("data-filter-value") ?? "all"
      applyFilter(key, value)
    })
  })
}

document.addEventListener("nav", setupTripCards)
