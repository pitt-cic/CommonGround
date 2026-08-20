"""
Layout linter. Run against sample or real content to catch a slot that is
about to overflow before a stakeholder sees it.

Reports, per field: line count, whether the renderer had to shrink the type,
and the widest rendered line as a percentage of the slot. Anything that shrank
means the schema's max_length for that field is too generous for its geometry.

    python3 lint.py
"""

from __future__ import annotations

import sys
import xml.etree.ElementTree as ET

import render as R
from build_samples import SAMPLES

FOOTER_RULE_Y = 938.0
MARGIN_L, MARGIN_R = 72.0, 1008.0
CHROME = {"footer", "org"}  # live below the rule by design


def audit(template: str, content: dict) -> list[str]:
    problems: list[str] = []
    root = ET.fromstring(R.prepare(template, content))
    lowest = 0.0

    print(f"\n{template}")
    print("  " + "-" * 74)

    for el in root.iter(f"{{{R.SVG_NS}}}text"):
        field = el.get("data-field")
        if field is None:
            continue
        text = (el.text or "").strip()
        if not text:
            continue
        if el.get("data-upper") == "1":
            text = text.upper()

        size = R._float_attr(el, "font-size", 16.0)
        tracking = R._float_attr(el, "letter-spacing", 0.0)
        maxw = R._float_attr(el, "data-maxw", 1e9)
        maxlines = int(R._float_attr(el, "data-maxlines", 1))
        lead = R._float_attr(el, "data-lead", size * 1.25)
        valign = el.get("data-valign", "top")
        family = el.get("font-family", "")
        anchor = el.get("text-anchor", "start")

        lines, eff = R._fit(text, size, maxw, maxlines, tracking, family)
        widest = max(R._measure(l, eff, tracking, family) for l in lines)
        fill = widest / maxw * 100

        x = R._float_attr(el, "x", 0.0)
        if anchor == "end":
            slot_l, slot_r = x - maxw, x
            line_l, line_r = x - widest, x
        elif anchor == "middle":
            slot_l, slot_r = x - maxw / 2, x + maxw / 2
            line_l, line_r = x - widest / 2, x + widest / 2
        else:
            slot_l, slot_r = x, x + maxw
            line_l, line_r = x, x + widest

        if slot_r > MARGIN_R + 0.5 or slot_l < MARGIN_L - 0.5:
            problems.append(
                f"{template}.{field}: SLOT out of margins "
                f"[{slot_l:.0f},{slot_r:.0f}] vs [{MARGIN_L:.0f},{MARGIN_R:.0f}] "
                f"-- fix data-maxw or x in the template")
        if line_r > MARGIN_R + 0.5 or line_l < MARGIN_L - 0.5:
            problems.append(
                f"{template}.{field}: RENDERED TEXT crosses the margin "
                f"(right edge {line_r:.0f}, margin {MARGIN_R:.0f})")

        y = R._float_attr(el, "y", 0.0)
        span = (len(lines) - 1) * lead
        if valign == "bottom":
            top = y - span
        elif valign == "center":
            top = y - span / 2
        else:
            top = y
        if field not in CHROME:
            lowest = max(lowest, top + span)

        flag = "  "
        if fill > 100.5:
            flag = "X "
            problems.append(f"{template}.{field}: overflows its slot ({fill:.1f}%)")
        if eff < size - 0.01:
            flag = "! "
            problems.append(
                f"{template}.{field}: shrank {size:.0f} -> {eff:.1f}px "
                f"({len(text)} chars in {maxlines} line(s)); tighten max_length"
            )
        if text.endswith("\u2026"):
            flag = "X "
            problems.append(f"{template}.{field}: TRUNCATED")

        print(f"  {flag}{field:22s} {len(text):>4d}ch  "
              f"{len(lines)}/{maxlines}ln  {fill:5.1f}% of slot  "
              f"right edge {line_r:>6.0f}")

    print(f"  lowest baseline {lowest:.0f} (footer rule at {FOOTER_RULE_Y:.0f})")
    if lowest > FOOTER_RULE_Y - 20:
        problems.append(f"{template}: content reaches y={lowest:.0f}, collides with footer")
    return problems


if __name__ == "__main__":
    found: list[str] = []
    for name, content in SAMPLES.items():
        found += audit(name, content)

    print()
    if found:
        for p in found:
            print("FAIL " + p)
        sys.exit(1)
    print("clean")