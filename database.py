import os
import sqlite3
import datetime
import hashlib

# ==============================================================================
# CHRONODRISHTI PERSISTENCE LAYER
# ------------------------------------------------------------------------------
# Cloud backend (Supabase) is used when the SDK + credentials are available.
# If either is missing, or the cloud client cannot be constructed, the module
# transparently falls back to a local SQLite ledger so that app.py never
# crashes and every /api/* endpoint keeps functioning offline / air-gapped.
# ==============================================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IS_VERCEL = os.environ.get("VERCEL") == "1"
_DB_DIR = "/tmp/evidence_vault" if IS_VERCEL else os.path.join(BASE_DIR, "evidence_vault")
LOCAL_DB_PATH = os.path.join(_DB_DIR, "chronodrishti_master.db")

# --- Optional cloud backend ---------------------------------------------------
# Import the optional third-party SDKs defensively: their absence must NOT
# break `import database`.
try:
    from dotenv import load_dotenv
    from supabase import create_client, Client  # noqa: F401  (Client kept for API parity)

    load_dotenv(os.path.join(BASE_DIR, ".env"))
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")

    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ImportError("Supabase credentials missing in .env")

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    DB_MODE = "supabase"
    print("[DB] Supabase cloud backend active.")
except ImportError as e:
    supabase = None
    Client = None
    DB_MODE = "local"
    print(f"[DB] Cloud backend unavailable ({e}); using local SQLite at {LOCAL_DB_PATH}")
except Exception as e:  # malformed keys, client init errors, etc.
    supabase = None
    Client = None
    DB_MODE = "local"
    print(f"[DB] Supabase init failed ({e}); using local SQLite at {LOCAL_DB_PATH}")


# ==============================================================================
# LOCAL SQLITE FALLBACK
# ==============================================================================
def _local_connect():
    db_dir = os.path.dirname(LOCAL_DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(LOCAL_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _local_init():
    conn = _local_connect()
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS cases (
                case_id TEXT PRIMARY KEY,
                fir_number TEXT,
                police_station TEXT,
                seized_device TEXT,
                investigating_officer TEXT,
                master_hash TEXT,
                status TEXT DEFAULT 'INGESTED',
                created_at TEXT
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id TEXT,
                action TEXT,
                details TEXT,
                officer TEXT,
                created_at TEXT
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS bookmarks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id TEXT,
                timecode TEXT,
                frame_number INTEGER,
                label TEXT,
                notes TEXT,
                created_at TEXT
            )
        """)
        conn.commit()
    finally:
        conn.close()


# ==============================================================================
# PUBLIC API (same signatures as the original module)
# ==============================================================================
def init_db():
    """Provision storage. Supabase tables are created via the web SQL editor;
    the local SQLite schema is created here on demand."""
    if DB_MODE == "local":
        _local_init()
    # Supabase: tables are provisioned externally, no local init needed.


def get_all_cases():
    try:
        if DB_MODE == "supabase":
            response = supabase.table("cases").select("*").order("created_at", desc=True).execute()
            return response.data or []
    except Exception as e:
        print("[DB Error] Supabase fetch cases failed, using local fallback:", e)

    try:
        conn = _local_connect()
        try:
            rows = conn.execute("SELECT * FROM cases ORDER BY created_at DESC").fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
    except Exception as e:
        print("[DB Error] Fetch cases failed:", e)
        return []


def create_case(case_id, fir_number, police_station, seized_device, officer):
    now = datetime.datetime.now().isoformat()
    m_hash = hashlib.sha256(f"{case_id}{fir_number}{now}".encode()).hexdigest()

    if DB_MODE == "supabase":
        try:
            # Insert into Cloud Cases Table
            supabase.table("cases").insert({
                "case_id": case_id,
                "fir_number": fir_number,
                "police_station": police_station,
                "seized_device": seized_device,
                "investigating_officer": officer,
                "master_hash": m_hash,
                "status": "INGESTED"
            }).execute()

            # Log to Cloud Audit Trail
            log_action(case_id, "CASE_REGISTERED", f"Registered FIR {fir_number} via API key handshake", officer)
            return m_hash
        except Exception as e:
            print("[DB Error] Supabase insert case failed, using local fallback:", e)

    try:
        conn = _local_connect()
        try:
            conn.execute("""
                INSERT OR REPLACE INTO cases
                (case_id, fir_number, police_station, seized_device, investigating_officer, master_hash, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (case_id, fir_number, police_station, seized_device, officer, m_hash, "INGESTED", now))
            conn.commit()
        finally:
            conn.close()
        log_action(case_id, "CASE_REGISTERED", f"Registered FIR {fir_number} via local ledger", officer)
        return m_hash
    except Exception as e:
        print("[DB Error] Insert case failed:", e)
        return "error_hash"


def get_audit_logs(case_id):
    try:
        if DB_MODE == "supabase":
            response = supabase.table("audit_logs").select("*").eq("case_id", case_id).order("id", desc=True).limit(20).execute()
            return response.data or []
    except Exception as e:
        print("[DB Error] Supabase fetch logs failed, using local fallback:", e)

    try:
        conn = _local_connect()
        try:
            rows = conn.execute(
                "SELECT * FROM audit_logs WHERE case_id = ? ORDER BY id DESC LIMIT 20",
                (case_id,)
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
    except Exception as e:
        print("[DB Error] Fetch logs failed:", e)
        return []


def log_action(case_id, action, details, officer="Insp. S. Sharma"):
    if DB_MODE == "supabase":
        try:
            supabase.table("audit_logs").insert({
                "case_id": case_id,
                "action": action,
                "details": details,
                "officer": officer
            }).execute()
            return
        except Exception as e:
            print("[DB Error] Supabase log action failed, using local fallback:", e)

    try:
        conn = _local_connect()
        try:
            conn.execute("""
                INSERT INTO audit_logs (case_id, action, details, officer, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (case_id, action, details, officer, datetime.datetime.now().isoformat()))
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        print("[DB Error] Log action failed:", e)


def get_bookmarks(case_id):
    try:
        if DB_MODE == "supabase":
            response = supabase.table("bookmarks").select("*").eq("case_id", case_id).order("id", desc=True).execute()
            return response.data or []
    except Exception as e:
        print("[DB Error] Supabase fetch bookmarks failed, using local fallback:", e)

    try:
        conn = _local_connect()
        try:
            rows = conn.execute(
                "SELECT * FROM bookmarks WHERE case_id = ? ORDER BY id DESC",
                (case_id,)
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
    except Exception as e:
        print("[DB Error] Fetch bookmarks failed:", e)
        return []


def add_bookmark(case_id, timecode, frame_number, label, notes="Examiner Flag"):
    if DB_MODE == "supabase":
        try:
            supabase.table("bookmarks").insert({
                "case_id": case_id,
                "timecode": timecode,
                "frame_number": frame_number,
                "label": label,
                "notes": notes
            }).execute()
            return
        except Exception as e:
            print("[DB Error] Supabase add bookmark failed, using local fallback:", e)

    try:
        conn = _local_connect()
        try:
            conn.execute("""
                INSERT INTO bookmarks (case_id, timecode, frame_number, label, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (case_id, timecode, frame_number, label, notes, datetime.datetime.now().isoformat()))
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        print("[DB Error] Add bookmark failed:", e)
