from __future__ import annotations

from fastapi import FastAPI, Request

app = FastAPI()


@app.get("/")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/webhook")
async def webhook(request: Request) -> dict[str, str]:
    body = await request.json()

    print("=== LINE WEBHOOK EVENT ===")
    print(body)

    events = body.get("events", [])
    for event in events:
        source = event.get("source", {})
        user_id = source.get("userId")
        event_type = event.get("type")

        if user_id:
            print(f"[FOUND USER ID] event_type={event_type} userId={user_id}")
        else:
            print(f"[NO USER ID] event_type={event_type} source={source}")

    return {"status": "ok"}