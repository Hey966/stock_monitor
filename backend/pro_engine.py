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


def _range_pct(start: float | None, end: float | None) -> float:
    if not start or not end:
        return 0.0
    return (end - start) / start * 100


def _last_change_pct(closes: list[float], bars: int) -> float:
    if len(closes) < bars + 1:
        return 0.0
    return _range_pct(closes[-bars - 1], closes[-1])


def _market_bias(market: dict[str, Any] | None) -> tuple[str, int, list[str], dict[str, Any]]:
    if not market:
        return "unknown", 0, ["尚未取得大盤同步資料"], {"status": "missing"}
    change_rate = _f(market.get("change_rate"), 0) or 0
    close = _f(market.get("close"))
    open_ = _f(market.get("open"))
    high = _f(market.get("high"))
    low = _f(market.get("low"))
    pos = None
    if close and high and low and high > low:
        pos = (close - low) / (high - low)
    red = bool(close and open_ and close >= open_)
    score = 0
    notes: list[str] = []
    if change_rate >= 0.8:
        score += 2
        notes.append("權值股偏強")
    elif change_rate <= -0.8:
        score -= 2
        notes.append("權值股偏弱")
    if red:
        score += 1
        notes.append("權值股紅K")
    else:
        score -= 1
        notes.append("權值股黑K或轉弱")
    if pos is not None:
        if pos >= 0.65:
            score += 1
            notes.append("權值股位於盤中高檔")
        elif pos <= 0.35:
            score -= 1
            notes.append("權值股靠近盤中低檔")
    if score >= 2:
        status = "bull"
    elif score <= -2:
        status = "bear"
    else:
        status = "neutral"
    return status, score, notes, {"status": status, "score": score, "change_rate": round(change_rate, 2), "red_k": red, "intraday_position": round(pos, 3) if pos is not None else None, "name": market.get("name"), "code": market.get("code")}


def build_pro_analysis(code: str, quote: dict[str, Any], rows: list[Any], market: dict[str, Any] | None = None) -> dict[str, Any]:
    reasons: list[str] = []
    risks: list[str] = []
    traps: list[str] = []
    signals: dict[str, Any] = {}
    score = 45
    score_cap: int | None = None

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
    lows = [_f(getattr(r, "low", None), 0) or 0 for r in recent]
    vols = [_f(getattr(r, "volume", None), 0) or 0 for r in recent]
    vwap = _vwap(rows)
    ma5 = mean(closes[-5:]) if len(closes) >= 5 else None
    ma20 = mean(closes[-20:]) if len(closes) >= 20 else None
    recent_vol = mean(vols[-5:]) if len(vols) >= 5 else 0
    base_vol = mean(vols[-30:-5]) if len(vols) >= 30 else (mean(vols) if vols else 0)
    rel_vol = recent_vol / base_vol if base_vol else 0
    slope = _slope(closes[-8:]) if len(closes) >= 8 else 0
    chg3 = _last_change_pct(closes, 3)
    chg5 = _last_change_pct(closes, 5)

    market_status, market_score, market_notes, market_signal = _market_bias(market)
    signals["market_sync"] = market_signal
    if code != "2330":
        if market_status == "bull" and change_rate > 0:
            score += 8
            reasons.append("大盤權值同步偏多")
        elif market_status == "bear" and change_rate > 0:
            score -= 12
            risks.append("個股偏強但權值股偏弱，容易被大盤拖累")
        elif market_status == "bear" and change_rate <= 0:
            score -= 8
            risks.append("個股與權值股同步偏弱")
        elif market_status == "neutral":
            score -= 2
            risks.append("大盤同步性普通，訊號需保守")
    else:
        reasons.append("此股為權值核心參考，市場同步以自身為主")
    for note in market_notes[:2]:
        if market_status == "bear":
            risks.append("市場：" + note)
        elif market_status == "bull":
            reasons.append("市場：" + note)

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
        if imbalance <= -0.90:
            score_cap = 75 if score_cap is None else min(score_cap, 75)
            risks.append("五檔委賣極強，分數上限 75")
        elif imbalance <= -0.80:
            score_cap = 80 if score_cap is None else min(score_cap, 80)
            risks.append("五檔委賣明顯壓制，分數上限 80")
        elif imbalance <= -0.50:
            score_cap = 88 if score_cap is None else min(score_cap, 88)
            risks.append("五檔委賣偏重，分數上限 88")
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

    intraday_pos = None
    if close and high and low and high > low:
        intraday_pos = (close - low) / (high - low)
        signals["intraday_position"] = round(intraday_pos, 3)
        if intraday_pos >= 0.75:
            score += 7
            reasons.append("價格位於盤中高檔區")
        elif intraday_pos <= 0.35:
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

    distance_to_vwap = None
    if close and vwap:
        distance_to_vwap = (close - vwap) / vwap * 100
        signals["distance_to_vwap_pct"] = round(distance_to_vwap, 2)
        if distance_to_vwap > 2.2:
            score -= 10
            risks.append("離 VWAP 過遠，追價風險升高")
        elif 0 <= distance_to_vwap <= 1.2:
            score += 5
            reasons.append("距 VWAP 不遠，適合等回測")

    signals["last_3_bar_change_pct"] = round(chg3, 2)
    signals["last_5_bar_change_pct"] = round(chg5, 2)
    trap_block = False

    if chg3 >= 2.0 or chg5 >= 3.0:
        score -= 18
        trap_block = True
        traps.append("急拉未確認回測，禁止追價")

    if distance_to_vwap is not None and distance_to_vwap >= 2.0:
        score -= 14
        trap_block = True
        traps.append("價格離 VWAP 過遠，追價風險過高")

    if open_ and high and close and high > open_:
        fade_from_high = (high - close) / high * 100
        signals["fade_from_high_pct"] = round(fade_from_high, 2)
        if open_ > 0 and close < open_ and fade_from_high >= 1.2:
            score -= 18
            trap_block = True
            traps.append("開高走低，疑似誘多陷阱")

    if intraday_pos is not None and rel_vol >= 2.2 and intraday_pos <= 0.45:
        score -= 15
        trap_block = True
        traps.append("高量但價格不在高位，疑似出貨或壓盤")

    pullback_ok = False
    if close and vwap and lows:
        recent_low = min(lows[-5:]) if len(lows) >= 5 else min(lows)
        pullback_ok = recent_low >= vwap * 0.995 and close > vwap and chg3 < 1.6
        signals["pullback_hold_vwap"] = pullback_ok
        if pullback_ok:
            score += 12
            reasons.append("回測 VWAP 附近不破，結構較健康")
        elif close > vwap and (chg3 >= 2.0 or chg5 >= 3.0):
            traps.append("尚未完成回測不破，暫不追高")
            trap_block = True

    if traps:
        risks.extend(["陷阱：" + x for x in traps[:5]])

    score = max(0, min(100, int(round(score))))
    if score_cap is not None and score > score_cap:
        score = score_cap
    signals["orderbook_risk_cap"] = score_cap
    signals["trap_block"] = trap_block
    signals["trap_reasons"] = traps

    if trap_block:
        level, action, entry = "blocked", "禁止進場，等待回測不破", False
    elif score >= 88 and pullback_ok:
        level, action, entry = "strong", "強勢可進，仍需小停損", True
    elif score >= 88:
        level, action, entry = "strong_watch", "強勢觀察，等回測不破再進", False
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
        "risks": risks[:10],
        "traps": traps[:8],
        "signals": signals,
        "quote": {k: v for k, v in quote.items() if k != "raw"},
        "message": "STX Pro Engine v4.1：加入 Orderbook Risk Cap、Market Sync 與 Trap Engine。",
    }
