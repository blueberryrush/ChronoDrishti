import sqlite3
import datetime
import os

DB_PATH = "evidence_vault/chronodrishti_master.db"

def init_db():
    os.makedirs("evidence_vault/reports", exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. Cases Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cases (
        case_id TEXT PRIMARY KEY,
        title TEXT,
        fir_number TEXT,
        officer_badge TEXT,
        device_model TEXT,
        master_hash TEXT,
        status TEXT,
        created_at TEXT
    )
    """)

    # 2. Immutable Chain of Custody Audit Log (BSA 2023 Sec 63)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id TEXT,
        action TEXT,
        details TEXT,
        officer TEXT,
        timestamp TEXT
    )
    """)

    # 3. Flagged Incidents / Bookmarks
    cursor.execute("""
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

    # Seed Default Cases if Empty
    cursor.execute("SELECT COUNT(*) FROM cases")
    if cursor.fetchone()[0] == 0:
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S IST")
        cursor.execute("""
            INSERT INTO cases VALUES 
            ('case_101', 'DELHI CANTT SECTOR 4 INCIDENT', 'FIR-2026/DEL-SPL-089', 'NTRO-CHRONO-884', 'Hikvision DS-7208HQHI (2TB)', '9a4c28f117b80c551e18d96204ef88e7b9937102e3b970ac772592dae4182910', 'SEALED & VERIFIED', ?),
            ('case_102', 'HIGHWAY 44 TOLL CHECKPOINT', 'FIR-2026/NH-CHK-014', 'NTRO-CHRONO-912', 'Dahua DH-XVR5108HS (1TB)', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'IN-ANALYSIS', ?)
        """, (now, now))
        
        # Seed Initial Audit Log
        cursor.execute("INSERT INTO audit_logs (case_id, action, details, officer, timestamp) VALUES (?, ?, ?, ?, ?)",
                       ('case_101', 'INGESTION', 'Bit-stream raw clone mounted via hardware write-blocker', 'NTRO-CHRONO-884', now))
        cursor.execute("INSERT INTO audit_logs (case_id, action, details, officer, timestamp) VALUES (?, ?, ?, ?, ?)",
                       ('case_101', 'CARVING', 'Reconstructed 14 orphan NAL units from unallocated sectors', 'NTRO-CHRONO-884', now))
        
        # Seed Initial Bookmark
        cursor.execute("INSERT INTO bookmarks (case_id, timecode, frame_number, label, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                       ('case_101', '22:42:03.200 IST', 45, 'ACOUSTIC SHOCKWAVE', 'Optical flow vibration spike detected on entrance window', now))

    conn.commit()
    conn.close()

def log_action(case_id, action, details, officer="NTRO-CHRONO-884"):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S IST")
    cursor.execute("INSERT INTO audit_logs (case_id, action, details, officer, timestamp) VALUES (?, ?, ?, ?, ?)",
                   (case_id, action, details, officer, now))
    conn.commit()
    conn.close()

def get_audit_logs(case_id):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT timestamp, action, details, officer FROM audit_logs WHERE case_id=? ORDER BY id DESC LIMIT 15", (case_id,))
    rows = cursor.fetchall()
    conn.close()
    return [{"timestamp": r[0], "action": r[1], "details": r[2], "officer": r[3]} for r in rows]

def add_bookmark(case_id, timecode, frame_number, label, notes="Manual Examiner Flag"):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S IST")
    cursor.execute("INSERT INTO bookmarks (case_id, timecode, frame_number, label, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                   (case_id, timecode, frame_number, label, notes, now))
    conn.commit()
    conn.close()

def get_bookmarks(case_id):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, timecode, frame_number, label, notes, created_at FROM bookmarks WHERE case_id=? ORDER BY id DESC", (case_id,))
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "timecode": r[1], "frame": r[2], "label": r[3], "notes": r[4], "created_at": r[5]} for r in rows]