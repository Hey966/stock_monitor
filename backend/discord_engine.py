from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime
from typing import Any


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
    content = f"🔥 **{title}**\n股票：{code}\n分數：{score}\n{message}"
    return _post_discord(content)


def _pct(v: Any) -> str:
    try:
        n = float(v)
        return f"{n:+.2f}%"
    except Exception:
        return "-"


def send_battle_report(scan: dict[str, Any], stats: dict[str, Any] | None = None) -> dict[str, Any]:
    top = scan.get("top5") or []
    strongest = scan.get("strongest_sector") or {}
    now = datetime.now().strftime("%H:%M:%S")

    lines = [
        "📡 **STX AI 戰情中心｜盤中雷達速報**",
        f"時間：{now}",
        f"掃描：{scan.get('scanned', 0)}/{scan.get('universe_size', 0)} 檔",
        f"最強族群：{strongest.get('sector', '-')}｜{strongest.get('avg_score', '-')}分",
        "",
        "🔥 **雷達 TOP10**",
    ]

    if top:
        for i, item in enumerate(top[:10], 1):
            lines.append(
                f"{i}. {item.get('code')} {item.get('name') or ''}｜{item.get('sector') or '其他'}｜{item.get('score')}分｜{_pct(item.get('change_rate'))}｜{item.get('mood') or '-'}"
            )
    else:
        lines.append("尚無雷達資料")

    if stats and stats.get("ok"):
        lines.extend([
            "",
            "📊 **Replay 勝率**",
            f"訊號數：{stats.get('total_signals', 0)}｜勝率：{stats.get('win_rate', '-')}%｜平均：{stats.get('avg_latest_pct', '-')}%｜陷阱攔截：{stats.get('trap_block_count', 0)}",
        ])
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

    return _post_discord("\n".join(lines)[:1900])
