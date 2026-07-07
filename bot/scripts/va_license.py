#!/usr/bin/env python3
"""
va_license.py — Virginia DPOR contractor license verification (REAL, working).

Hits the live VA DPOR License Lookup:
  1. POST search-text -> results table (name, license #, type, board)
  2. POST license-number -> detail page (class, cert date, EXPIRATION date)

A license is ACTIVE if its expiration date is in the future.
Only 'Board for Contractors' license types count as a contractor license.

Returns a dict; never throws (returns {"verified": False, ...} on any failure).

Usage:
  python3 va_license.py --company "Dominion Electric"
  from va_license import verify_va_license; verify_va_license("Dominion Electric")
"""
import sys, re, json, argparse
from datetime import date, datetime

try:
    import requests
except ImportError:
    requests = None

BASE = "https://dporweb.dpor.virginia.gov/LicenseLookup"
SEARCH_URL = f"{BASE}/Search"
DETAIL_URL = f"{BASE}/LicenseDetail"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def _clean(html):
    t = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", t).strip()


def _search(session, company):
    """Return list of {name, license_number, address, type, board}."""
    headers = {
        "User-Agent": UA,
        "Referer": SEARCH_URL,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    r = session.post(SEARCH_URL, headers=headers,
                     data={"search-text": company, "phone-number": ""}, timeout=20)
    if r.status_code != 200:
        return []
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", r.text, re.S | re.I)
    out = []
    for row in rows:
        # license number lives in the hidden input / data-search attr
        lic = re.search(r'name="license-number"[^>]*value="(\d{6,12})"', row)
        if not lic:
            lic = re.search(r'data-search="(\d{6,12})"', row)
        if not lic:
            continue
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S | re.I)
        texts = [_clean(c) for c in cells]
        # drop the honeypot phone label cell
        texts = [t for t in texts if t and "don't fill this out" not in t.lower()]
        name = texts[0] if len(texts) > 0 else ""
        address = texts[1] if len(texts) > 1 else ""
        ltype = texts[2] if len(texts) > 2 else ""
        board = texts[3] if len(texts) > 3 else ""
        out.append({
            "name": name, "license_number": lic.group(1),
            "address": address, "type": ltype, "board": board,
        })
    return out


def _detail(session, license_number):
    """Return {class, cert_date, expiration_date, active} for a license number."""
    headers = {
        "User-Agent": UA,
        "Referer": SEARCH_URL,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    r = session.post(DETAIL_URL, headers=headers,
                     data={"license-number": license_number, "phone-number": ""}, timeout=20)
    info = {"class": None, "cert_date": None, "expiration_date": None, "active": None}
    if r.status_code != 200:
        return info
    flat = re.sub(r"[\r\n\t]+", " ", re.sub(r"\|+", "|", re.sub(r"<[^>]+>", "|", r.text)))
    parts = [p.strip() for p in flat.split("|") if p.strip()]
    for i, p in enumerate(parts):
        nxt = parts[i + 1] if i + 1 < len(parts) else ""
        if re.match(r"^Class\s+[A-C]", p, re.I):
            info["class"] = p.strip()
        elif re.search(r"Initial Certification Date", p, re.I):
            m = re.search(r"\d{4}-\d{2}-\d{2}", nxt)
            if m:
                info["cert_date"] = m.group(0)
        elif re.search(r"Expiration Date", p, re.I):
            m = re.search(r"\d{4}-\d{2}-\d{2}", nxt)
            if m:
                info["expiration_date"] = m.group(0)
    # Active = expiration in the future
    if info["expiration_date"]:
        try:
            exp = datetime.strptime(info["expiration_date"], "%Y-%m-%d").date()
            info["active"] = exp >= date.today()
        except ValueError:
            info["active"] = None
    return info


_GENERIC_WORDS = {
    "inc", "llc", "llp", "lllp", "corp", "corporation", "co", "company", "ltd",
    "the", "and", "of", "services", "service", "contractors", "contractor",
    "contracting", "construction", "group", "enterprises", "enterprise",
    # generic trade descriptors — must NOT be the sole basis for a match
    "electric", "electrical", "plumbing", "plumbers", "hvac", "heating", "cooling",
    "drywall", "roofing", "painting", "masonry", "concrete", "flooring", "framing",
    "remodeling", "renovation", "renovations", "innovations", "innovation",
    "solutions", "systems", "builders", "building", "home", "homes", "residential",
    "commercial", "general", "mechanical", "design", "interiors", "restoration",
}


def _tokens(name):
    return [w for w in re.findall(r"[a-z]+", name.lower()) if len(w) > 1]


def _distinctive(name):
    """Tokens that actually identify a business (drop generic trade/suffix words)."""
    return set(t for t in _tokens(name) if t not in _GENERIC_WORDS)


def _score_match(query, name):
    """
    Symmetric name-match score in [0,1].

    Requires overlap of DISTINCTIVE tokens (brand words), not just generic trade
    words. 'Electrical Innovations' vs 'PILLAR INNOVATIONS LLC' scores ~0 because
    their only shared token ('innovations') is generic. Uses F1 of distinctive
    token overlap so both names must genuinely correspond.
    """
    q = _distinctive(query)
    n = _distinctive(name)
    if not q or not n:
        # No distinctive tokens on one side — fall back to full-token containment
        qf, nf = set(_tokens(query)), set(_tokens(name))
        if not qf or not nf:
            return 0.0
        inter = len(qf & nf)
        return inter / max(len(qf), len(nf))
    inter = len(q & n)
    if inter == 0:
        return 0.0
    precision = inter / len(q)
    recall = inter / len(n)
    return 2 * precision * recall / (precision + recall)


# Minimum name-match score to treat a DPOR record as the same business.
MATCH_THRESHOLD = 0.6


def verify_va_license(company, trade=""):
    """
    Main entry. Returns:
      {
        "verified": bool,          # true only if an ACTIVE contractor license was found
        "status": "Active"|"Expired"|"Not Found"|"Unavailable",
        "license_number": str|None,
        "class": str|None,         # Class A / B / C (bonding tier)
        "expiration_date": str|None,
        "matched_name": str|None,
        "candidates": int,         # how many DPOR results matched the name
        "source": "VA DPOR"
      }
    """
    if not requests:
        return {"verified": False, "status": "Unavailable",
                "reason": "requests not installed", "source": "VA DPOR"}
    try:
        s = requests.Session()
        s.get(SEARCH_URL, headers={"User-Agent": UA}, timeout=15)
        results = _search(s, company)
    except Exception as e:
        return {"verified": False, "status": "Unavailable",
                "reason": str(e)[:120], "source": "VA DPOR"}

    # Keep only real contractor-board licenses, rank by name match
    contractors = [r for r in results if "contractor" in (r.get("board", "") + r.get("type", "")).lower()]
    pool = contractors or results
    if not pool:
        return {"verified": False, "status": "Not Found", "license_number": None,
                "candidates": 0, "source": "VA DPOR"}

    pool.sort(key=lambda r: _score_match(company, r["name"]), reverse=True)

    # Check details for the top candidates (bounded to avoid hammering DPOR).
    # Prefer an ACTIVE license among strong name matches over a stale exact tie.
    checked = []
    for cand in pool[:6]:
        mq = _score_match(company, cand["name"])
        if mq < MATCH_THRESHOLD and checked:
            break  # matches now too weak to be the same business; stop
        try:
            det = _detail(s, cand["license_number"])
        except Exception:
            det = {"active": None, "expiration_date": None, "class": None}
        checked.append((cand, det, mq))
        # Short-circuit only on a strong-name ACTIVE license.
        if det.get("active") and mq >= 0.8:
            break

    if not checked:
        return {"verified": False, "status": "Not Found", "license_number": None,
                "matched_name": None, "candidates": len(pool), "source": "VA DPOR",
                "note": "No confident name match in DPOR — license not confirmed"}

    def rank(entry):
        cand, det, mq = entry
        active_rank = 2 if det.get("active") else (1 if det.get("active") is None else 0)
        exp = det.get("expiration_date") or "0000-00-00"
        # Name match quality DOMINATES (bucketed) so we never accept a weak-name
        # active license over a strong-name one. Among comparable name matches,
        # prefer active, then latest expiration.
        return (round(mq, 1), active_rank, exp)

    best, det, match_quality = max(checked, key=rank)

    # HARD GATE: if the best name match is too weak, we did NOT find this business.
    # Never report a license (esp. "Active") for a business we can't confidently match.
    if match_quality < MATCH_THRESHOLD:
        return {
            "verified": False,
            "status": "Not Found",
            "license_number": None,
            "class": None,
            "expiration_date": None,
            "matched_name": None,
            "match_quality": round(match_quality, 2),
            "candidates": len(pool),
            "source": "VA DPOR",
            "note": "No confident name match in DPOR — license not confirmed",
        }

    active = det.get("active")
    status = "Active" if active else ("Expired" if active is False else "Found (status unknown)")
    return {
        "verified": bool(active),
        "status": status,
        "license_number": best["license_number"],
        "class": det.get("class"),
        "expiration_date": det.get("expiration_date"),
        "matched_name": best["name"],
        "match_quality": round(match_quality, 2),
        "candidates": len(pool),
        "source": "VA DPOR",
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--company", required=True)
    ap.add_argument("--trade", default="")
    args = ap.parse_args()
    print(json.dumps(verify_va_license(args.company, args.trade), indent=2))


if __name__ == "__main__":
    main()
