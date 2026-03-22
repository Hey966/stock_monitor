from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Optional

from app.logger import get_logger

logger = get_logger(__name__)


@dataclass
class SWOTResult:
    """SWOT analysis result."""

    stock_id: str
    company_name: Optional[str]

    strengths: list[str]
    weaknesses: list[str]
    opportunities: list[str]
    threats: list[str]

    summary: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SWOTAnalyzer:
    """
    Generate a concise SWOT analysis for a stock.

    Rules:
    - Each quadrant has at most 3 points
    - Strengths / Weaknesses should cite concrete financial indicators
    - Output should be plain-language and concise
    """

    STRONG_ROE_THRESHOLD = 15.0
    WEAK_ROE_THRESHOLD = 8.0

    STRONG_GROSS_MARGIN_THRESHOLD = 30.0
    WEAK_GROSS_MARGIN_THRESHOLD = 20.0

    LOW_DEBT_TO_EQUITY_THRESHOLD = 50.0
    HIGH_DEBT_TO_EQUITY_THRESHOLD = 100.0

    STRONG_REVENUE_GROWTH_THRESHOLD = 10.0
    WEAK_REVENUE_GROWTH_THRESHOLD = 0.0

    STRONG_EARNINGS_GROWTH_THRESHOLD = 10.0
    WEAK_EARNINGS_GROWTH_THRESHOLD = 0.0

    def analyze(
        self,
        stock_data: dict[str, Any],
        valuation_result: Optional[dict[str, Any]] = None,
        value_trap_result: Optional[dict[str, Any]] = None,
    ) -> SWOTResult:
        """
        Build SWOT analysis from stock data and optional analyzer outputs.
        """
        stock_id = str(stock_data.get("symbol", "UNKNOWN"))
        company_name = stock_data.get("company_name")

        logger.info(
            "Start SWOT analysis for stock_id=%s company=%s",
            stock_id,
            company_name,
        )

        strengths = self._build_strengths(stock_data)
        weaknesses = self._build_weaknesses(stock_data)
        opportunities = self._build_opportunities(stock_data, valuation_result)
        threats = self._build_threats(stock_data, valuation_result, value_trap_result)

        result = SWOTResult(
            stock_id=stock_id,
            company_name=company_name,
            strengths=strengths[:3],
            weaknesses=weaknesses[:3],
            opportunities=opportunities[:3],
            threats=threats[:3],
            summary=self._build_summary(
                strengths=strengths[:3],
                weaknesses=weaknesses[:3],
                opportunities=opportunities[:3],
                threats=threats[:3],
            ),
        )

        logger.info("SWOT analysis completed for stock_id=%s", stock_id)
        return result

    def _build_strengths(self, stock_data: dict[str, Any]) -> list[str]:
        strengths: list[str] = []

        roe = self._to_float(stock_data.get("roe"))
        gross_margin = self._to_float(stock_data.get("gross_margin"))
        debt_to_equity = self._to_float(stock_data.get("debt_to_equity"))
        revenue_growth = self._to_float(stock_data.get("revenue_growth"))
        earnings_growth = self._to_float(stock_data.get("earnings_growth"))
        current_ratio = self._to_float(stock_data.get("current_ratio"))

        if roe is not None and roe >= self.STRONG_ROE_THRESHOLD:
            strengths.append(
                f"ROE 約 {roe:.2f}% ，代表公司很會用股東的錢去賺錢，賺錢能力強。"
            )

        if gross_margin is not None and gross_margin >= self.STRONG_GROSS_MARGIN_THRESHOLD:
            strengths.append(
                f"毛利率約 {gross_margin:.2f}% ，代表產品有賺頭，定價能力不錯。"
            )

        if (
            debt_to_equity is not None
            and debt_to_equity <= self.LOW_DEBT_TO_EQUITY_THRESHOLD
        ):
            strengths.append(
                f"負債權益比約 {debt_to_equity:.2f} ，口袋算深，財務壓力不大。"
            )

        if revenue_growth is not None and revenue_growth >= self.STRONG_REVENUE_GROWTH_THRESHOLD:
            strengths.append(
                f"營收成長約 {revenue_growth:.2f}% ，代表生意還在往上走。"
            )

        if earnings_growth is not None and earnings_growth >= self.STRONG_EARNINGS_GROWTH_THRESHOLD:
            strengths.append(
                f"獲利成長約 {earnings_growth:.2f}% ，代表公司最近越賺越多。"
            )

        if current_ratio is not None and current_ratio >= 1.5:
            strengths.append(
                f"流動比率約 {current_ratio:.2f} ，短期資金調度能力不錯。"
            )

        if not strengths:
            strengths.append("目前看不到特別突出的基本面優勢，建議再觀察更多年度資料。")

        return strengths

    def _build_weaknesses(self, stock_data: dict[str, Any]) -> list[str]:
        weaknesses: list[str] = []

        roe = self._to_float(stock_data.get("roe"))
        gross_margin = self._to_float(stock_data.get("gross_margin"))
        debt_to_equity = self._to_float(stock_data.get("debt_to_equity"))
        revenue_growth = self._to_float(stock_data.get("revenue_growth"))
        earnings_growth = self._to_float(stock_data.get("earnings_growth"))
        current_ratio = self._to_float(stock_data.get("current_ratio"))

        if roe is not None and roe < self.WEAK_ROE_THRESHOLD:
            weaknesses.append(
                f"ROE 約 {roe:.2f}% ，代表公司用資本賺錢的效率偏弱。"
            )

        if gross_margin is not None and gross_margin < self.WEAK_GROSS_MARGIN_THRESHOLD:
            weaknesses.append(
                f"毛利率約 {gross_margin:.2f}% ，代表產品賺頭偏薄，競爭壓力可能較大。"
            )

        if debt_to_equity is not None and debt_to_equity >= self.HIGH_DEBT_TO_EQUITY_THRESHOLD:
            weaknesses.append(
                f"負債權益比約 {debt_to_equity:.2f} ，口袋不算深，財務壓力偏高。"
            )

        if revenue_growth is not None and revenue_growth < self.WEAK_REVENUE_GROWTH_THRESHOLD:
            weaknesses.append(
                f"營收成長約 {revenue_growth:.2f}% ，代表生意正在縮水。"
            )

        if earnings_growth is not None and earnings_growth < self.WEAK_EARNINGS_GROWTH_THRESHOLD:
            weaknesses.append(
                f"獲利成長約 {earnings_growth:.2f}% ，代表賺錢能力在退步。"
            )

        if current_ratio is not None and current_ratio < 1.0:
            weaknesses.append(
                f"流動比率約 {current_ratio:.2f} ，短期資金壓力需要留意。"
            )

        if not weaknesses:
            weaknesses.append("目前沒有看到明顯的財務弱點，但還是要持續追蹤後續變化。")

        return weaknesses

    def _build_opportunities(
        self,
        stock_data: dict[str, Any],
        valuation_result: Optional[dict[str, Any]] = None,
    ) -> list[str]:
        opportunities: list[str] = []

        revenue_growth = self._to_float(stock_data.get("revenue_growth"))
        earnings_growth = self._to_float(stock_data.get("earnings_growth"))
        final_zone = valuation_result.get("final_zone") if valuation_result else None
        forward_pe = self._to_float(stock_data.get("forward_pe"))
        trailing_pe = self._to_float(stock_data.get("trailing_pe"))

        if final_zone == "🟢 便宜區":
            opportunities.append("目前估值落在便宜區，若基本面穩住，未來有估值修復空間。")

        if (
            revenue_growth is not None
            and earnings_growth is not None
            and revenue_growth > 0
            and earnings_growth > 0
        ):
            opportunities.append("營收和獲利都還在成長，代表公司仍有擴張空間。")

        if (
            forward_pe is not None
            and trailing_pe is not None
            and forward_pe < trailing_pe
        ):
            opportunities.append(
                f"預估本益比 {forward_pe:.2f} 低於目前本益比 {trailing_pe:.2f} ，市場預期後面獲利還有機會提升。"
            )

        if not opportunities:
            opportunities.append("短期看不到很明確的便宜機會，較適合等待更好的價格或更強的成長訊號。")

        return opportunities

    def _build_threats(
        self,
        stock_data: dict[str, Any],
        valuation_result: Optional[dict[str, Any]] = None,
        value_trap_result: Optional[dict[str, Any]] = None,
    ) -> list[str]:
        threats: list[str] = []

        final_zone = valuation_result.get("final_zone") if valuation_result else None
        risk_level = value_trap_result.get("risk_level") if value_trap_result else None
        is_value_trap = value_trap_result.get("is_value_trap") if value_trap_result else None

        revenue_growth = self._to_float(stock_data.get("revenue_growth"))
        earnings_growth = self._to_float(stock_data.get("earnings_growth"))
        trailing_pe = self._to_float(stock_data.get("trailing_pe"))

        if final_zone == "🔴 昂貴區":
            if trailing_pe is not None:
                threats.append(
                    f"目前本益比約 {trailing_pe:.2f} ，股價偏貴，後面只要成長放慢，修正壓力就會比較大。"
                )
            else:
                threats.append("目前估值偏高，一旦市場情緒轉弱，股價修正壓力會比較大。")

        if is_value_trap:
            threats.append(f"系統判定有價值陷阱風險，目前風險等級為 {risk_level}。")

        if revenue_growth is not None and revenue_growth < 0:
            threats.append("營收已經轉弱，若沒有回升，市場信心可能持續下滑。")

        if earnings_growth is not None and earnings_growth < 0:
            threats.append("獲利正在退步，若情況延續，估值可能被市場重新下修。")

        if not threats:
            threats.append("目前沒有看到特別突出的短期威脅，但高檔股仍要留意市場波動。")

        return threats

    @staticmethod
    def _build_summary(
        strengths: list[str],
        weaknesses: list[str],
        opportunities: list[str],
        threats: list[str],
    ) -> str:
        """
        Build a one-paragraph human-readable summary.
        """
        if strengths and "目前看不到特別突出的基本面優勢" not in strengths[0]:
            strength_text = "基本面有一定優勢"
        else:
            strength_text = "基本面亮點不算特別明顯"

        if weaknesses and "目前沒有看到明顯的財務弱點" not in weaknesses[0]:
            weakness_text = "也有幾個需要留意的弱點"
        else:
            weakness_text = "目前沒有明顯財務硬傷"

        if opportunities and "短期看不到很明確的便宜機會" not in opportunities[0]:
            opportunity_text = "仍有一些成長或估值機會"
        else:
            opportunity_text = "短期機會感較普通"

        if threats and "目前沒有看到特別突出的短期威脅" not in threats[0]:
            threat_text = "但同時要留意估值或成長轉弱風險"
        else:
            threat_text = "整體風險暫時可控"

        return f"{strength_text}，{weakness_text}；{opportunity_text}，{threat_text}。"

    @staticmethod
    def _to_float(value: Any) -> Optional[float]:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None