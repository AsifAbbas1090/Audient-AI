"""
PDF export service — generates clinical and patient-facing session reports.

Uses ReportLab (pure Python, no system binaries).
Produces A4 PDFs with: per-layout canvas-drawn letterhead, prescription-pad
patient fields, template-driven content sections, and a provider attestation footer.

Six fixed visual template layouts are available (chosen in the Template Builder).
Each layout's header is drawn entirely on the PDF canvas, not as Platypus flowables,
giving full control over coloured backgrounds, reversed text, and logo placement.

Usage:
    from services.pdf_service import generate_session_pdf
    pdf_bytes = generate_session_pdf(conversation)           # clinical
    pdf_bytes = generate_session_pdf(conversation, "patient") # patient-facing
"""
from __future__ import annotations

import io
import os
import urllib.request
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Callable

if TYPE_CHECKING:
    from models.conversation import Conversation

from reportlab.lib import colors as rl_colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, Image, KeepTogether,
)

from config import Config
from services.pdf_theme import resolve_pdf_theme, make_styles, PdfThemeResolved

_BRANDING_URL_PREFIX = "/api/users/branding/"

_WHITE  = rl_colors.white
_BLACK  = rl_colors.HexColor("#111827")
_CONF_RED = rl_colors.HexColor("#b91c1c")


# ── Image helpers ─────────────────────────────────────────────────────────────

def _branding_url_to_disk(path: str) -> str:
    relative = path[len(_BRANDING_URL_PREFIX):]
    parts = relative.split("/", 1)
    if len(parts) != 2:
        return path
    user_id, filename = parts
    return os.path.join(Config.SESSIONS_DIR, "branding", user_id, filename)


def _image_reader(url_or_path: str | None) -> ImageReader | None:
    if not url_or_path or not str(url_or_path).strip():
        return None
    s = str(url_or_path).strip()
    try:
        if s.startswith(("http://", "https://")):
            req = urllib.request.Request(s, headers={"User-Agent": "Audient-AI-PDF/1.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                return ImageReader(io.BytesIO(resp.read()))
        if s.startswith(_BRANDING_URL_PREFIX):
            s = _branding_url_to_disk(s)
        return ImageReader(s)
    except Exception:
        return None


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


# ── Canvas helpers ────────────────────────────────────────────────────────────

def _canvas_logo(canv, ir: ImageReader | None, x: float, y: float,
                 w: float, h: float) -> None:
    if not ir:
        return
    try:
        canv.drawImage(ir, x, y, width=w, height=h,
                       preserveAspectRatio=True, mask="auto")
    except Exception:
        pass


def _page_footer(canv, doc, brand_name: str, accent_hex: str,
                 bottom_margin: float) -> None:
    Wp, _ = A4
    m = 0.5 * cm
    canv.setFont("Helvetica", 6.5)
    canv.setFillColor(rl_colors.HexColor("#6b7280"))
    canv.drawCentredString(Wp / 2, bottom_margin * 0.38,
                           f"{brand_name}  ·  Page {doc.page}")


def _page_border(canv, accent_hex: str) -> None:
    Wp, Hp = A4
    m = 0.5 * cm
    canv.setStrokeColor(rl_colors.HexColor(accent_hex))
    canv.setLineWidth(0.35)
    canv.rect(m, m, Wp - 2 * m, Hp - 2 * m, stroke=1, fill=0)


# ── Per-layout canvas chrome functions ────────────────────────────────────────
# Each returns a callable(canv, doc) that draws the entire page surround.

def _chrome_teal_rx_pad(branding: dict, tr: PdfThemeResolved, audience: str) -> Callable:
    """Teal full-width banner + large Rx symbol left + white doctor text."""
    def _draw(canv, doc):
        Wp, Hp = A4
        hh = tr.header_height
        ac  = rl_colors.HexColor(tr.accent_hex)
        dark = rl_colors.HexColor("#0f766e")
        pale = rl_colors.HexColor("#ccfbf1")
        lm   = tr.left_margin

        canv.saveState()

        # Banner background
        canv.setFillColor(ac)
        canv.rect(0, Hp - hh, Wp, hh, fill=1, stroke=0)

        # Darker stripe at banner bottom
        canv.setFillColor(dark)
        canv.rect(0, Hp - hh, Wp, 0.28 * cm, fill=1, stroke=0)

        # Large Rx on left
        canv.setFillColor(pale)
        canv.setFont("Helvetica-Bold", 36)
        canv.drawString(lm * 0.55, Hp - hh + 0.62 * cm, "Rx")

        # Doctor info
        name   = (branding.get("doctor_name")  or "").strip()
        title  = (branding.get("doctor_title") or "").strip()
        clinic = (branding.get("clinic_name")  or "").strip()
        x_txt  = lm * 0.55 + 1.85 * cm

        # Logo top-right
        logo_ir = _image_reader(branding.get("logo_url"))
        logo_w = 1.8 * cm
        logo_placed = False
        if logo_ir:
            logo_x = Wp - logo_w - 0.7 * cm
            logo_y = Hp - hh + (hh - logo_w) / 2
            _canvas_logo(canv, logo_ir, logo_x, logo_y, logo_w, logo_w)
            logo_placed = True

        canv.setFillColor(_WHITE)
        canv.setFont("Helvetica-Bold", 14)
        canv.drawString(x_txt, Hp - hh + 2.25 * cm, name)

        if title:
            canv.setFillColor(pale)
            canv.setFont("Helvetica", 8)
            canv.drawString(x_txt, Hp - hh + 1.5 * cm, title)

        if clinic:
            canv.setFillColor(_WHITE)
            canv.setFont("Helvetica-Bold", 8.5)
            canv.drawString(x_txt, Hp - hh + 0.78 * cm, clinic)

        # Badge (top-right, only if no logo)
        if not logo_placed:
            badge = "AFTER-VISIT SUMMARY" if audience == "patient" else "CONFIDENTIAL"
            sub   = "Patient Copy" if audience == "patient" else "Clinical Record"
            canv.setFillColor(pale)
            canv.setFont("Helvetica-Bold", 7)
            canv.drawRightString(Wp - 0.7 * cm, Hp - hh + 2.25 * cm, badge)
            canv.setFont("Helvetica", 6.5)
            canv.drawRightString(Wp - 0.7 * cm, Hp - hh + 1.5 * cm, sub)

        # Page border + footer
        _page_border(canv, tr.accent_hex)
        brand = (branding.get("clinic_name") or branding.get("doctor_name") or "").strip()
        _page_footer(canv, doc, brand, tr.accent_hex, tr.bottom_margin)

        canv.restoreState()
    return _draw


def _chrome_navy_letterhead(branding: dict, tr: PdfThemeResolved, audience: str) -> Callable:
    """Deep navy formal letterhead with thin gold separator line."""
    def _draw(canv, doc):
        Wp, Hp = A4
        hh   = tr.header_height
        ac   = rl_colors.HexColor(tr.accent_hex)
        gold = rl_colors.HexColor("#fbbf24")
        pale = rl_colors.HexColor("#bfdbfe")
        lm   = tr.left_margin

        canv.saveState()

        # Navy banner
        canv.setFillColor(ac)
        canv.rect(0, Hp - hh, Wp, hh, fill=1, stroke=0)

        # Gold separator at bottom of banner
        canv.setFillColor(gold)
        canv.rect(0, Hp - hh, Wp, 0.22 * cm, fill=1, stroke=0)

        # Logo (top-left)
        logo_ir = _image_reader(branding.get("logo_url"))
        logo_w  = 2.0 * cm
        x_txt   = lm
        if logo_ir:
            logo_y = Hp - hh + (hh - logo_w) / 2
            _canvas_logo(canv, logo_ir, lm * 0.5, logo_y, logo_w, logo_w)
            x_txt = lm * 0.5 + logo_w + 0.4 * cm

        # Doctor info (white)
        name   = (branding.get("doctor_name")  or "").strip()
        title  = (branding.get("doctor_title") or "").strip()
        clinic = (branding.get("clinic_name")  or "").strip()
        license_num = (branding.get("license_number") or "").strip()

        canv.setFillColor(_WHITE)
        canv.setFont("Helvetica-Bold", 15)
        canv.drawString(x_txt, Hp - hh + 2.8 * cm, name)

        if title:
            canv.setFillColor(pale)
            canv.setFont("Helvetica", 8.5)
            canv.drawString(x_txt, Hp - hh + 2.05 * cm, title)

        if clinic:
            canv.setFillColor(_WHITE)
            canv.setFont("Helvetica-Bold", 9)
            canv.drawString(x_txt, Hp - hh + 1.3 * cm, clinic)

        if license_num:
            canv.setFillColor(pale)
            canv.setFont("Helvetica", 7.5)
            canv.drawString(x_txt, Hp - hh + 0.62 * cm, f"Reg. No.: {license_num}")

        # CONFIDENTIAL / AFTER-VISIT badge (top-right)
        badge = "AFTER-VISIT SUMMARY" if audience == "patient" else "CONFIDENTIAL"
        sub   = "Patient Copy" if audience == "patient" else "Clinical Record"
        canv.setFillColor(pale)
        canv.setFont("Helvetica-Bold", 7.5)
        canv.drawRightString(Wp - 0.8 * cm, Hp - hh + 2.8 * cm, badge)
        canv.setFont("Helvetica", 7)
        canv.drawRightString(Wp - 0.8 * cm, Hp - hh + 2.1 * cm, sub)

        # Rx symbol (lower-right of banner, faint watermark)
        if tr.show_rx:
            canv.setFillColor(rl_colors.HexColor("#1e40af"))
            canv.setFont("Helvetica-Bold", 42)
            canv.drawRightString(Wp - 0.7 * cm, Hp - hh + 0.38 * cm, "Rx")

        _page_border(canv, tr.accent_hex)
        brand = (branding.get("clinic_name") or branding.get("doctor_name") or "").strip()
        _page_footer(canv, doc, brand, tr.accent_hex, tr.bottom_margin)

        canv.restoreState()
    return _draw


def _chrome_emerald_sidebar(branding: dict, tr: PdfThemeResolved, audience: str) -> Callable:
    """Full-height emerald left sidebar with vertical clinic text and logo at top."""
    def _draw(canv, doc):
        Wp, Hp = A4
        sw  = tr.sidebar_width
        ac  = rl_colors.HexColor(tr.accent_hex)
        dark = rl_colors.HexColor("#047857")
        pale = rl_colors.HexColor("#a7f3d0")

        canv.saveState()

        # Full-height sidebar
        canv.setFillColor(ac)
        canv.rect(0, 0, sw, Hp, fill=1, stroke=0)

        # Thin darker strip on right edge of sidebar
        canv.setFillColor(dark)
        canv.rect(sw - 0.15 * cm, 0, 0.15 * cm, Hp, fill=1, stroke=0)

        # Logo at top of sidebar
        logo_ir = _image_reader(branding.get("logo_url"))
        if logo_ir:
            logo_dim = sw * 0.65
            lx = (sw - logo_dim) / 2
            _canvas_logo(canv, logo_ir, lx, Hp - logo_dim - 0.5 * cm,
                         logo_dim, logo_dim)

        # Doctor name (horizontal, small, near top below logo)
        name   = (branding.get("doctor_name")  or "").strip()
        clinic = (branding.get("clinic_name")  or "").strip()
        title  = (branding.get("doctor_title") or "").strip()

        # Horizontal short texts near top
        top_y = Hp - (sw * 0.65 + 1.2 * cm) if logo_ir else Hp - 1.0 * cm
        canv.setFillColor(_WHITE)
        canv.setFont("Helvetica-Bold", 7)
        txt_x = sw / 2
        if name:
            canv.saveState()
            canv.translate(txt_x, top_y)
            canv.drawCentredString(0, 0, name[:18])
            canv.restoreState()
            top_y -= 0.55 * cm
        if title:
            canv.setFillColor(pale)
            canv.setFont("Helvetica", 6)
            canv.saveState()
            canv.translate(txt_x, top_y)
            canv.drawCentredString(0, 0, title[:22])
            canv.restoreState()
            top_y -= 0.48 * cm

        # Clinic name rotated vertically (centered in lower 60% of sidebar)
        canv.setFillColor(_WHITE)
        canv.setFont("Helvetica-Bold", 9)
        rot_center_y = Hp * 0.38
        canv.saveState()
        canv.translate(sw / 2, rot_center_y)
        canv.rotate(90)
        lbl = (clinic or name or "")[:28]
        canv.drawCentredString(0, -3, lbl)
        canv.restoreState()

        # Thin accent line across top of content area
        canv.setStrokeColor(ac)
        canv.setLineWidth(2)
        canv.line(sw, Hp - 0.4 * cm, Wp, Hp - 0.4 * cm)

        # Page border (right+top+bottom only, left edge is sidebar)
        m = 0.5 * cm
        canv.setStrokeColor(rl_colors.HexColor(tr.accent_hex))
        canv.setLineWidth(0.35)
        canv.line(sw + m * 0.3, m, Wp - m, m)
        canv.line(Wp - m, m, Wp - m, Hp - m)
        canv.line(Wp - m, Hp - m, sw + m * 0.3, Hp - m)

        brand = (branding.get("clinic_name") or branding.get("doctor_name") or "").strip()
        canv.setFont("Helvetica", 6.5)
        canv.setFillColor(rl_colors.HexColor("#6b7280"))
        footer_line = f"{brand}  ·  Page {doc.page}" if brand else f"Page {doc.page}"
        canv.drawCentredString(
            sw + (Wp - sw) / 2,
            tr.bottom_margin * 0.38,
            footer_line,
        )

        # Badge text at top-right of content area
        badge = "AFTER-VISIT SUMMARY" if audience == "patient" else "CONFIDENTIAL"
        canv.setFont("Helvetica-Bold", 7)
        canv.setFillColor(rl_colors.HexColor(tr.accent_hex))
        canv.drawRightString(Wp - 0.8 * cm, Hp - 0.85 * cm, badge)

        canv.restoreState()
    return _draw


def _chrome_classic_blue(branding: dict, tr: PdfThemeResolved, audience: str) -> Callable:
    """Two-tone blue banner: main blue + light blue stripe beneath + Rx left."""
    def _draw(canv, doc):
        Wp, Hp = A4
        hh    = tr.header_height
        ac    = rl_colors.HexColor(tr.accent_hex)
        light = rl_colors.HexColor("#38bdf8")
        pale  = rl_colors.HexColor("#e0f2fe")
        lm    = tr.left_margin

        canv.saveState()

        # Main blue banner (upper 80%)
        main_h = hh * 0.82
        canv.setFillColor(ac)
        canv.rect(0, Hp - main_h, Wp, main_h, fill=1, stroke=0)

        # Light blue stripe (lower 18% of header)
        stripe_h = hh - main_h
        canv.setFillColor(light)
        canv.rect(0, Hp - hh, Wp, stripe_h, fill=1, stroke=0)

        # Large Rx symbol (left, in stripe zone)
        canv.setFillColor(ac)
        canv.setFont("Helvetica-Bold", 22)
        canv.drawString(lm * 0.6, Hp - hh + (stripe_h - 22) / 2 + 4, "Rx")

        # Doctor info in banner
        name   = (branding.get("doctor_name")  or "").strip()
        title  = (branding.get("doctor_title") or "").strip()
        clinic = (branding.get("clinic_name")  or "").strip()
        x_txt  = lm

        # Logo top-right
        logo_ir = _image_reader(branding.get("logo_url"))
        logo_w  = 1.7 * cm
        if logo_ir:
            logo_y = Hp - main_h + (main_h - logo_w) / 2
            _canvas_logo(canv, logo_ir, Wp - logo_w - 0.7 * cm, logo_y, logo_w, logo_w)

        canv.setFillColor(_WHITE)
        canv.setFont("Helvetica-Bold", 14.5)
        canv.drawString(x_txt, Hp - main_h + main_h * 0.65, name)

        if title:
            canv.setFillColor(pale)
            canv.setFont("Helvetica", 8)
            canv.drawString(x_txt, Hp - main_h + main_h * 0.38, title)

        if clinic:
            canv.setFillColor(_WHITE)
            canv.setFont("Helvetica-Bold", 8.5)
            canv.drawString(x_txt, Hp - main_h + main_h * 0.14, clinic)

        # Badge top-right
        badge = "AFTER-VISIT SUMMARY" if audience == "patient" else "CONFIDENTIAL"
        canv.setFillColor(pale)
        canv.setFont("Helvetica-Bold", 7)
        canv.drawRightString(Wp - 0.7 * cm, Hp - main_h + main_h * 0.65, badge)
        canv.setFont("Helvetica", 6.5)
        sub = "Patient Copy" if audience == "patient" else "Clinical Record"
        canv.drawRightString(Wp - 0.7 * cm, Hp - main_h + main_h * 0.42, sub)

        _page_border(canv, tr.accent_hex)
        brand = (branding.get("clinic_name") or branding.get("doctor_name") or "").strip()
        _page_footer(canv, doc, brand, tr.accent_hex, tr.bottom_margin)

        canv.restoreState()
    return _draw


def _chrome_burgundy_specialist(branding: dict, tr: PdfThemeResolved, audience: str) -> Callable:
    """Formal two-zone burgundy header: deep upper band + ornamental rule + lighter lower band."""
    def _draw(canv, doc):
        Wp, Hp = A4
        hh      = tr.header_height
        ac      = rl_colors.HexColor(tr.accent_hex)
        dark    = rl_colors.HexColor("#7f1d1d")
        rose    = rl_colors.HexColor("#fff1f2")
        pale    = rl_colors.HexColor("#fecdd3")
        lm      = tr.left_margin

        upper_h = hh * 0.72
        lower_h = hh - upper_h

        canv.saveState()

        # Upper deep burgundy band
        canv.setFillColor(dark)
        canv.rect(0, Hp - upper_h, Wp, upper_h, fill=1, stroke=0)

        # Lower lighter rose band
        canv.setFillColor(rose)
        canv.rect(0, Hp - hh, Wp, lower_h, fill=1, stroke=0)

        # Ornamental rule between bands
        canv.setStrokeColor(ac)
        canv.setLineWidth(1.5)
        canv.line(0, Hp - upper_h, Wp, Hp - upper_h)

        # Thin decorative inner line in upper band
        canv.setStrokeColor(ac)
        canv.setLineWidth(0.5)
        inset = 0.5 * cm
        canv.line(inset, Hp - 0.35 * cm, Wp - inset, Hp - 0.35 * cm)

        # Logo (top-right of upper band)
        logo_ir = _image_reader(branding.get("logo_url"))
        logo_w  = 1.9 * cm
        if logo_ir:
            logo_y = Hp - upper_h + (upper_h - logo_w) / 2
            _canvas_logo(canv, logo_ir, Wp - logo_w - 0.8 * cm, logo_y, logo_w, logo_w)

        # Doctor info in upper band
        name    = (branding.get("doctor_name")   or "").strip()
        title   = (branding.get("doctor_title")  or "").strip()
        clinic  = (branding.get("clinic_name")   or "").strip()
        license_num = (branding.get("license_number") or "").strip()

        canv.setFillColor(_WHITE)
        canv.setFont("Helvetica-Bold", 15)
        canv.drawString(lm, Hp - upper_h + upper_h * 0.66, name)

        if title:
            canv.setFillColor(pale)
            canv.setFont("Helvetica", 8.5)
            canv.drawString(lm, Hp - upper_h + upper_h * 0.41, title)

        if license_num:
            canv.setFillColor(pale)
            canv.setFont("Helvetica", 7.5)
            canv.drawString(lm, Hp - upper_h + upper_h * 0.18,
                            f"Registration No.: {license_num}")

        # Clinic name in lower rose band
        if clinic:
            canv.setFillColor(ac)
            canv.setFont("Helvetica-Bold", 9)
            canv.drawString(lm, Hp - hh + (lower_h - 9) / 2 + 4, clinic)

        # Badge
        badge = "AFTER-VISIT SUMMARY" if audience == "patient" else "SPECIALIST CONSULTATION"
        canv.setFillColor(pale)
        canv.setFont("Helvetica-Bold", 7)
        canv.drawRightString(Wp - 0.8 * cm, Hp - upper_h + upper_h * 0.66, badge)
        canv.setFont("Helvetica", 7)
        sub = "Patient Copy" if audience == "patient" else "Confidential"
        canv.drawRightString(Wp - 0.8 * cm, Hp - upper_h + upper_h * 0.44, sub)

        _page_border(canv, tr.accent_hex)
        brand = (branding.get("clinic_name") or branding.get("doctor_name") or "").strip()
        _page_footer(canv, doc, brand, tr.accent_hex, tr.bottom_margin)

        canv.restoreState()
    return _draw


def _chrome_minimal_clean(branding: dict, tr: PdfThemeResolved, audience: str) -> Callable:
    """Minimal gray: thin top accent line + clean doctor nameplate, no coloured background."""
    def _draw(canv, doc):
        Wp, Hp = A4
        hh   = tr.header_height
        ac   = rl_colors.HexColor(tr.accent_hex)
        muted = rl_colors.HexColor("#4b5563")
        ink  = rl_colors.HexColor("#111827")
        lm   = tr.left_margin

        canv.saveState()

        # Thin top accent strip
        canv.setFillColor(ac)
        canv.rect(0, Hp - 0.3 * cm, Wp, 0.3 * cm, fill=1, stroke=0)

        # Logo (top-right)
        logo_ir = _image_reader(branding.get("logo_url"))
        logo_w  = 1.6 * cm
        if logo_ir:
            logo_y = Hp - hh + (hh - logo_w * 0.7) / 2 + logo_w * 0.15
            _canvas_logo(canv, logo_ir, Wp - logo_w - 0.7 * cm, logo_y, logo_w, logo_w * 0.7)

        # Doctor name in dark ink
        name   = (branding.get("doctor_name")  or "").strip()
        title  = (branding.get("doctor_title") or "").strip()
        clinic = (branding.get("clinic_name")  or "").strip()
        license_num = (branding.get("license_number") or "").strip()

        canv.setFillColor(ink)
        canv.setFont("Helvetica-Bold", 13)
        canv.drawString(lm, Hp - hh + hh * 0.72, name)

        if title:
            canv.setFillColor(muted)
            canv.setFont("Helvetica", 8)
            canv.drawString(lm, Hp - hh + hh * 0.48, title)

        if clinic:
            canv.setFillColor(ink)
            canv.setFont("Helvetica-Bold", 8.5)
            canv.drawString(lm, Hp - hh + hh * 0.28, clinic)

        if license_num:
            canv.setFillColor(muted)
            canv.setFont("Helvetica", 7)
            canv.drawString(lm, Hp - hh + hh * 0.1, f"Reg. No.: {license_num}")

        # Thin rule below header
        canv.setStrokeColor(ac)
        canv.setLineWidth(0.75)
        canv.line(lm, Hp - hh, Wp - tr.right_margin, Hp - hh)

        # Badge
        badge = "AFTER-VISIT SUMMARY" if audience == "patient" else "CONFIDENTIAL"
        canv.setFillColor(ac)
        canv.setFont("Helvetica-Bold", 7)
        canv.drawRightString(Wp - 0.7 * cm, Hp - hh + hh * 0.72, badge)

        # Thin page border
        m = 0.5 * cm
        canv.setStrokeColor(rl_colors.HexColor("#d1d5db"))
        canv.setLineWidth(0.3)
        canv.rect(m, m, Wp - 2 * m, Hp - 2 * m, stroke=1, fill=0)

        brand = (branding.get("clinic_name") or branding.get("doctor_name") or "").strip()
        _page_footer(canv, doc, brand, tr.accent_hex, tr.bottom_margin)

        canv.restoreState()
    return _draw


_CHROME_DISPATCH: dict[str, Callable] = {
    "teal_rx_pad":         _chrome_teal_rx_pad,
    "navy_letterhead":     _chrome_navy_letterhead,
    "emerald_sidebar":     _chrome_emerald_sidebar,
    "classic_blue":        _chrome_classic_blue,
    "burgundy_specialist": _chrome_burgundy_specialist,
    "minimal_clean":       _chrome_minimal_clean,
}


def _get_chrome_fn(layout_id: str, branding: dict,
                   tr: PdfThemeResolved, audience: str) -> Callable:
    fn = _CHROME_DISPATCH.get(layout_id, _chrome_teal_rx_pad)
    return fn(branding, tr, audience)


# ── Platypus layout helpers ───────────────────────────────────────────────────

def _section_heading(label: str, tr: PdfThemeResolved, st: dict, W: float) -> Table:
    t = Table([[Paragraph(label.upper(), st["section_heading"])]], colWidths=[W])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), tr.accent_light),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("LINEBEFORE",    (0, 0), (0, -1),  4, tr.accent),
    ]))
    return t


def _build_patient_block(
    story: list, fields: dict, tr: PdfThemeResolved, st: dict, W: float
) -> None:
    story.append(KeepTogether([
        _section_heading("Patient Information", tr, st, W),
        Spacer(1, 0.18 * cm),
    ]))

    name     = (fields.get("name")     or "—").strip()
    age      = (fields.get("age")      or "—").strip()
    gender   = (fields.get("gender")   or "—").strip()
    date     = (fields.get("date")     or "—").strip()
    duration = (fields.get("duration") or "—").strip()
    language = (fields.get("language") or "—").strip()

    def _fp(label: str, value: str) -> Paragraph:
        return Paragraph(
            f'<font name="Helvetica-Bold" size="7" color="#6b7280">{label}</font>'
            f'<br/><font name="Helvetica" size="9.5" color="#111827">{value}</font>',
            st["form_field_label"],
        )

    r1 = Table(
        [[_fp("PATIENT NAME", name), _fp("DATE OF VISIT", date)]],
        colWidths=[W * 0.65, W * 0.35],
    )
    r1.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (0, 0),  14),
        ("RIGHTPADDING",  (1, 0), (1, 0),   0),
        ("LINEBELOW",     (0, 0), (-1, 0),  0.75, tr.rule),
    ]))
    story.append(r1)
    story.append(Spacer(1, 0.12 * cm))

    r2 = Table(
        [[_fp("AGE", age), _fp("GENDER", gender),
          _fp("DURATION", duration), _fp("LANGUAGE", language)]],
        colWidths=[W * 0.18, W * 0.2, W * 0.3, W * 0.32],
    )
    r2.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-2, 0),  12),
        ("RIGHTPADDING",  (-1, 0), (-1, 0),  0),
        ("LINEBELOW",     (0, 0), (-1, 0),  0.75, tr.rule),
    ]))
    story.append(r2)
    story.append(Spacer(1, 0.3 * cm))


def _build_content_sections(
    story: list,
    sections: list,
    source_map: dict,
    tr: PdfThemeResolved,
    st: dict,
    W: float,
    audience: str,
) -> None:
    ordered = sections or (
        [{"label": "After-visit summary", "source_key": "patient_facing_summary", "visible": True}]
        if audience == "patient"
        else [
            {"label": "Condition / Diagnosis",  "source_key": "disease",          "visible": True},
            {"label": "Emotional State",         "source_key": "emotional_state",  "visible": True},
            {"label": "Education Level",         "source_key": "education",        "visible": True},
            {"label": "Additional Notes",        "source_key": "additional_notes", "visible": True},
        ]
    )

    for sec in ordered:
        if not sec.get("visible", True):
            continue
        source_key = sec.get("source_key")
        if source_key == "transcript":
            continue
        label = sec.get("label") or source_key or "Section"
        val   = source_map.get(source_key)

        if source_key == "follow_up_questions":
            if not val:
                continue
            if isinstance(val, list):
                items = [str(x).strip() for x in val if str(x).strip()]
                val = "\n".join(f"• {x}" for x in items) if items else None
            if not val:
                continue

        if not val or not str(val).strip():
            continue

        row = Table(
            [[Paragraph(str(label), st["field_name"]),
              Paragraph(str(val).replace("\n", "<br/>"), st["notes"])]],
            colWidths=[W * 0.22, W * 0.78],
        )
        row.setStyle(TableStyle([
            ("TOPPADDING",    (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING",   (0, 0), (0, 0),   8),
            ("RIGHTPADDING",  (0, 0), (0, 0),   6),
            ("LEFTPADDING",   (1, 0), (1, 0),  10),
            ("RIGHTPADDING",  (1, 0), (1, 0),   0),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW",     (0, 0), (-1, 0),  0.4, tr.rule),
            ("BACKGROUND",    (0, 0), (0, 0),   tr.panel),
            ("LINEBEFORE",    (0, 0), (0, 0),   2.5, tr.accent),
        ]))
        story.append(row)


def _build_signature_block(
    story: list, branding: dict, tr: PdfThemeResolved, st: dict, W: float, audience: str
) -> None:
    doctor_name  = (branding.get("doctor_name")   or "").strip()
    doctor_title = (branding.get("doctor_title")  or "").strip()
    clinic_name  = (branding.get("clinic_name")   or "").strip()
    license_num  = (branding.get("license_number") or "").strip()
    sig_url      = branding.get("signature_url")
    brand_name   = (clinic_name or doctor_name or "Audient AI").strip()

    story.append(Spacer(1, 0.5 * cm))
    story.append(HRFlowable(width="100%", thickness=0.75, color=tr.rule, spaceAfter=0))
    story.append(Spacer(1, 0.22 * cm))

    sig_ir = _image_reader(sig_url) if sig_url else None
    if sig_ir:
        try:
            story.append(Image(sig_ir, width=4.5 * cm, height=1.6 * cm))
        except Exception:
            sig_ir = None

    if not sig_ir:
        story.append(Spacer(1, 1.1 * cm))
        story.append(HRFlowable(width=4.5 * cm, thickness=0.5, color=tr.rule))

    story.append(Spacer(1, 0.12 * cm))

    cred_parts: list[str] = []
    if doctor_name:
        cred_parts.append(f'<font name="Helvetica-Bold" size="9.5">{doctor_name}</font>')
    if doctor_title:
        cred_parts.append(f'<font name="Helvetica" size="8" color="#4b5563">{doctor_title}</font>')
    if license_num:
        cred_parts.append(
            f'<font name="Helvetica" size="7.5" color="#6b7280">Registration No.: {license_num}</font>'
        )
    if cred_parts:
        story.append(Paragraph("<br/>".join(cred_parts), st["label"]))

    story.append(Spacer(1, 0.22 * cm))

    if audience == "patient":
        footer_text = (
            f"Prepared by <b>{brand_name}</b>. "
            "This document is for your personal health records. "
            "Always follow your doctor's specific advice regarding your treatment and follow-up care."
        ) if brand_name else (
            "This document is for your personal health records. "
            "Always follow your doctor's specific advice regarding your treatment and follow-up care."
        )
    else:
        footer_text = (
            f"<b>{brand_name}</b>. "
            "This record is confidential and intended solely for the treating clinician."
        ) if brand_name else (
            "This record is confidential and intended solely for the treating clinician."
        )

    footer_para = Paragraph(footer_text, st["footer"])

    if tr.footer_bar:
        ft = Table([[footer_para]], colWidths=[W])
        ft.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), tr.accent_light),
            ("TOPPADDING",    (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING",   (0, 0), (-1, -1), 12),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
            ("BOX",           (0, 0), (-1, -1), 0.75, tr.rule),
        ]))
        story.append(ft)
    else:
        story.append(footer_para)


# ── Main export functions ──────────────────────────────────────────────────────

def generate_session_pdf(conv: "Conversation", audience: str = "clinical") -> bytes:
    audience = (audience or "clinical").strip().lower()
    if audience not in ("clinical", "patient"):
        audience = "clinical"

    if audience == "patient":
        template_version = (
            getattr(conv, "patient_template_version", None)
            or getattr(conv, "template_version", None)
        )
    else:
        template_version = getattr(conv, "template_version", None)

    schema   = (template_version.schema_json if template_version else None) or {}
    sections = schema.get("sections") or []
    tr = resolve_pdf_theme(schema)
    st = make_styles(tr)

    branding = (template_version.branding_snapshot_json if template_version else None) or {}
    if not branding:
        user = getattr(conv, "user", None)
        branding = {
            "doctor_name":    getattr(user, "name",           None),
            "doctor_title":   getattr(user, "doctor_title",   None),
            "clinic_name":    getattr(user, "clinic_name",    None),
            "license_number": getattr(user, "license_number", None),
            "signature_url":  getattr(user, "signature_url",  None),
            "logo_url":       getattr(user, "logo_url",       None),
        }

    brand_name = (branding.get("clinic_name") or branding.get("doctor_name") or "").strip()
    doc_author = (branding.get("doctor_name") or brand_name or "").strip()

    buf = io.BytesIO()
    doc_title = (
        f"Patient Visit Summary — {conv.title or 'Consultation'}"
        if audience == "patient"
        else f"Clinical Note — {conv.title or 'Consultation'}"
    )
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=tr.left_margin,
        rightMargin=tr.right_margin,
        topMargin=tr.top_margin,
        bottomMargin=tr.bottom_margin,
        title=doc_title, author=doc_author,
    )
    W = A4[0] - tr.left_margin - tr.right_margin
    story: list = []

    visit_date = conv.created_at.strftime("%d %b %Y") if conv.created_at else datetime.now(timezone.utc).strftime("%d %b %Y")
    ref_no = conv.id[:8].upper()
    story.append(Paragraph(
        f"Date of visit: {visit_date} &nbsp;·&nbsp; Ref: {ref_no}",
        ParagraphStyle("sub", parent=st["label"], fontSize=7),
    ))
    story.append(Spacer(1, 0.25 * cm))

    summary = conv.summary
    _build_patient_block(story, {
        "name":     (summary.patient_name   if summary else None),
        "age":      (summary.patient_age    if summary else None),
        "gender":   (summary.patient_gender if summary else None),
        "date":     conv.created_at.strftime("%d %b %Y") if conv.created_at else None,
        "duration": _fmt_duration(conv.duration),
        "language": conv.language,
    }, tr, st, W)

    if tr.show_rx:
        story.append(Paragraph("Rx", st["rx_symbol"]))
        story.append(Spacer(1, 0.06 * cm))

    summary_heading = "After-Visit Summary" if audience == "patient" else "Clinical Documentation"
    story.append(KeepTogether([
        _section_heading(summary_heading, tr, st, W),
        Spacer(1, 0.18 * cm),
    ]))

    if summary:
        source_map = {
            "patient_name":           summary.patient_name,
            "patient_age":            summary.patient_age,
            "patient_gender":         summary.patient_gender,
            "disease":                summary.disease,
            "education":              summary.education,
            "emotional_state":        summary.emotional_state,
            "additional_notes":       summary.additional_notes,
            "follow_up_questions":    summary.follow_up_questions or [],
            "patient_facing_summary": summary.patient_facing_summary,
        }
        if isinstance(summary.extracted_entities, dict):
            source_map.update(summary.extracted_entities)
        _build_content_sections(story, sections, source_map, tr, st, W, audience)
    else:
        story.append(Paragraph("No summary available.", st["label"]))

    show_transcript = any(
        s.get("source_key") == "transcript" and s.get("visible", True)
        for s in sections
    )
    if show_transcript:
        story.append(Spacer(1, 0.3 * cm))
        story.append(KeepTogether([
            _section_heading("Encounter Transcript", tr, st, W),
            Spacer(1, 0.18 * cm),
        ]))
        transcript = conv.transcript
        if transcript and transcript.lines:
            for line in sorted(transcript.lines, key=lambda x: x.line_order):
                sp   = (line.speaker or "Speaker").strip()
                text = (line.text or "").strip()
                if not text:
                    continue
                sp_lower = sp.lower()
                if "patient" in sp_lower:
                    sp_style = st["transcript_patient"]
                elif "doctor" in sp_lower or "speaker 1" in sp_lower:
                    sp_style = st["transcript_doctor"]
                else:
                    sp_style = st["transcript_other"]
                row = Table(
                    [[Paragraph(_fmt_time(line.start_time), st["timestamp"]),
                      Paragraph(f"<b>{sp}</b>: {text}", sp_style)]],
                    colWidths=[W * 0.1, W * 0.9],
                )
                row.setStyle(TableStyle([
                    ("ROWPADDING", (0, 0), (-1, -1), 3),
                    ("VALIGN",     (0, 0), (-1, -1), "TOP"),
                ]))
                story.append(row)
        elif transcript and transcript.raw_text:
            story.append(Paragraph(transcript.raw_text, st["notes"]))
        else:
            story.append(Paragraph("No transcript on file.", st["label"]))

    _build_signature_block(story, branding, tr, st, W, audience)

    chrome_fn = _get_chrome_fn(tr.layout_id, branding, tr, audience)
    doc.build(story, onFirstPage=chrome_fn, onLaterPages=chrome_fn)
    return buf.getvalue()


def generate_template_preview_pdf(
    schema: dict,
    branding: dict | None,
    *,
    audience: str = "clinical",
) -> bytes:
    audience = (audience or "clinical").strip().lower()
    if audience not in ("clinical", "patient"):
        audience = "clinical"

    branding = branding or {}
    schema   = schema or {}
    sections = schema.get("sections") or []
    tr = resolve_pdf_theme(schema)
    st = make_styles(tr)
    brand_name = (
        branding.get("clinic_name") or branding.get("doctor_name") or "Audient AI"
    ).strip()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=tr.left_margin,
        rightMargin=tr.right_margin,
        topMargin=tr.top_margin,
        bottomMargin=tr.bottom_margin,
        title=f"PREVIEW — {'Patient' if audience == 'patient' else 'Clinical'} Template",
        author="Audient AI",
    )
    W = A4[0] - tr.left_margin - tr.right_margin
    story: list = []

    gen_date = datetime.now(timezone.utc).strftime("%d %b %Y  %H:%M UTC")
    story.append(Paragraph(
        f"Generated: {gen_date[:11].strip()}  ·  "
        "<b>TEMPLATE PREVIEW</b> — fictitious identifiers, layout review only",
        ParagraphStyle("sub", parent=st["label"], fontSize=7),
    ))
    story.append(Spacer(1, 0.25 * cm))

    _build_patient_block(story, {
        "name":     "Doe, Jane (illustrative)",
        "age":      "42 y",
        "gender":   "Female",
        "date":     gen_date[:11].strip(),
        "duration": "14m 05s",
        "language": "English",
    }, tr, st, W)

    if tr.show_rx:
        story.append(Paragraph("Rx", st["rx_symbol"]))
        story.append(Spacer(1, 0.06 * cm))

    summary_heading = "After-Visit Summary" if audience == "patient" else "Clinical Documentation"
    story.append(KeepTogether([
        _section_heading(summary_heading, tr, st, W),
        Spacer(1, 0.18 * cm),
    ]))

    sample_map = {
        "patient_name":   "Doe, Jane",
        "patient_age":    "42 y",
        "patient_gender": "Female",
        "disease": (
            "Essential hypertension (I10), well-controlled on current antihypertensive regimen."
        ),
        "education": "Bachelor's degree; health literacy adequate for verbal instruction.",
        "emotional_state": "Appropriate affect; calm and cooperative throughout consultation.",
        "additional_notes": (
            "Medication adherence reviewed — patient confirms taking amlodipine 5 mg daily. "
            "Lifestyle advice given: sodium restriction, 30 min daily walking. "
            "Return precautions discussed. Follow-up outpatient visit scheduled in 6 weeks."
        ),
        "follow_up_questions": (
            "• Home BP log to be maintained and reviewed at next visit.\n"
            "• Urgent review if sustained BP above 160/100 mmHg or if symptomatic."
        ),
        "patient_facing_summary": (
            "Your blood pressure has improved on your current treatment — well done for keeping "
            "up with your medication.\n\n"
            "Continue taking your tablets as prescribed and try to reduce salty foods. "
            "A short daily walk also helps keep blood pressure stable.\n\n"
            "Please seek urgent care if you develop a severe headache, chest pain, shortness of "
            "breath, or sudden weakness or vision changes. Your next appointment is in about "
            "six weeks — your clinic will be in touch with the date."
        ),
    }

    _build_content_sections(story, sections, sample_map, tr, st, W, audience)

    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph(
        "Transcript is not shown in preview. "
        "Add a visible Transcript section in the builder to include encounter dialogue on exported PDFs.",
        ParagraphStyle("trnote", parent=st["label"], fontSize=7, leading=11),
    ))

    _build_signature_block(story, branding, tr, st, W, audience)

    chrome_fn = _get_chrome_fn(tr.layout_id, branding, tr, audience)
    doc.build(story, onFirstPage=chrome_fn, onLaterPages=chrome_fn)
    return buf.getvalue()
