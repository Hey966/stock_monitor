from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

CACHE_PATH = Path(os.getenv("STX_REPLAY_CACHE", "/tmp/stx_replay_cache.json"))
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO = os.getenv("GITHUB_REPO", "Hey966/stock_monitor")
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main")
GITHUB_LOG_DIR = os.getenv("STX_REPLAY_GITHUB_DIR", "replay_logs")


def _now_dt() -> datetime:
    return datetime.now(timezone.utc)


def _now() -> str:
    return _now_dt().isoformat()


def _today_path() -> str:
    return f"{GITHUB_LOG_DIR}/{_now_dt().date().isoformat()}.json"


def _age_minutes(ts: str | None) -> float:
    try:
        if not ts:
            return 0.0
        return max(0.0, (_now_dt() - datetime.fromisoformat(ts)).total_seconds() / 60)
    except Exception:
        return 0.0


def _f(v: Any, default: float | None = None) -> float | None:
    try:
        if v is None:
            return default
        return float(v)
    except Exception:
        return default


def _i(v: Any, default: int = 0) -> int:
    try:
        if v is None:
            return default
        return int(v)
    except Exception:
        return default


def _pct(price: float, entry: float) -> float:
    return round((price - entry) / entry * 100, 3)


def _cache_load() -> list[dict[str, Any]]:
    try:
        if not CACHE_PATH.exists():
            return []
        data = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _cache_save(rows: list[dict[str, Any]]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(rows[-3000:], ensure_ascii=False, indent=2), encoding="utf-8")


def _github_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "STX-Replay-Storage",
    }
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return headers


def _github_api(path: str, method: str = "GET", payload: dict[str, Any] | None = None) -> dict[str, Any] | None:
    if not GITHUB_TOKEN:
        return None
    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{path}"
    if method == "GET":
        url += f"?ref={GITHUB_BRANCH}"
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=_github_headers(), method=method)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise
    except Exception:
        return None


def _github_read_day(path: str) -> tuple[list[dict[str, Any]], str | None]:
    obj = _github_api(path, "GET")
    if not obj:
        return [], None
    try:
        content = base64.b64decode(obj.get("content", "")).decode("utf-8")
        data = json.loads(content)
        rows = data.get("items", data) if isinstance(data, dict) else data
        return (rows if isinstance(rows, list) else []), obj.get("sha")
    except Exception:
        return [], obj.get("sha")


def _github_write_day(path: str, rows: list[dict[str, Any]]) -> bool:
    if not GITHUB_TOKEN:
        return False
    old_rows, sha = _github_read_day(path)
    merged: dict[str, dict[str, Any]] = {}
    for row in old_rows + rows:
        key = str(row.get("key") or f"{row.get('created_at')}:{row.get('code')}")
        merged[key] = row
    ordered = sorted(merged.values(), key=lambda x: str(x.get("created_at", "")))
    body = {
        "version": "STX Replay Storage v2 GitHub JSON Edition",
        "updated_at": _now(),
        "count": len(ordered),
        "items": ordered,
    }
    content = base64.b64encode(json.dumps(body, ensure_ascii=False, indent=2).encode("utf-8")).decode("ascii")
    payload: dict[str, Any] = {
        "message": f"Update STX replay log {path}",
        "content": content,
        "branch": GITHUB_BRANCH,
    }
    if sha:
        payload["sha"] = sha
    return _github_api(path, "PUT", payload) is not None


def _sync_today_to_github(rows: list[dict[str, Any]]) -> bool:
    today = _now_dt().date().isoformat()
    today_rows = [r for r in rows if str(r.get("created_at", "")).startswith(today)]
    if not today_rows:
        return False
    return _github_write_day(_today_path(), today_rows)


def _load(limit: int | None = None) -> list[dict[str, Any]]:
    rows = _cache_load()
    if not rows and GITHUB_TOKEN:
        gh_rows, _ = _github_read_day(_today_path())
        if gh_rows:
            rows = gh_rows
            _cache_save(rows)
    if limit:
        return rows[-limit:]
    return rows


def _save(rows: list[dict[str, Any]]) -> bool:
    _cache_save(rows)
    return _sync_today_to_github(rows)


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
    score = _i(analysis.get("score"), 0)
    key = f"{code}:{score}:{analysis.get('level')}:{entry}"

    for old in reversed(rows[-50:]):
        if old.get("key") == key and old.get("status") == "open":
            return {"ok": True, "saved": False, "reason": "duplicate", "item": old}

    item = {
        "key": key,
        "created_at": _now(),
        "updated_at": _now(),
        "status": "open",
        "code": code,
        "name": analysis.get("name"),
        "score": score,
        "level": analysis.get("level"),
        "action": analysis.get("action"),
        "entry_price": entry,
        "last_price": entry,
        "best_price": entry,
        "worst_price": entry,
        "age_minutes": 0,
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
        "results": {},
    }
    rows.append(item)
    synced = _save(rows)
    item["github_synced"] = synced
    return {"ok": True, "saved": True, "storage": "github_json", "github_synced": synced, "item": item}


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
        best_price = max(_f(item.get("best_price"), price) or price, price)
        worst_price = min(_f(item.get("worst_price"), price) or price, price)
        result = item.setdefault("results", {})
        result["latest_pct"] = _pct(price, entry)
        result["max_gain"] = _pct(best_price, entry)
        result["max_drawdown"] = _pct(worst_price, entry)
        if age >= 5 and "pct_5m" not in result:
            result["pct_5m"] = _pct(price, entry)
        if age >= 10 and "pct_10m" not in result:
            result["pct_10m"] = _pct(price, entry)
        if age >= 30 and "pct_30m" not in result:
            result["pct_30m"] = _pct(price, entry)
            item["status"] = "closed"
        item["best_price"] = best_price
        item["worst_price"] = worst_price
        item["age_minutes"] = round(age, 2)
        item["last_price"] = price
        item["updated_at"] = _now()
        updated += 1

    synced = _save(rows) if updated else False
    return {"ok": True, "updated": updated, "storage": "github_json", "github_synced": synced}


def get_logs(limit: int = 100) -> dict[str, Any]:
    rows = _load()
    return {
        "ok": True,
        "storage": "github_json",
        "github_enabled": bool(GITHUB_TOKEN),
        "github_repo": GITHUB_REPO,
        "github_path": _today_path(),
        "cache_path": str(CACHE_PATH),
        "count": len(rows),
        "items": rows[-limit:],
    }


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
        "version": "STX Replay Storage v2 GitHub JSON Edition + Replay Engine v2",
        "storage": "github_json",
        "github_enabled": bool(GITHUB_TOKEN),
        "github_repo": GITHUB_REPO,
        "github_path": _today_path(),
        "cache_path": str(CACHE_PATH),
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
