from __future__ import annotations

from typing import Any

from performance_engine import update_module_results


def update_performance_from_scan(scan: dict[str, Any]) -> dict[str, Any]:
    items = scan.get("items") or []
    checked = 0
    updated_total = 0
    errors: list[dict[str, str]] = []

    for item in items:
        code = str(item.get("code") or "").strip()
        price = item.get("close") or item.get("last_price") or item.get("entry_price")
        if not code or price is None:
            continue
        checked += 1
        try:
            result = update_module_results(code, price)
            updated_total += int(result.get("updated") or 0)
        except Exception as exc:
            errors.append({"code": code, "message": str(exc)[:120]})

    return {
        "ok": True,
        "version": "STX Performance Auto Update v1",
        "checked": checked,
        "updated": updated_total,
        "errors": errors[:10],
    }
