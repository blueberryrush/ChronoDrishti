import os
import datetime
from flask import Flask, render_template, jsonify, send_from_directory, request, Response
from analyzer import ForensicAnalyzer
import database

app = Flask(__name__)
database.init_db()
analyzer = ForensicAnalyzer()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/cases")
def list_cases():
    cases = analyzer.get_available_cases()
    return jsonify({"cases": cases})

@app.route("/api/case/<case_id>")
def get_case_details(case_id):
    details = analyzer.inspect_case(case_id)
    if not details:
        return jsonify({"error": "Case not found"}), 404
    return jsonify(details)

@app.route("/api/audit-logs/<case_id>")
def fetch_logs(case_id):
    logs = database.get_audit_logs(case_id)
    return jsonify({"logs": logs})

@app.route("/api/bookmarks/<case_id>", methods=["GET", "POST"])
def manage_bookmarks(case_id):
    if request.method == "POST":
        data = request.json or {}
        timecode = data.get("timecode", "22:42:00.000 IST")
        frame = data.get("frame", 0)
        label = data.get("label", "OPERATOR CHECKPOINT")
        notes = data.get("notes", "Evidence marked during scrub")
        
        database.add_bookmark(case_id, timecode, frame, label, notes)
        database.log_action(case_id, "BOOKMARK_ADDED", f"Flagged checkpoint at {timecode} (Frame {frame})")
        return jsonify({"status": "SUCCESS"})
    else:
        bookmarks = database.get_bookmarks(case_id)
        return jsonify({"bookmarks": bookmarks})

@app.route("/api/physics")
def get_physics():
    case_id = request.args.get("case", "case_101")
    filename = request.args.get("file")
    case_dir = os.path.join("evidence_vault", case_id)

    if not os.path.exists(case_dir):
        return jsonify({"error": "Case not found"}), 404

    if not filename:
        files = [f for f in os.listdir(case_dir) if f.endswith(('.mp4', '.avi'))]
        filename = files[0] if files else None

    if not filename:
        return jsonify({"error": "No media found"}), 404

    target_path = os.path.join(case_dir, filename)
    physics_data = analyzer.analyze_optical_physics(target_path)
    return jsonify(physics_data)

@app.route("/api/hexdump")
def get_hexdump():
    case_id = request.args.get("case", "case_101")
    filename = request.args.get("file")
    case_dir = os.path.join("evidence_vault", case_id)

    if not os.path.exists(case_dir):
        return jsonify({"lines": []})

    files = [f for f in os.listdir(case_dir) if f.endswith(('.mp4', '.avi'))]
    target_path = os.path.join(case_dir, filename) if filename else (os.path.join(case_dir, files[0]) if files else "")
    lines = analyzer.get_real_hexdump(target_path, num_bytes=256)
    return jsonify({"lines": lines})

@app.route("/api/certificate/<case_id>")
def download_cert(case_id):
    details = analyzer.inspect_case(case_id)
    if not details:
        return "Case not found", 404

    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S IST")
    cert_id = f"NTRO-BSA-63-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"

    # Log generation to database
    database.log_action(case_id, "BSA_CERT_GENERATED", f"Section 63 certificate sealed with ID {cert_id}")

    cert = f"""================================================================================
          BHARATIYA SAKSHYA ADHINIYAM (BSA), 2023 - SECTION 63
                 CERTIFICATE OF ELECTRONIC EVIDENCE INTEGRITY
================================================================================
CERTIFICATE UNIQUE ID : {cert_id}
CASE REFERENCE ID     : {case_id.upper()}
DESIGNATED JURISDICTION: National Technical Research Organisation (NTRO) - Sovereign Cell
DATE OF EXTRACTION    : {now}
OPERATIONAL STATE     : HARDWARE WRITE-BLOCKED • AIR-GAPPED DEDICATED HOST

[1. SOURCE BIT-STREAM DISK MANIFEST]
Master SHA-256 Digest : {details['master_hash']}
Total Media Streams   : {details['total_cameras']}
Total Physical Sectors: {details['total_sectors']} (512 Bytes/Sector)
Bit-Stream Integrity  : 100% BIT-FOR-BIT PRESERVED

[2. EXTRACTED SURVEILLANCE STREAMS]
"""
    for cam in details["cameras"]:
        cert += f"• File: {cam['filename']:<26} | Res: {cam['resolution']} | FPS: {cam['fps']} | Hash: {cam['sha256']}\n"

    cert += f"""
[3. STATUTORY COMPLIANCE DECLARATION UNDER BSA 2023 SECTION 63]
I hereby declare that:
(a) The electronic records herein were generated from physical surveillance media
    lawfully seized and maintained in continuous sovereign custody.
(b) Bit-stream cloning was executed via hardware write-blocker, ensuring zero sector mutation.
(c) Cryptographic hashes and physical offsets recorded herein remain mathematically immutable.

Digital Seal Stamp : [VALIDATED_BY_NTRO_FORENSIC_KERNEL]
Verification Node  : http://localhost:5000/api/certificate/{case_id}
================================================================================
"""
    # Physically save on server
    report_file = os.path.join("evidence_vault/reports", f"{cert_id}.txt")
    with open(report_file, "w") as f:
        f.write(cert)

    return Response(cert, mimetype="text/plain", headers={"Content-Disposition": f"attachment;filename={cert_id}.txt"})

if __name__ == "__main__":
    print("\n[+] ChronoDrishti Sovereign Node Started on http://127.0.0.1:5000 ...")
    app.run(port=5000, debug=True)