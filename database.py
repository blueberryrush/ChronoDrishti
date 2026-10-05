import os
import datetime
import hashlib
from dotenv import load_dotenv
from supabase import create_client, Client

# Load secrets from .env file
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("\n[!] WARNING: Supabase keys missing in .env file!\n")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def init_db():
    # Supabase tables are created via web SQL editor, no local init needed
    pass

def get_all_cases():
    try:
        response = supabase.table("cases").select("*").order("created_at", desc=True).execute()
        return response.data
    except Exception as e:
        print("[DB Error] Fetch cases failed:", e)
        return []

def create_case(case_id, fir_number, police_station, seized_device, officer):
    try:
        now = datetime.datetime.now().isoformat()
        m_hash = hashlib.sha256(f"{case_id}{fir_number}{now}".encode()).hexdigest()
        
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
        print("[DB Error] Insert case failed:", e)
        return "error_hash"

def get_audit_logs(case_id):
    try:
        response = supabase.table("audit_logs").select("*").eq("case_id", case_id).order("id", desc=True).limit(20).execute()
        return response.data
    except Exception as e:
        print("[DB Error] Fetch logs failed:", e)
        return []

def log_action(case_id, action, details, officer="Insp. S. Sharma"):
    try:
        supabase.table("audit_logs").insert({
            "case_id": case_id,
            "action": action,
            "details": details,
            "officer": officer
        }).execute()
    except Exception as e:
        print("[DB Error] Log action failed:", e)

def get_bookmarks(case_id):
    try:
        response = supabase.table("bookmarks").select("*").eq("case_id", case_id).order("id", desc=True).execute()
        return response.data
    except Exception as e:
        print("[DB Error] Fetch bookmarks failed:", e)
        return []

def add_bookmark(case_id, timecode, frame_number, label, notes="Examiner Flag"):
    try:
        supabase.table("bookmarks").insert({
            "case_id": case_id,
            "timecode": timecode,
            "frame_number": frame_number,
            "label": label,
            "notes": notes
        }).execute()
    except Exception as e:
        print("[DB Error] Add bookmark failed:", e)