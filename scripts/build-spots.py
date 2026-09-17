#!/usr/bin/env python3
"""
把 Obsidian 景點筆記的 frontmatter 轉成 Deck.gl 可用的 spots.json

用法:
    python3 build-spots.py <筆記資料夾> <輸出檔>

例:
    python3 build-spots.py ./wiki/places ./data/spots.json
"""

import sys
import json
import re
from pathlib import Path

try:
    import yaml
except ImportError:
    print("需要 PyYAML,請先執行:  pip install pyyaml")
    sys.exit(1)


def read_frontmatter(path):
    """讀取檔案最前面 --- 之間的 YAML 區塊。沒有就回傳 None。"""
    text = path.read_text(encoding="utf-8")
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if not match:
        return None
    try:
        return yaml.safe_load(match.group(1))
    except yaml.YAMLError as e:
        print(f"  ⚠️  YAML 解析失敗,跳過:{path.name}\n      {e}")
        return None


def parse_location(value):
    """
    '35.05056,136.84333'  (lat,lng)  ->  [136.84333, 35.05056]  (lng,lat)

    注意順序對調:Deck.gl / GeoJSON 規定經度在前。
    """
    if not value or not isinstance(value, str):
        return None
    parts = value.split(",")
    if len(parts) != 2:
        return None
    try:
        lat = float(parts[0].strip())
        lng = float(parts[1].strip())
    except ValueError:
        return None
    # 粗略合理性檢查,抓出寫反的資料
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        print(f"  ⚠️  座標超出範圍,可能 lat/lng 寫反了:{value}")
        return None
    return [lng, lat]


def first_or_none(value):
    """place_category 這類欄位有時是 list、有時是字串,統一取第一個。"""
    if isinstance(value, list):
        return value[0] if value else None
    return value


def normalize_days(value):
    """
    day_assigned 可能是 None、'Day1'、或 [Day1, Day6]。
    統一成字串陣列,沒排的回傳空陣列。
    """
    if value is None or value == "":
        return []
    if not isinstance(value, list):
        value = [value]
    return [str(v).strip() for v in value if v is not None and str(v).strip()]


def build_spot(fm):
    """把一份 frontmatter 轉成一筆 spot。缺座標就回傳 None。"""
    position = parse_location(fm.get("location"))
    if position is None:
        return None

    # food 筆記用 food_category,place 筆記用 place_category
    category = first_or_none(fm.get("place_category")) or first_or_none(fm.get("food_category"))

    spot = {
        "name": fm.get("map_label") or fm.get("title") or "(未命名)",
        "title": fm.get("title"),
        "position": position,
        "type": fm.get("type"),          # place / food
        # 中文鍵轉英文,讓資料進入程式後統一用英文
        "interest": fm.get("興致指數"),
        "category": category,
        "district": fm.get("district"),
        "station": fm.get("station"),
        "lines": fm.get("lines") or [],
        "duration": fm.get("duration"),
        "status": fm.get("status"),
        "priority": fm.get("priority"),
        # food 專屬欄位
        "meal_slot": fm.get("meal_slot"),
        "cuisine": fm.get("cuisine"),
        "price_range": fm.get("price_range"),
        "booking_required": fm.get("booking_required"),
        "image": fm.get("image"),
        "official_url": fm.get("official_url"),
        # day_assigned 可能是 None / 單值 / 陣列,統一成陣列
        "days": normalize_days(fm.get("day_assigned")),
    }

    # 附近廁所:保留座標,之後可做成獨立圖層
    restrooms = []
    for r in (fm.get("nearby_restrooms") or []):
        pos = parse_location(r.get("location"))
        if pos:
            restrooms.append({
                "name": r.get("name"),
                "position": pos,
                "distance": r.get("distance"),
            })
    if restrooms:
        spot["restrooms"] = restrooms

    # 拿掉值為 None 的欄位,讓 JSON 乾淨一點
    return {k: v for k, v in spot.items() if v is not None}


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)

    src_dir = Path(sys.argv[1])
    out_path = Path(sys.argv[2])

    if not src_dir.is_dir():
        print(f"找不到資料夾:{src_dir}")
        sys.exit(1)

    spots = []
    skipped = []

    # rglob 會連子資料夾一起掃
    for md_path in sorted(src_dir.rglob("*.md")):
        fm = read_frontmatter(md_path)
        if not fm:
            continue

        # 收 place / food / supermarket 三種
        if fm.get("type") not in ("place", "food", "supermarket"):
            continue

        spot = build_spot(fm)
        if spot is None:
            skipped.append(md_path.name)
            continue
        spots.append(spot)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(spots, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"✅ 寫出 {len(spots)} 筆 → {out_path}")

    if skipped:
        print(f"\n⚠️  {len(skipped)} 筆因為缺少或無法解析 location 被跳過:")
        for name in skipped:
            print(f"   - {name}")

    # 統計:哪些欄位有缺漏,方便回頭補資料
    if spots:
        from collections import Counter
        print("\n📊 統計:")
        print("   type     :", dict(Counter(s.get("type") for s in spots)))
        print("   category :", dict(Counter(s.get("category") for s in spots)))
        day_counter = Counter()
        unassigned = 0
        for s_ in spots:
            ds = s_.get("days") or []
            if not ds:
                unassigned += 1
            for d in ds:
                day_counter[d] += 1
        print("   days     :", dict(sorted(day_counter.items())))
        print(f"   未排行程 : {unassigned} 筆")

        missing_interest = [s["name"] for s in spots if "interest" not in s]
        if missing_interest:
            print(f"\n📋 沒有興致指數的景點({len(missing_interest)} 筆):")
            for name in missing_interest[:10]:
                print(f"   - {name}")
            if len(missing_interest) > 10:
                print(f"   ...還有 {len(missing_interest) - 10} 筆")


if __name__ == "__main__":
    main()