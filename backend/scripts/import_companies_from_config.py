import os
import json
import sqlite3
import uuid

DB_PATH = os.environ.get("DB_PATH", "./job_watcher.sqlite3")
CONFIG_PATH = os.environ.get("CONFIG_PATH", "./config.json")

DEFAULT_USER_ID = "default"

def normalize_company_key(name: str) -> str:
    return (name or "").strip()

def main():
    abs_cfg = os.path.abspath(CONFIG_PATH)
    if not os.path.exists(abs_cfg):
        raise FileNotFoundError(f"config.json not found at: {abs_cfg}")

    with open(abs_cfg, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    sources_list = cfg.get("sources") or []
    if not isinstance(sources_list, list):
        raise ValueError("config['sources'] must be a list")

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row

    inserted = 0
    skipped = 0

    # We will group sources by company label/name when config is "per source entry"
    companies_map = {}  # company_name -> {"company_name":..., "sources":[...]}

    for s in sources_list:
        if not isinstance(s, dict):
            skipped += 1
            continue

        # --- Support your current format ---
        # Example: { "type": "greenhouse", "company_slug": "airbnb", "label": "Airbnb" }
        label = s.get("label") or s.get("company") or s.get("company_name")
        company_name = normalize_company_key(label)

        src_type = (s.get("type") or "").strip()
        company_slug = (s.get("company_slug") or "").strip()
        url = (s.get("url") or s.get("career_url") or "").strip()
        mode = (s.get("mode") or "requests") if src_type == "career_url" else None

        # --- Support old format too ---
        # { company: "...", greenhouse_slug: "...", lever_slug: "...", career_url: "..." }
        if not company_name and (s.get("greenhouse_slug") or s.get("lever_slug") or s.get("career_url")):
            company_name = normalize_company_key(s.get("company") or s.get("company_name") or "")

        if not company_name:
            skipped += 1
            continue

        if company_name not in companies_map:
            companies_map[company_name] = {
                "company_name": company_name,
                "sources": [],
            }

        # Translate to DB source model
        if src_type in ("greenhouse", "lever"):
            slug = company_slug or (s.get("greenhouse_slug") if src_type == "greenhouse" else s.get("lever_slug")) or ""
            slug = slug.strip()
            if slug:
                companies_map[company_name]["sources"].append({
                    "type": src_type,
                    "slug": slug,
                    "url": None,
                    "mode": None,
                    "notes": s.get("notes", "") or ""
                })
        elif src_type == "career_url":
            if url:
                companies_map[company_name]["sources"].append({
                    "type": "career_url",
                    "slug": None,
                    "url": url,
                    "mode": mode,
                    "notes": s.get("notes", "") or ""
                })
        else:
            # ignore unknown types
            skipped += 1

    # Insert companies into DB (de-dupe by company_name)
    for company_name, obj in companies_map.items():
        # Check existing
        row = con.execute(
            "SELECT id FROM companies WHERE user_id=? AND company_name=?",
            (DEFAULT_USER_ID, company_name),
        ).fetchone()
        if row:
            skipped += 1
            continue

        company_id = str(uuid.uuid4())
        con.execute(
            """
            INSERT INTO companies (id, user_id, company_name, employer_name, sources_json, source_priority_json, fetch_mode)
            VALUES (?,?,?,?,?,?,?)
            """,
            (
                company_id,
                DEFAULT_USER_ID,
                company_name,
                None,
                json.dumps(obj["sources"]),
                json.dumps(["career_url", "greenhouse", "lever"]),
                "all",
            ),
        )
        inserted += 1

    con.commit()
    con.close()
    print(f"Done. inserted={inserted} skipped={skipped}")

if __name__ == "__main__":
    main()
