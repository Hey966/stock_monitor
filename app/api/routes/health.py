from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok"
    }


@router.get("/ping")
def ping() -> dict:
    return {
        "message": "pong"
    }