from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "generated"

ENROLLEE_FILE = ROOT / os.getenv("ENROLLEE_FILE", "Enrollees.geojson")

PROVIDER_FILES = {
    "Hospital": "Hospitals.geojson",
    "Dental": "Dental_Clinics.geojson",
    "Optician": "Optical_Clinics.geojson",
    "Paediatrics": "Paediatrics_Clinics.geojson",
    "Pharmacy": "Pharmacies.geojson",
    "Physiotherapy": "Physiotherapy_Clinics.geojson",
}


def norm(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().lower().split())


def first_value(props: dict[str, Any], names: list[str], default: Any = None) -> Any:
    normalized = {norm(k): v for k, v in props.items()}
    for name in names:
        if norm(name) in normalized:
            return normalized[norm(name)]
    return default


def point_coordinates(feature: dict[str, Any]) -> tuple[float, float]:
    geometry = feature.get("geometry") or {}
    if geometry.get("type") != "Point":
        raise ValueError("Every enrollee and provider feature must be a Point.")
    coordinates = geometry.get("coordinates") or []
    if len(coordinates) < 2:
        raise ValueError("Point geometry has no valid coordinates.")
    return float(coordinates[0]), float(coordinates[1])


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371008.8 * 2 * math.asin(math.sqrt(h))


def load_geojson(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Missing required file: {path}")
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def build_providers() -> list[dict[str, Any]]:
    providers: list[dict[str, Any]] = []
    provider_number = 1

    for provider_type, filename in PROVIDER_FILES.items():
        path = ROOT / filename
        if not path.exists():
            print(f"WARNING: {filename} not found. Skipping.")
            continue

        data = load_geojson(path)

        for feature in data.get("features", []):
            props = feature.get("properties") or {}
            lon, lat = point_coordinates(feature)

            name = first_value(props, ["Name", "Provider Name", "PROVIDER_NAME"], "Unnamed provider")
            address = first_value(props, ["Address", "ADDRESS"], "")
            plan = first_value(props, ["HMO Plan", "HMO_PLAN", "Plan", "PLAN"], "")
            state = first_value(props, ["State", "STATE"], "")
            lga = first_value(props, ["LGA"], "")
            service_type = first_value(props, ["ServiceTyp", "Service Type", "SERVICE_TYPE"], "")
            email = first_value(props, ["Email Address", "Email", "EMAIL"], "")
            phone = first_value(props, ["Phone Number", "Phone", "PHONE"], "")

            providers.append({
                "provider_id": f"PROV-{provider_number:06d}",
                "name": name,
                "type": provider_type,
                "address": address,
                "state": state,
                "lga": lga,
                "plan": str(plan).strip(),
                "plan_normalized": norm(plan),
                "service_type": service_type,
                "email": email,
                "phone": phone,
                "lon": lon,
                "lat": lat,
            })
            provider_number += 1

    return providers


def build_enrollees() -> list[dict[str, Any]]:
    data = load_geojson(ENROLLEE_FILE)
    enrollees: list[dict[str, Any]] = []

    for index, feature in enumerate(data.get("features", []), start=1):
        props = feature.get("properties") or {}
        lon, lat = point_coordinates(feature)

        name = first_value(
            props,
            ["Name", "Enrollee Name", "ENROLLEE_NAME", "NAME"],
            f"Enrollee {index}",
        )
        enrollee_id = first_value(
            props,
            ["Enrollee ID", "ENROLLEE_ID", "ID", "Build_ID"],
            f"ENR-{index:06d}",
        )
        address = first_value(props, ["Address", "ADDRESS"], "")
        plan = first_value(
            props,
            ["HMO Plan", "HMO_PLAN", "Plan", "PLAN", "Plan Name"],
            "",
        )

        enrollees.append({
            "enrollee_id": str(enrollee_id),
            "name": str(name),
            "address": str(address or ""),
            "plan": str(plan or ""),
            "plan_normalized": norm(plan),
            "lon": lon,
            "lat": lat,
        })

    return enrollees


def build_home_matches(
    enrollees: list[dict[str, Any]],
    providers: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    matches: dict[str, list[dict[str, Any]]] = {}

    for enrollee in enrollees:
        enrollee_point = (enrollee["lon"], enrollee["lat"])
        enrollee_matches = []

        for provider in providers:
            distance = haversine_m(
                enrollee_point,
                (provider["lon"], provider["lat"]),
            )

            if distance <= 1000:
                enrollee_matches.append({
                    "provider_id": provider["provider_id"],
                    "distance_m": round(distance, 1),
                    "plan_eligible": (
                        enrollee["plan_normalized"] != ""
                        and enrollee["plan_normalized"] == provider["plan_normalized"]
                    ),
                })

        matches[enrollee["enrollee_id"]] = sorted(
            enrollee_matches,
            key=lambda item: item["distance_m"],
        )

    return matches


def write_json(filename: str, payload: Any) -> None:
    GENERATED.mkdir(exist_ok=True)
    path = GENERATED / filename
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))


def main() -> None:
    print("Building HealthHMO data index...")
    providers = build_providers()
    enrollees = build_enrollees()
    home_matches = build_home_matches(enrollees, providers)

    write_json("providers.json", providers)
    write_json("enrollees.json", enrollees)
    write_json("home_matches.json", home_matches)

    summary = {
        "provider_count": len(providers),
        "enrollee_count": len(enrollees),
        "generated_at": __import__("datetime").datetime.now().isoformat(),
    }
    write_json("metadata.json", summary)

    print(f"Providers indexed: {len(providers)}")
    print(f"Enrollees indexed: {len(enrollees)}")
    print("Generated: providers.json, enrollees.json, home_matches.json, metadata.json")


if __name__ == "__main__":
    main()
