from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request

import discord
from dotenv import load_dotenv

load_dotenv()

DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "").strip()
STX_API_BASE = os.getenv("STX_API_BASE", "https://stock-monitor-b6d6.onrender.com").rstrip("/")

QUERY_RE = re.compile(r"^(?:/stx\s+)?([0-9]{4}|AI|ai|半導體|航運|電腦週邊|電腦|AI伺服器|AI散熱|面板|重電|電線電纜|PCB|pcb)$")


def fetch_stx_query(q: str) -> dict:
    url = f"{STX_API_BASE}/api/stx-query?q={urllib.parse.quote(q)}"
    req = urllib.request.Request(url, headers={"User-Agent": "STX-Discord-Bot"})
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode("utf-8"))


def clamp_message(text: str, limit: int = 1900) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[: limit - 20] + "\n...已截斷"


class STXBot(discord.Client):
    async def on_ready(self):
        print(f"STX Discord Bot logged in as {self.user}")

    async def on_message(self, message: discord.Message):
        if message.author.bot:
            return

        content = message.content.strip()
        m = QUERY_RE.match(content)
        if not m:
            return

        q = m.group(1)
        async with message.channel.typing():
            try:
                data = fetch_stx_query(q)
                reply = data.get("message") or "STX 查詢沒有回傳內容。"
                await message.reply(clamp_message(reply), mention_author=False)
            except Exception as exc:
                await message.reply(f"STX 查詢失敗：{str(exc)[:160]}", mention_author=False)


def main():
    if not DISCORD_BOT_TOKEN:
        raise RuntimeError("DISCORD_BOT_TOKEN is not set")

    intents = discord.Intents.default()
    intents.message_content = True
    intents.guilds = True
    intents.messages = True

    client = STXBot(intents=intents)
    client.run(DISCORD_BOT_TOKEN)


if __name__ == "__main__":
    main()
