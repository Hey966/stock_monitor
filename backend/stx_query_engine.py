from __future__ import annotations

from typing import Any


def _s(v: Any) -> str:
    return str(v or "").strip()


def _score(item: dict[str, Any]) -> int:
    for key in ["fund_score", "score", "big_player_score", "day_trade_risk"]:
        try:
            if item.get(key) is not None:
                return int(float(item.get(key)))
        except Exception:
            pass
    return 0


def _pct(v: Any) -> str:
    try:
        return f"{float(v):+.2f}%"
    except Exception:
        return "-"


def _normalize_query(q: str) -> str:
    q = _s(q).lower()
    aliases = {
        "ai": "AI",
        "ai伺服器": "AI伺服器",
        "ai散熱": "AI散熱",
        "半導體": "半導體",
        "航運": "航運",
        "電腦": "電腦週邊",
        "電腦週邊": "電腦週邊",
        "面板": "面板",
        "重電": "重電",
        "電線": "電線電纜",
        "電線電纜": "電線電纜",
        "pcb": "PCB",
    }
    return aliases.get(q, q)


def _item_line(item: dict[str, Any], index: int | None = None) -> str:
    code = item.get("code") or "-"
    name = item.get("name") or ""
    sector = item.get("sector") or "其他"
    score = _score(item)
    change = _pct(item.get("change_rate"))
    pieces = []
    if item.get("fund_score") is not None:
        pieces.append(f"資金 {item.get('fund_score')}")
    if item.get("big_player_score") is not None:
        pieces.append(f"主力 {item.get('big_player_score')}")
    if item.get("day_trade_risk") is not None:
        pieces.append(f"隔沖 {item.get('day_trade_risk')}")
    meta = "｜".join(pieces) if pieces else (item.get("mood") or "-")
    prefix = f"{index}. " if index is not None else ""
    return f"{prefix}{code} {name}｜{sector}｜{score}分｜{change}｜{meta}"


def build_stx_query_response(q: str, scan: dict[str, Any], fund_report: dict[str, Any] | None = None, limit: int = 5) -> dict[str, Any]:
    raw_q = _s(q)
    query = _normalize_query(raw_q)
    items = list(scan.get("items") or [])
    alerts = list((fund_report or {}).get("alerts") or [])
    pool = alerts + items

    if not raw_q:
        return {
            "ok": False,
            "query": raw_q,
            "type": "empty",
            "message": "請輸入股票代號、股票名稱或族群，例如：2356、英業達、AI、半導體。",
            "items": [],
        }

    exact = []
    for item in pool:
        code = _s(item.get("code"))
        name = _s(item.get("name"))
        if raw_q == code or raw_q in name:
            exact.append(item)

    if exact:
        best = sorted(exact, key=_score, reverse=True)[0]
        lines = [f"🔎 **STX 個股查詢｜{best.get('code')} {best.get('name') or ''}**", _item_line(best), ""]
        chip = best.get("chip_signal")
        alert = best.get("alert")
        if alert or chip:
            lines.append(f"訊號：{alert or '-'}｜{chip or '-'}")
        lines.append("資料來源：STX 即時掃描 / 資金流 / 績效紀錄")
        return {"ok": True, "query": raw_q, "type": "stock", "items": exact[:limit], "message": "\n".join(lines)}

    sector_matches = []
    for item in pool:
        sector = _s(item.get("sector"))
        if query == "AI":
            matched = "AI" in sector
        else:
            matched = query and (query in sector or sector in query)
        if matched:
            sector_matches.append(item)

    if sector_matches:
        ranked = sorted(sector_matches, key=_score, reverse=True)[:limit]
        title = query if query else raw_q
        lines = [f"🔥 **STX 族群查詢｜{title} TOP{len(ranked)}**"]
        for i, item in enumerate(ranked, 1):
            lines.append(_item_line(item, i))
        lines.append("")
        lines.append("提示：可輸入股票代號或名稱查個股細節。")
        return {"ok": True, "query": raw_q, "type": "sector", "items": ranked, "message": "\n".join(lines)}

    ranked = sorted(pool, key=_score, reverse=True)[:limit]
    lines = [f"⚠️ 找不到「{raw_q}」的完全匹配。", "目前強勢候選："]
    for i, item in enumerate(ranked, 1):
        lines.append(_item_line(item, i))
    return {"ok": True, "query": raw_q, "type": "fallback", "items": ranked, "message": "\n".join(lines)}
