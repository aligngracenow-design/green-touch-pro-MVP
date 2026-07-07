#!/usr/bin/env python3
"""
GreenTouch.Pro — Subcontractor Vetting Engine v2
==================================================
Sources (free, no API keys):
  1. DuckDuckGo search for BBB ratings + reviews
  2. State license board lookup (VA DPOR)
  3. Google cached snippet search

Composite score → green (70+) / yellow (45-69) / red (<45)

Usage:
  python3 vet_sub.py --company "ABC Drywall" --trade drywall --state VA --city Woodbridge
  python3 vet_sub.py --company "ABC Drywall" --trade drywall --state VA --zip 22102
"""

import sys, json, re, time, argparse, urllib.parse
from datetime import datetime

try:
    import requests
except ImportError:
    requests = None

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
}

def safe_int(val, default=0):
    try: return int(val)
    except: return default

def safe_float(val, default=0.0):
    try: return float(val)
    except: return default

# ─── Multi-Source Search ────────────────────────────────────────
def search_ratings(company, trade, city="", state="VA"):
    """
    Search DuckDuckGo + Google for BBB ratings, Google reviews, etc.
    Returns combined data from all accessible sources.
    """
    if not requests:
        return {"error": "requests not installed"}

    result = {
        "bbb_rating": None,
        "bbb_accredited": False,
        "bbb_complaints": 0,
        "years_in_business": None,
        "google_rating": None,
        "google_reviews": 0,
        "snippets": [],
        "source": "web_search"
    }

    query = f'"{company}" {trade} {city} {state} BBB rating reviews'
    encoded = urllib.parse.quote(query)

    # Source 1: DuckDuckGo HTML (less blocked than Google/Bing)
    try:
        ddg_url = f"https://html.duckduckgo.com/html/?q={encoded}"
        r = requests.get(ddg_url, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            text = r.text
            # Extract snippets
            for snippet in re.findall(r'class="result__snippet"[^>]*>(.*?)</a>', text, re.DOTALL):
                clean = re.sub(r'<[^>]+>', '', snippet).strip()
                if clean and len(clean) > 20:
                    result["snippets"].append(clean[:300])

            # BBB rating in snippets
            for snip in result["snippets"]:
                # BBB rating letter
                m = re.search(r'(?:BBB|rating)[^A-F]*?([A-F]\+?)', snip, re.IGNORECASE)
                if m:
                    result["bbb_rating"] = m.group(1)
                    break

            # BBB accredited
            if re.search(r'BBB\s+Accredited', text, re.IGNORECASE):
                result["bbb_accredited"] = True

            # Complaints
            for snip in result["snippets"]:
                m = re.search(r'(\d+)\s*complaint', snip, re.IGNORECASE)
                if m:
                    result["bbb_complaints"] = int(m.group(1))
                    break

            # Google-style star rating in snippets
            for snip in result["snippets"]:
                # Match "4.3 over 5", "4.5 stars", "4.5/5", "rating of 4.3"
                m = re.search(r'(\d+\.?\d*)\s*(?:★|star|out of|over 5|/5)', snip, re.IGNORECASE)
                if not m:
                    m = re.search(r'rating\s*(?:of|is|:)?\s*(\d+\.?\d*)', snip, re.IGNORECASE)
                if m:
                    val = safe_float(m.group(1))
                    if 1 <= val <= 5 and not result["google_rating"]:
                        result["google_rating"] = val
                        break

            # Review count — broader patterns
            for snip in result["snippets"]:
                # "39 customer reviews", "based on 17 reviews", "17 reviews"
                for pat in [r'(\d[\d,]*)\s*(?:customer\s*)?reviews?', r'based on\s*(\d[\d,]*)\s*reviews?']:
                    m = re.search(pat, snip, re.IGNORECASE)
                    if m:
                        result["google_reviews"] = max(result["google_reviews"], safe_int(m.group(1).replace(',', '')))
                        break

            # License number from snippets (fallback)
            for snip in result["snippets"]:
                m = re.search(r'(?:License|Lic)[:\s#]*(\d{6,12})', snip, re.IGNORECASE)
                if m and not result.get("license_number"):
                    result["license_number"] = m.group(1)
                    break
            for snip in result["snippets"]:
                m = re.search(r'(?:since|founded|est\.|established)[:\s]*(\d{4})', snip, re.IGNORECASE)
                if m:
                    year = int(m.group(1))
                    if 1900 < year < 2026:
                        result["years_in_business"] = 2026 - year
                        break

    except Exception as e:
        result["ddg_error"] = str(e)[:100]

    # Source 2: Google cached/search (fallback)
    try:
        gurl = f"https://www.google.com/search?q={encoded}&num=10"
        r = requests.get(gurl, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            text = r.text

            # Extract star rating from Google results (e.g. "4.5 ★")
            stars = re.findall(r'(\d+\.?\d*)\s*★', text)
            for s in stars:
                val = safe_float(s)
                if 1 <= val <= 5:
                    result["google_rating"] = val
                    break

            # Review count
            m = re.search(r'(\d[\d,]*)\s*(?:Google\s*)?reviews?', text, re.IGNORECASE)
            if m and not result["google_reviews"]:
                result["google_reviews"] = safe_int(m.group(1).replace(',', ''))
    except:
        pass

    return result


# ─── License Lookup ─────────────────────────────────────────────
def lookup_license(company, state="VA"):
    """Check state contractor license board. Uses the real VA DPOR verifier."""
    if not requests:
        return {"error": "requests not installed", "source": "license"}

    # Virginia: use the working DPOR verifier (va_license.py)
    if state.upper() == "VA":
        try:
            import os, importlib.util
            _here = os.path.dirname(os.path.abspath(__file__))
            _spec = importlib.util.spec_from_file_location(
                "va_license", os.path.join(_here, "va_license.py"))
            _mod = importlib.util.module_from_spec(_spec)
            _spec.loader.exec_module(_mod)
            v = _mod.verify_va_license(company)
            return {
                "number": v.get("license_number"),
                "status": v.get("status"),
                "verified": v.get("verified", False),
                "class": v.get("class"),
                "expiration_date": v.get("expiration_date"),
                "matched_name": v.get("matched_name"),
                "state": "VA",
                "source": "VA DPOR",
            }
        except Exception as e:
            return {"number": None, "status": "Unavailable",
                    "verified": False, "error": str(e)[:100],
                    "state": "VA", "source": "VA DPOR"}

    # Other states: not yet supported — honest "unavailable"
    return {"number": None, "status": "Unavailable",
            "verified": False, "state": state, "source": "license",
            "note": f"License board lookup not implemented for {state}"}


# ─── Composite Scoring ──────────────────────────────────────────
def compute_score(search_data, license_data):
    """Compute composite vetting score (0-100)."""
    score = 0
    details = []

    # BBB Rating component (max 35 pts)
    bbb_rating = search_data.get("bbb_rating")
    rating_vals = {'A+': 35, 'A': 33, 'A-': 30, 'B+': 27, 'B': 24, 'B-': 20,
                   'C+': 16, 'C': 12, 'C-': 8, 'D+': 5, 'D': 3, 'D-': 1, 'F': 0}
    if bbb_rating and bbb_rating in rating_vals:
        pts = rating_vals[bbb_rating]
        score += pts
        details.append(f"BBB: {bbb_rating} ({pts}pts)")
    elif bbb_rating:
        details.append(f"BBB rating found: {bbb_rating}")
    else:
        # partial signal from snippets
        snippets = search_data.get("snippets", [])
        if any('bbb' in s.lower() for s in snippets):
            details.append("BBB: mentioned in search (unverified)")
        else:
            details.append("BBB: No data found")

    # BBB Accredited bonus (max 10 pts)
    if search_data.get("bbb_accredited"):
        score += 10
        details.append("BBB Accredited (+10)")

    # BBB Complaints (penalty)
    complaints = search_data.get("bbb_complaints", 0) or 0
    if complaints > 10:
        score -= 15
        details.append(f"BBB: {complaints} complaints (-15)")
    elif complaints > 3:
        score -= 5
        details.append(f"BBB: {complaints} complaints (-5)")

    # Years in business (max 10 pts)
    yib = search_data.get("years_in_business")
    if yib:
        if yib >= 10: pts = 10
        elif yib >= 5: pts = 7
        elif yib >= 3: pts = 4
        else: pts = 2
        score += pts
        details.append(f"Est. ~{2026-yib} ({yib}y, +{pts}pts)")

    # Google Reviews (max 30 pts)
    g_rating = search_data.get("google_rating")
    g_reviews = search_data.get("google_reviews", 0) or 0
    if g_rating and g_rating >= 1:
        google_pts = min(30, max(0, (g_rating - 2.0) * 15))
        if g_reviews > 50: google_pts = min(30, google_pts + 5)
        if g_reviews > 100: google_pts = min(30, google_pts + 3)
        score += google_pts
        details.append(f"Google: {g_rating}★ ({g_reviews} reviews, {google_pts:.0f}pts)")
    elif g_rating:
        details.append(f"Google rating found: {g_rating} (insufficient data)")
    else:
        details.append("Google: No reviews found")

    # License (max 15 pts) — REQUIRED for green status
    lic_num = license_data.get("number") or search_data.get("license_number")
    lic_status = (license_data.get("status") or "").lower()
    lic_verified_flag = license_data.get("verified") is True
    lic_class = license_data.get("class")
    lic_exp = license_data.get("expiration_date")
    class_str = f" {lic_class}" if lic_class else ""
    exp_str = f", exp {lic_exp}" if lic_exp else ""
    license_verified = False
    if lic_num:
        if lic_verified_flag or "active" in lic_status or "good standing" in lic_status:
            score += 15
            details.append(f"License: #{lic_num}{class_str} Active ✓ (+15{exp_str})")
            license_verified = True
        elif "expired" in lic_status or "revoked" in lic_status or "suspended" in lic_status:
            score += 3
            details.append(f"License: #{lic_num}{class_str} {license_data.get('status')} ⚠️ (+3{exp_str})")
        else:
            score += 10
            details.append(f"License: #{lic_num}{class_str} Found — status unknown (+10)")
    else:
        details.append("License: ⚠️ NOT VERIFIED — no active VA contractor license found")

    score = int(min(100, max(0, score)))

    # Color threshold — LICENSE GATE: cannot be green without verified active license
    if score >= 70:
        if license_verified:
            color = "green"
        else:
            color = "yellow"  # downgrade: high score but license unverified
            details.append("⚠️ LICENSE GATE: Score qualifies for green but license unverified. Verify license before contacting.")
    elif score >= 45:
        color = "yellow"
    else:
        color = "red"

    return {"score": score, "color": color, "details": details, "license_verified": license_verified}


# ─── Main ───────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="GreenTouch.Pro Sub Vetter")
    parser.add_argument("--company", required=True, help="Company name")
    parser.add_argument("--trade", default="contractor", help="Trade/specialty")
    parser.add_argument("--zip", default="", help="ZIP code")
    parser.add_argument("--city", default="", help="City")
    parser.add_argument("--state", default="VA", help="State (default: VA)")
    args = parser.parse_args()

    if not requests:
        print(json.dumps({
            "error": "Python 'requests' package not installed",
            "vet_score": 50, "vet_color": "yellow"
        }))
        return

    start = time.time()

    # Run all lookups
    search = search_ratings(args.company, args.trade, args.city, args.state)
    lic = lookup_license(args.company, args.state)

    # Compute score
    vet = compute_score(search, lic)

    output = {
        "company": args.company,
        "trade": args.trade,
        "search_data": search,
        "license": lic,
        "vet_score": vet["score"],
        "vet_color": vet["color"],
        "vet_details": vet["details"],
        "license_verified": vet["license_verified"],
        "vetted_at": datetime.now().isoformat(),
        "elapsed_seconds": round(time.time() - start, 2)
    }

    print(json.dumps(output, indent=2))

if __name__ == "__main__":
    main()
