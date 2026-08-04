import { MarkerClusterer } from "@googlemaps/markerclusterer"

type NoteMapPoint = {
  title: string
  href?: string
  lat: number
  lng: number
  icon: string
  bg: string
  fg: string
}

type NoteMapPayload = {
  apiKey: string
  self: NoteMapPoint
  others: NoteMapPoint[]
}

// 同一顆地圖標記查過一次路線後就快取起來（快取的是完整路線結果，不是只有距離文字，
// 這樣同一次 Directions API 呼叫可以同時滿足「顯示距離文字」跟「畫出路線」兩個用途），
// 同一次頁面停留期間重複點擊不會重打 API
const directionsCache = new Map<number, Promise<google.maps.DirectionsResult | undefined>>()

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

// 地圖本身的樣式：關掉 Google 自己的 POI／大眾運輸圖示跟文字標籤，只留路名/地形等基本資訊，
// 避免跟我們自己畫的標記混在一起看不清楚
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
]

// 用經典 google.maps.Marker（非 AdvancedMarkerElement），不需要額外設定 Map ID 或載入 marker library
function markerIcon(bg: string, fg: string, scale: number): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: bg,
    fillOpacity: 1,
    strokeColor: fg,
    strokeWeight: 2,
    scale,
  }
}

// 本則筆記自己的標記：跟其他地點的配色反過來（用該類型的深色當底、白色外框、尺寸更大），
// 不管筆記本身是什麼類型，都會比周圍淡色的標記顯眼很多
function selfMarkerIcon(fg: string): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: fg,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 3,
    scale: 18,
  }
}

// name 有值時圖示下方會顯示地點名稱（自身標記不需要，已經有常駐的「你在這裡」標籤了）。
// 名稱疊在圖示「下面」（用換行，不是接在同一行後面）：MarkerLabel 是以標記座標為
// 中心點置中顯示，同一行的話文字會左右對半展開、蓋住圖示本身；換行變兩行後圖示
// 還是在最上面、清楚可見。文字顏色用該地點類型的顏色（跟標記圖示同一套配色），
// 一方面跟 Google 自己的路名／地標文字明顯區分開來，一方面看到顏色就能對應是哪種
// 類型的地點。不管縮放層級都直接顯示：密集商圈本來就會被 MarkerClusterer 合併成
// 群聚數字圓圈，不會有一堆名稱擠在一起看不清楚的問題
function markerLabel(icon: string, fg: string, name?: string): google.maps.MarkerLabel {
  return {
    text: name ? `${icon}\n${name}` : icon,
    fontSize: "13px",
    color: name ? fg : undefined,
    className: name ? "note-map-marker-name" : undefined,
  }
}

function formatWalkingDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  return minutes < 1 ? "不到 1 分鐘" : `約 ${minutes} 分鐘`
}

function getWalkingRoute(
  directionsService: google.maps.DirectionsService,
  origin: google.maps.LatLngLiteral,
  destination: google.maps.LatLngLiteral,
  cacheKey: number,
): Promise<google.maps.DirectionsResult | undefined> {
  const cached = directionsCache.get(cacheKey)
  if (cached) return cached

  const promise = new Promise<google.maps.DirectionsResult | undefined>((resolve) => {
    directionsService.route(
      { origin, destination, travelMode: google.maps.TravelMode.WALKING },
      (result, status) => {
        resolve(status === google.maps.DirectionsStatus.OK && result ? result : undefined)
      },
    )
  })
  directionsCache.set(cacheKey, promise)
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

// showTitle 為 false 時（地圖已經放大到街道尺度、圖示旁邊已經有名稱文字了）
// 就不重複顯示地點名稱，只留下步行距離的膠囊，避免同一個名字連續出現兩次
// 名稱已經常駐顯示在圖示下方了，這裡不重複顯示地點名稱文字，但距離膠囊本身在有
// href 時會是一個連結，點下去可以跳到那則筆記——保留「點附近地點可以直接看那則
// 筆記」這個功能，不會因為拿掉重複文字而跟著消失
function buildInfoWindowContent(point: NoteMapPoint): HTMLElement {
  const container = document.createElement("div")
  container.className = "note-map-infowindow"

  const distanceEl = document.createElement(point.href ? "a" : "div")
  distanceEl.className = "note-map-infowindow-distance"
  if (point.href) {
    ;(distanceEl as HTMLAnchorElement).href = point.href
    // 滑鼠移上去顯示原生 tooltip，讓人知道這個膠囊點下去會做什麼（不是只顯示距離而已）
    distanceEl.title = `前往「${point.title}」頁面`
  }
  distanceEl.textContent = "步行距離計算中…"
  container.appendChild(distanceEl)

  return container
}

// 自訂文字版全螢幕按鈕，取代 Google 內建那個不夠直覺的小圖示。
// 用 map.controls[...].push() 加進去（不是外部另外擺一個 <button>）：
// 這樣按鈕本身是 canvas 的子節點，進入全螢幕後（fullscreen 只會顯示目標元素的子樹）
// 這顆按鈕還是看得到、按得到，才能在全螢幕模式下自己按退出
function createFullscreenButton(canvas: HTMLElement): HTMLElement {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "note-map-fullscreen-button"
  button.textContent = "全螢幕"
  button.addEventListener("click", () => {
    if (document.fullscreenElement === canvas) {
      document.exitFullscreen()
    } else {
      canvas.requestFullscreen()
    }
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

  const center: google.maps.LatLngLiteral = { lat: payload.self.lat, lng: payload.self.lng }
  const map = new google.maps.Map(canvas, {
    center,
    zoom: 16,
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
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(createFullscreenButton(canvas))
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
    icon: selfMarkerIcon(payload.self.fg),
    label: markerLabel(payload.self.icon, payload.self.fg),
    zIndex: 10,
    title: payload.self.title,
  })

  // 常駐標籤，不會因為使用者點別的地方就消失，讓人在全螢幕模式下滑來滑去也不會
  // 忘記自己正在看哪個地點。
  // 包一層 try/catch：這是自訂的 OverlayView，萬一在某些時機（例如整頁第一次載入、
  // Maps SDK 剛啟動）內部行為跟預期不同而拋錯，不能讓它中斷整個 renderMap()、
  // 連累後面的其他標記／群聚／步行距離都不會執行
  try {
    createSelfLabelOverlay(`你在這裡：${payload.self.title}`, center).setMap(map)
  } catch (err) {
    console.error("note map: self label overlay failed", err)
  }

  if (payload.others.length === 0) return

  const directionsService = new google.maps.DirectionsService()
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
          // #4285F4 是 Google 自己走路路線慣用的藍色
          icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#4285F4", scale: 3 },
          offset: "0",
          repeat: "12px",
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
      icon: markerIcon(point.bg, point.fg, 11),
      label: markerLabel(point.icon, point.fg, point.title),
      title: point.title,
    })

    marker.addListener("click", () => {
      // 換頁後這個 container 可能已經被 morph 掉了，避免把資訊視窗開到已經不存在的地圖上
      if (!document.body.contains(container)) return

      const content = buildInfoWindowContent(point)

      // 等 Directions API 的結果回來、路線畫完之後，才開資訊視窗（不是點擊當下馬上開、
      // 之後才補資料），讓 InfoWindow.open() 一定是這整個流程最後一步
      getWalkingRoute(directionsService, center, position, otherMarkers.indexOf(marker)).then(
        (result) => {
          const leg = result?.routes[0]?.legs[0]
          const distanceEl = content.querySelector<HTMLElement>(".note-map-infowindow-distance")
          if (distanceEl) {
            const distanceText = leg
              ? `步行約 ${leg.distance?.text ?? ""}．${leg.duration ? formatWalkingDuration(leg.duration.value) : ""}`
              : "無法取得步行距離"
            // 固定加上箭頭表示「這個可以點下去」，不用靠 hover 才看得出來能點擊
            // （hover 觸發的動態樣式變化在這個 InfoWindow 裡不安全，見上面的說明）
            distanceEl.textContent = point.href ? `${distanceText} →` : distanceText
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
