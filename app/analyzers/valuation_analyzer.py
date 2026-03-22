from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Optional

from app.logger import get_logger

logger = get_logger(__name__)


@dataclass
class ValuationResult:
    """Valuation analysis result."""

    stock_id: str
    company_name: Optional[str]

    current_price: Optional[float]
    trailing_pe: Optional[float]
    forward_pe: Optional[float]
    dividend_yield: Optional[float]

    pe_zone: str
    dividend_zone: str
    final_zone: str

    summary: str
    warnings: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ValuationAnalyzer:
    """
    Analyze stock valuation using:
    1. PE-based zone
    2. Dividend yield-based zone

    Current version:
    - Uses rule-based thresholds as MVP
    - Can be upgraded later to true historical PE band analysis
    """

    PE_CHEAP_THRESHOLD = 15.0
    PE_EXPENSIVE_THRESHOLD = 25.0

    DIVIDEND_YIELD_CHEAP_THRESHOLD = 4.0
    DIVIDEND_YIELD_EXPENSIVE_THRESHOLD = 2.0

    def analyze(self, stock_data: dict[str, Any]) -> ValuationResult:
        """
        Analyze valuation from normalized stock data.

        Args:
            stock_data: Normalized stock data dict from StockProvider

        Returns:
            ValuationResult
        """
        stock_id = str(stock_data.get("symbol", "UNKNOWN"))
        company_name = stock_data.get("company_name")
        current_price = self._to_float(stock_data.get("current_price"))
        trailing_pe = self._to_float(stock_data.get("trailing_pe"))
        forward_pe = self._to_float(stock_data.get("forward_pe"))
        dividend_yield = self._normalize_dividend_yield(stock_data.get("dividend_yield"))

        logger.info(
            "Start valuation analysis for stock_id=%s company=%s",
            stock_id,
            company_name,
        )

        pe_zone = self._classify_pe_zone(trailing_pe)
        dividend_zone = self._classify_dividend_zone(dividend_yield)
        final_zone = self._merge_zones(pe_zone, dividend_zone)
        warnings = self._build_warnings(trailing_pe, dividend_yield, stock_data)
        summary = self._build_summary(final_zone, trailing_pe, dividend_yield)

        result = ValuationResult(
            stock_id=stock_id,
            company_name=company_name,
            current_price=current_price,
            trailing_pe=trailing_pe,
            forward_pe=forward_pe,
            dividend_yield=dividend_yield,
            pe_zone=pe_zone,
            dividend_zone=dividend_zone,
            final_zone=final_zone,
            summary=summary,
            warnings=warnings,
        )

        logger.info(
            "Valuation analysis completed for stock_id=%s final_zone=%s",
            stock_id,
            final_zone,
        )
        return result

    def _classify_pe_zone(self, trailing_pe: Optional[float]) -> str:
        """
        Classify valuation zone by trailing PE.

        Returns:
            🔴 昂貴區 / 🟡 合理區 / 🟢 便宜區 / ⚪ 資料不足
        """
        if trailing_pe is None or trailing_pe <= 0:
            return "⚪ 資料不足"

        if trailing_pe < self.PE_CHEAP_THRESHOLD:
            return "🟢 便宜區"

        if trailing_pe > self.PE_EXPENSIVE_THRESHOLD:
            return "🔴 昂貴區"

        return "🟡 合理區"

    def _classify_dividend_zone(self, dividend_yield: Optional[float]) -> str:
        """
        Classify valuation zone by dividend yield.

        Higher dividend yield may imply cheaper valuation,
        lower dividend yield may imply more expensive valuation.

        Returns:
            🔴 昂貴區 / 🟡 合理區 / 🟢 便宜區 / ⚪ 資料不足
        """
        if dividend_yield is None or dividend_yield < 0:
            return "⚪ 資料不足"

        if dividend_yield >= self.DIVIDEND_YIELD_CHEAP_THRESHOLD:
            return "🟢 便宜區"

        if dividend_yield <= self.DIVIDEND_YIELD_EXPENSIVE_THRESHOLD:
            return "🔴 昂貴區"

        return "🟡 合理區"

    def _merge_zones(self, pe_zone: str, dividend_zone: str) -> str:
        """
        Merge PE zone and dividend yield zone into a final zone.
        """
        valid_zones = {"🟢 便宜區", "🟡 合理區", "🔴 昂貴區"}

        if pe_zone not in valid_zones and dividend_zone not in valid_zones:
            return "⚪ 資料不足"

        if pe_zone == dividend_zone and pe_zone in valid_zones:
            return pe_zone

        if pe_zone == "⚪ 資料不足":
            return dividend_zone

        if dividend_zone == "⚪ 資料不足":
            return pe_zone

        if "🔴 昂貴區" in (pe_zone, dividend_zone) and "🟢 便宜區" in (pe_zone, dividend_zone):
            return "🟡 合理區"

        if pe_zone == "🔴 昂貴區" or dividend_zone == "🔴 昂貴區":
            return "🔴 昂貴區"

        if pe_zone == "🟢 便宜區" or dividend_zone == "🟢 便宜區":
            return "🟢 便宜區"

        return "🟡 合理區"

    def _build_summary(
        self,
        final_zone: str,
        trailing_pe: Optional[float],
        dividend_yield: Optional[float],
    ) -> str:
        """
        Build a short human-readable summary.
        """
        pe_text = f"本益比約 {trailing_pe:.2f}" if trailing_pe is not None else "本益比資料不足"
        dy_text = (
            f"殖利率約 {dividend_yield:.2f}%"
            if dividend_yield is not None
            else "殖利率資料不足"
        )

        if final_zone == "🟢 便宜區":
            return f"{pe_text}，{dy_text}。整體看起來價格偏便宜，但還要檢查獲利有沒有變差。"

        if final_zone == "🔴 昂貴區":
            return f"{pe_text}，{dy_text}。整體看起來價格偏高，追價前要更小心。"

        if final_zone == "🟡 合理區":
            return f"{pe_text}，{dy_text}。整體估值大致落在合理範圍。"

        return f"{pe_text}，{dy_text}。目前資料不足，暫時無法明確判斷估值區間。"

    def _build_warnings(
        self,
        trailing_pe: Optional[float],
        dividend_yield: Optional[float],
        stock_data: dict[str, Any],
    ) -> list[str]:
        """
        Build warning messages for suspicious or potentially inconsistent data.
        """
        warnings: list[str] = []

        if trailing_pe is not None and trailing_pe <= 0:
            warnings.append("本益比小於等於 0，可能代表公司獲利異常或資料不完整。")

        if dividend_yield is not None and dividend_yield > 20:
            warnings.append("殖利率數值異常偏高，可能是資料來源格式差異，建議再次確認。")

        revenue_growth = self._to_float(stock_data.get("revenue_growth"))
        earnings_growth = self._to_float(stock_data.get("earnings_growth"))

        if trailing_pe is not None and trailing_pe < self.PE_CHEAP_THRESHOLD:
            if (revenue_growth is not None and revenue_growth < 0) or (
                earnings_growth is not None and earnings_growth < 0
            ):
                warnings.append("股價看起來便宜，但營收或獲利正在衰退，需留意價值陷阱風險。")

        return warnings

    @staticmethod
    def _to_float(value: Any) -> Optional[float]:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _normalize_dividend_yield(value: Any) -> Optional[float]:
        """
        Normalize dividend yield to percentage.

        Handles both:
        - 0.013 -> 1.3
        - 1.3   -> 1.3

        This is necessary because upstream data formats may vary.
        """
        if value is None:
            return None

        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            return None

        if numeric_value < 0:
            return None

        if numeric_value <= 1:
            return numeric_value * 100

        return numeric_value