#!/usr/bin/env python3
"""用 Google Places API (New) 批次查詢各筆記附近的公廁，寫進 frontmatter 的 nearby_restrooms。

這是一次性批次腳本，不是網站前端程式碼——查到的是「查詢當下的快照」，
之後想更新資料重跑一次即可（記得加 --refresh 讓它重新打 API）。

用法：
    python3 scripts/fetch_nearby_restrooms.py              # 查詢並寫入
    python3 scripts/fetch_nearby_restrooms.py --dry-run    # 只看會寫什麼，不動檔案
    python3 scripts/fetch_nearby_restrooms.py --refresh    # 忽略快取，重新呼叫 API

金鑰從專案根目錄 .env 的 GOOGLE_PLACES_API_KEY 讀取（比照 quartz/util/loadEnv.ts）。
那把金鑰要另外建、不要沿用前端的 GOOGLE_MAPS_API_KEY——前端那把有 HTTP 網域限制，
伺服器端呼叫會被擋。詳見 .env.example。

費用：Nearby Search (New) 屬 Pro SKU，每月前 5,000 次免費。本專案約 136 則筆記
有座標 = 136 次呼叫，遠低於免費額度。FieldMask 只取 id/名稱/座標，不要加
rating、opening_hours（會跳到更貴的 Enterprise SKU）。
"""
import argparse
import json
import math
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIKI = os.path.join(ROOT, "trip_vault/wiki")
CACHE = os.path.join(ROOT, "tmp/nearby_restrooms.json")  # tmp/ 已在 .gitignore

RADIUS_M = 500.0  # 走路可及範圍
KEEP = 5  # 每則筆記最多保留最近的幾筆


def load_key():
    env = os.path.join(ROOT, ".env")
    if os.path.exists(env):
        with open(env, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("GOOGLE_PLACES_API_KEY="):
                    v = line.split("=", 1)[1].strip().strip("\"'")
                    if v:
                        return v
    v = os.environ.get("GOOGLE_PLACES_API_KEY", "")
    if v:
        return v
    sys.exit("✗ 找不到 GOOGLE_PLACES_API_KEY（請看 .env.example）")


def haversine(lat1, lng1, lat2, lng2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def fmt_distance(m):
    return f"約{m/1000:.1f}km" if m >= 1000 else f"約{int(round(m / 10.0) * 10)}m"


def notes_with_location():
    out = []
    for dirpath, _, files in os.walk(WIKI):
        for fn in sorted(files):
            if not fn.endswith(".md"):
                continue
            path = os.path.join(dirpath, fn)
            text = open(path, encoding="utf-8").read()
            if not text.startswith("---"):
                continue
            end = text.find("\n---", 3)
            if end == -1:
                continue
            fm = text[3:end]
            m = re.search(r"^location:\s*([0-9.\-]+)\s*,\s*([0-9.\-]+)\s*$", fm, re.M)
            if not m:
                continue
            t = re.search(r"^title:\s*(.+)$", fm, re.M)
            out.append({
                "path": path,
                "title": t.group(1).strip() if t else fn[:-3],
                "lat": float(m.group(1)),
                "lng": float(m.group(2)),
            })
    return out


def search_nearby(key, lat, lng):
    body = json.dumps({
        "includedTypes": ["public_bathroom"],  # 注意別用 public_bath，那是錢湯
        "maxResultCount": 20,
        "locationRestriction": {
            "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": RADIUS_M}
        },
        "languageCode": "ja",
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://places.googleapis.com/v1/places:searchNearby",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "places.id,places.displayName,places.location",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def query_all():
    key = load_key()
    notes = notes_with_location()
    print(f"有座標的筆記：{len(notes)} 則　半徑 {int(RADIUS_M)}m　每則最多留 {KEEP} 筆\n")
    results, calls, failed = {}, 0, []
    for i, n in enumerate(notes, 1):
        try:
            data = search_nearby(key, n["lat"], n["lng"])
            calls += 1
        except Exception as e:
            failed.append((n["title"], str(e)[:80]))
            print(f"  [{i:3d}/{len(notes)}] ✗ {n['title']}　{str(e)[:60]}")
            continue
        found = []
        for p in data.get("places", []):
            loc = p.get("location", {})
            plat, plng = loc.get("latitude"), loc.get("longitude")
            name = (p.get("displayName") or {}).get("text", "").strip()
            if plat is None or plng is None or not name:
                continue
            found.append({
                "name": name, "lat": plat, "lng": plng,
                # place_id 給 Google Maps 連結用（query_place_id），少了它就只能落座標圖釘
                "place_id": p.get("id", ""),
                "dist_m": haversine(n["lat"], n["lng"], plat, plng),
            })
        found.sort(key=lambda x: x["dist_m"])
        results[n["path"]] = {"title": n["title"], "restrooms": found[:KEEP]}
        print(f"  [{i:3d}/{len(notes)}] {n['title'][:34]:36s} {len(found):2d} 筆"
              + (f"　最近 {fmt_distance(found[0]['dist_m'])}" if found else "　（查無）"))
        time.sleep(0.12)
    print(f"\n總呼叫次數：{calls}　失敗：{len(failed)}")
    for t, e in failed:
        print(f"  失敗：{t}　{e}")
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    json.dump(results, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return results


def build_block(restrooms):
    lines = ["nearby_restrooms:"]
    for r in restrooms:
        name = r["name"].replace("\\", "\\\\").replace('"', '\\"')
        lines.append(f'  - name: "{name}"')
        lines.append(f'    location: {r["lat"]:.6f},{r["lng"]:.6f}')
        lines.append(f'    distance: {fmt_distance(r["dist_m"])}')
        if r.get("place_id"):
            lines.append(f'    place_id: {r["place_id"]}')
    return "\n".join(lines) + "\n"


def apply_to_file(path, restrooms, dry_run):
    """只置換 frontmatter 裡的 nearby_restrooms 區塊，其餘一字不動"""
    text = open(path, encoding="utf-8").read()
    end = text.find("\n---", 3)
    fm, rest = text[3:end], text[end:]
    original = fm
    fm = re.sub(r"^nearby_restrooms:.*?(?=^\S|\Z)", "", fm, flags=re.M | re.S)
    if restrooms:
        block = build_block(restrooms)
        if re.search(r"^date_added:", fm, re.M):
            fm = re.sub(r"^(date_added:)", block + r"\1", fm, count=1, flags=re.M)
        else:
            fm = fm.rstrip("\n") + "\n" + block
    if fm == original:
        return False
    if not dry_run:
        open(path, "w", encoding="utf-8").write("---" + fm + rest)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="只顯示會寫什麼，不動檔案")
    ap.add_argument("--refresh", action="store_true", help="忽略快取，重新呼叫 API")
    args = ap.parse_args()

    if args.refresh or not os.path.exists(CACHE):
        data = query_all()
    else:
        data = json.load(open(CACHE, encoding="utf-8"))
        print(f"沿用快取 {CACHE}（要重查請加 --refresh）\n")

    changed = skipped = 0
    for path, v in sorted(data.items()):
        if not os.path.exists(path):
            print(f"  ✗ 檔案不存在（可能已改名）：{path}")
            continue
        if not v["restrooms"]:
            skipped += 1
            continue
        if apply_to_file(path, v["restrooms"], args.dry_run):
            changed += 1
    print(("[試跑] " if args.dry_run else "") + f"寫入 {changed} 則；{skipped} 則附近查無公廁")


if __name__ == "__main__":
    main()
