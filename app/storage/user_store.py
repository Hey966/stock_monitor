from __future__ import annotations

import json
from pathlib import Path
from typing import List

from app.config import settings
from app.logger import get_logger

logger = get_logger(__name__)


def _get_file_path() -> Path:
    return Path(settings.line_users_file)


def _ensure_file_exists() -> None:
    path = _get_file_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    if not path.exists():
        logger.info(f"Create user file: {path}")
        path.write_text("[]", encoding="utf-8")
        return

    content = path.read_text(encoding="utf-8").strip()
    if not content:
        logger.warning(f"User file is empty, reset to empty list: {path}")
        path.write_text("[]", encoding="utf-8")


def get_all_users() -> List[str]:
    _ensure_file_exists()
    path = _get_file_path()

    try:
        with path.open("r", encoding="utf-8") as f:
            users = json.load(f)

        if not isinstance(users, list):
            logger.warning("Invalid user file format, reset to empty list")
            save_all_users([])
            return []

        return [str(user).strip() for user in users if str(user).strip()]

    except json.JSONDecodeError:
        logger.error("User file JSON is invalid, reset to empty list")
        save_all_users([])
        return []
    except Exception as e:
        logger.error(f"Failed to read users: {e}")
        return []


def save_all_users(users: List[str]) -> None:
    path = _get_file_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    normalized_users = []
    seen = set()

    for user in users:
        user_id = str(user).strip()
        if not user_id or user_id in seen:
            continue
        seen.add(user_id)
        normalized_users.append(user_id)

    try:
        with path.open("w", encoding="utf-8") as f:
            json.dump(normalized_users, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Failed to save users: {e}")


def add_user(user_id: str) -> bool:
    users = get_all_users()

    if user_id in users:
        return False

    users.append(user_id)
    save_all_users(users)

    logger.info(f"New user added: {user_id}")
    return True