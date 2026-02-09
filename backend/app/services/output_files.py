import csv
import json
import os

FIELDS = [
    "dedupe_key","first_seen","past_h1b_support","source_type","company_name",
    "job_id","title","location","department","team","date_posted","url","description"
]

def write_json(path: str, jobs: list[dict]) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)

def write_csv(path: str, jobs: list[dict]) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for j in jobs:
            row = {k: j.get(k, "") for k in FIELDS}
            w.writerow(row)
    os.replace(tmp, path)
