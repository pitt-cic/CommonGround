"""
Render CommonGround SVG infographics from validated Bedrock output.

Design contract
---------------
Bedrock never emits SVG. It returns a Pydantic model (see schemas.py) whose
fields carry max_length constraints. This module does three jobs the model
cannot be trusted with:

  1. XML-escapes every substituted value.
  2. Wraps text into <tspan> lines, because SVG <text> does not wrap.
  3. Steps the font size down when a value still overflows its slot, and
     ellipsises as a last resort so a layout can never visibly break.

Geometry lives in the SVG files, not here. Each wrappable <text> element
declares its own constraints via data-* attributes:

  data-field    field id (also the substitution token, uppercased)
  data-maxw     max line width in user units
  data-maxlines max line count before the size steps down
  data-lead     line height in user units (defaults to 1.25 * font-size)
  data-valign   "top" (default) | "bottom" | "center" -- how a variable
                line count grows around the declared y baseline
  data-upper    "1" to uppercase the value at render time

Edit the SVG, and the renderer follows. No duplicated coordinates.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from xml.sax.saxutils import escape

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

TEMPLATE_DIR = Path(__file__).parent / "templates"

MIN_SCALE = 0.72          # never shrink text below 72% of its designed size
SCALE_STEP = 0.94         # multiplicative step per shrink attempt


# --------------------------------------------------------------------------
# Width measurement
# --------------------------------------------------------------------------
# Real advance widths (per 1000 em) for the *widest plausible fallback* in each
# family, because that is what actually renders:
#
#   serif slots -> Georgia. Source Serif 4 is not installed on most machines
#                  and Georgia is noticeably wider, especially its figures
#                  (0.636em vs 0.55 for a generic average).
#   sans slots  -> Arial. Inter and Helvetica Neue are both equal or narrower.
#
# Measuring against the widest fallback means a layout that fits here fits
# everywhere. SAFETY adds a further margin so lines never run to the exact
# edge of their slot.
#
# If you bundle the real .ttf files into the Lambda layer (you must, for
# rasterisation), swap _measure for PIL metrics:
#
#     from PIL import ImageFont
#     _F = {}
#     def _measure(s, size, tracking=0.0, family=""):
#         path = SERIF_TTF if _is_serif(family) else SANS_TTF
#         f = _F.setdefault((path, round(size)), ImageFont.truetype(path, round(size)))
#         return (f.getlength(s) + max(0, len(s) - 1) * tracking) * SAFETY
#
# Nothing else changes. Re-run stress.py afterwards; a few limits will move.

SAFETY = 1.03


def _build(groups, default):
    table = {}
    for chars, w in groups:
        for c in chars:
            table[c] = w / 1000.0
    return table, default / 1000.0


_SERIF, _SERIF_DEF = _build([
    (" ", 241), ("'", 213), ('"', 401), (",.", 265), (":;", 292), ("!", 302),
    ("()", 353), ("-", 361), ("/", 372), ("il", 297), ("j", 320), ("t", 375),
    ("f", 351), ("r", 442), ("s", 447), ("cz", 480), ("e", 508), ("g", 528),
    ("x", 542), ("vy", 549), ("o", 555), ("a", 561), ("q", 570), ("k", 574),
    ("b", 596), ("d", 600), ("p", 601), ("hnu", 610), ("w", 823), ("m", 903),
    ("0123456789#$+", 636), ("%", 861), ("&", 763), ("@", 1000),
    ("I", 392), ("J", 394), ("S", 562), ("P", 583), ("FZ", 588), ("L", 592),
    ("T", 610), ("E", 617), ("Y", 632), ("B", 654), ("C", 660), ("X", 665),
    ("K", 683), ("V", 690), ("R", 693), ("G", 705), ("A", 707), ("OQ", 728),
    ("D", 738), ("U", 749), ("N", 762), ("H", 799), ("M", 962), ("W", 986),
], 610)

_SANS, _SANS_DEF = _build([
    ("ijl", 222), (" !.,:;/ftI[]", 278), ("'", 191), ('"', 355), ("|", 260),
    ("()-`r", 333), ("{}", 334), ("*", 389), ("^", 469),
    ("ckJsvxyz", 500), ("0123456789abdeghnopqu#$_?L", 556), ("+<=>~", 584),
    ("FTZ", 611), ("&ABEKPSVXY", 667), ("CDHNRUw", 722), ("GOQ", 778),
    ("Mm", 833), ("%", 889), ("W", 944), ("@", 1015),
], 556)


def _is_serif(family: str) -> bool:
    f = family.lower()
    return "serif" in f and "sans-serif" not in f


def _measure(s: str, size: float, tracking: float = 0.0, family: str = "") -> float:
    if _is_serif(family):
        table, default = _SERIF, _SERIF_DEF
    else:
        table, default = _SANS, _SANS_DEF
    adv = sum(table.get(c, default) for c in s) * size
    return (adv + max(0, len(s) - 1) * tracking) * SAFETY


def _wrap(text: str, size: float, maxw: float, tracking: float = 0.0,
          family: str = "") -> list[str]:
    """Greedy word wrap. Hard-splits any single word wider than the slot."""
    lines: list[str] = []
    for word in text.split():
        if not lines:
            lines.append(word)
            continue
        candidate = lines[-1] + " " + word
        if _measure(candidate, size, tracking, family) <= maxw:
            lines[-1] = candidate
        else:
            lines.append(word)

    out: list[str] = []
    for line in lines:
        while _measure(line, size, tracking, family) > maxw and len(line) > 1:
            cut = len(line) - 1
            while cut > 1 and _measure(line[:cut], size, tracking, family) > maxw:
                cut -= 1
            out.append(line[:cut])
            line = line[cut:]
        out.append(line)
    return out or [""]


def _fit(text: str, size: float, maxw: float, maxlines: int, tracking: float,
         family: str = ""):
    """Return (lines, effective_size). Shrinks, then ellipsises."""
    scale = 1.0
    while scale >= MIN_SCALE:
        eff = size * scale
        lines = _wrap(text, eff, maxw, tracking, family)
        if len(lines) <= maxlines:
            return lines, eff
        scale *= SCALE_STEP

    eff = size * MIN_SCALE
    lines = _wrap(text, eff, maxw, tracking, family)[:maxlines]
    last = lines[-1]
    while last and _measure(last + "\u2026", eff, tracking, family) > maxw:
        last = last[:-1]
    lines[-1] = last.rstrip(" ,;:") + "\u2026"
    return lines, eff


# --------------------------------------------------------------------------
# Token substitution
# --------------------------------------------------------------------------

_TOKEN = re.compile(r"\{\{([A-Z0-9_]+)\}\}")


def substitute(svg: str, values: dict) -> str:
    """Replace {{TOKEN}} with XML-escaped values. Unknown tokens become ''."""
    def repl(m):
        raw = values.get(m.group(1).lower(), "")
        return escape("" if raw is None else str(raw))
    return _TOKEN.sub(repl, svg)


# --------------------------------------------------------------------------
# Text layout pass
# --------------------------------------------------------------------------

def _float_attr(el, name, default=None):
    v = el.get(name)
    if v in (None, ""):
        return default
    try:
        return float(v)
    except ValueError:
        return default


def layout_text(svg: str) -> str:
    root = ET.fromstring(svg)
    parents = {child: parent for parent in root.iter() for child in parent}

    for el in list(root.iter(f"{{{SVG_NS}}}text")):
        if el.get("data-field") is None:
            continue

        content = (el.text or "").strip()
        if not content:
            parents[el].remove(el)
            continue

        if el.get("data-upper") == "1":
            content = content.upper()

        size = _float_attr(el, "font-size", 16.0)
        tracking = _float_attr(el, "letter-spacing", 0.0)
        maxw = _float_attr(el, "data-maxw", 1e9)
        maxlines = int(_float_attr(el, "data-maxlines", 1))
        lead = _float_attr(el, "data-lead", size * 1.25)
        valign = el.get("data-valign", "top")
        family = el.get("font-family", "")

        lines, eff = _fit(content, size, maxw, maxlines, tracking, family)

        if abs(eff - size) > 0.01:
            el.set("font-size", f"{eff:.2f}")

        y = _float_attr(el, "y", 0.0)
        span = (len(lines) - 1) * lead
        if valign == "bottom":
            y -= span
        elif valign == "center":
            y -= span / 2.0
        el.set("y", f"{y:.2f}")

        x = el.get("x", "0")
        el.text = None
        for i, line in enumerate(lines):
            ts = ET.SubElement(el, f"{{{SVG_NS}}}tspan")
            ts.set("x", x)
            ts.set("dy", "0" if i == 0 else f"{lead:g}")
            ts.text = line

        for attr in [a for a in el.attrib if a.startswith("data-")]:
            del el.attrib[attr]

    return ET.tostring(root, encoding="unicode", xml_declaration=False)


# --------------------------------------------------------------------------
# Row builders for the list-shaped templates
# --------------------------------------------------------------------------

def _read(name: str) -> str:
    return (TEMPLATE_DIR / name).read_text(encoding="utf-8")


def _rows_key_findings(items: list[dict]) -> tuple[str, dict]:
    frag = _read("key_findings.row.svg")
    top, bottom, gap = 392.0, 900.0, 16.0
    n = len(items)
    row_h = (bottom - top - gap * (n - 1)) / n
    body_lines = 3 if row_h >= 140 else 2

    out, values = [], {}
    for i, item in enumerate(items):
        ry = top + i * (row_h + gap)
        fid = f"finding{i + 1}"
        values[f"{fid}_title"] = item["title"]
        values[f"{fid}_body"] = item["body"]
        out.append(
            frag.replace("{{ROW_Y}}", f"{ry:.1f}")
                .replace("{{NUM_Y}}", f"{ry + 46:.1f}")
                .replace("{{TITLE_Y}}", f"{ry + 42:.1f}")
                .replace("{{BODY_Y}}", f"{ry + 72:.1f}")
                .replace("{{BODY_LINES}}", str(body_lines))
                .replace("{{NUM}}", f"{i + 1:02d}")
                .replace("{{ID}}", fid)
                .replace("{{TITLE}}", f"{{{{{fid.upper()}_TITLE}}}}")
                .replace("{{BODY}}", f"{{{{{fid.upper()}_BODY}}}}")
        )
    return "\n".join(out), values


def _rows_method_steps(items: list[dict]) -> tuple[str, dict]:
    frag = _read("method_steps.row.svg")
    top, bottom, gap = 400.0, 890.0, 14.0
    n = len(items)
    row_h = (bottom - top - gap * (n - 1)) / n

    out, values = [], {}
    for i, item in enumerate(items):
        ry = top + i * (row_h + gap)
        sid = f"step{i + 1}"
        values[f"{sid}_title"] = item["title"]
        values[f"{sid}_body"] = item["body"]
        out.append(
            frag.replace("{{MARK_Y}}", f"{ry + 18:.1f}")
                .replace("{{MARK_TEXT_Y}}", f"{ry + 24:.1f}")
                .replace("{{TITLE_Y}}", f"{ry + 27:.1f}")
                .replace("{{BODY_Y}}", f"{ry + 58:.1f}")
                .replace("{{BODY_LINES}}", "3" if row_h >= 130 else "2")
                .replace("{{NUM}}", str(i + 1))
                .replace("{{ID}}", sid)
                .replace("{{TITLE}}", f"{{{{{sid.upper()}_TITLE}}}}")
                .replace("{{BODY}}", f"{{{{{sid.upper()}_BODY}}}}")
        )
    extra = {
        "line_y1": f"{top + 18:.1f}",
        "line_y2": f"{top + (n - 1) * (row_h + gap) + 18:.1f}",
    }
    return "\n".join(out), {**values, **extra}


# --------------------------------------------------------------------------
# Public entry point
# --------------------------------------------------------------------------

DEFAULTS = {"org": "Pitt Cloud Innovation Center"}


def prepare(template: str, content: dict) -> str:
    """Template with rows expanded and values substituted, before text layout.
    Exposed so lint.py can audit the declared data-* constraints."""
    svg = _read(f"{template}.svg")
    values = {**DEFAULTS, **{k: v for k, v in content.items() if not isinstance(v, list)}}

    if template == "stat_grid":
        for i, stat in enumerate(content.get("stats", [])[:4], start=1):
            values[f"stat{i}_value"] = stat["value"]
            values[f"stat{i}_label"] = stat["label"]
            values[f"stat{i}_detail"] = stat["detail"]
    elif template == "pull_quote":
        quote = content.get("quote", "")
        if quote and not quote.startswith('"'):
            values["quote"] = f'"{quote}"'
    elif template == "key_findings":
        rows, extra = _rows_key_findings(content["findings"])
        svg = svg.replace("{{ROWS}}", rows)
        values.update(extra)
    elif template == "method_steps":
        rows, extra = _rows_method_steps(content["steps"])
        svg = svg.replace("{{ROWS}}", rows)
        values.update(extra)

    return substitute(svg, values)


def render(template: str, content: dict) -> str:
    """
    template: "stat_grid" | "key_findings" | "pull_quote" | "comparison" | "method_steps"
    content:  the Pydantic model dumped to a dict (model.model_dump())
    """
    return layout_text(prepare(template, content))