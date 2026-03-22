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

    if not path.exists():
        logger.info(f"Create user file: {path}")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("[]", encoding="utf-8")


def get_all_users() -> List[str]:
    """
    取得所有 LINE user_id
    """
    _ensure_file_exists()
    path = _get_file_path()

    try:
        with path.open("r", encoding="utf-8") as f:
            users = json.load(f)

        if not isinstance(users, list):
            logger.warning("Invalid user file format, reset to empty list")
            return []

        return users

    except Exception as e:
        logger.error(f"Failed to read users: {e}")
        return []


def save_all_users(users: List[str]) -> None:
    """
    覆寫所有使用者
    """
    path = _get_file_path()

    try:
        with path.open("w", encoding="utf-8") as f:
            json.dump(users, f, ensure_ascii=False, indent=2)

    except Exception as e:
        logger.error(f"Failed to save users: {e}")


def add_user(user_id: str) -> bool:
    """
    新增 user（避免重複）
    return: True = 新增成功, False = 已存在
    """
    users = get_all_users()

    if user_id in users:
        return False

    users.append(user_id)
    save_all_users(users)

    logger.info(f"New user added: {user_id}")
    return True