import json
import uuid
from typing import Any, Dict, List, Optional

DEFAULT_PRIORITY = ["career_url", "greenhouse", "lever"]

def _row_to_company_dict(row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "company_name": row["company_name"],
        "employer_name": row["employer_name"],
        "sources": json.loads(row["sources_json"]),
        "source_priority": json.loads(row["source_priority_json"]),
        "fetch_mode": row["fetch_mode"],
    }

def list_companies(con, user_id: str) -> List[Dict[str, Any]]:
    rows = con.execute(
        "SELECT * FROM companies WHERE user_id=? ORDER BY company_name ASC",
        (user_id,),
    ).fetchall()
    return [_row_to_company_dict(r) for r in rows]

def get_company(con, company_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    row = con.execute(
        "SELECT * FROM companies WHERE id=? AND user_id=?",
        (company_id, user_id),
    ).fetchone()
    return _row_to_company_dict(row) if row else None

def create_company(con, user_id: str, company: Dict[str, Any]) -> Dict[str, Any]:
    company_id = str(uuid.uuid4())
    sources = company.get("sources") or []
    priority = company.get("source_priority") or DEFAULT_PRIORITY
    fetch_mode = company.get("fetch_mode") or "all"

    con.execute(
        """
        INSERT INTO companies (id, user_id, company_name, employer_name, sources_json, source_priority_json, fetch_mode)
        VALUES (?,?,?,?,?,?,?)
        """,
        (
            company_id,
            user_id,
            company["company_name"],
            company.get("employer_name"),
            json.dumps(sources),
            json.dumps(priority),
            fetch_mode,
        ),
    )
    con.commit()
    return get_company(con, company_id, user_id)

def update_company(con, company_id: str, user_id: str, company: Dict[str, Any]) -> Dict[str, Any]:
    sources = company.get("sources") or []
    priority = company.get("source_priority") or DEFAULT_PRIORITY
    fetch_mode = company.get("fetch_mode") or "all"

    con.execute(
        """
        UPDATE companies
        SET company_name=?, employer_name=?, sources_json=?, source_priority_json=?, fetch_mode=?
        WHERE id=? AND user_id=?
        """,
        (
            company["company_name"],
            company.get("employer_name"),
            json.dumps(sources),
            json.dumps(priority),
            fetch_mode,
            company_id,
            user_id,
        ),
    )
    con.commit()
    updated = get_company(con, company_id, user_id)
    if not updated:
        raise KeyError("Company not found")
    return updated

def delete_company(con, company_id: str, user_id: str) -> None:
    con.execute(
        "DELETE FROM companies WHERE id=? AND user_id=?",
        (company_id, user_id),
    )
    con.commit()
