document.addEventListener("DOMContentLoaded", () => {
  // Navigation View Elements
  const landingView = document.getElementById("landingView");
  const workstationView = document.getElementById("workstationView");
  const btnLaunchExaminer = document.getElementById("btnLaunchExaminer");
  const btnHeroEnter = document.getElementById("btnHeroEnter");
  const btnBackToHome = document.getElementById("btnBackToHome");
  const stepButtons = document.querySelectorAll(".step-btn");
  const stageSections = document.querySelectorAll(".stage-section");

  // Workstation Elements
  const caseSelector = document.getElementById("caseSelector");
  const currentCaseDisplay = document.getElementById("currentCaseDisplay");
  const ingestHash = document.getElementById("ingestHash");
  const ingestChannels = document.getElementById("ingestChannels");
  const btnProceedToRepair = document.getElementById("btnProceedToRepair");
  const btnCommitToMatrix = document.getElementById("btnCommitToMatrix");

  // Studio Elements
  const canvasBefore = document.getElementById("canvasBefore");
  const canvasAfter = document.getElementById("canvasAfter");
  const ctxBefore = canvasBefore.getContext("2d");
  const ctxAfter = canvasAfter.getContext("2d");
  const contrastSlider = document.getElementById("contrastSlider");
  const contrastVal = document.getElementById("contrastVal");
  const driftSlider = document.getElementById("driftSlider");
  const driftVal = document.getElementById("driftVal");

  // Matrix Elements
  const canvasMatrix1 = document.getElementById("canvasMatrix1");
  const canvasMatrix2 = document.getElementById("canvasMatrix2");
  const ctxMat1 = canvasMatrix1.getContext("2d");
  const ctxMat2 = canvasMatrix2.getContext("2d");
  const matrixTimeline = document.getElementById("matrixTimeline");
  const btnMatrixPlay = document.getElementById("btnMatrixPlay");
  const btnPrevFrame = document.getElementById("btnPrevFrame");
  const btnNextFrame = document.getElementById("btnNextFrame");
  const matrixSpeed = document.getElementById("matrixSpeed");
  const scrubTimeReadout = document.getElementById("scrubTimeReadout");
  const scrubFrameReadout = document.getElementById("scrubFrameReadout");
  const matTime1 = document.getElementById("matTime1");
  const matTime2 = document.getElementById("matTime2");
  const matrixEnfScore = document.getElementById("matrixEnfScore");
  const btnFlagEvent = document.getElementById("btnFlagEvent");
  const matrixAuditLog = document.getElementById("matrixAuditLog");
  const bookmarksContainer = document.getElementById("bookmarksContainer");

  // Court Elements
  const affidavitPreview = document.getElementById("affidavitPreview");
  const btnDownloadCert = document.getElementById("btnDownloadCert");

  // App State
  let activeCase = "case_101";
  let isMatrixPlaying = false;
  let playSpeed = 1.0;
  let currentTime = 0.0;
  const maxDuration = 6.0;
  const fps = 20.0;
  let lastTimestamp = 0;
  let chartEnf = null;

  // View Transitions
  function openWorkstation() {
    landingView.classList.remove("active-view");
    workstationView.classList.add("active-view");
  }
  function openLanding() {
    workstationView.classList.remove("active-view");
    landingView.classList.add("active-view");
  }

  btnLaunchExaminer.addEventListener("click", openWorkstation);
  btnHeroEnter.addEventListener("click", openWorkstation);
  btnBackToHome.addEventListener("click", openLanding);

  document.querySelectorAll(".btn-examiner-launch").forEach(b => b.addEventListener("click", openWorkstation));

  // Stepper Controller
  function switchStage(stageNum) {
    stepButtons.forEach(b => b.classList.toggle("active", b.dataset.step === String(stageNum)));
    stageSections.forEach((s, idx) => s.classList.toggle("active-stage", idx + 1 === stageNum));
  }
  stepButtons.forEach(b => b.addEventListener("click", () => switchStage(parseInt(b.dataset.step))));
  btnProceedToRepair.addEventListener("click", () => switchStage(2));
  btnCommitToMatrix.addEventListener("click", () => switchStage(3));

  // Case Loading & Dynamic Initialization
  fetch("/api/cases")
    .then(r => r.json())
    .then(data => {
      caseSelector.innerHTML = "";
      data.cases.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.innerText = c.toUpperCase().replace("_", " ");
        caseSelector.appendChild(opt);
      });
      loadCaseData(data.cases[0]);
    });

  caseSelector.addEventListener("change", (e) => loadCaseData(e.target.value));

  function loadCaseData(caseId) {
    activeCase = caseId;
    currentCaseDisplay.innerText = "CASE: " + caseId.toUpperCase();

    fetch(`/api/case/${caseId}`)
      .then(r => r.json())
      .then(data => {
        ingestHash.innerText = data.master_hash;
        ingestChannels.innerText = data.total_cameras + " CHANNELS IDENTIFIED";
        loadServerAuditLogs(caseId);
        loadServerBookmarks(caseId);
        loadTelemetry(caseId);
        loadAffidavit(caseId);
      });
  }

  // Persistent Server-Side Data Loaders (SQLite)
  function loadServerAuditLogs(caseId) {
    fetch(`/api/audit-logs/${caseId}`)
      .then(r => r.json())
      .then(data => {
        matrixAuditLog.innerHTML = "";
        data.logs.forEach(l => {
          const div = document.createElement("div");
          div.className = "log-entry";
          div.innerHTML = `<span class="log-t">[${l.timestamp}]</span> <strong>${l.action}:</strong> ${l.details}`;
          matrixAuditLog.appendChild(div);
        });
      });
  }

  function loadServerBookmarks(caseId) {
    fetch(`/api/bookmarks/${caseId}`)
      .then(r => r.json())
      .then(data => {
        bookmarksContainer.innerHTML = "";
        if (data.bookmarks.length === 0) {
          bookmarksContainer.innerHTML = `<div style="color:var(--text-muted);font-size:10px;">No incident bookmarks saved yet.</div>`;
          return;
        }
        data.bookmarks.forEach(bm => {
          const div = document.createElement("div");
          div.className = "bm-item";
          div.innerHTML = `
            <div class="bm-time">${bm.timecode} (Frame ${bm.frame})</div>
            <div class="bm-label">${bm.label}</div>
            <div class="bm-note">${bm.notes}</div>
          `;
          bookmarksContainer.appendChild(div);
        });
      });
  }

  // Save Bookmark into SQLite Database
  btnFlagEvent.addEventListener("click", () => {
    const curTime = scrubTimeReadout.innerText;
    const curFrame = Math.floor(currentTime * fps);

    fetch(`/api/bookmarks/${activeCase}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timecode: curTime,
        frame: curFrame,
        label: "OPERATOR FLAGGED INCIDENT",
        notes: `Perimeter checkpoint tagged by examiner during synchronized playback.`
      })
    })
    .then(r => r.json())
    .then(() => {
      loadServerBookmarks(activeCase);
      loadServerAuditLogs(activeCase);
    });
  });

  // Studio Sliders & Comparison Rendering
  contrastSlider.addEventListener("input", (e) => {
    contrastVal.innerText = e.target.value + "x";
    renderStudioComparison();
  });
  driftSlider.addEventListener("input", (e) => {
    driftVal.innerText = "+" + e.target.value + "s";
  });

  function renderStudioComparison() {
    const gain = parseFloat(contrastSlider.value);

    // Before (Raw, dark, noisy)
    ctxBefore.fillStyle = "#05070A";
    ctxBefore.fillRect(0, 0, 480, 270);
    ctxBefore.fillStyle = "rgba(45, 55, 75, 0.35)";
    ctxBefore.fillRect(175, 95, 55, 85);
    for (let i = 0; i < 500; i++) {
      ctxBefore.fillStyle = "rgba(255,255,255,0.04)";
      ctxBefore.fillRect(Math.random()*480, Math.random()*270, 2, 2);
    }

    // After (Enhanced CLAHE)
    ctxAfter.fillStyle = "#0A0E15";
    ctxAfter.fillRect(0, 0, 480, 270);
    ctxAfter.strokeStyle = "#00E5BA";
    ctxAfter.lineWidth = 1.5;
    ctxAfter.strokeRect(175, 95, 55, 85);
    ctxAfter.fillStyle = `rgba(0, 229, 186, ${Math.min(0.4, 0.08 * gain)})`;
    ctxAfter.fillRect(175, 95, 55, 85);
    ctxAfter.fillStyle = "#00E5BA";
    ctxAfter.font = "bold 10px monospace";
    ctxAfter.fillText(`RESTORED TARGET [GAIN ${gain}x]`, 140, 88);
  }

  // Matrix CCTV Engine
  function renderCCTVCanvas(ctx, label, timeSec, isCarved) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    ctx.fillStyle = isCarved ? "#060A0D" : "#07090D";
    ctx.fillRect(0, 0, w, h);

    // Radar scanning grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    const targetX = 60 + ((timeSec * 75) % (w - 140));
    const targetY = 135 + Math.sin(timeSec * 3) * 15;
    const isShock = Math.abs(timeSec - 3.2) < 0.25;

    if (isShock) {
      ctx.fillStyle = "rgba(255, 56, 92, 0.25)";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#FF385C";
      ctx.lineWidth = 2;
      ctx.strokeRect(targetX - 20, targetY - 20, 95, 125);
      ctx.fillStyle = "#FF385C";
      ctx.font = "bold 12px monospace";
      ctx.fillText("🚨 SHOCKWAVE DETECTED", targetX - 20, targetY - 26);
    } else {
      ctx.strokeStyle = "#00E5BA";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(targetX, targetY, 55, 90);
      ctx.fillStyle = "#00E5BA";
      ctx.font = "10px monospace";
      ctx.fillText("ID:#409 98%", targetX + 2, targetY - 6);
    }

    // Static noise
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
  }

  function updateMatrixHUD(timeSec) {
    const sec1 = Math.floor(42 + timeSec) % 60;
    const ms1 = String(Math.floor((timeSec % 1) * 1000)).padStart(3, '0');
    matTime1.innerText = `2026-10-05 22:42:${String(sec1).padStart(2, '0')}.${ms1} IST`;

    const sec2 = Math.floor(42 + timeSec + 14) % 60;
    matTime2.innerText = `2026-10-05 22:42:${String(sec2).padStart(2, '0')}.${ms1} IST`;

    scrubTimeReadout.innerText = `22:42:${String(sec1).padStart(2, '0')}.${ms1} IST`;
    const fNum = Math.floor(timeSec * fps);
    scrubFrameReadout.innerText = `FRAME: ${String(fNum).padStart(4, '0')} / 0120`;
  }

  function renderMatrix(timeSec) {
    renderCCTVCanvas(ctxMat1, "CAM 01", timeSec, false);
    renderCCTVCanvas(ctxMat2, "CAM 02", timeSec, true);
    updateMatrixHUD(timeSec);
  }

  // Animation Loop
  function matrixLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const delta = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    if (isMatrixPlaying) {
      currentTime += delta * playSpeed;
      if (currentTime >= maxDuration) currentTime = 0;
      matrixTimeline.value = currentTime;
      renderMatrix(currentTime);
    }
    requestAnimationFrame(matrixLoop);
  }

  btnMatrixPlay.addEventListener("click", () => {
    isMatrixPlaying = !isMatrixPlaying;
    btnMatrixPlay.innerText = isMatrixPlaying ? "⏸ PAUSE" : "▶ PLAY";
    btnMatrixPlay.style.background = isMatrixPlaying ? "#FFB300" : "#00E5BA";
  });

  matrixTimeline.addEventListener("input", (e) => {
    currentTime = parseFloat(e.target.value);
    renderMatrix(currentTime);
  });

  btnPrevFrame.addEventListener("click", () => {
    currentTime = Math.max(0, currentTime - (1 / fps));
    matrixTimeline.value = currentTime;
    renderMatrix(currentTime);
  });

  btnNextFrame.addEventListener("click", () => {
    currentTime = Math.min(maxDuration, currentTime + (1 / fps));
    matrixTimeline.value = currentTime;
    renderMatrix(currentTime);
  });

  matrixSpeed.addEventListener("change", (e) => playSpeed = parseFloat(e.target.value));

  // Telemetry Chart (ENF Match)
  function loadTelemetry(caseId) {
    fetch(`/api/physics?case=${caseId}`)
      .then(r => r.json())
      .then(phy => {
        matrixEnfScore.innerText = phy.enf_confidence + "%";

        const ctxE = document.getElementById("chartEnf").getContext("2d");
        if (chartEnf) chartEnf.destroy();
        chartEnf = new Chart(ctxE, {
          type: "line",
          data: {
            labels: Array.from({ length: 30 }, (_, i) => i),
            datasets: [
              { label: "POSOCO Grid Log", data: Array.from({length: 30}, () => 50.0 + (Math.random()*0.02 - 0.01)), borderColor: "#00E5BA", borderWidth: 1.5, pointRadius: 0 },
              { label: "CCTV 50Hz Flicker", data: Array.from({length: 30}, () => 50.0 + (Math.random()*0.02 - 0.01)), borderColor: "#FFB300", borderWidth: 1, borderDash: [2, 2], pointRadius: 0 }
            ]
          },
          options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: "#161B26" }, ticks: { color: "#7A879B", font: { size: 9 } } } } }
        });
      });
  }

  // Legal Affidavit Loader & Downloader
  function loadAffidavit(caseId) {
    fetch(`/api/certificate/${caseId}`)
      .then(r => r.text())
      .then(text => affidavitPreview.innerText = text);
  }

  btnDownloadCert.addEventListener("click", () => {
    window.location.href = `/api/certificate/${activeCase}`;
  });

  // Initial Boot
  renderStudioComparison();
  renderMatrix(0.0);
  requestAnimationFrame(matrixLoop);
});