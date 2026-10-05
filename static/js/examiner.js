<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChronoDrishti | Forensic Examiner Suite</title>
  <link rel="stylesheet" href="{{ url_for('static', filename='css/style.css') }}">
  <style>
    .video-view-box {
      width: 100%;
      height: 270px;
      background: #0B131E;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  </style>
</head>
<body>

  <header class="master-header">
    <div class="header-inner">
      <a href="/" class="brand-group">
        <div class="brand-crest">
          <svg width="24" height="24" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="26" stroke="#1E3A2B" stroke-width="2" />
            <circle cx="32" cy="32" r="6" fill="#10B981" />
          </svg>
        </div>
        <div class="brand-title">CHRONODRISHTI <span class="brand-badge">EXAMINER SUITE</span></div>
      </a>
      <div><a href="/" class="btn-home-return">◀ PORTAL DIRECTORY</a></div>
    </div>
  </header>

  <main class="page-container">
    <div class="portal-banner">
      <div>
        <div class="portal-badge-tag">TIER 1 ACTIVE: FORENSIC EXAMINER WORKSTATION</div>
        <div class="portal-case-info">ACTIVE ARTIFACT: <span id="lblActiveCase" class="mono text-accent">SELECTING...</span></div>
      </div>
      <div>
        <select id="caseSelector" class="select-box"></select>
      </div>
    </div>

    <!-- Examiner Sub-Tabs -->
    <div class="examiner-tabs">
      <button class="ex-tab active" onclick="switchTab('studio')">1. RESTORATION & CALIBRATION STUDIO</button>
      <button class="ex-tab" onclick="switchTab('matrix')">2. CHRONOMESH 4D DUAL MATRIX</button>
    </div>

    <!-- TAB 1: Restoration Studio -->
    <div id="tabStudio" class="ex-tab-content active-tab-content">
      <div class="grid-studio">
        <div class="card-grey">
          <div class="pane-head">PARAMETRIC RECONSTRUCTION CONTROLS</div>
          <div class="pane-body">
            <div class="slider-box">
              <div class="slider-head">
                <span>Low-Light Contrast Gain (CLAHE):</span>
                <span id="txtGain" class="mono text-accent">1.0x</span>
              </div>
              <input type="range" id="sliderGain" min="1.0" max="3.0" step="0.2" value="1.0">
            </div>
            <div class="slider-box">
              <div class="slider-head">
                <span>Playback Brightness Boost:</span>
                <span id="txtBright" class="mono text-accent">100%</span>
              </div>
              <input type="range" id="sliderBright" min="50" max="250" step="10" value="100">
            </div>
            <button class="btn-subtle" onclick="playBoth()">▶ PLAY / PAUSE SYNCED FOOTAGE</button>
          </div>
        </div>

        <div class="card-grey">
          <div class="pane-head">DUAL RESTORATION COMPARISON (RAW VS ENHANCED)</div>
          <div class="viewports-row">
            <div class="vp-box">
              <div class="vp-title text-alert">RAW CORRUPTED FEED (UNPROCESSED)</div>
              <div class="video-view-box">
                <video id="vidRaw" loop muted playsinline></video>
              </div>
            </div>
            <div class="vp-box">
              <div class="vp-title text-accent">REPAIRED & CALIBRATED (CLAHE APPLIED)</div>
              <div class="video-view-box">
                <video id="vidEnhanced" loop muted playsinline></video>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: ChronoMesh Dual-Matrix -->
    <div id="tabMatrix" class="ex-tab-content" style="display:none;">
      <div class="card-grey">
        <div class="pane-head">CHRONOMESH MULTI-ANGLE SURVEILLANCE STREAMS</div>
        <div class="cctv-grid">
          <div class="cctv-tile">
            <div class="cctv-tile-bar">PRIMARY CHANNEL (CAM 01)</div>
            <video id="vidCam1" loop muted playsinline></video>
          </div>
          <div class="cctv-tile">
            <div class="cctv-tile-bar">SYNCHRONIZED CARVED FEED (CAM 02)</div>
            <video id="vidCam2" loop muted playsinline></video>
          </div>
        </div>
      </div>
    </div>
  </main>

  <script>
    const caseSelector = document.getElementById("caseSelector");
    const lblActiveCase = document.getElementById("lblActiveCase");
    const vidRaw = document.getElementById("vidRaw");
    const vidEnhanced = document.getElementById("vidEnhanced");
    const vidCam1 = document.getElementById("vidCam1");
    const vidCam2 = document.getElementById("vidCam2");
    const sliderGain = document.getElementById("sliderGain");
    const sliderBright = document.getElementById("sliderBright");

    // Load Cases into Dropdown
    fetch("/api/cases")
      .then(r => r.json())
      .then(data => {
        caseSelector.innerHTML = "";
        data.cases.forEach(c => {
          const opt = document.createElement("option");
          opt.value = c.case_id;
          opt.innerText = (c.fir_number || c.case_id).toUpperCase();
          caseSelector.appendChild(opt);
        });
        if (caseSelector.value) loadCaseVideo(caseSelector.value);
      });

    caseSelector.addEventListener("change", (e) => loadCaseVideo(e.target.value));

    function loadCaseVideo(caseId) {
      lblActiveCase.innerText = caseId.toUpperCase();
      fetch(`/api/case/${caseId}`)
        .then(r => r.json())
        .then(d => {
          if (d.has_video) {
            vidRaw.src = d.video_url;
            vidEnhanced.src = d.video_url;
            vidCam1.src = d.video_url;
            vidCam2.src = d.video_url;
            vidRaw.play();
            vidEnhanced.play();
            vidCam1.play();
            vidCam2.play();
          } else {
            alert("Is case me abhi koi video nahi hai. Pehle '/field' portal par jaakar koi MP4 video upload karein!");
          }
        });
    }

    // Dynamic Filter Effect (CSS Hardware Simulation)
    function updateFilters() {
      const contrast = sliderGain.value;
      const bright = sliderBright.value;
      document.getElementById("txtGain").innerText = contrast + "x";
      document.getElementById("txtBright").innerText = bright + "%";
      vidEnhanced.style.filter = `contrast(${contrast}) brightness(${bright}%)`;
    }

    sliderGain.addEventListener("input", updateFilters);
    sliderBright.addEventListener("input", updateFilters);

    function playBoth() {
      if (vidRaw.paused) {
        vidRaw.play(); vidEnhanced.play();
      } else {
        vidRaw.pause(); vidEnhanced.pause();
      }
    }

    function switchTab(tab) {
      document.querySelectorAll(".ex-tab").forEach(t => t.classList.remove("active"));
      if (tab === 'studio') {
        document.querySelectorAll(".ex-tab")[0].classList.add("active");
        document.getElementById("tabStudio").style.display = "block";
        document.getElementById("tabMatrix").style.display = "none";
      } else {
        document.querySelectorAll(".ex-tab")[1].classList.add("active");
        document.getElementById("tabStudio").style.display = "none";
        document.getElementById("tabMatrix").style.display = "block";
      }
    }
  </script>
</body>
</html>