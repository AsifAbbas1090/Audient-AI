"""
Celery application factory.

When REDIS_URL is set:
  - Tasks run in a separate worker process (true background queue)
  - Start worker: celery -A celery_app.celery worker --loglevel=info

When REDIS_URL is not set:
  - task_always_eager = True  →  tasks execute synchronously in the calling thread
  - The /complete endpoint still returns quickly because we dispatch into
    a daemon thread (see tasks/process_session.py dispatch helper).
  - This lets you develop without Redis installed.
"""
from config import Config
from celery import Celery

_broker  = Config.REDIS_URL or "memory://"
_backend = Config.REDIS_URL or "cache+memory://"

celery = Celery(
    "audient",
    broker=_broker,
    backend=_backend,
    include=["tasks.process_session"],
)

celery.conf.update(
    task_serializer       = "json",
    result_serializer     = "json",
    accept_content        = ["json"],
    timezone              = "UTC",
    enable_utc            = True,
    task_track_started    = True,
    # Without Redis: run tasks synchronously (dev/no-queue mode)
    task_always_eager     = not bool(Config.REDIS_URL),
    # Prevent tasks from hanging forever on a Groq timeout
    task_soft_time_limit  = 120,   # seconds — send SoftTimeLimitExceeded
    task_time_limit       = 150,   # hard kill after this
    # Retry on connection errors
    broker_connection_retry_on_startup = True,
)
