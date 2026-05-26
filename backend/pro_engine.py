from __future__ import annotations

from statistics import mean
from typing import Any


def _f(v: Any, default: float | None = None) -> float | None:
    try:
        if v is None:
            return default
        return float(v)
    except Exception:
        return default


def _vwap(rows: list[Any]) -> float | None:
    pv = 0.0
    vol_sum = 0.0
    for r in rows:
        h = _f(getattr(r, "high", None), 0) or 0
        l = _f(getattr(r, "low", None), 0) or 0
        c = _f(getattr(r, "close", None), 0) or 0
        v = _f(getattr(r, "volume", None), 0) or 0
        pv += ((h + l + c) / 3) * v
        vol_sum += v
    if vol_sum <= 0:
        return None
    return pv / vol_sum


def _slope(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    return values[-1] - values[0]


def build_pro_analysis(code: str, quote: dict[str, Any], rows: list[Any]) -> dict[str, Any]:
    reasons: list[str] = []
    risks: list[str] = []
    signals: dict[str, Any] = {}
    score = 45

    close = _f(quote.get("close"))
    open_ = _f(quote.get("open"))
    high = _f(quote.get("high"))
    low = _f(quote.get("low"))
    change_rate = _f(quote.get("change_rate"), 0) or 0
    buy_volume = _f(quote.get("buy_volume"), 0) or 0
    sell_volume = _f(quote.get("sell_volume"), 0) or 0
    volume_ratio = _f(quote.get("volume_ratio"), 0) or 0

    recent = rows[-30:]
    closes = [_f(getattr(r, "close", None), 0) or 0 for r in recent]
    vols = [_f(getattr(r, "volume", None), 0) or 0 for r in recent]
    vwap = _vwap(rows)
    ma5 = mean(closes[-5:]) if len(closes) >= 5 else None
    ma20 = mean(closes[-20:]) if len(closes) >= 20 else None
    recent_vol = mean(vols[-5:]) if len(vols) >= 5 else 0
    base_vol = mean(vols[-30:-5]) if len(vols) >= 30 else (mean(vols) if vols else 0)
    rel_vol = recent_vol / base_vol if base_vol else 0
    slope = _slope(closes[-8:]) if len(closes) >= 8 else 0

    if close and vwap:
        signals["vwap"] = round(vwap, 3)
        if close > vwap:
            score += 14
            reasons.append("站上 VWAP，多方成本線偏強")
        else:
            score -= 16
            risks.append("跌破 VWAP，盤中優勢不足")

    if ma5 and ma20:
        signals["ma5"] = round(ma5, 3)
        signals["ma20"] = round(ma20, 3)
        if ma5 > ma20 and slope > 0:
            score += 10
            reasons.append("短均線向上，價格斜率轉強")
        elif ma5 < ma20:
            score -= 8
            risks.append("短均線仍偏弱")

    signals["relative_volume"] = round(rel_vol, 2)
    if rel_vol >= 1.8:
        score += 12
        reasons.append("近端量能明顯放大")
    elif rel_vol >= 1.25:
        score += 6
        reasons.append("近端量能略有放大")
    elif rel_vol and rel_vol < 0.75:
        score -= 8
        risks.append("量能不足，容易假突破")

    signals["volume_ratio"] = volume_ratio
    if volume_ratio >= 2:
        score += 8
        reasons.append("量比偏高，盤中關注度提升")
    elif 0 < volume_ratio < 0.8:
        score -= 5
        risks.append("量比偏低，動能不足")

    if buy_volume or sell_volume:
        imbalance = (buy_volume - sell_volume) / max(buy_volume + sell_volume, 1)
        signals["orderbook_imbalance"] = round(imbalance, 3)
        if imbalance >= 0.25:
            score += 10
            reasons.append("五檔委買明顯強於委賣")
        elif imbalance <= -0.25:
            score -= 12
            risks.append("五檔委賣壓力較大")
    else:
        signals["orderbook_imbalance"] = None
        risks.append("尚未取得有效五檔量資料")

    signals["change_rate"] = round(change_rate, 2)
    if change_rate >= 3.5:
        score -= 8
        risks.append("漲幅已高，避免追第一段急拉")
    elif 0.5 <= change_rate <= 2.5:
        score += 6
        reasons.append("漲幅適中，仍有觀察空間")
    elif change_rate <= -1.5:
        score -= 10
        risks.append("跌幅偏大，短線偏弱")

    if close and high and low and high > low:
        pos = (close - low) / (high - low)
        signals["intraday_position"] = round(pos, 3)
        if pos >= 0.75:
            score += 7
            reasons.append("價格位於盤中高檔區")
        elif pos <= 0.35:
            score -= 8
            risks.append("價格靠近盤中低檔區")

    if close and open_:
        signals["red_k"] = close >= open_
        if close >= open_:
            score += 4
            reasons.append("目前為紅 K，動能偏多")
        else:
            score -= 5
            risks.append("目前為黑 K，短線承壓")

    if close and vwap:
        dist = (close - vwap) / vwap * 100
        signals["distance_to_vwap_pct"] = round(dist, 2)
        if dist > 2.2:
            score -= 10
            risks.append("離 VWAP 過遠，追價風險升高")
        elif 0 <= dist <= 1.2:
            score += 5
            reasons.append("距 VWAP 不遠，適合等回測")

    score = max(0, min(100, int(round(score))))
    if score >= 88:
        level, action, entry = "strong", "強勢觀察，等回測不破再進", True
    elif score >= 76:
        level, action, entry = "watch", "可觀察，不追高", False
    elif score >= 60:
        level, action, entry = "neutral", "訊號普通，等待更明確量價", False
    else:
        level, action, entry = "risk", "風險偏高，暫不進場", False

    entry_zone = stop = target = None
    if close:
        if vwap:
            entry_zone = f"{round(max(vwap, close * 0.992), 2)} ~ {round(close, 2)}"
        stop_base = min([x for x in [vwap, low, close * 0.985] if x])
        stop = f"跌破 {round(stop_base, 2)}"
        if high:
            target = f"先看 {round(high, 2)}，突破再看量能延伸"

    return {
        "code": code,
        "name": quote.get("name"),
        "score": score,
        "level": level,
        "action": action,
        "entry": entry,
        "entry_zone": entry_zone,
        "stop": stop,
        "target": target,
        "reasons": reasons[:8],
        "risks": risks[:8],
        "signals": signals,
        "quote": {k: v for k, v in quote.items() if k != "raw"},
        "message": "STX Pro Engine v2：後端計算，前端只顯示。",
    }
