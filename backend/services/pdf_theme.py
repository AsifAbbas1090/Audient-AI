"""
PDF layout template definitions — 6 fixed prescription-pad / letterhead styles.
Each layout has a fixed colour scheme; no user colour picker.

Stored in template schema_json.theme: { "layout": str }
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.units import cm

_CONFIDENTIAL_RED = colors.HexColor("#b91c1c")
_HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

# ── Layout catalogue ──────────────────────────────────────────────────────────
LAYOUT_TEMPLATES: dict[str, dict[str, Any]] = {
    "teal_rx_pad": {
        "label":         "Teal Rx Pad",
        "description":   "Classic teal prescription-pad with full-width banner and Rx symbol",
        "accent_hex":    "#0d9488",
        "panel_hex":     "#f0fdfa",
        "rule_hex":      "#5eead4",
        "show_rx":       True,
        "footer_bar":    True,
        "top_margin":    4.0 * cm,
        "bottom_margin": 2.2 * cm,
        "left_margin":   2.0 * cm,
        "right_margin":  2.0 * cm,
        "header_height": 3.5 * cm,
        "sidebar_width": 0.0,
    },
    "navy_letterhead": {
        "label":         "Navy Letterhead",
        "description":   "Deep navy formal letterhead — ideal for hospital specialists",
        "accent_hex":    "#1e3a8a",
        "panel_hex":     "#eff6ff",
        "rule_hex":      "#93c5fd",
        "show_rx":       True,
        "footer_bar":    True,
        "top_margin":    4.5 * cm,
        "bottom_margin": 2.2 * cm,
        "left_margin":   2.0 * cm,
        "right_margin":  2.0 * cm,
        "header_height": 4.0 * cm,
        "sidebar_width": 0.0,
    },
    "emerald_sidebar": {
        "label":         "Emerald Sidebar",
        "description":   "Modern emerald full-height left sidebar — striking clinic style",
        "accent_hex":    "#059669",
        "panel_hex":     "#ecfdf5",
        "rule_hex":      "#6ee7b7",
        "show_rx":       False,
        "footer_bar":    True,
        "top_margin":    2.2 * cm,
        "bottom_margin": 2.2 * cm,
        "left_margin":   4.2 * cm,
        "right_margin":  1.8 * cm,
        "header_height": 0.0,
        "sidebar_width": 3.5 * cm,
    },
    "classic_blue": {
        "label":         "Classic Blue",
        "description":   "Classic sky-blue prescription pad with two-tone banner and Rx symbol",
        "accent_hex":    "#0369a1",
        "panel_hex":     "#f0f9ff",
        "rule_hex":      "#7dd3fc",
        "show_rx":       True,
        "footer_bar":    True,
        "top_margin":    4.0 * cm,
        "bottom_margin": 2.2 * cm,
        "left_margin":   2.0 * cm,
        "right_margin":  2.0 * cm,
        "header_height": 3.5 * cm,
        "sidebar_width": 0.0,
    },
    "burgundy_specialist": {
        "label":         "Burgundy Specialist",
        "description":   "Formal burgundy letterhead — surgical and specialist practices",
        "accent_hex":    "#9f1239",
        "panel_hex":     "#fff1f2",
        "rule_hex":      "#fda4af",
        "show_rx":       False,
        "footer_bar":    True,
        "top_margin":    5.0 * cm,
        "bottom_margin": 2.2 * cm,
        "left_margin":   2.0 * cm,
        "right_margin":  2.0 * cm,
        "header_height": 4.5 * cm,
        "sidebar_width": 0.0,
    },
    "minimal_clean": {
        "label":         "Minimal Clean",
        "description":   "Clean gray — compact clinical record, no decorative elements",
        "accent_hex":    "#374151",
        "panel_hex":     "#f9fafb",
        "rule_hex":      "#d1d5db",
        "show_rx":       False,
        "footer_bar":    False,
        "top_margin":    3.5 * cm,
        "bottom_margin": 2.2 * cm,
        "left_margin":   2.0 * cm,
        "right_margin":  2.0 * cm,
        "header_height": 3.0 * cm,
        "sidebar_width": 0.0,
    },
}

VALID_LAYOUT_IDS = frozenset(LAYOUT_TEMPLATES.keys())

# Backward-compat mapping from old preset names to new layout IDs
_PRESET_TO_LAYOUT: dict[str, str] = {
    "minimal_clinical":    "minimal_clean",
    "rx_pad_classic":      "classic_blue",
    "teal_healthcare":     "teal_rx_pad",
    "navy_diagnostician":  "navy_letterhead",
    "emerald_clinic":      "emerald_sidebar",
    "burgundy_specialist": "burgundy_specialist",
}


# ── Colour helpers ────────────────────────────────────────────────────────────

def _hex_color(hex_str: str) -> colors.Color:
    h = hex_str.strip()
    if not h.startswith("#"):
        h = "#" + h
    return colors.HexColor(h)


def _mix_toward_white(hex_str: str, amount: float = 0.88) -> colors.Color:
    h = hex_str.lstrip("#")
    if len(h) != 6:
        return colors.HexColor("#f9fafb")
    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)
    r = int(r + (255 - r) * amount)
    g = int(g + (255 - g) * amount)
    b = int(b + (255 - b) * amount)
    return colors.HexColor(f"#{r:02x}{g:02x}{b:02x}")


# ── Resolved theme dataclass ──────────────────────────────────────────────────

@dataclass(frozen=True)
class PdfThemeResolved:
    layout_id:      str
    accent:         colors.Color
    accent_light:   colors.Color
    ink:            colors.Color
    ink_muted:      colors.Color
    rule:           colors.Color
    panel:          colors.Color
    show_rx:        bool
    footer_bar:     bool
    top_margin:     float
    bottom_margin:  float
    left_margin:    float
    right_margin:   float
    header_height:  float
    sidebar_width:  float
    accent_hex:     str


def resolve_pdf_theme(schema: dict[str, Any] | None) -> PdfThemeResolved:
    raw = (schema or {}).get("theme")
    layout_id = "teal_rx_pad"

    if isinstance(raw, dict):
        # New format: {"layout": "..."}
        lv = str(raw.get("layout") or "").strip()
        if lv in VALID_LAYOUT_IDS:
            layout_id = lv
        else:
            # Backward compat: old {"preset": "...", "accent": "..."} format
            p = str(raw.get("preset") or "").strip()
            layout_id = _PRESET_TO_LAYOUT.get(p, "teal_rx_pad")

    meta = LAYOUT_TEMPLATES[layout_id]
    accent_hex = meta["accent_hex"]
    ac = _hex_color(accent_hex)
    ac_light = _mix_toward_white(accent_hex.lstrip("#"), 0.88)
    ink = colors.HexColor("#111827")
    muted = colors.HexColor("#4b5563")
    rule = _hex_color(meta["rule_hex"])
    panel = _hex_color(meta["panel_hex"])

    return PdfThemeResolved(
        layout_id=layout_id,
        accent=ac,
        accent_light=ac_light,
        ink=ink,
        ink_muted=muted,
        rule=rule,
        panel=panel,
        show_rx=bool(meta["show_rx"]),
        footer_bar=bool(meta["footer_bar"]),
        top_margin=float(meta["top_margin"]),
        bottom_margin=float(meta["bottom_margin"]),
        left_margin=float(meta["left_margin"]),
        right_margin=float(meta["right_margin"]),
        header_height=float(meta["header_height"]),
        sidebar_width=float(meta.get("sidebar_width", 0.0)),
        accent_hex=accent_hex,
    )


# ── Paragraph style factory ───────────────────────────────────────────────────

def make_styles(tr: PdfThemeResolved) -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    ink, muted = tr.ink, tr.ink_muted

    return {
        "letterhead_identity": ParagraphStyle(
            "lh_id", parent=base["Normal"],
            fontSize=14, textColor=ink, leading=20,
            fontName="Helvetica-Bold", spaceAfter=0,
        ),
        "badge": ParagraphStyle(
            "badge", parent=base["Normal"],
            fontSize=8, textColor=tr.accent, leading=12,
            fontName="Helvetica-Bold", alignment=TA_RIGHT,
        ),
        "section_heading": ParagraphStyle(
            "sec_hd", parent=base["Normal"],
            fontSize=9, textColor=tr.accent, leading=13,
            fontName="Helvetica-Bold", spaceAfter=0, spaceBefore=0,
        ),
        "section": ParagraphStyle(
            "section", parent=base["Normal"],
            fontSize=10, textColor=ink, leading=14,
            spaceBefore=12, spaceAfter=4, fontName="Helvetica-Bold",
        ),
        "form_field_label": ParagraphStyle(
            "ffl", parent=base["Normal"],
            fontSize=8.5, textColor=ink, leading=16, spaceAfter=0,
        ),
        "field_name": ParagraphStyle(
            "field_name", parent=base["Normal"],
            fontSize=8.5, textColor=ink, leading=12,
            fontName="Helvetica-Bold",
        ),
        "label": ParagraphStyle(
            "label", parent=base["Normal"],
            fontSize=8.5, textColor=muted, leading=12,
        ),
        "value": ParagraphStyle(
            "value", parent=base["Normal"],
            fontSize=9, textColor=ink, leading=13,
        ),
        "notes": ParagraphStyle(
            "notes", parent=base["Normal"],
            fontSize=9, textColor=ink, leading=14,
        ),
        "attestation_name": ParagraphStyle(
            "att_nm", parent=base["Normal"],
            fontSize=10, textColor=ink, leading=14,
            fontName="Helvetica-Bold",
        ),
        "transcript_doctor": ParagraphStyle(
            "tr_doc", parent=base["Normal"],
            fontSize=8.5, textColor=ink, leading=13,
        ),
        "transcript_patient": ParagraphStyle(
            "tr_pat", parent=base["Normal"],
            fontSize=8.5, textColor=ink, leading=13,
        ),
        "transcript_other": ParagraphStyle(
            "tr_oth", parent=base["Normal"],
            fontSize=8.5, textColor=muted, leading=13,
        ),
        "timestamp": ParagraphStyle(
            "ts", parent=base["Normal"],
            fontSize=7.5, textColor=muted, leading=12,
        ),
        "footer": ParagraphStyle(
            "footer", parent=base["Normal"],
            fontSize=7.5, textColor=muted,
            alignment=TA_CENTER, leading=11,
        ),
        "confidential": ParagraphStyle(
            "conf", parent=base["Normal"],
            fontSize=8, textColor=_CONFIDENTIAL_RED,
            leading=11, fontName="Helvetica-Bold",
        ),
        "rx_symbol": ParagraphStyle(
            "rx_sym", parent=base["Normal"],
            fontSize=26, textColor=tr.accent, leading=30,
            fontName="Helvetica-Bold", alignment=TA_LEFT,
        ),
        "doctor_accent": ParagraphStyle(
            "doc_ac", parent=base["Normal"],
            fontSize=11, textColor=tr.accent, leading=14,
            fontName="Helvetica-Bold", alignment=TA_RIGHT,
        ),
        "h_title": ParagraphStyle(
            "h_title", parent=base["Heading1"],
            fontSize=16, textColor=ink, leading=20,
            spaceAfter=0, fontName="Helvetica-Bold",
        ),
        "h_sub": ParagraphStyle(
            "h_sub", parent=base["Normal"],
            fontSize=9, textColor=muted, leading=12, spaceAfter=0,
        ),
    }


# ── Public API helpers ────────────────────────────────────────────────────────

def default_theme_dict() -> dict[str, str]:
    return {"layout": "teal_rx_pad"}


def layout_templates_for_api() -> list[dict[str, Any]]:
    order = [
        "teal_rx_pad",
        "navy_letterhead",
        "emerald_sidebar",
        "classic_blue",
        "burgundy_specialist",
        "minimal_clean",
    ]
    return [
        {
            "id":          k,
            "label":       LAYOUT_TEMPLATES[k]["label"],
            "description": LAYOUT_TEMPLATES[k]["description"],
            "accent_hex":  LAYOUT_TEMPLATES[k]["accent_hex"],
            "panel_hex":   LAYOUT_TEMPLATES[k]["panel_hex"],
        }
        for k in order
        if k in LAYOUT_TEMPLATES
    ]


# Keep old name so existing route import doesn't break
theme_presets_for_api = layout_templates_for_api


def validate_clean_theme(raw: Any) -> dict[str, str]:
    if not isinstance(raw, dict):
        return default_theme_dict()
    # New format: {"layout": "..."}
    layout = str(raw.get("layout") or "").strip()
    if layout in VALID_LAYOUT_IDS:
        return {"layout": layout}
    # Backward compat: old {"preset": "...", "accent": "..."}
    preset = str(raw.get("preset") or "").strip()
    mapped = _PRESET_TO_LAYOUT.get(preset)
    if mapped:
        return {"layout": mapped}
    return default_theme_dict()
