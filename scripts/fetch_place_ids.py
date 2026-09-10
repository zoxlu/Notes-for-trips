#!/usr/bin/env python3
"""用 Google Places API (New) Text Search 幫每則筆記查對應的 place_id，寫進 frontmatter。

為什麼需要：筆記上方屬性區的「地圖」連結原本把「店名 + 座標」混在同一個 query
參數裡，但 Google Maps URLs 規格說 query 只能是「地點名稱／地址」或「經緯度」
其中一種。正確做法是 query 放座標、地點識別交給 query_place_id。

比對方式：用筆記標題當關鍵字、以筆記座標為中心做 locationBias，取第一筆結果，
再檢查它跟筆記座標的距離。超過 MAX_MATCH_M 就視為比對失敗（寧可留空讓連結
退回座標圖釘，也不要連到錯的店家）。

用法：
    python3 scripts/fetch_place_ids.py --dry-run   # 只看比對結果，不動檔案
    python3 scripts/fetch_place_ids.py             # 寫入 place_id
    python3 scripts/fetch_place_ids.py --refresh   # 忽略快取重新查

費用：Text Search 與 Nearby Search 同屬 Pro SKU，每月前 5,000 次免費。
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
CACHE = os.path.join(ROOT, "tmp/place_ids.json")

BIAS_M = 400.0  # 搜尋時的位置偏好半徑
# 結果離筆記座標超過這個距離就不採用。設 600m 是因為園區型場所（吉卜力公園、
# 熱田神宮、久屋大通公園等）的 location 是大範圍的近似中心點，跟 Google 標的
# 代表點本來就會差幾百公尺；超過 200m 的採用結果會另外列出來供人工確認。
MAX_MATCH_M = 600.0

# 人工判斷後排除的比對結果：搜尋有回東西，但無法確定是同一家店，寧可留空讓連結
# 退回座標圖釘，也不要連到錯的地方
SKIP_TITLES = {
    # 比對到「名古屋コーチンラーメン栄町店」（493m），但分店名不同；該筆記本身
    # 就有待確認項目提到這家店可能已搬遷，無法確定是否為同一家
    "名古屋コーチンラーメン はなれ",
}


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


def search_text(key, query, lat, lng):
    body = json.dumps({
        "textQuery": query,
        "maxResultCount": 3,
        "locationBias": {
            "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": BIAS_M}
        },
        "languageCode": "ja",
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://places.googleapis.com/v1/places:searchText",
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
    print(f"有座標的筆記：{len(notes)} 則　比對容許距離 {int(MAX_MATCH_M)}m\n")
    results, calls, failed = {}, 0, []
    for i, n in enumerate(notes, 1):
        try:
            data = search_text(key, n["title"], n["lat"], n["lng"])
            calls += 1
        except Exception as e:
            failed.append((n["title"], str(e)[:80]))
            print(f"  [{i:3d}] ✗ {n['title']}　{str(e)[:50]}")
            continue

        best = None
        for p in data.get("places", []):
            loc = p.get("location", {})
            plat, plng = loc.get("latitude"), loc.get("longitude")
            if plat is None or plng is None:
                continue
            d = haversine(n["lat"], n["lng"], plat, plng)
            cand = {
                "place_id": p.get("id", ""),
                "matched_name": (p.get("displayName") or {}).get("text", ""),
                "dist_m": d,
                # 一併存下 Google 的代表點座標，之後要稽核筆記 location 準不準就不用再打 API
                "lat": plat,
                "lng": plng,
            }
            if best is None or d < best["dist_m"]:
                best = cand

        # 快取一律保留候選結果（含 place_id），採不採用留到寫入階段用 MAX_MATCH_M 判斷，
        # 這樣之後想調門檻不必重打 API
        ok = best is not None and best["dist_m"] <= MAX_MATCH_M and best["place_id"]
        results[n["path"]] = {
            "title": n["title"],
            "place_id": best["place_id"] if best else "",
            "matched_name": best["matched_name"] if best else "",
            "dist_m": best["dist_m"] if best else None,
            "note_lat": n["lat"],
            "note_lng": n["lng"],
            "matched_lat": best["lat"] if best else None,
            "matched_lng": best["lng"] if best else None,
        }
        if ok:
            print(f"  [{i:3d}] ✓ {n['title'][:26]:28s} → {best['matched_name'][:24]:26s} {best['dist_m']:5.0f}m")
        else:
            d = f"{best['dist_m']:.0f}m" if best else "無結果"
            nm = best["matched_name"][:20] if best else ""
            print(f"  [{i:3d}] – {n['title'][:26]:28s} 　比對失敗（{nm} {d}）")
        time.sleep(0.12)

    print(f"\n總呼叫次數：{calls}　失敗：{len(failed)}")
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    json.dump(results, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return results


def apply_to_file(path, place_id, dry_run):
    text = open(path, encoding="utf-8").read()
    end = text.find("\n---", 3)
    fm, rest = text[3:end], text[end:]
    original = fm
    fm = re.sub(r"^place_id:.*\n", "", fm, flags=re.M)
    if place_id:
        line = f"place_id: {place_id}\n"
        # 放在 location 底下，兩個都是「這個地點在哪」的資料
        if re.search(r"^location:.*$", fm, re.M):
            fm = re.sub(r"^(location:.*\n)", r"\1" + line, fm, count=1, flags=re.M)
        else:
            fm = fm.rstrip("\n") + "\n" + line
    if fm == original:
        return False
    if not dry_run:
        open(path, "w", encoding="utf-8").write("---" + fm + rest)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    if args.refresh or not os.path.exists(CACHE):
        data = query_all()
    else:
        data = json.load(open(CACHE, encoding="utf-8"))
        print(f"沿用快取 {CACHE}（要重查請加 --refresh）\n")

    changed = skipped = 0
    review = []
    for path, v in sorted(data.items()):
        if not os.path.exists(path):
            print(f"  ✗ 檔案不存在：{path}")
            continue
        d = v.get("dist_m")
        accept = bool(v["place_id"]) and d is not None and d <= MAX_MATCH_M
        if v["title"] in SKIP_TITLES:
            accept = False
            print(f"  – 不採用：{v['title'][:24]:26s} → {v['matched_name'][:22]:24s} （人工排除，見 SKIP_TITLES）")
        elif not accept and v["place_id"]:
            print(f"  – 不採用：{v['title'][:24]:26s} → {v['matched_name'][:22]:24s} {d:.0f}m（超過 {int(MAX_MATCH_M)}m）")
        if not accept:
            skipped += 1
            continue
        if d > 200:
            review.append((v["title"], v["matched_name"], d))
        if apply_to_file(path, v["place_id"], args.dry_run):
            changed += 1

    if review:
        print(f"\n  距離較遠但仍採用的 {len(review)} 則（大範圍場所，座標是近似中心點，請確認名稱正確）：")
        for t, mn, d in sorted(review, key=lambda x: -x[2]):
            print(f"    {t[:26]:28s} → {mn[:24]:26s} {d:5.0f}m")

    print(("\n[試跑] " if args.dry_run else "\n") + f"寫入 {changed} 則；{skipped} 則不採用（連結會退回座標圖釘）")


if __name__ == "__main__":
    main()
