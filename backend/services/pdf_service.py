"""
PDF export service — generates a clinical session report using ReportLab.

Pure Python (no system binaries like wkhtmltopdf needed).
Produces a clean A4 PDF with: header, patient info, clinical summary, transcript.

Usage:
    from services.pdf_service import generate_session_pdf
    pdf_bytes = generate_session_pdf(conversation)
"""
from __future__ import annotations
import io
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.conversation import Conversation

# ReportLab imports
from reportlab.lib.pagesizes   import A4
from reportlab.lib.styles      import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units       import cm
from reportlab.lib             import colors
from reportlab.platypus        import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, Image,
)
from reportlab.lib.enums       import TA_LEFT, TA_CENTER, TA_RIGHT

# ── Colour palette ─────────────────────────────────────────────────────────────
_BRAND       = colors.HexColor("#6366f1")   # indigo-500
_BRAND_LIGHT = colors.HexColor("#e0e7ff")   # indigo-100
_DARK        = colors.HexColor("#1e1b4b")   # indigo-950
_MUTED       = colors.HexColor("#6b7280")   # grey-500
_RED         = colors.HexColor("#ef4444")
_GREEN       = colors.HexColor("#22c55e")
_WHITE       = colors.white


# ── Style helpers ─────────────────────────────────────────────────────────────

def _styles():
    base = getSampleStyleSheet()
    return {
        "h_title": ParagraphStyle(
            "h_title", parent=base["Heading1"],
            fontSize=18, textColor=_WHITE, leading=22,
            spaceAfter=0, fontName="Helvetica-Bold",
        ),
        "h_sub": ParagraphStyle(
            "h_sub", parent=base["Normal"],
            fontSize=9, textColor=_BRAND_LIGHT, leading=12,
            spaceAfter=0,
        ),
        "section": ParagraphStyle(
            "section", parent=base["Normal"],
            fontSize=10, textColor=_BRAND, leading=14,
            spaceBefore=12, spaceAfter=4, fontName="Helvetica-Bold",
        ),
        "label": ParagraphStyle(
            "label", parent=base["Normal"],
            fontSize=8.5, textColor=_MUTED, leading=12,
        ),
        "value": ParagraphStyle(
            "value", parent=base["Normal"],
            fontSize=9, textColor=colors.HexColor("#111827"), leading=13,
        ),
        "transcript_doctor": ParagraphStyle(
            "tr_doc", parent=base["Normal"],
            fontSize=8.5, textColor=colors.HexColor("#312e81"), leading=13,
            leftIndent=0,
        ),
        "transcript_patient": ParagraphStyle(
            "tr_pat", parent=base["Normal"],
            fontSize=8.5, textColor=colors.HexColor("#065f46"), leading=13,
            leftIndent=0,
        ),
        "transcript_other": ParagraphStyle(
            "tr_oth", parent=base["Normal"],
            fontSize=8.5, textColor=colors.HexColor("#374151"), leading=13,
            leftIndent=0,
        ),
        "timestamp": ParagraphStyle(
            "ts", parent=base["Normal"],
            fontSize=7.5, textColor=_MUTED, leading=12,
        ),
        "footer": ParagraphStyle(
            "footer", parent=base["Normal"],
            fontSize=7.5, textColor=_MUTED, alignment=TA_CENTER,
        ),
        "notes": ParagraphStyle(
            "notes", parent=base["Normal"],
            fontSize=8.5, textColor=colors.HexColor("#374151"), leading=14,
        ),
        "confidential": ParagraphStyle(
            "conf", parent=base["Normal"],
            fontSize=9, textColor=_RED, leading=12, fontName="Helvetica-Bold",
        ),
    }


def _fmt_time(seconds: float | None) -> str:
    if seconds is None:
        return ""
    s = int(seconds)
    return f"{s // 60:02d}:{s % 60:02d}"


def _fmt_duration(seconds: int | None) -> str:
    if not seconds:
        return "—"
    m, s = divmod(seconds, 60)
    return f"{m}m {s:02d}s"


# ── Main function ─────────────────────────────────────────────────────────────

def generate_session_pdf(conv: "Conversation") -> bytes:
    """
    Generate a PDF clinical note for a completed session.
    Returns raw PDF bytes suitable for streaming to the client.
    """
    buf    = io.BytesIO()
    doc    = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=1.5*cm, bottomMargin=2*cm,
        title=f"Clinical Note — {conv.title or 'Session'}",
        author="Audient AI",
    )
    st      = _styles()
    W       = A4[0] - 4*cm   # usable width
    story   = []

    template_version = getattr(conv, "template_version", None)
    schema = (template_version.schema_json if template_version else None) or {}
    sections = schema.get("sections") or []
    branding = (template_version.branding_snapshot_json if template_version else None) or {}
    if not branding:
        user = getattr(conv, "user", None)
        branding = {
            "doctor_name": getattr(user, "name", None),
            "doctor_title": getattr(user, "doctor_title", None),
            "clinic_name": getattr(user, "clinic_name", None),
            "license_number": getattr(user, "license_number", None),
            "signature_url": getattr(user, "signature_url", None),
            "logo_url": getattr(user, "logo_url", None),
        }
    brand_name = branding.get("clinic_name") or branding.get("doctor_name") or "Audient AI"

    # ── Header banner ─────────────────────────────────────────────────────────
    header_data = [[
        Paragraph(str(brand_name), st["h_title"]),
        Paragraph(
            "CONFIDENTIAL — CLINICAL SESSION REPORT",
            ParagraphStyle("cfb", parent=st["confidential"],
                           textColor=colors.HexColor("#fca5a5"), fontSize=8, alignment=TA_RIGHT),
        ),
    ]]
    header_tbl = Table(header_data, colWidths=[W * 0.6, W * 0.4])
    header_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), _BRAND),
        ("ROWPADDING",   (0, 0), (-1, -1), 10),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(header_tbl)
    logo_path = branding.get("logo_url")
    if logo_path:
        try:
            story.append(Spacer(1, 0.15 * cm))
            story.append(Image(logo_path, width=3 * cm, height=1.2 * cm))
        except Exception:
            pass
    story.append(Spacer(1, 0.3*cm))

    # Sub-header: generated date + session ID
    gen_date = datetime.now(timezone.utc).strftime("%d %b %Y  %H:%M UTC")
    story.append(Paragraph(
        f"Generated: {gen_date} &nbsp;|&nbsp; Session ID: {conv.id[:16]}…",
        ParagraphStyle("sub", parent=st["label"], fontSize=7.5),
    ))
    story.append(Spacer(1, 0.4*cm))

    # ── Patient information ────────────────────────────────────────────────────
    summary = conv.summary
    story.append(Paragraph("PATIENT INFORMATION", st["section"]))
    story.append(HRFlowable(width="100%", thickness=1, color=_BRAND_LIGHT))
    story.append(Spacer(1, 0.2*cm))

    name    = (summary.patient_name if summary else None) or "—"
    age     = (summary.patient_age  if summary else None) or "—"
    gender  = (summary.patient_gender if summary else None) or "—"
    lang    = conv.language or "—"
    date    = conv.created_at.strftime("%d %b %Y") if conv.created_at else "—"
    dur     = _fmt_duration(conv.duration)

    patient_data = [
        [Paragraph("Name",     st["label"]), Paragraph(name,   st["value"]),
         Paragraph("Date",     st["label"]), Paragraph(date,   st["value"])],
        [Paragraph("Age",      st["label"]), Paragraph(age,    st["value"]),
         Paragraph("Duration", st["label"]), Paragraph(dur,    st["value"])],
        [Paragraph("Gender",   st["label"]), Paragraph(gender, st["value"]),
         Paragraph("Language", st["label"]), Paragraph(lang,   st["value"])],
    ]
    col_w = [W * 0.15, W * 0.35, W * 0.15, W * 0.35]
    pt = Table(patient_data, colWidths=col_w)
    pt.setStyle(TableStyle([
        ("BACKGROUND",  (0, 0), (-1, -1), colors.HexColor("#f9fafb")),
        ("ROWPADDING",  (0, 0), (-1, -1), 5),
        ("VALIGN",      (0, 0), (-1, -1), "TOP"),
        ("GRID",        (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
    ]))
    story.append(pt)

    # ── Clinical summary (template-aware) ─────────────────────────────────────
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("CLINICAL SUMMARY", st["section"]))
    story.append(HRFlowable(width="100%", thickness=1, color=_BRAND_LIGHT))
    story.append(Spacer(1, 0.2*cm))

    if summary:
        source_map = {
            "patient_name": summary.patient_name,
            "patient_age": summary.patient_age,
            "patient_gender": summary.patient_gender,
            "disease": summary.disease,
            "education": summary.education,
            "emotional_state": summary.emotional_state,
            "additional_notes": summary.additional_notes,
            "follow_up_questions": summary.follow_up_questions or [],
        }
        if isinstance(summary.extracted_entities, dict):
            source_map.update(summary.extracted_entities)
        ordered_sections = sections or [
            {"label": "Condition / Diagnosis", "source_key": "disease", "visible": True},
            {"label": "Emotional State", "source_key": "emotional_state", "visible": True},
            {"label": "Education Level", "source_key": "education", "visible": True},
            {"label": "Additional Notes", "source_key": "additional_notes", "visible": True},
        ]
        for section in ordered_sections:
            if not section.get("visible", True):
                continue
            source_key = section.get("source_key")
            if source_key == "transcript":
                continue
            label = section.get("label") or source_key or "Section"
            val = source_map.get(source_key)
            if source_key == "follow_up_questions":
                if not val:
                    continue
                val = " • ".join([str(x) for x in val])
            if not val or not str(val).strip():
                continue
            row = Table(
                [[Paragraph(str(label), st["label"]), Paragraph(str(val), st["notes"])]],
                colWidths=[W * 0.22, W * 0.78],
            )
            row.setStyle(TableStyle([
                ("ROWPADDING",   (0, 0), (-1, -1), 4),
                ("VALIGN",       (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW",    (0, 0), (-1, 0), 0.3, colors.HexColor("#f3f4f6")),
            ]))
            story.append(row)
    else:
        story.append(Paragraph("No clinical summary available.", st["label"]))

    # ── Transcript ─────────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("TRANSCRIPT", st["section"]))
    story.append(HRFlowable(width="100%", thickness=1, color=_BRAND_LIGHT))
    story.append(Spacer(1, 0.2*cm))

    transcript = conv.transcript
    if transcript and transcript.lines:
        lines = sorted(transcript.lines, key=lambda x: x.line_order)
        for line in lines:
            sp   = (line.speaker or "Speaker").strip()
            text = (line.text or "").strip()
            if not text:
                continue
            ts_str = _fmt_time(line.start_time)

            # Colour speaker label by role
            if "patient" in sp.lower():
                sp_style = st["transcript_patient"]
            elif "doctor" in sp.lower() or "speaker 1" in sp.lower():
                sp_style = st["transcript_doctor"]
            else:
                sp_style = st["transcript_other"]

            ts_col = Paragraph(ts_str, st["timestamp"])
            sp_col = Paragraph(f"<b>{sp}</b>: {text}", sp_style)
            row = Table([[ts_col, sp_col]], colWidths=[W * 0.1, W * 0.9])
            row.setStyle(TableStyle([
                ("ROWPADDING", (0, 0), (-1, -1), 3),
                ("VALIGN",     (0, 0), (-1, -1), "TOP"),
            ]))
            story.append(row)
    elif transcript and transcript.raw_text:
        story.append(Paragraph(transcript.raw_text, st["notes"]))
    else:
        story.append(Paragraph("No transcript available.", st["label"]))

    # ── Footer ─────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.5*cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=_BRAND_LIGHT))
    story.append(Spacer(1, 0.2*cm))
    signature_path = branding.get("signature_url")
    if signature_path:
        try:
            story.append(Spacer(1, 0.15 * cm))
            story.append(Image(signature_path, width=4 * cm, height=1.5 * cm))
        except Exception:
            pass
    signer_line = " ".join(
        x for x in [
            branding.get("doctor_name"),
            f"({branding.get('doctor_title')})" if branding.get("doctor_title") else None,
        ] if x
    )
    creds = branding.get("license_number")
    footer_text = (
        f"Generated by <b>{brand_name}</b> — AI-assisted clinical documentation. "
        "This document is confidential and intended for authorized medical personnel only. "
        "AI-extracted fields should be verified by the clinician before clinical use."
    )
    if signer_line:
        footer_text += f" Signed by: {signer_line}."
    if creds:
        footer_text += f" License: {creds}."
    story.append(Paragraph(footer_text, st["footer"]))

    doc.build(story)
    return buf.getvalue()
