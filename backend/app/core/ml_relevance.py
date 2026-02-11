from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

"""Local ML relevance (optional deps).

This module is intentionally defensive: if scikit-learn isn't installed,
the API server should still start and the app should remain usable.
"""

try:
    from sklearn.feature_extraction.text import TfidfVectorizer  # type: ignore
    from sklearn.linear_model import LogisticRegression  # type: ignore
    import joblib  # type: ignore

    _ML_DEPS_OK = True
    _ML_DEPS_MISSING: List[str] = []
except Exception:  # pragma: no cover
    # Keep imports lazy/optional so the server doesn't crash.
    TfidfVectorizer = None  # type: ignore
    LogisticRegression = None  # type: ignore
    joblib = None  # type: ignore
    _ML_DEPS_OK = False
    _ML_DEPS_MISSING = ["scikit-learn", "joblib"]


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ModelMeta:
    model_id: str
    trained_at: str
    n_samples: int
    n_pos: int
    n_neg: int


class MLRelevance:
    """A lightweight per-user relevance model (TF-IDF + Logistic Regression).

    Storage strategy:
      - model artifacts saved to disk under backend data dir (gitignored)
      - scores stored in DB (job_ml_scores) for fast join + ordering
    """

    def __init__(self, data_dir: str = "./.data"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.model_path = self.data_dir / "ml_model.joblib"
        self.meta_path = self.data_dir / "ml_meta.json"

    def load(self) -> Optional[Tuple[TfidfVectorizer, LogisticRegression, ModelMeta]]:
        if not _ML_DEPS_OK:
            return None
        if not self.model_path.exists() or not self.meta_path.exists():
            return None
        try:
            payload = joblib.load(self.model_path)
            vec = payload["vectorizer"]
            clf = payload["model"]
            meta_raw = json.loads(self.meta_path.read_text(encoding="utf-8"))
            meta = ModelMeta(**meta_raw)
            return vec, clf, meta
        except Exception:
            return None

    def _compute_model_id(self, rows: List[Tuple[str, str, str]]) -> str:
        # rows: (dedupe_key, label, created_at)
        h = hashlib.sha256()
        for dk, lbl, ts in rows:
            h.update((dk or "").encode("utf-8"))
            h.update(b"\x00")
            h.update((lbl or "").encode("utf-8"))
            h.update(b"\x00")
            h.update((ts or "").encode("utf-8"))
            h.update(b"\n")
        return h.hexdigest()

    def train_from_db(
        self,
        con,
        *,
        min_total: int = 20,
        min_pos: int = 5,
        min_neg: int = 5,
    ) -> Tuple[bool, Dict[str, object]]:
        """Train model from latest feedback per dedupe_key.

        Returns (trained, info).
        """

        if not _ML_DEPS_OK:
            return False, {"reason": "deps_missing", "missing": _ML_DEPS_MISSING}

        # latest label per job
        rows = con.execute(
            """
            SELECT f.dedupe_key, f.label, f.created_at
            FROM job_feedback f
            JOIN (
              SELECT dedupe_key, MAX(id) AS max_id
              FROM job_feedback
              GROUP BY dedupe_key
            ) x ON x.dedupe_key = f.dedupe_key AND x.max_id = f.id
            ORDER BY f.created_at DESC, f.id DESC
            """
        ).fetchall()

        latest = [(r["dedupe_key"], r["label"], r["created_at"]) for r in rows]
        if not latest:
            return False, {"reason": "no_feedback"}

        # map to y
        y_map = {
            "include": 1,
            "applied": 1,
            "exclude": 0,
            "ignore": 0,
        }

        keys: List[str] = []
        y: List[int] = []
        for dk, lbl, _ts in latest:
            if lbl not in y_map:
                continue
            keys.append(dk)
            y.append(y_map[lbl])

        n_samples = len(keys)
        n_pos = sum(1 for v in y if v == 1)
        n_neg = n_samples - n_pos

        if n_samples < min_total or n_pos < min_pos or n_neg < min_neg:
            return False, {
                "reason": "not_enough_labels",
                "n_samples": n_samples,
                "n_pos": n_pos,
                "n_neg": n_neg,
                "min_total": min_total,
                "min_pos": min_pos,
                "min_neg": min_neg,
            }

        # Join with jobs_latest to build text
        qmarks = ",".join(["?"] * len(keys))
        job_rows = con.execute(
            f"""
            SELECT dedupe_key, title, COALESCE(department,'' ) AS department,
                   COALESCE(team,'') AS team, COALESCE(description,'') AS description
            FROM jobs_latest
            WHERE dedupe_key IN ({qmarks})
            """,
            keys,
        ).fetchall()

        job_by_key = {r["dedupe_key"]: r for r in job_rows}
        X_text: List[str] = []
        y2: List[int] = []
        used_rows: List[Tuple[str, str, str]] = []
        for (dk, lbl, ts), yy in zip(latest, [y_map.get(lbl) for _, lbl, _ in latest]):
            if dk not in job_by_key:
                continue
            r = job_by_key[dk]
            text = " ".join(
                [
                    (r["title"] or ""),
                    (r["department"] or ""),
                    (r["team"] or ""),
                    (r["description"] or ""),
                ]
            )
            X_text.append(text)
            y2.append(y_map.get(lbl, 0))
            used_rows.append((dk, lbl, ts))

        if len(X_text) < min_total:
            return False, {
                "reason": "not_enough_joined_jobs",
                "n_joined": len(X_text),
                "n_samples": n_samples,
            }

        model_id = self._compute_model_id(used_rows)

        existing = self.load()
        if existing and existing[2].model_id == model_id:
            return False, {
                "reason": "already_trained",
                "model_id": model_id,
                "n_samples": len(X_text),
                "n_pos": sum(1 for v in y2 if v == 1),
                "n_neg": sum(1 for v in y2 if v == 0),
            }

        vec = TfidfVectorizer(
            lowercase=True,
            stop_words="english",
            max_features=6000,
            ngram_range=(1, 2),
            min_df=2,
        )
        X = vec.fit_transform(X_text)
        clf = LogisticRegression(
            solver="liblinear",
            max_iter=200,
            class_weight="balanced",
        )
        clf.fit(X, y2)

        meta = ModelMeta(
            model_id=model_id,
            trained_at=now_utc_iso(),
            n_samples=len(X_text),
            n_pos=sum(1 for v in y2 if v == 1),
            n_neg=sum(1 for v in y2 if v == 0),
        )

        joblib.dump({"vectorizer": vec, "model": clf}, self.model_path)
        self.meta_path.write_text(json.dumps(meta.__dict__, indent=2), encoding="utf-8")

        return True, {"model_id": model_id, **meta.__dict__}

    def score_jobs_latest(self, con) -> Dict[str, object]:
        if not _ML_DEPS_OK:
            return {"ok": False, "reason": "deps_missing", "missing": _ML_DEPS_MISSING}
        loaded = self.load()
        if not loaded:
            return {"ok": False, "reason": "no_model"}
        vec, clf, meta = loaded

        rows = con.execute(
            """
            SELECT dedupe_key, title, COALESCE(department,'') AS department,
                   COALESCE(team,'') AS team, COALESCE(description,'') AS description
            FROM jobs_latest
            """
        ).fetchall()

        if not rows:
            return {"ok": True, "scored": 0, "model_id": meta.model_id}

        texts = []
        keys = []
        for r in rows:
            keys.append(r["dedupe_key"])
            texts.append(
                " ".join(
                    [
                        (r["title"] or ""),
                        (r["department"] or ""),
                        (r["team"] or ""),
                        (r["description"] or ""),
                    ]
                )
            )

        X = vec.transform(texts)
        # proba for class 1 (relevant)
        probs = clf.predict_proba(X)[:, 1]
        now = now_utc_iso()

        con.executemany(
            """
            INSERT INTO job_ml_scores(dedupe_key, ml_prob, model_id, updated_at)
            VALUES(?,?,?,?)
            ON CONFLICT(dedupe_key) DO UPDATE SET
              ml_prob=excluded.ml_prob,
              model_id=excluded.model_id,
              updated_at=excluded.updated_at
            """,
            [(dk, float(p), meta.model_id, now) for dk, p in zip(keys, probs)],
        )

        return {"ok": True, "scored": len(keys), "model_id": meta.model_id}
