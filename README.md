# HealthHMO Provider Locator

A GitHub-first HMO provider locator built around the existing HealthHMO provider GeoJSON files.

## What it does

1. Reads the enrollee GeoJSON.
2. Reads all provider GeoJSON files.
3. Standardizes provider attributes.
4. Builds a lightweight provider index for the browser.
5. Precomputes enrollee-home/provider eligibility relationships.
6. Uses the enrollee plan and provider `HMO Plan` to determine eligibility.
7. Publishes the web application through GitHub Pages.
8. Allows a user to search by enrollee name or ID.
9. Supports 100 m, 200 m, 500 m and 1 km radius searches.
10. Supports an alternate location using browser geolocation or a typed address.

## Expected enrollee GeoJSON

Place the file at:

`Enrollees.geojson`

The script is deliberately tolerant of common field names.

Recommended fields:

- `Name` or `ENROLLEE_NAME`
- `Enrollee ID` or `ENROLLEE_ID`
- `Address`
- `HMO Plan` or `PLAN`

The enrollee feature geometry must be a Point in WGS84 longitude/latitude.

Example:

```json
{
  "type": "Feature",
  "properties": {
    "Name": "John Adigun",
    "Enrollee ID": "ENR-00184",
    "Address": "Ikeja, Lagos",
    "HMO Plan": "Plan1"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [3.3515, 6.6018]
  }
}
```

## Important

The current provider data in the repository uses `HMO Plan`, for example `Plan1`, `Plan2`, etc. The eligibility engine compares normalized enrollee and provider plan values.

## GitHub Pages setup

1. Push the implementation files into the repository.
2. Put `Enrollees.geojson` in the repository root.
3. Go to **Settings → Pages**.
4. Select **GitHub Actions** as the source.
5. Push to `main`.

The workflow builds the data and deploys `docs/` to GitHub Pages.

## Data privacy

Do not place real enrollee names, addresses or identifiable healthcare data in a public repository. Use a private repository for real operational data and review applicable data-protection requirements before deployment.

## Processing architecture

```text
Provider GeoJSON files
          +
Enrollees.geojson
          |
          v
Python build_data.py
          |
          +--> generated/providers.json
          +--> generated/enrollees.json
          +--> generated/home_matches.json
          |
          v
GitHub Pages
          |
          v
Browser radius + plan filtering
```

## Why the browser handles alternate locations

Home-location relationships are precomputed by Python for fast lookup.

For an alternate location, the browser calculates distances against the provider index immediately. This avoids starting a GitHub Actions job for every search.

For a production HMO deployment, use a private repository and move sensitive data away from public static hosting.
