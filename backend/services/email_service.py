"""
Email notification service — Resend API.

Sends transactional emails when a session finishes processing.
Gracefully no-ops when RESEND_API_KEY is not configured.

Usage:
    from services.email_service import notify_session_complete
    notify_session_complete(to_email, conv_id, conv_title, summary_dict)
"""
from __future__ import annotations
from typing import Any


def _api_key() -> str:
    from config import Config
    return Config.RESEND_API_KEY


def _from_email() -> str:
    from config import Config
    return Config.FROM_EMAIL


def notify_session_complete(
    to_email:  str,
    conv_id:   str,
    title:     str,
    summary:   dict[str, Any] | None = None,
    app_url:   str = "",
) -> bool:
    """
    Send a "session ready" email to the clinician.
    Returns True on success, False if skipped or failed.
    """
    key = _api_key()
    if not key or not to_email:
        return False   # silently skip — not configured

    name     = (summary or {}).get("patient_name") or "—"
    disease  = (summary or {}).get("disease")       or "—"
    notes    = (summary or {}).get("additional_notes") or ""
    session_url = f"{app_url}/session/{conv_id}" if app_url else f"/session/{conv_id}"

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1f2937;">
      <div style="background:#6366f1;padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#fff;font-size:22px;">Audient AI</h1>
        <p style="margin:4px 0 0;color:#c7d2fe;font-size:13px;">Clinical session processed</p>
      </div>
      <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;">
        <p style="font-size:15px;">Your session <strong>{title}</strong> has finished processing.</p>

        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <tr style="background:#ede9fe;">
            <td style="padding:8px 12px;font-weight:bold;font-size:13px;color:#4338ca;width:35%;">Patient</td>
            <td style="padding:8px 12px;font-size:13px;">{name}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;font-weight:bold;font-size:13px;color:#4338ca;">Condition</td>
            <td style="padding:8px 12px;font-size:13px;">{disease}</td>
          </tr>
          {'<tr style="background:#f3f4f6;"><td style="padding:8px 12px;font-weight:bold;font-size:13px;color:#4338ca;vertical-align:top;">Notes</td><td style="padding:8px 12px;font-size:13px;">' + notes + '</td></tr>' if notes else ''}
        </table>

        <div style="margin-top:24px;text-align:center;">
          <a href="{session_url}"
             style="background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;
                    text-decoration:none;font-size:14px;font-weight:bold;">
            View Session Record
          </a>
        </div>
      </div>
      <div style="padding:16px;text-align:center;color:#9ca3af;font-size:11px;">
        Audient AI &mdash; AI-powered medical transcription &bull;
        <a href="{session_url}" style="color:#9ca3af;">View in app</a>
      </div>
    </div>
    """

    text = (
        f"Your Audient AI session '{title}' is ready.\n\n"
        f"Patient: {name}\nCondition: {disease}\n"
        + (f"Notes: {notes}\n" if notes else "")
        + f"\nView at: {session_url}"
    )

    try:
        import resend
        resend.api_key = key
        resend.Emails.send({
            "from":    _from_email(),
            "to":      [to_email],
            "subject": f"Session ready: {title}",
            "html":    html,
            "text":    text,
        })
        print(f"[Email] sent to {to_email} for session {conv_id}")
        return True
    except Exception as e:
        print(f"[Email] failed for {conv_id}: {e}")
        return False


def notify_field_alert(
    to_email:    str,
    conv_id:     str,
    title:       str,
    missing:     list[str],
    app_url:     str = "",
) -> bool:
    """
    Send an alert when critical fields are missing from the session summary.
    Returns True on success, False if skipped or failed.
    """
    key = _api_key()
    if not key or not to_email or not missing:
        return False

    session_url = f"{app_url}/session/{conv_id}" if app_url else f"/session/{conv_id}"
    items_html  = "".join(f"<li style='margin:4px 0;'>{f}</li>" for f in missing)

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1f2937;">
      <div style="background:#ef4444;padding:20px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#fff;font-size:20px;">Missing Clinical Fields</h1>
        <p style="margin:4px 0 0;color:#fecaca;font-size:12px;">Action required — session: {title}</p>
      </div>
      <div style="background:#fef2f2;padding:24px;border:1px solid #fca5a5;border-top:none;">
        <p>The following fields could not be extracted from your session and require manual entry:</p>
        <ul style="background:#fff;border:1px solid #fca5a5;border-radius:8px;padding:16px 16px 16px 32px;">
          {items_html}
        </ul>
        <div style="margin-top:20px;text-align:center;">
          <a href="{session_url}"
             style="background:#ef4444;color:#fff;padding:12px 28px;border-radius:8px;
                    text-decoration:none;font-size:14px;font-weight:bold;">
            Complete Session Record
          </a>
        </div>
      </div>
    </div>
    """

    try:
        import resend
        resend.api_key = key
        resend.Emails.send({
            "from":    _from_email(),
            "to":      [to_email],
            "subject": f"Action required: missing fields in '{title}'",
            "html":    html,
        })
        return True
    except Exception as e:
        print(f"[Email] field-alert failed for {conv_id}: {e}")
        return False
