from __future__ import annotations

import json
import os
import urllib.request

from dotenv import load_dotenv
from fastapi import BackgroundTasks, HTTPException, Query, Request

from discord_interactions_engine import verify_discord_signature
from fund_flow_engine import build_fund_flow_report
from main import app, build_market_scan
from performance_auto_update import update_performance_from_scan
from stx_query_engine import build_stx_query_response

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


def _run_stx_query(q: str) -> str:
    scan = build_market_scan(limit=10)
    fund_report = build_fund_flow_report(scan, limit=20)
    result = build_stx_query_response(q=q, scan=scan, fund_report=fund_report, limit=5)
    return str(result.get("message") or "STX 查詢沒有回傳內容。")[:1900]


def _patch_original_response(application_id: str, token: str, content: str) -> None:
    url = f"https://discord.com/api/v10/webhooks/{application_id}/{token}/messages/@original"
    body = json.dumps({"content": content[:1900]}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "STX-Discord-Analysis"},
        method="PATCH",
    )
    with urllib.request.urlopen(req, timeout=20) as res:
        res.read()


def _background_stx_reply(application_id: str, token: str, q: str) -> None:
    try:
        content = _run_stx_query(q)
    except Exception as exc:
        content = f"STX 查詢失敗：{str(exc)[:160]}"
    try:
        _patch_original_response(application_id, token, content)
    except Exception as exc:
        print(f"Failed to patch Discord response: {exc}")


@app.post("/api/discord-interactions")
async def discord_interactions(request: Request, background_tasks: BackgroundTasks):
    body = await request.body()
    verify_discord_signature(DISCORD_PUBLIC_KEY, request, body)
    payload = json.loads(body.decode("utf-8"))

    if payload.get("type") == 1:
        return {"type": 1}

    q = _get_option_q(payload)
    if not q:
        return {"type": 4, "data": {"content": "請輸入查詢內容，例如：/stx q:2356", "flags": 64}}

    application_id = str(payload.get("application_id") or DISCORD_APPLICATION_ID)
    token = str(payload.get("token") or "")
    if application_id and token:
        background_tasks.add_task(_background_stx_reply, application_id, token, q)

    return {"type": 5, "data": {"content": f"STX 查詢中：{q}"}}


@app.get("/api/performance-auto-update")
def performance_auto_update(limit: int = Query(30, ge=5, le=30)):
    scan = build_market_scan(limit=limit)
    result = update_performance_from_scan(scan)
    return {"ok": True, "scan": {"scanned": scan.get("scanned"), "errors": scan.get("errors", [])[:5]}, "performance_update": result}


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
