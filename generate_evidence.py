import os
import cv2
import numpy as np

def create_clip(path, title, duration=6, fps=20, event_at_sec=3.0):
    w, h = 640, 360
    total_frames = duration * fps
    # OpenCV video writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(path, fourcc, fps, (w, h))

    for i in range(total_frames):
        # Dark CCTV background
        frame = np.full((h, w, 3), (18, 22, 28), dtype=np.uint8)
        
        # Grid lines (Surveillance monitor effect)
        for y in range(0, h, 40): cv2.line(frame, (0, y), (w, y), (25, 30, 38), 1)
        for x in range(0, w, 40): cv2.line(frame, (x, 0), (x, h), (25, 30, 38), 1)

        # Subject movement across the frame
        curr_sec = i / fps
        bx = int(50 + (i * 3.5) % (w - 120))
        by = int(140 + np.sin(i * 0.1) * 20)
        
        # Acoustic / shockwave event flash
        if abs(curr_sec - event_at_sec) < 0.2:
            cv2.circle(frame, (bx + 30, by + 40), 70, (255, 255, 255), -1)
            cv2.putText(frame, "SHOCKWAVE DETECTED", (bx - 20, by - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
        else:
            cv2.rectangle(frame, (bx, by), (bx + 55, by + 90), (0, 230, 118), 2)
            cv2.putText(frame, "TARGET #409", (bx, by - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 230, 118), 1)

        # CCTV timestamp HUD
        sec = int(42 + curr_sec) % 60
        cv2.putText(frame, f"[REC] {title}", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 180), 2)
        cv2.putText(frame, f"2026-10-05 22:42:{sec:02d} IST", (20, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1)
        cv2.putText(frame, "NTRO WRITE-BLOCKED FEED", (20, h - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (100, 100, 100), 1)

        # Optical noise simulation
        noise = np.random.normal(0, 5, frame.shape).astype(np.uint8)
        frame = cv2.add(frame, noise)

        out.write(frame)
    out.release()
    print(f"[✔] Created: {path}")

if __name__ == "__main__":
    print("Generating simulated evidence files...")
    # Case 101 (Market Incident - 3 Feeds)
    create_clip("evidence_vault/case_101/cam1_main_gate.mp4", "CAM 01: MAIN ENTRANCE", event_at_sec=3.2)
    create_clip("evidence_vault/case_101/cam2_rear_alley.mp4", "CAM 02: REAR ALLEY [CARVED]", event_at_sec=3.2)
    create_clip("evidence_vault/case_101/cam3_cash_counter.mp4", "CAM 03: CASH COUNTER", event_at_sec=4.5)

    # Case 102 (Highway Checkpoint - 2 Feeds)
    create_clip("evidence_vault/case_102/cam1_toll_barrier.mp4", "CAM 01: TOLL BOOTH", event_at_sec=2.0)
    create_clip("evidence_vault/case_102/cam2_outer_road.mp4", "CAM 02: HIGHWAY 44", event_at_sec=2.0)
    print("\nAll 5 video files successfully generated in evidence_vault!")