from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Any


def _tw_now() -> str:
    return datetime.now(ZoneInfo("Asia/Taipei")).strftime("%H:%M:%S")


def _post_discord(content: str) -> dict[str, Any]:
    webhook = os.getenv("DISCORD_WEBHOOK_URL", "")
    if not webhook:
        return {"ok": False, "error": "DISCORD_WEBHOOK_URL is not set"}
    body = json.dumps({"content": content}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        webhook,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "STX-Alert"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=8) as res:
        return {"ok": 200 <= res.status < 300, "status": res.status}


def send_discord_alert(payload: dict[str, Any]) -> dict[str, Any]:
    code = str(payload.get("code") or "STX")
    title = str(payload.get("title") or "STX 警報")
    score = str(payload.get("score") or "-")
    message = str(payload.get("message") or "盤中警報觸發")
    content = f"🔥 **{title}**\n時間：{_tw_now()}\n股票：{code}\n分數：{score}\n{message}"
    return _post_discord(content)


def _num(v: Any, default: float = 0.0) -> float:
    try:
        if v is None:
            return default
        return float(v)
    except Exception:
        return default


def _pct(v: Any) -> str:
    try:
        n = float(v)
        return f"{n:+.2f}%"
    except Exception:
        return "-"


def _score(item: dict[str, Any]) -> int:
    for key in ["final_score", "fund_score", "score", "big_player_score", "day_trade_risk"]:
        try:
            if item.get(key) is not None:
                return int(float(item.get(key)))
        except Exception:
            pass
    return 0


def send_radar_top5_alert(scan: dict[str, Any]) -> dict[str, Any]:
    rows = scan.get("discord_top5") or scan.get("top5") or []
    rows = [x for x in rows[:5] if str(x.get("final_result") or "") == "可進場"]
    if not rows:
        return {"ok": True, "sent": False, "reason": "no_entry_candidates"}

    scanned = int(_num(scan.get("scanned"), 0))
    universe = int(_num(scan.get("universe_size"), 0))
    strongest = scan.get("strongest_sector") or {}
    lines = [
        "🔥 **STX 台股當沖前5訊號**",
        f"時間：{_tw_now()}",
        f"掃描：{scanned}/{universe} 檔",
        f"最強族群：{strongest.get('sector', '-')}｜{strongest.get('avg_score', '-')}分",
        "推播條件：規則分析優先 + 無Trap + 非追價 + VWAP/回測確認",
        "",
    ]
    for i, item in enumerate(rows, 1):
        lines.extend([
            f"**TOP {i}｜{item.get('code')} {item.get('name') or ''}**",
            f"現價：{item.get('close', '-')}｜漲跌：{_pct(item.get('change_rate'))}",
            f"最終分數：{item.get('final_score', '-')}｜規則：{item.get('rule_score', '-')}｜Pro：{item.get('pro_score', '-')}｜族群：{item.get('group_score', '-')}",
            f"結果：{item.get('final_result', '-')}｜{item.get('final_reason', '-')}",
            "",
        ])
    return _post_discord("\n".join(lines)[:1900])


def send_grouped_alerts(
    items: list[dict[str, Any]],
    title: str = "STX 分類警報",
    max_groups: int = 6,
    max_items_per_group: int = 5,
) -> dict[str, Any]:
    if not items:
        return {"ok": True, "sent": False, "reason": "empty"}

    groups: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        sector = str(item.get("sector") or "其他")
        groups.setdefault(sector, []).append(item)

    ordered_groups = sorted(
        groups.items(),
        key=lambda kv: (max(_score(x) for x in kv[1]), len(kv[1])),
        reverse=True,
    )[:max_groups]

    lines = [f"📡 **{title}｜產業分類**", f"時間：{_tw_now()}", f"訊號：{len(items)} 檔", ""]

    for sector, rows in ordered_groups:
        rows = sorted(rows, key=_score, reverse=True)[:max_items_per_group]
        avg_score = round(sum(_score(x) for x in rows) / max(len(rows), 1), 1)
        lines.append(f"🔥 **{sector}｜{len(rows)}檔｜均分 {avg_score}**")
        for item in rows:
            code = item.get("code") or "-"
            name = item.get("name") or ""
            score = _score(item)
            fund = item.get("fund_score")
            big = item.get("big_player_score")
            risk = item.get("day_trade_risk")
            chip = item.get("chip_signal") or item.get("mood") or "-"
            change = _pct(item.get("change_rate"))
            meta = []
            if fund is not None:
                meta.append(f"資金{fund}")
            if big is not None:
                meta.append(f"主力{big}")
            if risk is not None:
                meta.append(f"隔沖{risk}")
            meta_text = "｜".join(meta) if meta else chip
            lines.append(f"- {code} {name}｜{score}分｜{change}｜{meta_text}")
        lines.append("")

    lines.append("💬 查詢提示：輸入股票代號、股票名稱或族群，例如：2356、英業達、AI、半導體。")
    return _post_discord("\n".join(lines)[:1900])


def _replay_summary(stats: dict[str, Any] | None) -> list[str]:
    if not stats or not stats.get("ok"):
        return ["", "📊 **Replay 實測**", "Replay API：未回傳。"]
    total = int(_num(stats.get("total_signals"), 0))
    if total <= 0:
        return ["", "📊 **Replay 實測**", "狀態：尚未啟用｜樣本：0"]

    lines = [
        "",
        "📊 **Replay 實測**",
        f"訊號數：{total}｜勝率：{stats.get('win_rate', '-')}%｜平均：{stats.get('avg_latest_pct', '-')}%｜陷阱攔截：{stats.get('trap_block_count', 0)}",
    ]
    latest = stats.get("latest") or []
    success = []
    for row in reversed(latest):
        result = row.get("results") or {}
        pct = result.get("latest_pct")
        try:
            if pct is not None and float(pct) > 0:
                success.append((row, pct))
        except Exception:
            pass
    if success:
        lines.append("✅ 最近成功訊號：")
        for row, pct in success[:5]:
            lines.append(f"- {row.get('code')}｜{row.get('score')}分｜{_pct(pct)}")
    return lines


def send_battle_report(scan: dict[str, Any], stats: dict[str, Any] | None = None) -> dict[str, Any]:
    top = scan.get("discord_top5") or scan.get("top5") or []
    strongest = scan.get("strongest_sector") or {}
    errors = scan.get("errors") or []
    scanned = int(_num(scan.get("scanned"), 0))
    universe = int(_num(scan.get("universe_size"), 0))
    now = _tw_now()

    lines = [
        "📡 **STX 當沖戰情中心｜盤中雷達速報**",
        f"時間：{now}",
        f"掃描：{scanned}/{universe} 檔",
        f"最強族群：{strongest.get('sector', '-')}｜{strongest.get('avg_score', '-')}分",
        "",
        "🔥 **最終結果前5**",
    ]

    if scanned == 0 and universe > 0:
        lines.append("資料源暫時異常，這輪雷達不列入判斷。")
        if errors:
            lines.append("錯誤摘要：")
            for err in errors[:3]:
                lines.append(f"- {err.get('code', '-')}：{err.get('message', '-')}")
    elif top:
        for i, item in enumerate(top[:5], 1):
            lines.append(
                f"{i}. {item.get('code')} {item.get('name') or ''}｜{item.get('sector') or '其他'}｜最終{item.get('final_score', item.get('score'))}分｜{_pct(item.get('change_rate'))}｜{item.get('final_result') or item.get('mood') or '-'}"
            )
    else:
        lines.append("本輪沒有達到雷達門檻的標的。")

    lines.extend(_replay_summary(stats))
    return _post_discord("\n".join(lines)[:1900])
