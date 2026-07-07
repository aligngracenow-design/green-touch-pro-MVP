#!/usr/bin/env python3
"""
places_subs.py — Google Places API sub-finder (production-grade)
Replaces the dead free-scraping approach with real Google Places data.

Requires: GOOGLE_PLACES_API_KEY in environment (or --key argument)
Free tier: $200/mo credit → ~5,000 place searches at no cost

Usage:
  python3 places_subs.py --trade "electrician" --city "Ashburn" --state "VA"
  python3 places_subs.py --trade "drywall" --location "20147"
"""
import sys, json, os, argparse, urllib.parse, urllib.request

PLACES_API = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_DETAILS = "https://maps.googleapis.com/maps/api/place/details/json"

def search_places(query, api_key, location_hint=""):
    """Search Google Places for contractors by trade + location."""
    params = {"query": query, "key": api_key, "type": "contractor"}
    if location_hint:
        params["location"] = location_hint
    url = f"{PLACES_API}?{urllib.parse.urlencode(params)}"

    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        return {"error": str(e), "results": []}

    return data

def get_details(place_id, api_key):
    """Fetch detailed info including phone, website, rating, reviews."""
    params = {"place_id": place_id, "key": api_key,
              "fields": "name,formatted_address,formatted_phone_number,website,"
                        "rating,user_ratings_total,price_level,opening_hours"}
    url = f"{PLACES_DETAILS}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            return json.loads(resp.read()).get("result", {})
    except:
        return {}

def format_subs(places_data, api_key, top_n=10):
    """Format Google Places results into sub objects with vetting scores."""
    results = places_data.get("results", [])
    subs = []

    for place in results[:top_n]:
        name = place.get("name", "")
        address = place.get("formatted_address", "")
        rating = place.get("rating", 0)
        total_ratings = place.get("user_ratings_total", 0)
        place_id = place.get("place_id", "")

        # Compute vetting score (0-100)
        score = 0
        if rating >= 4.5:
            score += 45
        elif rating >= 4.0:
            score += 35
        elif rating >= 3.5:
            score += 25
        elif rating > 0:
            score += 15

        if total_ratings >= 100:
            score += 20
        elif total_ratings >= 50:
            score += 15
        elif total_ratings >= 20:
            score += 10
        elif total_ratings >= 5:
            score += 5

        # Base professionalism score
        score += 20

        color = "green" if score >= 70 else ("yellow" if score >= 45 else "red")

        sub = {
            "name": name,
            "trade": places_data.get("query_trade", ""),
            "address": address,
            "google_rating": rating,
            "google_reviews": total_ratings,
            "place_id": place_id,
            "score": min(score, 100),
            "color": color,
            "source": "google_places",
        }

        # Fetch detailed info (phone, website)
        if place_id:
            details = get_details(place_id, api_key)
            sub["phone"] = details.get("formatted_phone_number", "")
            sub["website"] = details.get("website", "")

        subs.append(sub)

    return subs

def main():
    ap = argparse.ArgumentParser(description="Google Places Subcontractor Finder")
    ap.add_argument("--trade", required=True, help="Trade/specialty (e.g., electrician, drywall)")
    ap.add_argument("--city", default="", help="City name")
    ap.add_argument("--state", default="VA", help="State code")
    ap.add_argument("--zip", default="", help="ZIP code")
    ap.add_argument("--location", default="", help="Combined location string")
    ap.add_argument("--key", default="", help="Google Places API key (or set GOOGLE_PLACES_API_KEY)")
    ap.add_argument("--limit", type=int, default=10, help="Max results")
    args = ap.parse_args()

    api_key = args.key or os.environ.get("GOOGLE_PLACES_API_KEY", "")
    if not api_key:
        print(json.dumps({"error": "No API key. Set GOOGLE_PLACES_API_KEY or pass --key.", "results": []}))
        sys.exit(1)

    # Build search query
    loc = args.location or " ".join(filter(None, [args.city, args.state, args.zip]))
    query = f"{args.trade} contractors {loc}".strip()

    data = search_places(query, api_key, loc)
    data["query_trade"] = args.trade

    if "error" in data:
        print(json.dumps(data))
        sys.exit(1)

    subs = format_subs(data, api_key, args.limit)

    output = {
        "query": query,
        "total_found": len(data.get("results", [])),
        "returned": len(subs),
        "subs": subs,
    }
    print(json.dumps(output, indent=2))

if __name__ == "__main__":
    main()
