from __future__ import annotations

import os
from contextlib import asynccontextmanager
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
    raw: dict[str, Any]


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
    version="0.1.0",
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

    try:
        contract = api.Contracts.Stocks[code]
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"Cannot find stock code: {code}") from exc

    try:
        snapshot = api.snapshots([contract])[0]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch quote from Shioaji: {exc}") from exc

    raw = snapshot.__dict__.copy()
    close = raw.get("close")
    reference = raw.get("reference") or raw.get("yesterday_close")

    change_price = None
    change_rate = None
    if close is not None and reference:
        change_price = float(close) - float(reference)
        change_rate = change_price / float(reference) * 100

    return QuoteResponse(
        code=code,
        name=getattr(contract, "name", None),
        close=close,
        open=raw.get("open"),
        high=raw.get("high"),
        low=raw.get("low"),
        volume=raw.get("total_volume") or raw.get("volume"),
        change_price=change_price,
        change_rate=change_rate,
        raw=raw,
    )
