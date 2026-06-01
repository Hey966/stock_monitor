from __future__ import annotations

import json
from typing import Any, Callable

from fastapi import HTTPException, Request
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey


def verify_discord_signature(public_key: str, request: Request, body: bytes) -> None:
    if not public_key:
        raise HTTPException(status_code=500, detail="DISCORD_PUBLIC_KEY is not set")

    signature = request.headers.get("x-signature-ed25519", "")
    timestamp = request.headers.get("x-signature-timestamp", "")

    if not signature or not timestamp:
        raise HTTPException(status_code=401, detail="Missing Discord signature")

    try:
        verify_key = VerifyKey(bytes.fromhex(public_key))
        verify_key.verify(timestamp.encode("utf-8") + body, bytes.fromhex(signature))
    except (BadSignatureError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid Discord signature") from exc


def _option_value(payload: dict[str, Any]) -> str:
    data = payload.get("data") or {}
    options = data.get("options") or []
    for opt in options:
        if opt.get("name") in {"q", "query", "stock", "code"}:
            return str(opt.get("value") or "").strip()
    return ""


def build_discord_response(body: bytes, query_func: Callable[[str], str]) -> dict[str, Any]:
    payload = json.loads(body.decode("utf-8"))

    if payload.get("type") == 1:
        return {"type": 1}

    if payload.get("type") != 2:
        return {
            "type": 4,
            "data": {"content": "STX 不支援這個 Discord 互動。", "flags": 64},
        }

    data = payload.get("data") or {}
    if data.get("name") != "stx":
        return {"type": 4, "data": {"content": "未知指令。", "flags": 64}}

    q = _option_value(payload)
    if not q:
        return {
            "type": 4,
            "data": {"content": "請輸入查詢內容，例如：/stx 2356 或 /stx AI。", "flags": 64},
        }

    try:
        content = query_func(q)
    except Exception as exc:
        content = f"STX 查詢失敗：{str(exc)[:160]}"

    return {"type": 4, "data": {"content": content[:1900]}}
