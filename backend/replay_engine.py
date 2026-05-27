from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

LOG_PATH = Path(os.getenv("STX_REPLAY_LOG", "/tmp/stx_replay_logs.json"))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load() -> list[dict[str, Any]]:
    try:
        if not LOG_PATH.exists():
            return []
        data = json.loads(LOG_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save(rows: list[dict[str, Any]]) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOG_PATH.write_text(json.dumps(rows[-1000:], ensure_ascii=False, indent=2), encoding="utf-8")


def _f(v: Any, default: float | None = None) -> float | None:
    try:
        if v is None:
            return default
        return float(v)
    except Exception:
        return default


def should_record(analysis: dict[str, Any]) -> bool:
    score = int(_f(analysis.get("score"), 0) or 0)
    level = str(analysis.get("level") or "")
    trap_block = bool((analysis.get("signals") or {}).get("trap_block"))
    return score >= 75 or level in {"strong", "strong_watch", "blocked"} or trap_block


def save_signal(analysis: dict[str, Any]) -> dict[str, Any]:
    rows = _load()
    code = str(analysis.get("code") or "")
    quote = analysis.get("quote") or {}
    signals = analysis.get("signals") or {}
    entry = _f(quote.get("close"))
    key = f"{code}:{int(_f(analysis.get('score'), 0) or 0)}:{analysis.get('level')}:{entry}"

    for old in reversed(rows[-30:]):
        if old.get("key") == key and old.get("status") == "open":
            return {"ok": True, "saved": False, "reason": "duplicate", "item": old}

    item = {
        "key": key,
        "created_at": _now(),
        "status": "open",
        "code": code,
        "name": analysis.get("name"),
        "score": analysis.get("score"),
        "level": analysis.get("level"),
        "action": analysis.get("action"),
        "entry_price": entry,
        "trap_block": bool(signals.get("trap_block")),
        "traps": analysis.get("traps") or [],
        "market_sync": signals.get("market_sync"),
        "signals": {
            "vwap": signals.get("vwap"),
            "relative_volume": signals.get("relative_volume"),
            "orderbook_imbalance": signals.get("orderbook_imbalance"),
            "pullback_hold_vwap": signals.get("pullback_hold_vwap"),
            "distance_to_vwap_pct": signals.get("distance_to_vwap_pct"),
        },
        "results": {},
    }
    rows.append(item)
    _save(rows)
    return {"ok": True, "saved": True, "item": item}


def update_results(code: str, current_price: float | int | None) -> dict[str, Any]:
    price = _f(current_price)
    if price is None:
        return {"ok": False, "updated": 0, "reason": "missing_price"}
    rows = _load()
    updated = 0
    for item in rows:
        if item.get("code") != code or item.get("status") != "open":
            continue
        entry = _f(item.get("entry_price"))
        if not entry:
            continue
        pct = (price - entry) / entry * 100
        item.setdefault("results", {})["latest_pct"] = round(pct, 3)
        item["last_price"] = price
        item["updated_at"] = _now()
        updated += 1
    if updated:
        _save(rows)
    return {"ok": True, "updated": updated}


def get_logs(limit: int = 100) -> dict[str, Any]:
    rows = _load()
    return {"ok": True, "count": len(rows), "items": rows[-limit:]}


def get_stats() -> dict[str, Any]:
    rows = _load()
    closed_or_live = [r for r in rows if _f((r.get("results") or {}).get("latest_pct")) is not None]
    wins = [r for r in closed_or_live if (_f((r.get("results") or {}).get("latest_pct"), 0) or 0) > 0]
    blocked = [r for r in rows if r.get("trap_block")]
    strong = [r for r in rows if int(_f(r.get("score"), 0) or 0) >= 85 and not r.get("trap_block")]
    latest_pcts = [(_f((r.get("results") or {}).get("latest_pct"), 0) or 0) for r in closed_or_live]
    return {
        "ok": True,
        "total_signals": len(rows),
        "tracked_results": len(closed_or_live),
        "win_rate": round(len(wins) / len(closed_or_live) * 100, 2) if closed_or_live else None,
        "avg_latest_pct": round(mean(latest_pcts), 3) if latest_pcts else None,
        "trap_block_count": len(blocked),
        "strong_signal_count": len(strong),
        "latest": rows[-20:],
    }
