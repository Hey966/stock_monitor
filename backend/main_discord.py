from __future__ import annotations

import json
import os
import urllib.request

from dotenv import load_dotenv
from fastapi import HTTPException, Query, Request

from discord_interactions_engine import verify_discord_signature
from main import app

load_dotenv()
DISCORD_PUBLIC_KEY = os.getenv("DISCORD_PUBLIC_KEY", "").strip()
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "").strip()
DISCORD_APPLICATION_ID = os.getenv("DISCORD_APPLICATION_ID", "").strip()
DISCORD_GUILD_ID = os.getenv("DISCORD_GUILD_ID", "").strip()


def _get_option_q(payload: dict) -> str:
    data = payload.get("data") or {}
    for opt in data.get("options") or []:
        if opt.get("name") == "q":
            return str(opt.get("value") or "").strip()
    return ""


@app.post("/api/discord-interactions")
async def discord_interactions(request: Request):
    body = await request.body()
    verify_discord_signature(DISCORD_PUBLIC_KEY, request, body)
    payload = json.loads(body.decode("utf-8"))

    if payload.get("type") == 1:
        return {"type": 1}

    q = _get_option_q(payload)
    if not q:
        return {"type": 4, "data": {"content": "請輸入查詢內容，例如：/stx q:2356", "flags": 64}}

    return {"type": 4, "data": {"content": f"✅ STX Bot 已收到查詢：{q}\n互動通道正常，下一步接完整股票分析。"}}


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
