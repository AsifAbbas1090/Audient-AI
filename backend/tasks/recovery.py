"""
Operational hooks: reconcile conversations stuck in processing (dead workers, crashes).

Runs from Celery Beat when configured; Flask also starts a daemon reconcile loop in app.py.
"""
from __future__ import annotations

from celery_app import celery


@celery.task(name="tasks.recovery.reconcile_stale_processing_task")
def reconcile_stale_processing_task() -> dict:
    from app import app as flask_app

    with flask_app.app_context():
        from routes.conversations import reconcile_stale_processing_sessions

        n = reconcile_stale_processing_sessions()
        return {"reconciled": n}
