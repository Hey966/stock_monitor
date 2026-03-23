from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.logger import get_logger
from app.services.stock_monitor_service import run_monitor

logger = get_logger(__name__)

scheduler = BackgroundScheduler(timezone="Asia/Taipei")


def start_scheduler() -> None:
    if scheduler.running:
        logger.info("Scheduler already running")
        return

    scheduler.add_job(
        run_monitor,
        trigger="interval",
        minutes=1,
        id="test_monitor",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started")


def stop_scheduler() -> None:
    if not scheduler.running:
        return

    scheduler.shutdown()
    logger.info("Scheduler stopped")