from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

CACHE_PATH = Path(os.getenv("STX_PERFORMANCE_CACHE", "/tmp/stx_performance_cache.json"))
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO = os.getenv("GITHUB_REPO", "Hey966/stock_monitor")
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main")
GITHUB_LOG_DIR = os.getenv("STX_PERFORMANCE_GITHUB_DIR", "performance_logs")
LAST_GITHUB_ERROR = ""


def _now_dt() -> datetime:
    return datetime.now(timezone.utc)


def _now() -> str:
    return _now_dt().isoformat()


def _today_path() -> str:
    return f"{GITHUB_LOG_DIR}/{_now_dt().date().isoformat()}.json"


def _f(v: Any, default: float | None = None) -> float | None:
    try:
        if v is None:
            return default
        return float(v)
    except Exception:
        return default


def _pct(price: float, entry: float) -> float:
    return round((price - entry) / entry * 100, 3)


def _age_minutes(ts: str | None) -> float:
    try:
        if not ts:
            return 0.0
        return max(0.0, (_now_dt() - datetime.fromisoformat(ts)).total_seconds() / 60)
    except Exception:
        return 0.0


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
    CACHE_PATH.write_text(json.dumps(rows[-5000:], ensure_ascii=False, indent=2), encoding="utf-8")


def _github_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "STX-Performance-Storage",
    }
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return headers


def _set_github_error(message: str) -> None:
    global LAST_GITHUB_ERROR
    LAST_GITHUB_ERROR = message[:300]


def _clear_github_error() -> None:
    global LAST_GITHUB_ERROR
    LAST_GITHUB_ERROR = ""


def _github_api(path: str, method: str = "GET", payload: dict[str, Any] | None = None) -> dict[str, Any] | None:
    if not GITHUB_TOKEN:
        return None
    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{path}"
    if method == "GET":
        url += f"?ref={GITHUB_BRANCH}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, headers=_github_headers(), method=method)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        try:
            body = exc.read().decode("utf-8")
        except Exception:
            body = str(exc)
        _set_github_error(f"HTTP {exc.code}: {body}")
        raise
    except Exception as exc:
        _set_github_error(str(exc))
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

    for attempt in range(5):
        old_rows, sha = _github_read_day(path)
        merged: dict[str, dict[str, Any]] = {}
        for row in old_rows + rows:
            key = str(row.get("key") or f"{row.get('module')}:{row.get('created_at')}:{row.get('code')}")
            merged[key] = row
        ordered = sorted(merged.values(), key=lambda x: str(x.get("created_at", "")))
        body = {
            "version": "STX Module Performance v1",
            "updated_at": _now(),
            "count": len(ordered),
            "items": ordered,
        }
        content = base64.b64encode(json.dumps(body, ensure_ascii=False, indent=2).encode("utf-8")).decode("ascii")
        payload: dict[str, Any] = {
            "message": f"Update STX performance log {path}",
            "content": content,
            "branch": GITHUB_BRANCH,
        }
        if sha:
            payload["sha"] = sha
        try:
            result = _github_api(path, "PUT", payload)
            if result is not None:
                _clear_github_error()
                return True
            return False
        except urllib.error.HTTPError as exc:
            if exc.code == 409 and attempt < 4:
                time.sleep(0.75 * (attempt + 1))
                continue
            _set_github_error(f"GitHub write skipped after HTTP {exc.code}")
            return False
        except Exception as exc:
            _set_github_error(f"GitHub write skipped: {exc}")
            return False
    return False


def _load(limit: int | None = None) -> list[dict[str, Any]]:
    rows = _cache_load()
    if not rows and GITHUB_TOKEN:
        try:
            gh_rows, _ = _github_read_day(_today_path())
            if gh_rows:
                rows = gh_rows
                _cache_save(rows)
        except Exception:
            pass
    return rows[-limit:] if limit else rows


def _save(rows: list[dict[str, Any]]) -> bool:
    _cache_save(rows)
    today = _now_dt().date().isoformat()
    today_rows = [r for r in rows if str(r.get("created_at", "")).startswith(today)]
    try:
        return _github_write_day(_today_path(), today_rows) if today_rows else False
    except Exception as exc:
        _set_github_error(f"GitHub sync failed but cache saved: {exc}")
        return False


def _module_score(item: dict[str, Any], module: str) -> int:
    candidates = [item.get("score"), item.get("fund_score"), item.get("big_player_score"), item.get("day_trade_risk")]
    if module == "fund_flow":
        candidates = [item.get("fund_score"), item.get("big_player_score"), item.get("score")]
    for v in candidates:
        n = _f(v)
        if n is not None:
            return int(n)
    return 0


def _build_row(module: str, item: dict[str, Any], reason: str = "auto") -> dict[str, Any] | None:
    code = str(item.get("code") or "")
    entry = _f(item.get("close") or item.get("entry_price"))
    if not code or not entry:
        return None
    score = _module_score(item, module)
    key = f"{module}:{code}:{score}:{entry}"
    return {
        "key": key,
        "module": module,
        "reason": reason,
        "created_at": _now(),
        "updated_at": _now(),
        "status": "open",
        "code": code,
        "name": item.get("name"),
        "sector": item.get("sector"),
        "entry_price": entry,
        "last_price": entry,
        "best_price": entry,
        "worst_price": entry,
        "score": score,
        "change_rate_at_signal": item.get("change_rate"),
        "volume_ratio_at_signal": item.get("volume_ratio"),
        "alert": item.get("alert") or item.get("alert_type"),
        "results": {},
    }


def record_module_signal(module: str, item: dict[str, Any], reason: str = "auto") -> dict[str, Any]:
    row = _build_row(module, item, reason)
    if not row:
        return {"ok": False, "saved": False, "reason": "missing_code_or_price"}
    rows = _load()
    for old in reversed(rows[-200:]):
        if old.get("key") == row.get("key") and old.get("status") == "open":
            return {"ok": True, "saved": False, "reason": "duplicate", "item": old}
    rows.append(row)
    synced = _save(rows)
    row["github_synced"] = synced
    return {"ok": True, "saved": True, "github_synced": synced, "github_error": LAST_GITHUB_ERROR if not synced else "", "item": row}


def record_module_signals(module: str, items: list[dict[str, Any]], reason: str = "auto", limit: int = 20) -> dict[str, Any]:
    rows = _load()
    existing_open = {str(r.get("key")) for r in rows if r.get("status") == "open"}
    saved = 0
    skipped = 0
    for item in items[:limit]:
        row = _build_row(module, item, reason)
        if not row:
            skipped += 1
            continue
        if str(row.get("key")) in existing_open:
            skipped += 1
            continue
        rows.append(row)
        existing_open.add(str(row.get("key")))
        saved += 1
    synced = _save(rows) if saved else False
    return {"ok": True, "module": module, "saved": saved, "skipped": skipped, "github_synced": synced, "github_error": LAST_GITHUB_ERROR if saved and not synced else ""}


def update_module_results(code: str, current_price: float | int | None) -> dict[str, Any]:
    price = _f(current_price)
    if price is None:
        return {"ok": False, "updated": 0, "reason": "missing_price"}

    rows = _load()
    updated = 0
    for row in rows:
        if row.get("code") != code or row.get("status") != "open":
            continue
        entry = _f(row.get("entry_price"))
        if not entry:
            continue
        age = _age_minutes(row.get("created_at"))
        best_price = max(_f(row.get("best_price"), price) or price, price)
        worst_price = min(_f(row.get("worst_price"), price) or price, price)
        result = row.setdefault("results", {})
        result["latest_pct"] = _pct(price, entry)
        result["max_gain"] = _pct(best_price, entry)
        result["max_drawdown"] = _pct(worst_price, entry)
        if age >= 5 and "pct_5m" not in result:
            result["pct_5m"] = _pct(price, entry)
        if age >= 10 and "pct_10m" not in result:
            result["pct_10m"] = _pct(price, entry)
        if age >= 30 and "pct_30m" not in result:
            result["pct_30m"] = _pct(price, entry)
        if age >= 240 and "pct_close_proxy" not in result:
            result["pct_close_proxy"] = _pct(price, entry)
            row["status"] = "closed"
        row["last_price"] = price
        row["best_price"] = best_price
        row["worst_price"] = worst_price
        row["age_minutes"] = round(age, 2)
        row["updated_at"] = _now()
        updated += 1

    synced = _save(rows) if updated else False
    return {"ok": True, "updated": updated, "github_synced": synced, "github_error": LAST_GITHUB_ERROR if updated and not synced else ""}


def get_performance_logs(limit: int = 200) -> dict[str, Any]:
    rows = _load()
    return {
        "ok": True,
        "version": "STX Module Performance v1",
        "storage": "github_json",
        "github_enabled": bool(GITHUB_TOKEN),
        "github_repo": GITHUB_REPO,
        "github_path": _today_path(),
        "github_last_error": LAST_GITHUB_ERROR,
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


def _best(rows: list[dict[str, Any]]) -> float | None:
    vals = [(_f((r.get("results") or {}).get("max_gain"), 0) or 0) for r in rows if r.get("results")]
    return round(max(vals), 3) if vals else None


def _worst(rows: list[dict[str, Any]]) -> float | None:
    vals = [(_f((r.get("results") or {}).get("max_drawdown"), 0) or 0) for r in rows if r.get("results")]
    return round(min(vals), 3) if vals else None


def get_module_performance() -> dict[str, Any]:
    rows = _load()
    modules = sorted({str(r.get("module")) for r in rows if r.get("module")})
    module_stats = []
    for module in modules:
        mrows = [r for r in rows if r.get("module") == module]
        module_stats.append({
            "module": module,
            "signals": len(mrows),
            "open": len([r for r in mrows if r.get("status") == "open"]),
            "closed": len([r for r in mrows if r.get("status") == "closed"]),
            "tracked": len(_tracked(mrows, "latest_pct")),
            "win_rate_latest": _win_rate(mrows, "latest_pct"),
            "win_rate_5m": _win_rate(mrows, "pct_5m"),
            "win_rate_10m": _win_rate(mrows, "pct_10m"),
            "win_rate_30m": _win_rate(mrows, "pct_30m"),
            "avg_latest_pct": _avg(mrows, "latest_pct"),
            "avg_30m_pct": _avg(mrows, "pct_30m"),
            "max_gain": _best(mrows),
            "max_drawdown": _worst(mrows),
            "latest": mrows[-5:],
        })
    module_stats.sort(key=lambda x: (x.get("win_rate_30m") is not None, x.get("win_rate_30m") or -1, x.get("signals") or 0), reverse=True)
    return {
        "ok": True,
        "version": "STX Module Performance v1",
        "storage": "github_json",
        "github_enabled": bool(GITHUB_TOKEN),
        "github_repo": GITHUB_REPO,
        "github_path": _today_path(),
        "github_last_error": LAST_GITHUB_ERROR,
        "total_signals": len(rows),
        "tracked_results": len(_tracked(rows, "latest_pct")),
        "modules": module_stats,
        "latest": rows[-20:],
    }
