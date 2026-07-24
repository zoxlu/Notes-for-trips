#!/usr/bin/env python3
"""PostToolUse hook: checks wiki note frontmatter after Edit/Write.
Only looks at markdown files under trip_vault/wiki/ (excluding the
auto-generated 00-Index/ and 04-Attachments/ folders). Reports missing
required frontmatter keys per trip_vault/CLAUDE.md's schema, without
blocking the edit.
"""
import json
import re
import sys

COMMON_REQUIRED_FIELDS = ["title", "type", "raw_note"]

# 依 type 分別檢查，對應 CLAUDE.md 的 schema，不是每種類型都要求一樣的欄位
REQUIRED_BY_TYPE = {
    "place": ["station", "district"],
    "food": ["station", "district", "meal_slot"],
    "accommodation": ["station", "district"],
    "activity": ["station", "district"],
    "transport": ["transport_mode"],
}

SKIP_DIRS = ("00-Index/", "04-Attachments/")
LOCATION_PATTERN = re.compile(r"^-?\d+(\.\d+)?,-?\d+(\.\d+)?$")


def relevant_path(path: str) -> bool:
    if not path.endswith(".md"):
        return False
    if "trip_vault/wiki/" not in path:
        return False
    if any(skip in path for skip in SKIP_DIRS):
        return False
    return True


def parse_frontmatter(text: str) -> dict:
    match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not match:
        return {}
    fm = {}
    for line in match.group(1).splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        key, _, value = line.partition(":")
        fm[key.strip()] = value.strip()
    return fm


def main():
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0

    tool_input = payload.get("tool_input", {}) or {}
    tool_response = payload.get("tool_response", {}) or {}
    file_path = tool_input.get("file_path") or tool_response.get("filePath") or ""
    if not relevant_path(file_path):
        return 0

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
    except OSError:
        return 0

    fm = parse_frontmatter(content)
    issues = []

    for field in COMMON_REQUIRED_FIELDS:
        if field not in fm or not fm[field]:
            issues.append(f"缺少 `{field}`")

    note_type = fm.get("type")
    if note_type:
        for field in REQUIRED_BY_TYPE.get(note_type, []):
            if field not in fm or not fm[field]:
                issues.append(f"type={note_type} 缺少建議欄位 `{field}`")

    location = fm.get("location")
    if location and not LOCATION_PATTERN.match(location):
        issues.append(f"`location` 格式看起來不對：{location}（應為「緯度,經度」）")

    if "## 📝 我的備註" not in content:
        issues.append("找不到 `## 📝 我的備註` 區塊")

    if issues:
        summary = "、".join(issues)
        output = {
            "systemMessage": f"validate_notes: {file_path} 有以下提醒：{summary}",
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "additionalContext": (
                    f"筆記 {file_path} 有以下提醒（不阻擋已完成的編輯，僅供參考，"
                    f"下次更新這則筆記時可以順手補上）：{summary}。"
                    f"請依照 trip_vault/CLAUDE.md 的 schema 規則處理。"
                ),
            },
        }
        print(json.dumps(output, ensure_ascii=False))

    return 0


if __name__ == "__main__":
    sys.exit(main())