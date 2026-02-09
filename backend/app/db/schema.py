import sqlite3
from pathlib import Path

def init_db(db_path: str, migration_sql_path: str) -> None:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    try:
        with open(migration_sql_path, "r", encoding="utf-8") as f:
            con.executescript(f.read())
        con.commit()
    finally:
        con.close()
