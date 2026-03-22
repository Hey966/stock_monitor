from __future__ import annotations

from fastapi import FastAPI, Request

from app.storage.user_store import UserStore

app = FastAPI()
user_store = UserStore()


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
            is_new = user_store.add_user(user_id)
            print(
                f"[FOUND USER ID] event_type={event_type} userId={user_id} new_user={is_new}"
            )
        else:
            print(f"[NO USER ID] event_type={event_type} source={source}")

    return {"status": "ok"}