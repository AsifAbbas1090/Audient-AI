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
    HRFlowable, KeepTogether,
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

    # ── Header banner ─────────────────────────────────────────────────────────
    header_data = [[
        Paragraph("Audient AI", st["h_title"]),
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

    # ── Clinical summary ───────────────────────────────────────────────────────
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("CLINICAL SUMMARY", st["section"]))
    story.append(HRFlowable(width="100%", thickness=1, color=_BRAND_LIGHT))
    story.append(Spacer(1, 0.2*cm))

    if summary:
        fields = [
            ("Condition / Diagnosis", summary.disease),
            ("Emotional State",       summary.emotional_state),
            ("Education Level",       summary.education),
            ("Additional Notes",      summary.additional_notes),
        ]
        for label, val in fields:
            if val and str(val).strip():
                row = Table(
                    [[Paragraph(label, st["label"]), Paragraph(str(val), st["notes"])]],
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
    story.append(Paragraph(
        "Generated by <b>Audient AI</b> — AI-powered medical transcription system. "
        "This document is confidential and intended for authorized medical personnel only. "
        "AI-extracted fields should be verified by the clinician before clinical use.",
        st["footer"],
    ))

    doc.build(story)
    return buf.getvalue()
