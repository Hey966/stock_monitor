from __future__ import annotations

import json
import os
import urllib.request

from dotenv import load_dotenv
from fastapi import HTTPException, Query, Request

from discord_interactions_engine import build_discord_response, verify_discord_signature
from fund_flow_engine import build_fund_flow_report
from main import app, build_market_scan
from stx_query_engine import build_stx_query_response

load_dotenv()
DISCORD_PUBLIC_KEY = os.getenv("DISCORD_PUBLIC_KEY", "").strip()
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "").strip()
DISCORD_APPLICATION_ID = os.getenv("DISCORD_APPLICATION_ID", "").strip()
DISCORD_GUILD_ID = os.getenv("DISCORD_GUILD_ID", "").strip()


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


@app.get("/api/discord-register-commands")
def discord_register_commands(guild_id: str | None = Query(None)):
    if not DISCORD_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="DISCORD_BOT_TOKEN is not set")
    if not DISCORD_APPLICATION_ID:
        raise HTTPException(status_code=500, detail="DISCORD_APPLICATION_ID is not set")

    command = {
        "name": "stx",
        "description": "查詢 STX 股票或族群訊號",
        "type": 1,
        "options": [
            {
                "name": "q",
                "description": "股票代號或族群，例如 2356、AI、半導體",
                "type": 3,
                "required": True,
            }
        ],
    }

    target_guild_id = (guild_id or DISCORD_GUILD_ID).strip() if (guild_id or DISCORD_GUILD_ID) else ""
    if target_guild_id:
        url = f"https://discord.com/api/v10/applications/{DISCORD_APPLICATION_ID}/guilds/{target_guild_id}/commands"
    else:
        url = f"https://discord.com/api/v10/applications/{DISCORD_APPLICATION_ID}/commands"

    body = json.dumps(command).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bot {DISCORD_BOT_TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "STX-Discord-Command-Register",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            payload = json.loads(res.read().decode("utf-8"))
            return {"ok": True, "scope": "guild" if target_guild_id else "global", "command": payload}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to register Discord command: {exc}") from exc
