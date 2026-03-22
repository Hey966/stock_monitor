from __future__ import annotations

from typing import List

from app.logger import get_logger
from app.storage import user_store

logger = get_logger(__name__)


def get_all_users() -> List[str]:
    """
    取得所有使用者
    """
    return user_store.get_all_users()


def add_user(user_id: str) -> bool:
    """
    新增使用者（防重複）
    """
    if not user_id:
        logger.warning("Empty user_id, skip")
        return False

    added = user_store.add_user(user_id)

    if added:
        logger.info(f"User registered: {user_id}")
    else:
        logger.info(f"User already exists: {user_id}")

    return added


def has_user(user_id: str) -> bool:
    """
    檢查 user 是否存在
    """
    users = user_store.get_all_users()
    return user_id in users


def remove_user(user_id: str) -> bool:
    """
    移除使用者（可選）
    """
    users = user_store.get_all_users()

    if user_id not in users:
        return False

    users.remove(user_id)
    user_store.save_all_users(users)

    logger.info(f"User removed: {user_id}")
    return True