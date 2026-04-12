"""
Audit logging helper.
Call log_action() anywhere inside a request context to record an event.
The caller is responsible for committing the session.
"""
from flask import g
from extensions import db
from models.audit_log import AuditLog


def log_action(
    action: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
    details: dict | None = None,
) -> AuditLog:
    """
    Create an AuditLog row and add it to the current db.session.
    Does NOT commit — caller must commit.

    Reads user_id / user_name from Flask's g (set by require_auth / optional_auth).
    """
    user_id   = getattr(g, "user_id",   None)
    user_name = getattr(g, "user_name", None)

    entry = AuditLog(
        user_id       = user_id,
        user_name     = user_name,
        action        = action,
        resource_type = resource_type,
        resource_id   = resource_id,
        details       = details,
    )
    db.session.add(entry)
    return entry
