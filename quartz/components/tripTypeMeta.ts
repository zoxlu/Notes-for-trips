export type TypeMeta = { icon: string; bg: string; fg: string; label: string }

// 卡片本身沒有代表圖時，用來決定佔位圖示/底色，依 frontmatter 的 type 決定
// TripHome（首頁卡片）跟 NoteMap（筆記內建小地圖標記）共用這份定義
export const CARD_TYPE_META: Record<string, TypeMeta> = {
  place: { icon: "🏯", bg: "#FAECE7", fg: "#993C1D", label: "景點" },
  food: { icon: "🍣", bg: "#FAEEDA", fg: "#854F0B", label: "美食" },
  accommodation: { icon: "🛌", bg: "#E6F1FB", fg: "#0C447C", label: "住宿" },
  transport: { icon: "🚃", bg: "#EFEFEF", fg: "#3A3A3A", label: "交通" },
  supermarket: { icon: "🛒", bg: "#E8F5E9", fg: "#2E7D32", label: "超市" },
}
