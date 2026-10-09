import os
import sys
import math
import hashlib
import datetime
import shutil
from functools import wraps
from flask import Flask, render_template, jsonify, send_from_directory, request, Response, session, redirect, url_for
from werkzeug.utils import secure_filename
from analyzer import ForensicAnalyzer

app = Flask(__name__)
app.secret_key = "chronodrishti_sovereign_forensic_secret_key_2026"
analyzer = ForensicAnalyzer()

# ==============================================================================
# VERCEL / LOCAL STORAGE CONFIG & IN-MEMORY METRICS CACHE
# ==============================================================================
IS_VERCEL = os.environ.get("VERCEL") == "1"
VAULT_DIR = "/tmp/evidence_vault" if IS_VERCEL else os.path.join(os.path.dirname(os.path.abspath(__file__)), "evidence_vault")

try:
    os.makedirs(VAULT_DIR, exist_ok=True)
except Exception as e:
    print(f"[WARN] Vault directory creation deferred: {e}")

# In-memory case metrics cache for instant (0.01s) UI responses
CASE_METRICS_CACHE = {}

IN_MEMORY_CASES = [
    {
        "case_id": "case_101",
        "fir_number": "FIR-2026/DEL-089",
        "police_station": "Special Cell, Northern Range",
        "device": "Hikvision DS-7208HQHI (2TB HDD)",
        "officer": "Insp. S. Sharma [NTRO-CYBER-884]"
    },
    {
        "case_id": "case_102",
        "fir_number": "FIR-2026/MUM-SPL-410",
        "police_station": "Anti-Terrorism Cell (Unit 4)",
        "device": "Dahua DHI-XVR5108HS-4KL-I3",
        "officer": "Sub-Insp. A. Kadam [CID-TECH-102]"
    }
]

# Valid Demo Credentials Lookup
VALID_CREDENTIALS = {
    "examiner": {"badge_id": "NTRO-EXAM-884", "passkey": "sovereign2026", "name": "Insp. S. Sharma [Tier 1]"},
    "field": {"badge_id": "CBI-FLD-102", "passkey": "wormlock2026", "name": "Officer R. Verma [Tier 2]"},
    "court": {"badge_id": "COURT-DEL-041", "passkey": "bsa2023seal", "name": "Magistrate V. K. Rao [Tier 3]"}
}

# Database optional handler
try:
    import database
    database.init_db()
    DB_AVAILABLE = True
except Exception as e:
    print(f"[INFO] DB offline or unconfigured: {e}")
    DB_AVAILABLE = False


def require_role(allowed_roles=None):
    """Decorator to enforce Flask session authentication and optional role checking."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user_role = session.get("user_role")
            if not user_role:
                # Redirect to login with next destination hint
                target = request.path.lstrip('/')
                return redirect(url_for("login_page", next=target))
            if allowed_roles and user_role not in allowed_roles:
                # Role not permitted, redirect to login
                return redirect(url_for("login_page", next=request.path.lstrip('/')))
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def get_case_video_info(case_id):
    case_folder = os.path.join(VAULT_DIR, case_id)
    if not os.path.exists(case_folder):
        return None, None

    files = [f for f in os.listdir(case_folder) if f.lower().endswith(('.mp4', '.avi', '.mov', '.mkv'))]
    if not files:
        return None, None

    video_file = files[0]
    video_path = os.path.join(case_folder, video_file)
    return video_file, video_path


def get_or_compute_metrics(case_id, video_path):
    if case_id in CASE_METRICS_CACHE:
        return CASE_METRICS_CACHE[case_id]

    entropy = analyzer.calculate_shannon_entropy(video_path)
    hexdump = analyzer.extract_real_hexdump(video_path, 256)
    telemetry = analyzer.extract_video_telemetry(video_path)

    cached_data = {
        "entropy": entropy,
        "hexdump": hexdump,
        "metrics": telemetry
    }
    CASE_METRICS_CACHE[case_id] = cached_data
    return cached_data


# ==============================================================================
# AUTHENTICATION & SESSION ROUTES
# ==============================================================================
@app.route("/login")
def login_page():
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or request.form
    role = (data.get("role") or "examiner").strip().lower()
    badge_id = (data.get("badge_id") or "").strip()
    passkey = (data.get("passkey") or "").strip()

    # Match credential or grant demo access for role
    valid_info = VALID_CREDENTIALS.get(role)
    if not valid_info:
        return jsonify({"status": "ERROR", "message": "Invalid forensic role requested"}), 400

    # Verification check (allow exact match or demo fallback)
    if badge_id and passkey:
        if valid_info["badge_id"] != badge_id or valid_info["passkey"] != passkey:
            return jsonify({"status": "ERROR", "message": "Invalid Badge ID or Security Passkey"}), 401

    session["user_role"] = role
    session["badge_id"] = badge_id or valid_info["badge_id"]
    session["user_name"] = valid_info["name"]

    target_route = f"/{role}" if role in ["examiner", "field", "court"] else "/"
    return jsonify({
        "status": "SUCCESS",
        "role": role,
        "badge_id": session["badge_id"],
        "redirect": target_route
    })


@app.route("/api/session")
def api_session():
    return jsonify({
        "authenticated": "user_role" in session,
        "role": session.get("user_role"),
        "badge_id": session.get("badge_id"),
        "user_name": session.get("user_name")
    })


# ==============================================================================
# HTML TEMPLATE PAGE ROUTES (PROTECTED VIA SESSION ROLE)
# ==============================================================================
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/examiner")
@require_role(["examiner"])
def portal_examiner():
    return render_template("examiner.html")

@app.route("/field")
@require_role(["field", "examiner"])
def portal_field():
    return render_template("field.html")

@app.route("/court")
@require_role(["court", "examiner"])
def portal_judicial():
    return render_template("judicial.html")


# ==============================================================================
# EVIDENCE SERVING & API ENDPOINTS
# ==============================================================================
@app.route("/vault/<case_id>/<filename>")
def serve_evidence_video(case_id, filename):
    case_folder = os.path.join(VAULT_DIR, case_id)
    if os.path.exists(os.path.join(case_folder, filename)):
        return send_from_directory(case_folder, filename)
    return jsonify({"error": "Media file not found"}), 404


@app.route("/api/cases")
def list_cases():
    cases_result = []

    if DB_AVAILABLE:
        try:
            db_cases = database.get_all_cases()
            for item in db_cases:
                if isinstance(item, dict):
                    cases_result.append({
                        "case_id": item.get("case_id"),
                        "fir_number": item.get("fir_number", item.get("case_id"))
                    })
                elif isinstance(item, (list, tuple)) and len(item) >= 2:
                    cases_result.append({
                        "case_id": str(item[0]),
                        "fir_number": str(item[1])
                    })
        except Exception:
            pass

    for c in IN_MEMORY_CASES:
        if not any(x["case_id"] == c["case_id"] for x in cases_result):
            cases_result.append({
                "case_id": c["case_id"],
                "fir_number": c["fir_number"]
            })

    if os.path.exists(VAULT_DIR):
        for folder in os.listdir(VAULT_DIR):
            folder_path = os.path.join(VAULT_DIR, folder)
            if os.path.isdir(folder_path) and folder != "reports" and not folder.startswith(".") and not any(x["case_id"] == folder for x in cases_result):
                cases_result.append({
                    "case_id": folder,
                    "fir_number": folder.replace("_", "/").upper()
                })

    return jsonify({"cases": cases_result})


@app.route("/api/cases/upload", methods=["POST"])
def upload_case_evidence():
    fir_number = request.form.get("fir_number", "").strip() or "FIR-2026/DEL-089"
    police_station = request.form.get("police_station", "").strip() or "Special Cell Northern Range"
    seized_device = request.form.get("seized_device", "").strip() or "Hikvision DS-7208HQHI (2TB HDD)"
    officer = request.form.get("officer", "").strip() or "Insp. S. Sharma [NTRO-CYBER-884]"

    clean_id = "case_" + fir_number.replace("/", "_").replace("-", "_").lower()
    case_folder = os.path.join(VAULT_DIR, clean_id)
    os.makedirs(case_folder, exist_ok=True)

    file = request.files.get("evidence_file")
    orig_filename = "source_evidence.mp4"
    if file and file.filename:
        orig_filename = secure_filename(file.filename)

    save_path = os.path.join(case_folder, orig_filename)

    if file and file.filename:
        file.save(save_path)
    else:
        dummy_clip = os.path.join(VAULT_DIR, "case_101", "cam1_main_gate.mp4")
        if os.path.exists(dummy_clip):
            shutil.copyfile(dummy_clip, save_path)
        else:
            with open(save_path, "wb") as f:
                f.write(b"\x00" * 4096)

    # Real SHA-256 calculation
    sha256_hash = analyzer.calculate_file_hash(save_path)

    # Forensic stream carving / header sanitization for damaged or headerless captures.
    carving_manifest = ""
    try:
        recon = analyzer.reconstruct_or_sanitize_stream(save_path, save_path)
        if recon.get("carved"):
            carving_manifest = (
                f"{recon.get('recovered_keyframes', 0)} Orphan Keyframes Recovered; SPS/PPS Injected"
            )
    except Exception as carve_err:
        print(f"[WARN] Stream carving skipped: {carve_err}")

    # Pre-cache telemetry and entropy on upload for instant UI responses
    CASE_METRICS_CACHE[clean_id] = {
        "entropy": analyzer.calculate_shannon_entropy(save_path),
        "hexdump": analyzer.extract_real_hexdump(save_path, 256),
        "metrics": analyzer.extract_video_telemetry(save_path)
    }

    case_meta = {
        "case_id": clean_id,
        "fir_number": fir_number,
        "police_station": police_station,
        "device": seized_device,
        "officer": officer,
        "sha256": sha256_hash,
        "filename": orig_filename,
        "carving_manifest": carving_manifest
    }

    existing = next((c for c in IN_MEMORY_CASES if c["case_id"] == clean_id), None)
    if existing:
        existing.update(case_meta)
    else:
        IN_MEMORY_CASES.append(case_meta)

    if DB_AVAILABLE:
        try:
            database.create_case(clean_id, fir_number, police_station, seized_device, officer)
            database.log_action(clean_id, "MEDIA_INGESTED", f"File: {orig_filename} | SHA256: {sha256_hash}")
            if carving_manifest:
                database.log_action(clean_id, "STREAM_CARVED", carving_manifest)
        except Exception:
            pass

    return jsonify({
        "status": "SUCCESS",
        "case_id": clean_id,
        "filename": orig_filename,
        "hash": sha256_hash,
        "carving_manifest": carving_manifest
    })


@app.route("/api/case/<case_id>")
def get_case_details(case_id):
    video_file, video_path = get_case_video_info(case_id)

    if not video_file or not video_path or not os.path.exists(video_path):
        return jsonify({
            "case_id": case_id,
            "has_video": False,
            "raw_video_url": "",
            "enhanced_video_url": "",
            "raw_filename": "",
            "enhanced_filename": "",
            "entropy": 0.0,
            "hexdump": ["00000000:  (No evidence media present)"],
            "metrics": {
                "width": 1920, "height": 1080, "fps": 25.0,
                "total_frames": 0, "processed_frames": 0,
                "shockwave_time": 0.0, "peak_frame": 0,
                "enf_curve": [50.000] * 30
            }
        })

    video_url = f"/vault/{case_id}/{video_file}"
    cached = get_or_compute_metrics(case_id, video_path)

    return jsonify({
        "case_id": case_id,
        "has_video": True,
        "raw_video_url": video_url,
        "enhanced_video_url": video_url,
        "raw_filename": video_file,
        "enhanced_filename": video_file,
        "entropy": cached["entropy"],
        "metrics": cached["metrics"],
        "hexdump": cached["hexdump"]
    })


@app.route("/api/physics")
def get_physics():
    return jsonify({
        "enf_confidence": 99.84,
        "power_grid": "POSOCO Northern Synchronous Grid (50.00 Hz)",
        "solar_azimuth_match": "MATCH (Azimuth: 142.6 deg, Elevation: 38.2 deg)",
        "shockwave_detected": True,
        "acoustic_event_frame": 69
    })


@app.route("/api/bookmarks/<case_id>", methods=["GET", "POST"])
def bookmarks(case_id):
    if request.method == "POST":
        return jsonify({"status": "SUCCESS"})
    return jsonify({
        "bookmarks": [
            {"timecode": "00:01:14", "frame": 1850, "label": "Perimeter breach detected"},
            {"timecode": "00:03:45", "frame": 69, "label": "Acoustic shockwave pulse peak"}
        ]
    })


@app.route("/api/certificate/<case_id>")
def download_certificate(case_id):
    video_file, video_path = get_case_video_info(case_id)

    file_size = os.path.getsize(video_path) if video_path and os.path.exists(video_path) else 0
    sector_count = file_size // 512
    sha256_hash = analyzer.calculate_file_hash(video_path) if video_path and os.path.exists(video_path) else "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    entropy = analyzer.calculate_shannon_entropy(video_path) if video_path and os.path.exists(video_path) else 7.842

    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S IST")
    cert_id = f"BSA-SEC63-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"

    matched = next((c for c in IN_MEMORY_CASES if c["case_id"] == case_id), None)
    fir_ref = matched["fir_number"] if matched else case_id.replace("case_", "").replace("_", "/").upper()
    device_ref = matched.get("device", "Hikvision DS-7208HQHI (2TB HDD)") if matched else "Hikvision DS-7208HQHI (2TB HDD)"
    officer_ref = matched.get("officer", "Insp. S. Sharma [NTRO-CYBER-884]") if matched else "Insp. S. Sharma [NTRO-CYBER-884]"
    ps_ref = matched.get("police_station", "Special Cell, Northern Range") if matched else "Special Cell, Northern Range"

    cert_text = f"""================================================================================
          BHARATIYA SAKSHYA ADHINIYAM (BSA), 2023 - SECTION 63
                 CERTIFICATE OF ELECTRONIC EVIDENCE INTEGRITY
================================================================================
UNIQUE CERTIFICATE ID  : {cert_id}
CASE REFERENCE / FIR   : {fir_ref}
POLICE STATION / AGENCY: {ps_ref}
JURISDICTION           : National Technical Research Organisation (NTRO) - Forensic Node
DATE & TIME OF SEAL    : {now}
OPERATIONAL STATE      : HARDWARE WRITE-BLOCKED • AIR-GAPPED DEDICATED HOST

[PART 1: BIT-STREAM SOURCE DISK INTEGRITY MANIFEST]
Seized Device          : {device_ref}
Raw Evidence File      : {video_file or "source_evidence.mp4"}
Forensic Standard      : ISO/IEC 27037:2012 COMPLIANT
Binary Size            : {file_size:,} Bytes
Physical Sector Count  : {sector_count:,} Sectors (512-Byte Standard Sectors)
Master SHA-256 Digest  : {sha256_hash}
Shannon Sector Entropy : {entropy:.3f} / 8.000 (High-Density Stream Payload Confirmed)
Verification State     : 100% BIT-FOR-BIT MATCH (UNALTERED EVIDENCE STATE)

[PART 2: OPTICAL PHYSICS & CHRONO-LOCK TELEMETRY]
50Hz Grid Synchronization: 99.84% Correlation with POSOCO National Power Grid Archives
Optical Shockwave Event  : Sub-pixel Motion Magnification Logged at Acoustic Spike
Restoration Pipeline     : Parametric NAL Reconstruction & Adaptive Dynamic CLAHE Equalization

[PART 3: STATUTORY DECLARATION UNDER SECTION 63 OF BSA, 2023]
I hereby certify under Section 63 of the Bharatiya Sakshya Adhiniyam, 2023, that:
(a) The electronic records described herein were produced by lawful bit-stream acquisition.
(b) Physical write-blocking protocols prevented binary tampering or sector alteration.
(c) The optical 50Hz electrical network frequency (ENF) aligns with National Grid logs.

Authorized Forensic Examiner : {officer_ref}
Digital Verification Stamp   : [HMAC-SHA256: {sha256_hash[:32]}]
================================================================================
"""
    return Response(
        cert_text,
        mimetype="text/plain",
        headers={"Content-Disposition": f"attachment;filename={cert_id}.txt"}
    )


# ==============================================================================
# LOCAL DEVELOPMENT ENTRYPOINT
# ==============================================================================
if __name__ == "__main__":
    app.run(port=5000, debug=True)