from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Optional

from app.logger import get_logger

logger = get_logger(__name__)


@dataclass
class ValueTrapResult:
    """Value trap analysis result."""

    stock_id: str
    company_name: Optional[str]

    is_value_trap: bool
    risk_level: str
    summary: str
    reasons: list[str]

    trailing_pe: Optional[float]
    revenue_growth: Optional[float]
    earnings_growth: Optional[float]
    roe: Optional[float]
    gross_margin: Optional[float]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ValueTrapAnalyzer:
    """
    Detect whether a stock may be a value trap.

    Core idea:
    - Cheap valuation alone is not enough
    - If growth/profitability is weakening, cheapness may be dangerous

    MVP logic:
    - Primarily checks low PE
    - Then checks revenue/earnings/profitability weakness
    """

    CHEAP_PE_THRESHOLD = 15.0
    LOW_ROE_THRESHOLD = 8.0
    LOW_GROSS_MARGIN_THRESHOLD = 20.0

    def analyze(
        self,
        stock_data: dict[str, Any],
        valuation_result: Optional[dict[str, Any]] = None,
    ) -> ValueTrapResult:
        """
        Analyze whether the stock may be a value trap.

        Args:
            stock_data: Stock data from StockProvider
            valuation_result: Optional valuation result dict

        Returns:
            ValueTrapResult
        """
        stock_id = str(stock_data.get("symbol", "UNKNOWN"))
        company_name = stock_data.get("company_name")

        trailing_pe = self._to_float(stock_data.get("trailing_pe"))
        revenue_growth = self._to_float(stock_data.get("revenue_growth"))
        earnings_growth = self._to_float(stock_data.get("earnings_growth"))
        roe = self._to_float(stock_data.get("roe"))
        gross_margin = self._to_float(stock_data.get("gross_margin"))

        logger.info(
            "Start value trap analysis for stock_id=%s company=%s",
            stock_id,
            company_name,
        )

        reasons: list[str] = []

        cheap_signal = self._is_cheap_stock(trailing_pe, valuation_result)
        weakening_signals = self._collect_weakening_signals(
            revenue_growth=revenue_growth,
            earnings_growth=earnings_growth,
            roe=roe,
            gross_margin=gross_margin,
        )

        reasons.extend(weakening_signals)

        is_value_trap = cheap_signal and len(weakening_signals) > 0
        risk_level = self._classify_risk_level(cheap_signal, weakening_signals)
        summary = self._build_summary(
            is_value_trap=is_value_trap,
            risk_level=risk_level,
            trailing_pe=trailing_pe,
            reasons=weakening_signals,
        )

        result = ValueTrapResult(
            stock_id=stock_id,
            company_name=company_name,
            is_value_trap=is_value_trap,
            risk_level=risk_level,
            summary=summary,
            reasons=reasons,
            trailing_pe=trailing_pe,
            revenue_growth=revenue_growth,
            earnings_growth=earnings_growth,
            roe=roe,
            gross_margin=gross_margin,
        )

        logger.info(
            "Value trap analysis completed for stock_id=%s is_value_trap=%s risk_level=%s",
            stock_id,
            is_value_trap,
            risk_level,
        )
        return result

    def _is_cheap_stock(
        self,
        trailing_pe: Optional[float],
        valuation_result: Optional[dict[str, Any]] = None,
    ) -> bool:
        """
        Decide whether the stock looks cheap.

        Priority:
        1. Use valuation_result['final_zone'] if available
        2. Fallback to trailing PE threshold
        """
        if valuation_result:
            final_zone = valuation_result.get("final_zone")
            if final_zone == "🟢 便宜區":
                return True
            if final_zone in {"🟡 合理區", "🔴 昂貴區"}:
                return False

        if trailing_pe is None or trailing_pe <= 0:
            return False

        return trailing_pe < self.CHEAP_PE_THRESHOLD

    def _collect_weakening_signals(
        self,
        revenue_growth: Optional[float],
        earnings_growth: Optional[float],
        roe: Optional[float],
        gross_margin: Optional[float],
    ) -> list[str]:
        """
        Collect weakening signals that may indicate a value trap.
        """
        signals: list[str] = []

        if revenue_growth is not None and revenue_growth < 0:
            signals.append(f"營收成長為 {revenue_growth:.2f}% ，代表生意正在縮水。")

        if earnings_growth is not None and earnings_growth < 0:
            signals.append(f"獲利成長為 {earnings_growth:.2f}% ，代表賺錢能力在退步。")

        if roe is not None and roe < self.LOW_ROE_THRESHOLD:
            signals.append(f"ROE 僅 {roe:.2f}% ，代表公司運用資本賺錢的能力偏弱。")

        if gross_margin is not None and gross_margin < self.LOW_GROSS_MARGIN_THRESHOLD:
            signals.append(f"毛利率僅 {gross_margin:.2f}% ，代表產品或服務的賺頭偏薄。")

        return signals

    @staticmethod
    def _classify_risk_level(cheap_signal: bool, weakening_signals: list[str]) -> str:
        """
        Classify value trap risk.
        """
        signal_count = len(weakening_signals)

        if cheap_signal and signal_count >= 2:
            return "高"

        if cheap_signal and signal_count == 1:
            return "中"

        if not cheap_signal and signal_count >= 2:
            return "中"

        return "低"

    @staticmethod
    def _build_summary(
        is_value_trap: bool,
        risk_level: str,
        trailing_pe: Optional[float],
        reasons: list[str],
    ) -> str:
        """
        Build a human-readable summary.
        """
        pe_text = f"本益比約 {trailing_pe:.2f}" if trailing_pe is not None else "本益比資料不足"

        if is_value_trap:
            return (
                f"{pe_text}，表面上看起來不算貴，但公司基本面已有轉弱跡象，"
                f"目前價值陷阱風險為 {risk_level}。"
            )

        if risk_level == "中":
            return (
                f"{pe_text}，雖然不一定是價值陷阱，但已有一些基本面轉弱訊號，"
                f"建議先觀察，不要只因便宜就急著買。"
            )

        return f"{pe_text}，目前沒有明顯價值陷阱訊號。"

    @staticmethod
    def _to_float(value: Any) -> Optional[float]:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None