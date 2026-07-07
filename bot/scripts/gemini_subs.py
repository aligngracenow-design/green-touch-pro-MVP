#!/usr/bin/env python3
"""
gemini_subs.py — Find real subcontractors via Gemini + Google Search grounding,
then verify each against the live VA DPOR license board.

This replaces the dead free-scraper (find_subs.py) with a source that actually
returns real, current businesses WITH citations, then adds hard license truth
from va_license.py.

Usage:
  python3 gemini_subs.py --trade drywall --city Woodbridge --state VA
  python3 gemini_subs.py --trade electrician --location "Ashburn VA 20147" --verify

Env:
  GEMINI_API_KEY  (required)

Output: JSON { query, subs:[{name, phone, address, website, license:{...}}], sources:[...] }
Never throws — prints {"error":...,"subs":[]} on failure.
"""
import sys, os, json, re, argparse

try:
    import requests
except ImportError:
    print(json.dumps({"error": "requests not installed", "subs": []}))
    sys.exit(0)

GEMINI_URL = ("https://generativelanguage.googleapis.com/v1beta/models/"
              "gemini-flash-latest:generateContent")


def _load_env_key():
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key:
        return key
    # Fall back to reading .env next to the project root
    here = os.path.dirname(os.path.abspath(__file__))
    for envp in (os.path.join(here, "..", ".env"), os.path.join(here, "..", "..", "green-touch-pro-react", ".env")):
        try:
            with open(envp) as f:
                for line in f:
                    if line.startswith("GEMINI_API_KEY="):
                        return line.split("=", 1)[1].strip().strip('"').strip("'")
        except OSError:
            continue
    return ""


def find_subs(trade, location, api_key, limit=6):
    """Ask Gemini (with live Google Search) for real subs. Returns (subs, sources)."""
    prompt = (
        f"Find {limit} real, currently-operating {trade} subcontractor companies in "
        f"{location}. For EACH, return the exact company name, phone number, street "
        f"address (if available), and website (if available). Only list real businesses "
        f"you can find in search results. Format your answer as a strict JSON array of "
        f'objects with keys: "name", "phone", "address", "website". Return ONLY the JSON '
        f"array, no prose, no markdown fences."
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "tools": [{"google_search": {}}],
    }
    try:
        r = requests.post(
            GEMINI_URL,
            headers={"Content-Type": "application/json", "X-goog-api-key": api_key},
            json=body, timeout=90,
        )
        if r.status_code != 200:
            return [], [], f"Gemini HTTP {r.status_code}: {r.text[:160]}"
        data = r.json()
    except Exception as e:
        return [], [], f"Gemini request failed: {str(e)[:160]}"

    try:
        cand = data["candidates"][0]
        text = cand["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        return [], [], "Gemini returned no usable content"

    # Sources / citations
    sources = []
    gm = cand.get("groundingMetadata", {})
    for ch in gm.get("groundingChunks", []):
        w = ch.get("web", {})
        if w.get("title"):
            sources.append(w["title"])

    # Parse the JSON array out of the text (strip any stray fences)
    txt = re.sub(r"```(?:json)?", "", text).strip("` \n")
    m = re.search(r"\[.*\]", txt, re.S)
    subs = []
    if m:
        try:
            subs = json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    if not subs:
        # Fallback: line-based extraction of "Name — phone"
        for line in text.splitlines():
            nm = re.search(r"\*\*(.+?)\*\*", line) or re.search(r"^\d+\.\s*(.+)", line.strip())
            ph = re.search(r"\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}", line)
            if nm:
                subs.append({"name": nm.group(1).strip(), "phone": ph.group(0) if ph else "",
                             "address": "", "website": ""})

    # Normalize
    clean = []
    seen = set()
    for s in subs[:limit]:
        if not isinstance(s, dict):
            continue
        name = (s.get("name") or "").strip()
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        clean.append({
            "name": name,
            "phone": (s.get("phone") or "").strip(),
            "address": (s.get("address") or "").strip(),
            "website": (s.get("website") or "").strip(),
        })
    return clean, sources, None


def _verify_license(company, state):
    """Cross-check against the state license board (VA supported)."""
    try:
        import importlib.util
        here = os.path.dirname(os.path.abspath(__file__))
        spec = importlib.util.spec_from_file_location("va_license", os.path.join(here, "va_license.py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod.verify_va_license(company)
    except Exception as e:
        return {"verified": False, "status": "Unavailable", "reason": str(e)[:100]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--trade", required=True)
    ap.add_argument("--city", default="")
    ap.add_argument("--state", default="VA")
    ap.add_argument("--zip", default="")
    ap.add_argument("--location", default="")
    ap.add_argument("--limit", type=int, default=6)
    ap.add_argument("--verify", action="store_true", help="Cross-check licenses (slower)")
    args = ap.parse_args()

    api_key = _load_env_key()
    if not api_key:
        print(json.dumps({"error": "GEMINI_API_KEY not set", "subs": []}))
        return

    location = args.location or " ".join(filter(None, [args.city, args.state, args.zip]))
    subs, sources, err = find_subs(args.trade, location, api_key, args.limit)
    if err and not subs:
        print(json.dumps({"error": err, "subs": []}))
        return

    if args.verify:
        for s in subs:
            v = _verify_license(s["name"], args.state)
            s["license"] = {
                "verified": v.get("verified", False),
                "status": v.get("status"),
                "number": v.get("license_number"),
                "class": v.get("class"),
                "expiration_date": v.get("expiration_date"),
                "matched_name": v.get("matched_name"),
            }

    print(json.dumps({
        "query": f"{args.trade} in {location}",
        "count": len(subs),
        "subs": subs,
        "sources": sources[:8],
    }, indent=2))


if __name__ == "__main__":
    main()
