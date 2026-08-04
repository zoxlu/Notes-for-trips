import { MarkerClusterer } from "@googlemaps/markerclusterer"

type NoteMapPoint = {
  title: string
  label: string
  href?: string
  lat: number
  lng: number
  icon: string
  fg: string
}

type NoteMapPayload = {
  apiKey: string
  self: NoteMapPoint
  others: NoteMapPoint[]
}

let googleMapsLoader: Promise<void> | undefined

// InfoWindow 的 DOM 節點不是掛在地圖的 canvas 底下，換頁時就算把 canvas 整個換掉，
// 舊的 InfoWindow 也不會跟著消失，要自己記住上一次開的是哪個，換頁時手動關掉，
// 否則舊筆記留下的資訊視窗會一直飄在畫面上，變成看起來「跟標記對不上」的假象
let activeInfoWindow: google.maps.InfoWindow | undefined

// 動態載入 Google Maps JS API script，整個網站共用一份，SPA 換頁時如果已經載入過就直接沿用
function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof google !== "undefined" && google.maps) return Promise.resolve()
  if (googleMapsLoader) return googleMapsLoader

  googleMapsLoader = new Promise((resolve, reject) => {
    const callbackName = "__notemapOnGoogleMapsReady"
    ;(window as unknown as Record<string, () => void>)[callbackName] = () => resolve()

    const script = document.createElement("script")
    script.src =
      "https://maps.googleapis.com/maps/api/js?key=" +
      encodeURIComponent(apiKey) +
      "&loading=async&callback=" +
      callbackName
    script.async = true
    // 沒有 data-persist 的話，SPA 換頁時這個 <script> 標籤會被 Quartz 的路由器清掉
    // （雖然已經執行過的 JS 不會因此消失，但沒必要讓它處在會被清掉的狀態）
    script.dataset.persist = "true"
    script.onerror = () => reject(new Error("google maps script failed to load"))
    document.head.appendChild(script)
  })
  return googleMapsLoader
}

// 點群聚圓圈展開時，縮放層級最多只會拉到這裡，避免圓圈裡的標記彼此靠得很近時
// fitBounds() 把地圖拉到街道等級、失去跟周圍的相對位置感
const CLUSTER_CLICK_MAX_ZOOM = 18

// 地圖初始化時的縮放層級，「回到起點」按鈕會拉回這個值（跟初始化時的 center 一起
// 構成使用者一開始看到的視角）
const DEFAULT_ZOOM = 16

// 群聚圓圈的顏色：套件不指定的話預設是 Google 自己的藍色，跟這個地圖其餘標記／膠囊
// 的暖色系配色不搭，這裡改用跟膠囊（notemap.scss 的 $map-tertiary / $map-dark）
// 同一組顏色，讓群聚圓圈看起來也是同一套設計語言的一部分，而不是外來的元件
const CLUSTER_FILL = "#c48a8f"
const CLUSTER_TEXT = "#2b2422"

// 地圖本身的樣式：關掉 Google 自己的 POI／大眾運輸圖示跟文字標籤，只留路名/地形等基本資訊，
// 避免跟我們自己畫的標記混在一起看不清楚
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
]

// 用經典 google.maps.Marker（非 AdvancedMarkerElement），不需要額外設定 Map ID 或載入 marker library。
// 自己筆記跟其他地點共用同一套「該類型深色實心圓＋白色外框」風格（淺色底之前在地圖底圖上
// 太不顯眼，實心配白邊在任何底圖上都能跳出來）；自身標記單純用尺寸更大、外框更粗來跟其他
// 地點拉開視覺份量差距，不用再靠淺色/深色的配色反過來區分
function solidMarkerIcon(fg: string, scale: number, strokeWeight: number): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: fg,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight,
    scale,
  }
}

// 圖示本身只放 emoji，不再把地點名稱塞進同一個 MarkerLabel 裡（名稱改用下面的
// createPointLabelOverlay 畫成獨立的膠囊，兩者分開才能各自控制樣式／群聚時的顯示邏輯）
function markerLabel(icon: string): google.maps.MarkerLabel {
  return { text: icon, fontSize: "13px" }
}

function formatWalkingDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  return minutes < 1 ? "不到 1 分鐘" : `約 ${minutes} 分鐘`
}

function getWalkingRoute(
  directionsService: google.maps.DirectionsService,
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral,
  // 快取本身由呼叫端（renderMap）傳入，見該處註解：快取的生命週期必須綁定單一次
  // renderMap()（也就是單一次頁面停留），不能是模組層級的全域變數
  cache: Map<number, Promise<google.maps.DirectionsResult | undefined>>,
  cacheKey: number,
): Promise<google.maps.DirectionsResult | undefined> {
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const promise = new Promise<google.maps.DirectionsResult | undefined>((resolve) => {
    directionsService.route(
      { origin, destination, travelMode: google.maps.TravelMode.WALKING },
      (result, status) => {
        resolve(status === google.maps.DirectionsStatus.OK && result ? result : undefined)
      },
    )
  })
  cache.set(cacheKey, promise)
  return promise
}

// 「你在這裡」用常駐的自訂 overlay 顯示，不用 InfoWindow：InfoWindow 天生就是設計成
// 「使用者可以關掉」的元件，而這裡要的是「一直貼在地圖上、不會消失」的標籤，兩者需求
// 不一樣，用 InfoWindow 硬做只會一直卡在「使用者關掉了、要怎麼防止」這類問題。
// 用 google.maps.OverlayView 是 Google 官方文件推薦、給「固定貼在某個座標上的自訂
// HTML 內容」這種需求的標準做法，自己控制 DOM/CSS，不會遇到 InfoWindow 那些內部
// 定位邏輯的坑。
//
// class 宣告故意寫在函式「裡面」，不是檔案最外層：extends google.maps.OverlayView
// 這一行本身在 class 宣告當下就會需要 google.maps 存在，如果寫在最外層，這個 inline
// script 一載入（早於 Google Maps SDK 真正下載完成）就會直接噴錯，把整份 script 中斷掉
function createSelfLabelOverlay(
  text: string,
  position: google.maps.LatLngLiteral,
): google.maps.OverlayView {
  class SelfLabelOverlay extends google.maps.OverlayView {
    private div: HTMLDivElement | null = null

    onAdd() {
      this.div = document.createElement("div")
      this.div.className = "note-map-self-label"
      this.div.textContent = text
      this.getPanes()?.floatPane.appendChild(this.div)
    }

    draw() {
      const projection = this.getProjection()
      if (!projection || !this.div) return
      const point = projection.fromLatLngToDivPixel(new google.maps.LatLng(position))
      if (!point) return
      this.div.style.left = `${point.x}px`
      this.div.style.top = `${point.y}px`
    }

    onRemove() {
      this.div?.remove()
      this.div = null
    }
  }

  return new SelfLabelOverlay()
}

// 其他地點的名稱膠囊，畫在圖示正下方。跟「你在這裡」標籤用同一種 OverlayView 做法，
// 但這裡要另外處理跟 MarkerClusterer 的同步：MarkerClusterer 是靠直接呼叫
// marker.setMap(...)（在地圖上放回去 / 收成群聚圓圈時設回 null）來控制個別標記
// 顯示與否，並不知道我們另外掛了一個 OverlayView，所以膠囊自己得監聽 marker 的
// "map_changed" 事件，跟著同步顯示/隱藏——不然標記被收進群聚圓圈後，底下的名稱
// 膠囊會留在原地飄著，看起來像是「圖示消失了但名字還在」的錯誤畫面
function createPointLabelOverlay(
  map: google.maps.Map,
  marker: google.maps.Marker,
  text: string,
): google.maps.OverlayView {
  class PointLabelOverlay extends google.maps.OverlayView {
    private div: HTMLDivElement | null = null

    onAdd() {
      this.div = document.createElement("div")
      this.div.className = "note-map-point-label"
      this.div.textContent = text
      this.getPanes()?.floatPane.appendChild(this.div)
      marker.addListener("map_changed", () => this.syncVisibility())
      // marker 是否已經被 MarkerClusterer 收進群聚圓圈，在 onAdd() 當下就可能已經
      // 是最終狀態了（不保證一定會等到我們掛上監聽器之後才觸發 map_changed），
      // 這裡直接讀一次目前的狀態，不完全依賴監聽器有沒有接住事件
      this.syncVisibility()
    }

    syncVisibility() {
      if (!this.div) return
      this.div.style.display = marker.getMap() ? "" : "none"
    }

    draw() {
      const projection = this.getProjection()
      const position = marker.getPosition()
      if (!projection || !this.div || !position) return
      const point = projection.fromLatLngToDivPixel(position)
      if (!point) return
      this.div.style.left = `${point.x}px`
      this.div.style.top = `${point.y}px`
    }

    onRemove() {
      this.div?.remove()
      this.div = null
    }
  }

  const overlay = new PointLabelOverlay()
  overlay.setMap(map)
  return overlay
}

// 名稱已經常駐顯示在圖示下方了，這裡不重複顯示地點名稱文字。內容分兩行：上排是純文字
// 的步行距離/時間（不是連結，Directions API 回來前後只會更新這一行），下排是「前往
// 「XXX」」的獨立連結（有 href 才會有這一行）——分成兩個獨立元素，而不是像之前那樣
// 把整個距離文字包成一個連結，是刻意要讓「資訊」跟「動作」在視覺上一望即知是兩件事
function buildInfoWindowContent(point: NoteMapPoint): HTMLElement {
  const container = document.createElement("div")
  container.className = "note-map-infowindow"

  const distanceEl = document.createElement("div")
  distanceEl.className = "note-map-infowindow-distance"
  distanceEl.textContent = "步行距離計算中…"
  container.appendChild(distanceEl)

  if (point.href) {
    const linkEl = document.createElement("a")
    linkEl.className = "note-map-infowindow-link"
    linkEl.href = point.href
    // 連結顏色沿用這個地點類型自己的顏色（跟標記圖示同一套），除了讓連結本身
    // 更好認出來是「可以點的東西」，也跟地圖上其他膠囊（統一用 $map-tertiary）
    // 的配色拉開，不會混在一起分不清楚
    linkEl.style.color = point.fg
    linkEl.textContent = `前往「${point.label}」→`
    container.appendChild(linkEl)
  }

  return container
}

// iOS Safari（手機/平板）完全沒有實作標準 Fullscreen API：Element.requestFullscreen
// 在 iOS Safari 上不存在，也沒有 webkit 前綴版本可用（iOS 只有 <video> 專屬的
// webkitEnterFullscreen，不適用一般 <div>）。桌機版 Safari 早期版本則是需要
// webkit 前綴。用「方法存不存在」偵測，而不是猜 UA，才不會因為瀏覽器更新而失準
function getFullscreenApi(el: HTMLElement) {
  // 特意轉型成完全抹掉型別資訊的 Record，不用 HTMLElement/Document 原本的型別：
  // lib.dom.d.ts 把 requestFullscreen / exitFullscreen 宣告成一定存在的方法（因為
  // 標準規格是這樣寫的），TypeScript 因此會認定底下的存在性檢查「一定是 true」而
  // 報錯，但這兩個方法在 iOS Safari 上實際上就是 undefined，檢查是必要的執行期防呆
  const elAny = el as unknown as Record<string, (() => Promise<void> | void) | undefined>
  const docAny = document as unknown as Record<
    string,
    (() => Promise<void> | void) | Element | undefined
  >

  const request = elAny.requestFullscreen ?? elAny.webkitRequestFullscreen
  const exit = docAny.exitFullscreen ?? docAny.webkitExitFullscreen
  const isActive = () => document.fullscreenElement === el || docAny.webkitFullscreenElement === el

  if (typeof request !== "function" || typeof exit !== "function") return undefined
  return { request: request.bind(el), exit: exit.bind(document), isActive }
}

// 進入/退出「偽全螢幕」：不支援 Fullscreen API 的瀏覽器（主要是 iOS Safari）改用
// CSS position: fixed 把畫布蓋滿整個視窗畫面，視覺效果等同全螢幕，只是不是瀏覽器
// 原生的全螢幕模式（不會觸發 fullscreenchange 事件，狀態切換得自己手動處理）
function setPseudoFullscreen(canvas: HTMLElement, map: google.maps.Map, on: boolean) {
  canvas.classList.toggle("note-map-canvas--pseudo-fullscreen", on)
  document.documentElement.classList.toggle("note-map-pseudo-fullscreen-lock", on)
  const button = canvas.querySelector<HTMLButtonElement>(".note-map-fullscreen-button")
  if (button) button.textContent = on ? "退出全螢幕" : "全螢幕"
  map.setOptions({ gestureHandling: on ? "greedy" : "cooperative" })
  // 容器尺寸整個變了（一般大小 ↔ 滿版視窗），觸發 resize 讓地圖重新量測，
  // 不然畫面會維持切換前的尺寸，直到使用者手動拖曳/縮放才會校正
  google.maps.event.trigger(map, "resize")
}

// 自訂文字版全螢幕按鈕，取代 Google 內建那個不夠直覺的小圖示。
// 用 map.controls[...].push() 加進去（不是外部另外擺一個 <button>）：
// 這樣按鈕本身是 canvas 的子節點，進入全螢幕後（fullscreen 只會顯示目標元素的子樹）
// 這顆按鈕還是看得到、按得到，才能在全螢幕模式下自己按退出
function createFullscreenButton(canvas: HTMLElement, map: google.maps.Map): HTMLElement {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "note-map-fullscreen-button"
  button.textContent = "全螢幕"
  button.addEventListener("click", () => {
    const api = getFullscreenApi(canvas)
    if (api) {
      if (api.isActive()) {
        api.exit()
      } else {
        api.request()
      }
      return
    }
    // 沒有 Fullscreen API 可用，改走偽全螢幕；用 class 本身的狀態判斷目前是否
    // 已經在偽全螢幕中，不需要另外存一個布林變數
    const turningOn = !canvas.classList.contains("note-map-canvas--pseudo-fullscreen")
    setPseudoFullscreen(canvas, map, turningOn)
  })
  return button
}

// 使用者拖曳/縮放地圖找地點後，容易找不回一開始「以自己所在位置為中心」的視角，
// 提供一個按鈕直接跳回最初的 center/zoom（跟「你在這裡」常駐標籤是同一個座標，
// 不需要另外記錄，直接沿用初始化時算好的值即可）
function createHomeButton(
  map: google.maps.Map,
  home: { center: google.maps.LatLngLiteral; zoom: number },
): HTMLElement {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "note-map-home-button"
  button.textContent = "回到起點"
  button.addEventListener("click", () => {
    map.setCenter(home.center)
    map.setZoom(home.zoom)
  })
  return button
}

// 全站只註冊一次（不要放在 renderMap 裡面，每次換頁重畫地圖都會重新註冊，
// 舊的監聽器會一直累積、永遠不會被清掉），觸發時掃過目前畫面上所有地圖，
// 更新各自全螢幕按鈕的文字，並切換滾輪縮放要不要按 Ctrl
document.addEventListener("fullscreenchange", () => {
  document.querySelectorAll<HTMLElement>(".note-map-canvas").forEach((canvas) => {
    const isFullscreen = document.fullscreenElement === canvas

    const button = canvas.querySelector<HTMLButtonElement>(".note-map-fullscreen-button")
    if (button) button.textContent = isFullscreen ? "退出全螢幕" : "全螢幕"

    const map = (canvas as unknown as { __noteMap?: google.maps.Map }).__noteMap
    map?.setOptions({ gestureHandling: isFullscreen ? "greedy" : "cooperative" })
  })
})

// 偽全螢幕不是瀏覽器原生功能，不會觸發 fullscreenchange，也就不會自動響應 Esc，
// 這裡額外補上：Esc 鍵按下時掃過目前畫面上所有處在偽全螢幕狀態的地圖，一併退出，
// 使用體驗上跟原生全螢幕（按 Esc 可退出）一致
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return
  document
    .querySelectorAll<HTMLElement>(".note-map-canvas--pseudo-fullscreen")
    .forEach((canvas) => {
      const map = (canvas as unknown as { __noteMap?: google.maps.Map }).__noteMap
      if (map) setPseudoFullscreen(canvas, map, false)
    })
})

function renderMap(container: HTMLElement, oldCanvas: HTMLElement, payload: NoteMapPayload) {
  // Quartz 的 SPA 換頁是用 micromorph 對 DOM 做 diff/patch，不是整頁重建，
  // 這個 canvas 節點很可能是「上一則筆記地圖」留下來、被重複使用的同一個 DOM 元素。
  // google.maps.Map 沒有正式的 destroy API，同一個節點上重複 new 一次可能殘留舊的內部狀態
  // 導致座標投影跑掉，所以每次都直接換一個全新的節點，保證 Google Maps 一定是初始化在乾淨的 DOM 上
  const canvas = document.createElement("div")
  canvas.className = "note-map-canvas"
  // Quartz 的 SPA 換頁會把 <head> 裡沒標記 data-persist 的元素整個移除再重新加入，
  // index.css（含 .note-map-canvas 的 height/width）也在其中，重新載入是非同步的，
  // 換頁當下這段期間樣式可能還沒生效。如果地圖剛好在這個空窗期初始化，畫布會量到
  // 高度 0，Google Maps 的座標投影就會整個算錯。直接給明確的 inline style，
  // 不依賴外部 CSS 什麼時候載入完成
  canvas.style.height = "300px"
  canvas.style.width = "100%"
  oldCanvas.replaceWith(canvas)
  // 換頁時舊 canvas 節點直接被換掉丟棄，如果換頁當下剛好處在偽全螢幕狀態，
  // 不會有機會走到 setPseudoFullscreen(false) 那條路徑，鎖住背景捲動的 class
  // 會一直留在 <html> 上，這裡保險起見在每次重新渲染時都清一次
  document.documentElement.classList.remove("note-map-pseudo-fullscreen-lock")

  const center: google.maps.LatLngLiteral = { lat: payload.self.lat, lng: payload.self.lng }
  const map = new google.maps.Map(canvas, {
    center,
    zoom: DEFAULT_ZOOM,
    styles: MAP_STYLES,
    // 單純瀏覽用途不需要的控制項全部關掉：地圖/衛星切換、Street View 小人拖拉、
    // 鍵盤快捷鍵提示、地圖旋轉、方向平移面板。保留縮放 +/- 按鈕，操作上還是有幫助。
    // cameraControl 是新版向量地圖專用的合併版控制項（平移+旋轉+傾斜合成一個元件），
    // 跟舊版的 panControl/rotateControl 是分開的兩套東西，這個地圖用的是向量渲染
    // （之前有看到 "Rotate map"、"Tilt map" 這些 aria-label），要另外關掉才會消失
    mapTypeControl: false,
    streetViewControl: false,
    keyboardShortcuts: false,
    rotateControl: false,
    panControl: false,
    cameraControl: false,
    // 內建的全螢幕圖示按鈕不夠直覺，關掉改用下面自己加的文字按鈕
    fullscreenControl: false,
    // cooperative：地圖嵌在一般會滾動的頁面裡，滑鼠滾輪要按著 Ctrl 才會縮放，
    // 避免使用者滑頁面滑到一半不小心把地圖縮放掉，滾不動整個網頁。
    // 全螢幕模式下沒有這個顧慮（畫面被地圖佔滿，沒有「頁面」可以滾），
    // 進入全螢幕時會動態切換成 greedy，讓滾輪直接縮放，見下面 fullscreenchange 監聽器
    gestureHandling: "cooperative",
    // 不管使用者系統/瀏覽器是不是深色模式，地圖一律用亮色圖磚，跟我們自己畫的
    // 標記/文字顏色是搭配亮色地圖設計的，深色地圖底會對不上
    colorScheme: google.maps.ColorScheme.LIGHT,
  })
  // 兩顆按鈕包在同一個容器裡上下排列，而不是各自 push() 給 Google Maps 排橫排：
  // Google 對同一個 ControlPosition 底下多個控制項預設是排成一列，順序也是照它自己
  // 的內部邏輯（新 push 的會插到前一個的左邊），不好直接控制成「上下疊放」
  const controls = document.createElement("div")
  controls.className = "note-map-controls"
  controls.appendChild(createFullscreenButton(canvas, map))
  controls.appendChild(createHomeButton(map, { center, zoom: DEFAULT_ZOOM }))
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(controls)
  // 存一份 map 參照在 canvas 節點上，讓全站共用的 fullscreenchange 監聽器可以找到
  // 「現在是哪個地圖進入全螢幕」，藉此切換該地圖的 gestureHandling
  ;(canvas as unknown as { __noteMap?: google.maps.Map }).__noteMap = map

  // SPA 換頁時 google.maps 已經載入過，這段幾乎是 DOM 一插入就馬上執行，跟整頁載入
  // （網路延遲讓瀏覽器有時間排版）不同，容器當下量到的尺寸可能還沒穩定。
  // Google 官方文件對「動態插入/顯示地圖容器」的建議做法就是手動觸發一次 resize
  // 讓地圖重新量測正確尺寸，並重設中心點（resize 本身可能連帶把視角重置掉）
  google.maps.event.trigger(map, "resize")
  map.setCenter(center)

  // 換頁時把上一則筆記留下的 InfoWindow 關掉，不然它不會跟著 canvas 一起消失
  activeInfoWindow?.close()

  // 點附近地點標記時共用同一個 InfoWindow，點別的標記時會自動把前一個關掉，
  // 畫面比較不會亂。
  //
  // 實測發現 anchorPoint / pixelOffset（不管設 0,0 還是自訂值）在這個版本的 InfoWindow
  // 對自訂圖示標記完全沒有作用，方框永遠是「左上角對齊座標點、往右下延伸」。曾經試過
  // 用 CSS transform 硬把方框位移置中，但那會干擾 Google 內部量測內容尺寸的邏輯，
  // 導致第一次點擊時有機率整個沒顯示（詳見 notemap.scss 裡的說明），已經拿掉了，
  // 犧牲置中的精緻度換取穩定不出錯
  const infoWindow = new google.maps.InfoWindow()
  activeInfoWindow = infoWindow

  const selfMarker = new google.maps.Marker({
    map,
    position: center,
    icon: solidMarkerIcon(payload.self.fg, 18, 3),
    label: markerLabel(payload.self.icon),
    zIndex: 10,
    title: payload.self.title,
  })

  // 常駐標籤，不會因為使用者點別的地方就消失，讓人在全螢幕模式下滑來滑去也不會
  // 忘記自己正在看哪個地點。
  // 包一層 try/catch：這是自訂的 OverlayView，萬一在某些時機（例如整頁第一次載入、
  // Maps SDK 剛啟動）內部行為跟預期不同而拋錯，不能讓它中斷整個 renderMap()、
  // 連累後面的其他標記／群聚／步行距離都不會執行
  try {
    createSelfLabelOverlay(`你在這裡：${payload.self.label}`, center).setMap(map)
  } catch (err) {
    console.error("note map: self label overlay failed", err)
  }

  if (payload.others.length === 0) return

  const directionsService = new google.maps.DirectionsService()
  // 快取一定要在這裡（每次 renderMap 呼叫）重新建立，不能拉到模組層級當全域變數：
  // 快取 key 只是 otherMarkers 裡的陣列索引（0, 1, 2...），如果整個網站共用同一份
  // 快取，換到「自己所在位置不同」的另一則筆記時，同樣的索引值會命中上一則筆記
  // 留下的快取結果，顯示出「起點不是目前這則筆記自己位置」的錯誤路線
  const directionsCache = new Map<number, Promise<google.maps.DirectionsResult | undefined>>()
  // 點附近地點時順便畫出走路路線（藍色點狀線）。suppressMarkers：路線起訖點不要
  // 再疊一組 Google 預設的紅色圖釘，我們自己的標記已經有了。preserveViewport：
  // 只負責畫線，不要自作主張改變地圖目前的中心點/縮放層級
  const directionsRenderer = new google.maps.DirectionsRenderer({
    map,
    suppressMarkers: true,
    preserveViewport: true,
    polylineOptions: {
      strokeOpacity: 0,
      icons: [
        {
          // 改用實心圓點（而非短線段），比照 Google 地圖原生走路路線那種大顆藍色珠珠的畫法，
          // 顏色 #4285F4 是 Google 自己走路路線慣用的藍色
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: "#4285F4",
            fillOpacity: 1,
            strokeOpacity: 0,
            scale: 4,
          },
          offset: "0",
          repeat: "14px",
        },
      ],
    },
  })

  // 其他地點的標記先不直接 map: marker 加到地圖上，交給 MarkerClusterer 統一管理：
  // 縮小地圖、附近標記多的時候會自動合併成一個數字圓圈，放大後自動展開回個別標記
  const otherMarkers = payload.others.map((point) => {
    const position: google.maps.LatLngLiteral = { lat: point.lat, lng: point.lng }

    const marker = new google.maps.Marker({
      position,
      icon: solidMarkerIcon(point.fg, 11, 2),
      label: markerLabel(point.icon),
      title: point.title,
    })

    try {
      createPointLabelOverlay(map, marker, point.label)
    } catch (err) {
      console.error("note map: point label overlay failed", err)
    }

    marker.addListener("click", () => {
      // 換頁後這個 container 可能已經被 morph 掉了，避免把資訊視窗開到已經不存在的地圖上
      if (!document.body.contains(container)) return

      const content = buildInfoWindowContent(point)

      // 等 Directions API 的結果回來、路線畫完之後，才開資訊視窗（不是點擊當下馬上開、
      // 之後才補資料），讓 InfoWindow.open() 一定是這整個流程最後一步
      getWalkingRoute(
        directionsService,
        center,
        position,
        directionsCache,
        otherMarkers.indexOf(marker),
      ).then(
        (result) => {
          const leg = result?.routes[0]?.legs[0]
          const distanceEl = content.querySelector<HTMLElement>(".note-map-infowindow-distance")
          if (distanceEl) {
            distanceEl.textContent = leg
              ? `步行約 ${leg.distance?.text ?? ""}．${leg.duration ? formatWalkingDuration(leg.duration.value) : ""}`
              : "無法取得步行距離"
          }
          if (result) directionsRenderer.setDirections(result)

          infoWindow.setContent(content)
          infoWindow.open({ map, anchor: marker })
        },
      )
    })

    return marker
  })

  new MarkerClusterer({
    map,
    markers: otherMarkers,
    // 自訂群聚圓圈的外觀，改用跟其他標記同一套「實心圓＋白色外框」風格＋膠囊配色，
    // 不用套件內建的藍色圓圈渲染器
    renderer: {
      render: ({ count, position }) =>
        new google.maps.Marker({
          position,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: CLUSTER_FILL,
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            // 尺寸依群聚內的地點數量微幅放大，數量差異大時還是有一點視覺區別，
            // 但封頂避免圓圈大到蓋住太多背景地圖
            scale: Math.min(14 + count * 0.6, 22),
          },
          label: { text: String(count), color: CLUSTER_TEXT, fontSize: "14px", fontWeight: "700" },
          zIndex: 1000 + count,
        }),
    },
    // 套件預設點群聚圓圈是直接 fitBounds() 到圓圈裡所有標記的範圍，如果那些標記彼此
    // 靠得很近，會整個縮放到街道等級、放大到讓人搞不清楚方向。點完之後多檢查一次，
    // 縮放層級超過上限就手動拉回來，保留「點群聚會展開」的效果，但不會近到失去脈絡
    onClusterClick: (_event, cluster, clickedMap) => {
      if (!cluster.bounds) return
      clickedMap.fitBounds(cluster.bounds)
      google.maps.event.addListenerOnce(clickedMap, "bounds_changed", () => {
        if ((clickedMap.getZoom() ?? 0) > CLUSTER_CLICK_MAX_ZOOM) {
          clickedMap.setZoom(CLUSTER_CLICK_MAX_ZOOM)
        }
      })
    },
  })

  // 除錯用：暴露目前這次 render 的內部狀態方便直接在 console 檢查，之後穩定了會移除
  ;(window as unknown as Record<string, unknown>).__noteMapDebug = {
    map,
    canvas,
    selfMarker,
    payload,
    container,
  }
}

function initNoteMap(container: HTMLElement) {
  const raw = container.dataset.noteMap
  if (!raw) return
  // data 內容跟上次初始化時一樣（同一頁重複觸發 nav），不用重畫地圖、重打 API。
  // 這裡要在呼叫 loadGoogleMaps() 之前、同步地就先標記起來：網站第一次載入時，
  // spa.inline.ts 會主動再多補觸發一次 nav 事件（確保所有 script 都來得及註冊到
  // 監聽器），這個 script 本身「直接呼叫一次＋註冊監聽器」的固定寫法，會導致
  // initNoteMap 在第一次載入時被連續呼叫兩次。如果標記延後到 loadGoogleMaps()
  // resolve 之後才寫入，兩次呼叫都會在標記生效前就通過這個檢查，變成重複渲染
  // （第二次會渲染在一個已經被換掉、脫離畫面的舊 canvas 節點上，但共用的
  // activeInfoWindow 還是會被它關掉，導致畫面上真正看得到的資訊視窗被自己關掉）
  if (container.dataset.noteMapInitializedFor === raw) return
  container.dataset.noteMapInitializedFor = raw

  let payload: NoteMapPayload
  try {
    payload = JSON.parse(raw)
  } catch {
    return
  }

  const canvas = container.querySelector<HTMLElement>(".note-map-canvas")
  if (!canvas) return

  loadGoogleMaps(payload.apiKey)
    .then(() => {
      // 地圖載入完成前使用者可能已經換頁離開，容器已經不在畫面上了就不要再畫
      if (!document.body.contains(container)) return
      // 等下一個影格再畫地圖，確保瀏覽器已經跑完這次換頁 DOM 變動的排版，
      // 這樣 Google Maps 初始化時量到的容器尺寸才會是穩定的最終值
      requestAnimationFrame(() => renderMap(container, canvas, payload))
    })
    .catch(() => {
      canvas.innerHTML = ""
      const fallback = document.createElement("span")
      fallback.className = "note-map-placeholder"
      fallback.textContent = "地圖載入失敗"
      canvas.appendChild(fallback)
    })
}

function setupNoteMaps() {
  document.querySelectorAll<HTMLElement>(".note-map-container").forEach(initNoteMap)
}

document.addEventListener("nav", setupNoteMaps)
setupNoteMaps()
