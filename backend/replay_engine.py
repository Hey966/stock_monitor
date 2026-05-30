from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

LOG_PATH = Path(os.getenv("STX_REPLAY_LOG", "/tmp/stx_replay_logs.json"))


def _now_dt() -> datetime:
    return datetime.now(timezone.utc)


def _now() -> str:
    return _now_dt().isoformat()


def _age_minutes(ts: str | None) -> float:
    try:
        if not ts:
            return 0.0
        return max(0.0, (_now_dt() - datetime.fromisoformat(ts)).total_seconds() / 60)
    except Exception:
        return 0.0


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
    LOG_PATH.write_text(json.dumps(rows[-2000:], ensure_ascii=False, indent=2), encoding="utf-8")


def _f(v: Any, default: float | None = None) -> float | None:
    try:
        if v is None:
            return default
        return float(v)
    except Exception:
        return default


def _pct(price: float, entry: float) -> float:
    return round((price - entry) / entry * 100, 3)


def should_record(analysis: dict[str, Any]) -> bool:
    score = int(_f(analysis.get("score"), 0) or 0)
    level = str(analysis.get("level") or "")
    trap_block = bool((analysis.get("signals") or {}).get("trap_block"))
    return score >= 75 or level in {"strong", "strong_watch", "blocked"} or trap_block


def save_signal(analysis: dict[str, Any]) -> dict[str, Any]:
    if not should_record(analysis):
        return {"ok": True, "saved": False, "reason": "below_record_threshold"}
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
            "orderbook_risk_cap": signals.get("orderbook_risk_cap"),
            "pullback_hold_vwap": signals.get("pullback_hold_vwap"),
            "distance_to_vwap_pct": signals.get("distance_to_vwap_pct"),
        },
        "best_price": entry,
        "worst_price": entry,
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
        age = _age_minutes(item.get("created_at"))
        item["best_price"] = max(_f(item.get("best_price"), price) or price, price)
        item["worst_price"] = min(_f(item.get("worst_price"), price) or price, price)
        result = item.setdefault("results", {})
        result["latest_pct"] = _pct(price, entry)
        result["max_gain"] = _pct(_f(item.get("best_price"), price) or price, entry)
        result["max_drawdown"] = _pct(_f(item.get("worst_price"), price) or price, entry)
        if age >= 5 and "pct_5m" not in result:
            result["pct_5m"] = _pct(price, entry)
        if age >= 10 and "pct_10m" not in result:
            result["pct_10m"] = _pct(price, entry)
        if age >= 30 and "pct_30m" not in result:
            result["pct_30m"] = _pct(price, entry)
            item["status"] = "closed"
        item["age_minutes"] = round(age, 2)
        item["last_price"] = price
        item["updated_at"] = _now()
        updated += 1
    if updated:
        _save(rows)
    return {"ok": True, "updated": updated}


def get_logs(limit: int = 100) -> dict[str, Any]:
    rows = _load()
    return {"ok": True, "count": len(rows), "items": rows[-limit:]}


def _tracked(rows: list[dict[str, Any]], field: str) -> list[dict[str, Any]]:
    return [r for r in rows if _f((r.get("results") or {}).get(field)) is not None]


def _win_rate(rows: list[dict[str, Any]], field: str) -> float | None:
    tracked = _tracked(rows, field)
    if not tracked:
        return None
    wins = [r for r in tracked if (_f((r.get("results") or {}).get(field), 0) or 0) > 0]
    return round(len(wins) / len(tracked) * 100, 2)


def _avg(rows: list[dict[str, Any]], field: str) -> float | None:
    vals = [(_f((r.get("results") or {}).get(field), 0) or 0) for r in _tracked(rows, field)]
    return round(mean(vals), 3) if vals else None


def get_stats() -> dict[str, Any]:
    rows = _load()
    live = _tracked(rows, "latest_pct")
    blocked = [r for r in rows if r.get("trap_block")]
    strong = [r for r in rows if int(_f(r.get("score"), 0) or 0) >= 85 and not r.get("trap_block")]
    return {
        "ok": True,
        "version": "STX Replay Engine v2",
        "total_signals": len(rows),
        "open_signals": len([r for r in rows if r.get("status") == "open"]),
        "closed_signals": len([r for r in rows if r.get("status") == "closed"]),
        "tracked_results": len(live),
        "win_rate": _win_rate(rows, "latest_pct"),
        "win_rate_5m": _win_rate(rows, "pct_5m"),
        "win_rate_10m": _win_rate(rows, "pct_10m"),
        "win_rate_30m": _win_rate(rows, "pct_30m"),
        "avg_latest_pct": _avg(rows, "latest_pct"),
        "avg_5m_pct": _avg(rows, "pct_5m"),
        "avg_10m_pct": _avg(rows, "pct_10m"),
        "avg_30m_pct": _avg(rows, "pct_30m"),
        "avg_max_gain": _avg(rows, "max_gain"),
        "avg_max_drawdown": _avg(rows, "max_drawdown"),
        "trap_block_count": len(blocked),
        "strong_signal_count": len(strong),
        "latest": rows[-20:],
    }
