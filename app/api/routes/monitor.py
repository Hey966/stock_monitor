from __future__ import annotations

from fastapi import APIRouter

from app.logger import get_logger
from app.services import user_service
from app.services.line_messaging_service import push_text
from app.services.stock_monitor_service import run_monitor

router = APIRouter(prefix="/monitor", tags=["monitor"])
logger = get_logger(__name__)


@router.get("/run")
def run() -> dict:
    """
    手動執行股票監控
    """
    try:
        results = run_monitor()
        return {
            "status": "ok",
            "results": results,
        }
    except Exception as e:
        logger.exception(f"Monitor run failed: {e}")
        return {
            "status": "error",
            "message": str(e),
        }


@router.get("/test/push")
def test_push() -> dict:
    """
    測試 LINE 推播
    """
    users = user_service.get_all_users()

    if not users:
        return {
            "status": "no_users",
            "message": "目前沒有已註冊的 LINE 使用者",
        }

    for user_id in users:
        try:
            push_text(user_id, "測試推播成功 🚀")
        except Exception as e:
            logger.error(f"Push failed for {user_id}: {e}")

    return {
        "status": "ok",
        "user_count": len(users),
    }


@router.get("/users")
def get_users() -> dict:
    """
    查看目前所有使用者
    """
    users = user_service.get_all_users()

    return {
        "count": len(users),
        "users": users,
    }