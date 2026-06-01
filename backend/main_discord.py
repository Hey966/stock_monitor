from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import Request

from discord_interactions_engine import build_discord_response, verify_discord_signature
from fund_flow_engine import build_fund_flow_report
from main import app, build_market_scan
from stx_query_engine import build_stx_query_response

load_dotenv()
DISCORD_PUBLIC_KEY = os.getenv("DISCORD_PUBLIC_KEY", "").strip()


def run_stx_query(q: str) -> str:
    scan = build_market_scan(limit=10)
    fund_report = build_fund_flow_report(scan, limit=20)
    result = build_stx_query_response(q=q, scan=scan, fund_report=fund_report, limit=5)
    return str(result.get("message") or "STX 查詢沒有回傳內容。")[:1900]


@app.post("/api/discord-interactions")
async def discord_interactions(request: Request):
    body = await request.body()
    verify_discord_signature(DISCORD_PUBLIC_KEY, request, body)
    return build_discord_response(body, run_stx_query)
