from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any

DB_PATH = Path(os.getenv("STX_REPLAY_DB", "/tmp/stx_replay.db"))


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


def _json_dumps(v: Any) -> str:
    return json.dumps(v, ensure_ascii=False)


def _json_loads(v: Any, default: Any = None) -> Any:
    try:
        if v in (None, ""):
            return default
        return json.loads(v)
    except Exception:
        return default


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    init_db(conn)
    return conn


def init_db(conn: sqlite3.Connection | None = None) -> None:
    own = conn is None
    if conn is None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS replay_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            status TEXT DEFAULT 'open',
            code TEXT NOT NULL,
            name TEXT,
            score INTEGER,
            level TEXT,
            action TEXT,
            entry_price REAL,
            last_price REAL,
            best_price REAL,
            worst_price REAL,
            age_minutes REAL,
            trap_block INTEGER DEFAULT 0,
            traps_json TEXT,
            market_sync_json TEXT,
            signals_json TEXT,
            results_json TEXT DEFAULT '{}'
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_replay_code_status ON replay_logs(code, status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_replay_created_at ON replay_logs(created_at)")
    if own:
        conn.commit()
        conn.close()


def _row_to_item(row: sqlite3.Row) -> dict[str, Any]:
    results = _json_loads(row["results_json"], {}) or {}
    item = {
        "id": row["id"],
        "key": row["key"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "status": row["status"],
        "code": row["code"],
        "name": row["name"],
        "score": row["score"],
        "level": row["level"],
        "action": row["action"],
        "entry_price": row["entry_price"],
        "last_price": row["last_price"],
        "best_price": row["best_price"],
        "worst_price": row["worst_price"],
        "age_minutes": row["age_minutes"],
        "trap_block": bool(row["trap_block"]),
        "traps": _json_loads(row["traps_json"], []) or [],
        "market_sync": _json_loads(row["market_sync_json"], None),
        "signals": _json_loads(row["signals_json"], {}) or {},
        "results": results,
    }
    return {k: v for k, v in item.items() if v is not None}


def _load(limit: int | None = None) -> list[dict[str, Any]]:
    with _conn() as conn:
        if limit:
            rows = conn.execute(
                "SELECT * FROM replay_logs ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [_row_to_item(r) for r in reversed(rows)]
        rows = conn.execute("SELECT * FROM replay_logs ORDER BY id ASC").fetchall()
        return [_row_to_item(r) for r in rows]


def should_record(analysis: dict[str, Any]) -> bool:
    score = int(_f(analysis.get("score"), 0) or 0)
    level = str(analysis.get("level") or "")
    trap_block = bool((analysis.get("signals") or {}).get("trap_block"))
    return score >= 75 or level in {"strong", "strong_watch", "blocked"} or trap_block


def save_signal(analysis: dict[str, Any]) -> dict[str, Any]:
    if not should_record(analysis):
        return {"ok": True, "saved": False, "reason": "below_record_threshold"}

    code = str(analysis.get("code") or "")
    quote = analysis.get("quote") or {}
    signals = analysis.get("signals") or {}
    entry = _f(quote.get("close"))
    score = _i(analysis.get("score"), 0)
    key = f"{code}:{score}:{analysis.get('level')}:{entry}"

    with _conn() as conn:
        old = conn.execute(
            "SELECT * FROM replay_logs WHERE key = ? AND status = 'open' ORDER BY id DESC LIMIT 1",
            (key,),
        ).fetchone()
        if old:
            return {"ok": True, "saved": False, "reason": "duplicate", "item": _row_to_item(old)}

        item_signals = {
            "vwap": signals.get("vwap"),
            "relative_volume": signals.get("relative_volume"),
            "orderbook_imbalance": signals.get("orderbook_imbalance"),
            "orderbook_risk_cap": signals.get("orderbook_risk_cap"),
            "pullback_hold_vwap": signals.get("pullback_hold_vwap"),
            "distance_to_vwap_pct": signals.get("distance_to_vwap_pct"),
        }
        now = _now()
        conn.execute(
            """
            INSERT INTO replay_logs (
                key, created_at, updated_at, status, code, name, score, level, action,
                entry_price, last_price, best_price, worst_price, age_minutes,
                trap_block, traps_json, market_sync_json, signals_json, results_json
            ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, '{}')
            """,
            (
                key,
                now,
                now,
                code,
                analysis.get("name"),
                score,
                analysis.get("level"),
                analysis.get("action"),
                entry,
                entry,
                entry,
                entry,
                1 if signals.get("trap_block") else 0,
                _json_dumps(analysis.get("traps") or []),
                _json_dumps(signals.get("market_sync")),
                _json_dumps(item_signals),
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM replay_logs WHERE key = ?", (key,)).fetchone()
        return {"ok": True, "saved": True, "item": _row_to_item(row)}


def update_results(code: str, current_price: float | int | None) -> dict[str, Any]:
    price = _f(current_price)
    if price is None:
        return {"ok": False, "updated": 0, "reason": "missing_price"}

    updated = 0
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM replay_logs WHERE code = ? AND status = 'open' ORDER BY id ASC",
            (code,),
        ).fetchall()
        for row in rows:
            item = _row_to_item(row)
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
            status = item.get("status", "open")
            if age >= 30 and "pct_30m" not in result:
                result["pct_30m"] = _pct(price, entry)
                status = "closed"

            conn.execute(
                """
                UPDATE replay_logs
                SET updated_at = ?, status = ?, last_price = ?, best_price = ?, worst_price = ?,
                    age_minutes = ?, results_json = ?
                WHERE id = ?
                """,
                (_now(), status, price, best_price, worst_price, round(age, 2), _json_dumps(result), row["id"]),
            )
            updated += 1
        conn.commit()
    return {"ok": True, "updated": updated}


def get_logs(limit: int = 100) -> dict[str, Any]:
    rows = _load(limit=limit)
    with _conn() as conn:
        count = conn.execute("SELECT COUNT(*) FROM replay_logs").fetchone()[0]
    return {"ok": True, "storage": "sqlite", "db_path": str(DB_PATH), "count": count, "items": rows}


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
        "version": "STX Replay Storage v1 + Replay Engine v2",
        "storage": "sqlite",
        "db_path": str(DB_PATH),
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
