from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import date, timedelta
from typing import Any

import shioaji as sj
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

SHIOAJI_API_KEY = os.getenv("SHIOAJI_API_KEY", "")
SHIOAJI_SECRET_KEY = os.getenv("SHIOAJI_SECRET_KEY", "")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")

api: sj.Shioaji | None = None


class QuoteResponse(BaseModel):
    code: str
    name: str | None = None
    close: float | None = None
    open: float | None = None
    high: float | None = None
    low: float | None = None
    volume: int | None = None
    change_price: float | None = None
    change_rate: float | None = None
    buy_price: float | None = None
    buy_volume: int | None = None
    sell_price: float | None = None
    sell_volume: int | None = None
    volume_ratio: float | None = None
    average_price: float | None = None
    raw: dict[str, Any]


class KBarItem(BaseModel):
    ts: str
    open: float
    high: float
    low: float
    close: float
    volume: int | float


class KBarsResponse(BaseModel):
    code: str
    interval: str
    items: list[KBarItem]
    count: int
    start: str | None = None
    end: str | None = None
    message: str | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global api
    api = sj.Shioaji(simulation=True)

    if SHIOAJI_API_KEY and SHIOAJI_SECRET_KEY:
        api.login(api_key=SHIOAJI_API_KEY, secret_key=SHIOAJI_SECRET_KEY)
    else:
        print("Shioaji keys are not set. /api/quote may not work until .env is configured.")

    yield

    if api is not None:
        api.logout()


app = FastAPI(
    title="Stock Monitor Backend",
    description="Safe backend bridge for GitHub Pages frontend and Sinotrade Shioaji.",
    version="0.2.1",
    lifespan=lifespan,
)

origins = [origin.strip() for origin in CORS_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def pick_number(raw: dict[str, Any], *keys: str) -> float | int | None:
    for key in keys:
        value = raw.get(key)
        if value is not None:
            return value
    return None


def get_stock_contract(code: str):
    if api is None:
        raise HTTPException(status_code=503, detail="Shioaji API is not initialized")
    try:
        return api.Contracts.Stocks[code]
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Cannot find stock code: {code}") from exc


def normalize_kbars(kbars: Any) -> list[KBarItem]:
    rows: list[KBarItem] = []
    for ts, open_, high, low, close, volume in zip(
        getattr(kbars, "ts", []),
        getattr(kbars, "Open", []),
        getattr(kbars, "High", []),
        getattr(kbars, "Low", []),
        getattr(kbars, "Close", []),
        getattr(kbars, "Volume", []),
        strict=False,
    ):
        rows.append(
            KBarItem(
                ts=str(ts),
                open=float(open_),
                high=float(high),
                low=float(low),
                close=float(close),
                volume=float(volume),
            )
        )
    return rows


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok", "message": "Stock Monitor Backend is running"}


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True, "logged_in": bool(api and api.stock_account)}


@app.get("/api/quote", response_model=QuoteResponse)
def get_quote(code: str = Query(..., description="Taiwan stock code, e.g. 2330")) -> QuoteResponse:
    if api is None:
        raise HTTPException(status_code=503, detail="Shioaji API is not initialized")

    contract = get_stock_contract(code)

    try:
        snapshot = api.snapshots([contract])[0]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch quote from Shioaji: {exc}") from exc

    raw = snapshot.__dict__.copy()
    close = pick_number(raw, "close")
    change_price = pick_number(raw, "change_price")
    change_rate = pick_number(raw, "change_rate")

    reference = pick_number(raw, "reference", "yesterday_close")
    if change_price is None and close is not None and reference:
        change_price = float(close) - float(reference)
    if change_rate is None and change_price is not None and reference:
        change_rate = float(change_price) / float(reference) * 100

    return QuoteResponse(
        code=code,
        name=getattr(contract, "name", None),
        close=close,
        open=pick_number(raw, "open"),
        high=pick_number(raw, "high"),
        low=pick_number(raw, "low"),
        volume=pick_number(raw, "total_volume", "volume"),
        change_price=change_price,
        change_rate=change_rate,
        buy_price=pick_number(raw, "buy_price"),
        buy_volume=pick_number(raw, "buy_volume"),
        sell_price=pick_number(raw, "sell_price"),
        sell_volume=pick_number(raw, "sell_volume"),
        volume_ratio=pick_number(raw, "volume_ratio"),
        average_price=pick_number(raw, "average_price"),
        raw=raw,
    )


@app.get("/api/kbars", response_model=KBarsResponse)
def get_kbars(
    code: str = Query(..., description="Taiwan stock code, e.g. 2330"),
    days: int = Query(5, ge=1, le=10),
) -> KBarsResponse:
    if api is None:
        raise HTTPException(status_code=503, detail="Shioaji API is not initialized")

    contract = get_stock_contract(code)
    end = date.today()
    all_rows: list[KBarItem] = []
    used_start: date | None = None
    used_end: date | None = None

    # 先抓使用者指定天數；如果遇到假日/盤前/資料不足，自動往前擴大到 10 天。
    for lookback in [days, 7, 10]:
        start = end - timedelta(days=lookback - 1)
        try:
            kbars = api.kbars(contract, start=start.isoformat(), end=end.isoformat())
            rows = normalize_kbars(kbars)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to fetch kbars from Shioaji: {exc}") from exc

        if len(rows) >= 3:
            all_rows = rows
            used_start = start
            used_end = end
            break

    if not all_rows:
        return KBarsResponse(
            code=code,
            interval="1m",
            items=[],
            count=0,
            start=None,
            end=None,
            message="No K-bar data returned. It may be non-trading time, holiday, or Shioaji permission/data limitation.",
        )

    latest_rows = all_rows[-120:]
    return KBarsResponse(
        code=code,
        interval="1m",
        items=latest_rows,
        count=len(latest_rows),
        start=used_start.isoformat() if used_start else None,
        end=used_end.isoformat() if used_end else None,
        message="ok",
    )
