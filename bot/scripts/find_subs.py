#!/usr/bin/env python3
"""
find_subs.py — Discover subcontractor companies from the web by trade + location.
Multi-strategy: lite.duckduckgo.com (primary), Bing (fallback).
Returns JSON array of company-name strings on stdout. Never throws — prints [] on failure.

Usage:
    find_subs.py --query "drywall" --location "Ashburn VA"
"""
import sys, json, re, argparse

try:
    import requests
except ImportError:
    print("[]")
    sys.exit(0)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

TRADE_SUFFIXES = (
    "Contracting|Contractors|Contractor|Drywall|Construction|Plumbing|Plumbers|"
    "Electric|Electrical|HVAC|Heating|Cooling|Roofing|Roofers|Painting|Painters|"
    "Masonry|Landscaping|Landscape|Excavating|Excavation|Concrete|Framing|Flooring|"
    "Remodeling|Builders|Building|Services|Interiors|Finishing|Mechanical|Foundation|"
    "Carpentry|Tile|Siding|Insulation|Gutters|Fence|Fencing|Paving|Restoration|"
    "Renovations|Renovation|Design|Handyman|Maintenance|Systems|Solutions|Group|Company|Co|Inc|LLC"
)

# Junk / directory names to filter out — these aren't real local subs
JUNK = re.compile(
    r"\b(Yelp|Angi|Angie|Thumbtack|HomeAdvisor|BBB|Better Business|Houzz|Facebook|"
    r"Yellow ?Pages|Superpages|Manta|Buildzoom|Nextdoor|Google|Bing|Near Me|Top \d|Best \d|"
    r"Reviews|Directory|List|Find|Search|Updated|Reddit|Wikipedia|Indeed|Glassdoor)\b",
    re.IGNORECASE,
)

# Generic marketing lead-ins that signal a directory listing, not a company name
GENERIC_START = re.compile(
    r"^(Top|Best|Compare|Local|Rated|From|Your|Cheap|Affordable|Trusted|Leading|Professional|"
    r"Expert|Quality|Reliable|Licensed|Certified|Emergency|Same|Free|Get|Hire|Find|Need|"
    r"Home|Residential|Commercial|The|A|An|Our|My)\b",
    re.IGNORECASE,
)

COMPANY_RE = re.compile(
    r"\b([A-Z][A-Za-z&'.\-]+(?:\s+[A-Z][A-Za-z&'.\-]+){0,3}\s+(?:" + TRADE_SUFFIXES + r"))\b"
)


def clean_html(s):
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"&amp;", "&", s)
    s = re.sub(r"&#x27;|&#39;", "'", s)
    s = re.sub(r"&quot;", '"', s)
    s = re.sub(r"&[a-z]+;", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def extract_companies(text):
    out, seen = [], set()
    for m in COMPANY_RE.findall(text):
        name = m.strip(" .,-")
        if len(name) < 6:
            continue
        if JUNK.search(name):
            continue
        if GENERIC_START.match(name):
            continue
        # Must contain at least one capitalized proper-noun-ish word before the suffix
        words = name.split()
        if len(words) < 2:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out


def search_ddg_lite(query):
    """lite.duckduckgo.com — returns titles + snippets even to bots."""
    try:
        url = f"https://lite.duckduckgo.com/lite/?q={requests.utils.quote(query)}"
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return []
        # Titles in result-link anchors + surrounding snippet cells
        chunks = re.findall(r'class="result-link"[^>]*>(.*?)</a>', r.text, re.DOTALL)
        chunks += re.findall(r'class="result-snippet"[^>]*>(.*?)</td>', r.text, re.DOTALL)
        # Also scan the whole cleaned body as a last resort
        blob = " ".join(clean_html(c) for c in chunks)
        blob += " " + clean_html(r.text)
        return extract_companies(blob)
    except Exception:
        return []


def search_bing(query):
    try:
        url = f"https://www.bing.com/search?q={requests.utils.quote(query)}"
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return []
        titles = re.findall(r"<h2>(.*?)</h2>", r.text, re.DOTALL)
        blob = " ".join(clean_html(t) for t in titles)
        return extract_companies(blob)
    except Exception:
        return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--query", required=True)
    ap.add_argument("--location", default="")
    args = ap.parse_args()

    q = f"{args.query} contractors {args.location} reviews".strip()

    results, seen = [], set()
    for fn in (search_ddg_lite, search_bing):
        for name in fn(q):
            k = name.lower()
            if k not in seen:
                seen.add(k)
                results.append(name)
        if len(results) >= 8:
            break

    print(json.dumps(results[:10]))


if __name__ == "__main__":
    main()
