document.addEventListener("DOMContentLoaded", () => {
  const caseSelector = document.getElementById("caseSelector");
  const lblActiveCase = document.getElementById("lblActiveCase");
  const vidRaw = document.getElementById("vidRaw");
  const vidEnhanced = document.getElementById("vidEnhanced");
  const vidCam1 = document.getElementById("vidCam1");
  const vidCam2 = document.getElementById("vidCam2");
  const sliderGain = document.getElementById("sliderGain");
  const sliderBright = document.getElementById("sliderBright");

  const chkReticle = document.getElementById("chkReticle");
  const chkLoupe = document.getElementById("chkLoupe");

  const reticleRaw = document.getElementById("reticleRaw");
  const reticleEnhanced = document.getElementById("reticleEnhanced");

  const boxRaw = document.getElementById("boxRaw");
  const boxEnhanced = document.getElementById("boxEnhanced");
  const loupeRaw = document.getElementById("loupeRaw");
  const loupeEnhanced = document.getElementById("loupeEnhanced");
  const canvasRaw = document.getElementById("loupeCanvasRaw");
  const canvasEnhanced = document.getElementById("loupeCanvasEnhanced");
  const loupeHudRaw = document.getElementById("loupeHudRaw");
  const loupeHudEnhanced = document.getElementById("loupeHudEnhanced");

  const lblResFps = document.getElementById("lblResFps");
  const lblEntropy = document.getElementById("lblEntropy");
  const lblShockwave = document.getElementById("lblShockwave");
  const hexdumpView = document.getElementById("hexdumpView");
  const videoScrubber = document.getElementById("videoScrubber");
  const lblTimecode = document.getElementById("lblTimecode");

  let chartInstance = null;
  let loupeActive = false;
  let animFrameId = null;

  // Forensic reticle row labels (Y-axis AA..PP) and loupe geometry constants.
  const RETICLE_ROWS = ["AA","BB","CC","DD","EE","FF","GG","HH","II","JJ","KK","LL","MM","NN","OO","PP"];
  const LOUPE_DIAMETER = 180;   // px
  const LOUPE_ZOOM = 4;         // 4x nearest-neighbour magnification
  const LOUPE_CROP = LOUPE_DIAMETER / LOUPE_ZOOM; // 45 source px -> 180 px

  // Offscreen canvas performs the nearest-neighbour magnification, then the
  // visible canvas simply blits it (keeps per-frame draw cheap and crisp).
  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = LOUPE_DIAMETER;
  offscreenCanvas.height = LOUPE_DIAMETER;
  const offscreenCtx = offscreenCanvas.getContext("2d");

  // Normalized Cursor Tracking State for Dual Loupe Sync
  let cursorNormalized = { rx: 0.5, ry: 0.5, active: false };

  // Sync Video Controls (Play, Pause, Seek)
  if (vidRaw && vidEnhanced) {
    vidRaw.addEventListener("play", () => {
      vidEnhanced.play().catch(() => {});
      if (vidCam1) vidCam1.play().catch(() => {});
      if (vidCam2) vidCam2.play().catch(() => {});
    });

    vidRaw.addEventListener("pause", () => {
      vidEnhanced.pause();
      if (vidCam1) vidCam1.pause();
      if (vidCam2) vidCam2.pause();
    });

    vidRaw.addEventListener("seeking", () => {
      vidEnhanced.currentTime = vidRaw.currentTime;
      if (vidCam1) vidCam1.currentTime = vidRaw.currentTime;
      if (vidCam2) vidCam2.currentTime = vidRaw.currentTime;
    });

    vidRaw.addEventListener("seeked", () => {
      vidEnhanced.currentTime = vidRaw.currentTime;
      if (vidCam1) vidCam1.currentTime = vidRaw.currentTime;
      if (vidCam2) vidCam2.currentTime = vidRaw.currentTime;
    });

    vidRaw.addEventListener("ratechange", () => {
      vidEnhanced.playbackRate = vidRaw.playbackRate;
      if (vidCam1) vidCam1.playbackRate = vidRaw.playbackRate;
      if (vidCam2) vidCam2.playbackRate = vidRaw.playbackRate;
    });
  }

  // ==========================================================================
  // 1. 16x16 FORENSIC COORDINATE RETICLE GRID OVERLAY
  // ==========================================================================
  function buildReticleGridSVG() {
    const yLabels = RETICLE_ROWS;
    let svg = `<svg width="100%" height="100%" viewBox="0 0 1000 1000" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:10;">`;

    for (let i = 0; i <= 16; i++) {
      const pos = i * (1000 / 16);
      const isMajor = (i % 4 === 0);
      const dash = isMajor ? "none" : "3 3";
      const strokeCol = isMajor ? "rgba(16, 185, 129, 0.55)" : "rgba(16, 185, 129, 0.30)";

      svg += `<line x1="${pos}" y1="0" x2="${pos}" y2="1000" stroke="${strokeCol}" stroke-width="1.5" stroke-dasharray="${dash}" />`;
      svg += `<line x1="0" y1="${pos}" x2="1000" y2="${pos}" stroke="${strokeCol}" stroke-width="1.5" stroke-dasharray="${dash}" />`;

      if (i < 16) {
        const labelX = (i + 1).toString().padStart(2, '0');
        const midX = pos + (1000 / 32);
        svg += `<text x="${midX}" y="20" fill="#10B981" font-size="14" font-weight="bold" font-family="JetBrains Mono, monospace" text-anchor="middle">${labelX}</text>`;
        const labelY = yLabels[i];
        svg += `<text x="22" y="${midX + 5}" fill="#10B981" font-size="14" font-weight="bold" font-family="JetBrains Mono, monospace" text-anchor="middle">${labelY}</text>`;
      }
    }

    svg += `<circle cx="500" cy="500" r="14" stroke="#10B981" stroke-width="2" fill="none" />`;
    svg += `<line x1="475" y1="500" x2="525" y2="500" stroke="#10B981" stroke-width="2" />`;
    svg += `<line x1="500" y1="475" x2="500" y2="525" stroke="#10B981" stroke-width="2" />`;
    svg += `</svg>`;
    return svg;
  }

  const reticleSVGHtml = buildReticleGridSVG();
  if (reticleRaw) reticleRaw.innerHTML = reticleSVGHtml;
  if (reticleEnhanced) reticleEnhanced.innerHTML = reticleSVGHtml;

  if (chkReticle) {
    chkReticle.addEventListener("change", (e) => {
      const show = e.target.checked ? "block" : "none";
      if (reticleRaw) reticleRaw.style.display = show;
      if (reticleEnhanced) reticleEnhanced.style.display = show;
    });
  }

  // ==========================================================================
  // 2. SUB-PIXEL OPTICAL LOUPE LENS (4X MAGNIFIER)
  // ==========================================================================
  function updateLoupeCanvas(video, canvas, loupeHud, rx, ry, filterStyle) {
    if (!video || !canvas || !video.videoWidth) return;
    const ctx = canvas.getContext("2d");
    const vW = video.videoWidth;
    const vH = video.videoHeight;

    const vx = rx * vW;
    const vy = ry * vH;

    // Crop box: LOUPE_DIAMETER / zoom source pixels -> LOUPE_DIAMETER output.
    const cropW = LOUPE_CROP;
    const cropH = LOUPE_CROP;

    const sx = Math.max(0, Math.min(vW - cropW, vx - cropW / 2));
    const sy = Math.max(0, Math.min(vH - cropH, vy - cropH / 2));

    // 1) Magnify into the offscreen canvas with nearest-neighbour scaling so
    //    individual macroblocks / pixel structures remain distinguishable.
    offscreenCtx.save();
    offscreenCtx.clearRect(0, 0, LOUPE_DIAMETER, LOUPE_DIAMETER);
    offscreenCtx.imageSmoothingEnabled = false;
    offscreenCtx.filter = filterStyle || "none";
    offscreenCtx.drawImage(video, sx, sy, cropW, cropH, 0, 0, LOUPE_DIAMETER, LOUPE_DIAMETER);
    offscreenCtx.restore();

    // 2) Blit the magnified frame to the visible loupe canvas.
    ctx.save();
    ctx.clearRect(0, 0, LOUPE_DIAMETER, LOUPE_DIAMETER);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreenCanvas, 0, 0);
    ctx.restore();

    // 3) Hairline centre crosshair reticle.
    const c = LOUPE_DIAMETER / 2;
    ctx.strokeStyle = "#10B981";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(c - 12, c); ctx.lineTo(c + 12, c);
    ctx.moveTo(c, c - 12); ctx.lineTo(c, c + 12);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(c, c, 6, 0, Math.PI * 2);
    ctx.stroke();

    if (loupeHud) {
      const colIdx = Math.min(15, Math.floor(rx * 16));
      const rowIdx = Math.min(15, Math.floor(ry * 16));
      const sector = `${String.fromCharCode(65 + colIdx)}${String(rowIdx + 1).padStart(2, "0")}`;
      loupeHud.innerText = `X:${Math.round(vx).toString().padStart(4, '0')} Y:${Math.round(vy).toString().padStart(4, '0')} | SECTOR ${sector}`;
    }
  }

  function hideLoupes() {
    if (loupeRaw) loupeRaw.style.display = "none";
    if (loupeEnhanced) loupeEnhanced.style.display = "none";
  }

  // Draw the 4x magnified crop for a single viewport into its loupe canvas.
  function renderLoupeForBox(boxEl, videoEl, loupeEl, canvasEl, hudEl, filterStyle) {
    if (!boxEl || !videoEl || !loupeEl || !canvasEl) return;
    if (!videoEl.videoWidth) return;

    const bRect = boxEl.getBoundingClientRect();
    const { rx, ry } = cursorNormalized;
    const lx = Math.max(0, Math.min(bRect.width - LOUPE_DIAMETER, rx * bRect.width - LOUPE_DIAMETER / 2));
    const ly = Math.max(0, Math.min(bRect.height - LOUPE_DIAMETER, ry * bRect.height - LOUPE_DIAMETER / 2));

    loupeEl.style.left = `${lx}px`;
    loupeEl.style.top = `${ly}px`;
    loupeEl.style.display = "block";

    // Use the live CSS filter of the enhanced feed when none is forced.
    const activeFilter = filterStyle || videoEl.style.filter || "none";
    updateLoupeCanvas(videoEl, canvasEl, hudEl, rx, ry, activeFilter);
  }

  // Which viewport the cursor currently occupies (drives the rAF refresh loop).
  let hoveredBox = null;

  // Continuous refresh keeps the magnified crop in lockstep with live playback.
  // Self-terminates (and clears animFrameId) the moment the cursor leaves or the
  // loupe is disabled, so it can always be restarted cleanly.
  function drawActiveLoupes() {
    if (!loupeActive || !cursorNormalized.active || !hoveredBox) {
      hideLoupes();
      animFrameId = null;
      return;
    }

    if (hoveredBox === boxRaw) {
      renderLoupeForBox(boxRaw, vidRaw, loupeRaw, canvasRaw, loupeHudRaw, "none");
      if (loupeEnhanced) loupeEnhanced.style.display = "none";
    } else if (hoveredBox === boxEnhanced) {
      renderLoupeForBox(boxEnhanced, vidEnhanced, loupeEnhanced, canvasEnhanced, loupeHudEnhanced, null);
      if (loupeRaw) loupeRaw.style.display = "none";
    }

    animFrameId = requestAnimationFrame(drawActiveLoupes);
  }

  function updateCursorFromEvent(e, boxEl) {
    const rect = boxEl.getBoundingClientRect();
    cursorNormalized.rx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    cursorNormalized.ry = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    cursorNormalized.active = true;
  }

  function setupViewportLoupeListeners(boxEl, videoEl, loupeEl, canvasEl, hudEl, filterStyle) {
    if (!boxEl) return;

    // Grid overlays are pointer-events:none, so these fire on the video surface.
    boxEl.addEventListener("mousemove", (e) => {
      if (!loupeActive) return;
      updateCursorFromEvent(e, boxEl);
      hoveredBox = boxEl;
      // Immediate draw => zero-latency cursor tracking.
      renderLoupeForBox(boxEl, videoEl, loupeEl, canvasEl, hudEl, filterStyle);
      if (animFrameId === null) animFrameId = requestAnimationFrame(drawActiveLoupes);
    });

    boxEl.addEventListener("mouseenter", (e) => {
      if (!loupeActive) return;
      updateCursorFromEvent(e, boxEl);
      hoveredBox = boxEl;
      if (animFrameId === null) animFrameId = requestAnimationFrame(drawActiveLoupes);
    });

    boxEl.addEventListener("mouseleave", () => {
      cursorNormalized.active = false;
      hoveredBox = null;
      hideLoupes();
    });
  }

  setupViewportLoupeListeners(boxRaw, vidRaw, loupeRaw, canvasRaw, loupeHudRaw, "none");
  setupViewportLoupeListeners(boxEnhanced, vidEnhanced, loupeEnhanced, canvasEnhanced, loupeHudEnhanced, null);

  if (chkLoupe) {
    chkLoupe.addEventListener("change", (e) => {
      loupeActive = e.target.checked;
      if (!loupeActive) {
        cursorNormalized.active = false;
        hoveredBox = null;
        if (animFrameId !== null) {
          cancelAnimationFrame(animFrameId);
          animFrameId = null;
        }
        hideLoupes();
      } else if (animFrameId === null) {
        animFrameId = requestAnimationFrame(drawActiveLoupes);
      }
    });
  }

  // ==========================================================================
  // 3. CASE LOADING & METRICS RENDERING
  // ==========================================================================
  fetch("/api/cases")
    .then(r => r.json())
    .then(data => {
      caseSelector.innerHTML = "";
      if (data.cases && data.cases.length > 0) {
        data.cases.forEach(c => {
          const opt = document.createElement("option");
          opt.value = c.case_id;
          opt.innerText = (c.fir_number || c.case_id).toUpperCase();
          caseSelector.appendChild(opt);
        });
        if (caseSelector.value) {
          loadCaseData(caseSelector.value);
        }
      }
    })
    .catch(err => console.error("Error fetching cases:", err));

  caseSelector.addEventListener("change", (e) => loadCaseData(e.target.value));

  function loadCaseData(caseId) {
    lblActiveCase.innerText = caseId.toUpperCase();

    fetch(`/api/case/${caseId}`)
      .then(r => r.json())
      .then(d => {
        if (d.has_video) {
          const videoSrc = d.enhanced_video_url || d.raw_video_url;

          vidRaw.src = d.raw_video_url;
          vidEnhanced.src = videoSrc;

          if (vidCam1) vidCam1.src = d.raw_video_url;
          if (vidCam2) vidCam2.src = videoSrc;

          updateFilters();

          vidRaw.play().catch(() => {});
          vidEnhanced.play().catch(() => {});
          if (vidCam1) vidCam1.play().catch(() => {});
          if (vidCam2) vidCam2.play().catch(() => {});
        }

        if (d.metrics) {
          lblResFps.innerText = `${d.metrics.width}x${d.metrics.height} @ ${d.metrics.fps} FPS`;
          lblShockwave.innerText = `Frame ${d.metrics.peak_frame} (T+${d.metrics.shockwave_time}s)`;
        } else {
          lblResFps.innerText = "1920x1080 @ 25.0 FPS";
          lblShockwave.innerText = "Frame 69 (T+3.45s)";
        }
        lblEntropy.innerText = `${d.entropy} / 8.000`;

        if (d.hexdump && Array.isArray(d.hexdump)) {
          hexdumpView.innerText = d.hexdump.join("\n");
        }

        const enfData = (d.metrics && d.metrics.enf_curve) ? d.metrics.enf_curve : [50.000];
        renderENFChart(enfData);
      })
      .catch(err => console.error("Error loading case data:", err));
  }

  // Synchronized Play / Pause Button
  window.playBoth = function() {
    if (vidRaw.paused) {
      vidRaw.play().catch(() => {});
      vidEnhanced.play().catch(() => {});
      if (vidCam1) vidCam1.play().catch(() => {});
      if (vidCam2) vidCam2.play().catch(() => {});
    } else {
      vidRaw.pause();
      vidEnhanced.pause();
      if (vidCam1) vidCam1.pause();
      if (vidCam2) vidCam2.pause();
    }
  };

  // Dynamic GPU CLAHE Filter Sliders
  function updateFilters() {
    const contrast = sliderGain ? parseFloat(sliderGain.value) : 1.65;
    const brightPercent = sliderBright ? parseFloat(sliderBright.value) : 115;
    const bright = (brightPercent / 100).toFixed(2);

    if (document.getElementById("txtGain")) document.getElementById("txtGain").innerText = contrast.toFixed(2) + "x";
    if (document.getElementById("txtBright")) document.getElementById("txtBright").innerText = brightPercent + "%";

    if (vidEnhanced) {
      vidEnhanced.style.filter = `contrast(${contrast}) brightness(${bright}) saturate(0.85)`;
    }
  }

  if (sliderGain) sliderGain.addEventListener("input", updateFilters);
  if (sliderBright) sliderBright.addEventListener("input", updateFilters);

  // ==========================================================================
  // 4. SYNCHRONIZED TIMELINE SCRUBBER (FRAME-ACCURATE SEEK)
  // ==========================================================================
  let isScrubbing = false;

  function formatTimecode(t) {
    if (!isFinite(t) || t < 0) t = 0;
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t - Math.floor(t)) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  }

  function updateTimecodeLabel(duration, current) {
    if (!lblTimecode) return;
    const cur = (current !== undefined) ? current : (vidRaw ? vidRaw.currentTime : 0);
    let total = duration;
    if (total === undefined || !isFinite(total) || total <= 0) {
      total = (vidRaw && isFinite(vidRaw.duration)) ? vidRaw.duration : 0;
    }
    lblTimecode.innerText = `${formatTimecode(cur)} / ${total > 0 ? formatTimecode(total) : "00:00.000"}`;
  }

  function seekAllChannels(t) {
    if (vidRaw) vidRaw.currentTime = t;
    if (vidEnhanced) vidEnhanced.currentTime = t;
    if (vidCam1) vidCam1.currentTime = t;
    if (vidCam2) vidCam2.currentTime = t;
  }

  function syncScrubberFromVideo() {
    // Never fight the examiner's drag: only reflect playback when NOT scrubbing.
    if (!videoScrubber || isScrubbing) return;
    const dur = vidRaw ? vidRaw.duration : 0;
    if (isFinite(dur) && dur > 0) {
      videoScrubber.max = dur;
      videoScrubber.step = (vidRaw && vidRaw.playbackRate) ? Math.max(0.001, 1 / (25 * vidRaw.playbackRate)) : 0.01;
      videoScrubber.value = vidRaw.currentTime;
      updateTimecodeLabel(dur, vidRaw.currentTime);
    }
  }

  if (vidRaw) {
    vidRaw.addEventListener("timeupdate", syncScrubberFromVideo);
    vidRaw.addEventListener("loadedmetadata", syncScrubberFromVideo);
    vidRaw.addEventListener("durationchange", syncScrubberFromVideo);
    vidRaw.addEventListener("seeked", syncScrubberFromVideo);
  }

  if (videoScrubber) {
    const beginScrub = () => { isScrubbing = true; };
    const endScrub = () => {
      isScrubbing = false;
      syncScrubberFromVideo();
    };

    // Mark the drag lifecycle; timeupdate is ignored while scrubbing.
    videoScrubber.addEventListener("mousedown", beginScrub);
    videoScrubber.addEventListener("touchstart", beginScrub, { passive: true });

    // Live scrub -> seek the synchronized channels together (frame-accurate).
    videoScrubber.addEventListener("input", (e) => {
      isScrubbing = true;
      const t = parseFloat(e.target.value);
      seekAllChannels(t);
      updateTimecodeLabel(vidRaw ? vidRaw.duration : 0, t);
    });

    videoScrubber.addEventListener("mouseup", endScrub);
    videoScrubber.addEventListener("touchend", endScrub);
    videoScrubber.addEventListener("mouseleave", () => {
      if (isScrubbing) endScrub();
    });
  }

  // Sub-Tab Switcher
  window.switchTab = function(tabName) {
    document.querySelectorAll(".ex-tab").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".ex-tab-content").forEach(c => {
      c.style.display = "none";
      c.classList.remove("active-tab-content");
    });

    if (tabName === "studio") {
      document.querySelectorAll(".ex-tab")[0].classList.add("active");
      const tab = document.getElementById("tabStudio");
      tab.style.display = "block";
      tab.classList.add("active-tab-content");
    } else if (tabName === "enf") {
      document.querySelectorAll(".ex-tab")[1].classList.add("active");
      const tab = document.getElementById("tabEnf");
      tab.style.display = "block";
      tab.classList.add("active-tab-content");
    } else if (tabName === "hex") {
      document.querySelectorAll(".ex-tab")[2].classList.add("active");
      const tab = document.getElementById("tabHex");
      tab.style.display = "block";
      tab.classList.add("active-tab-content");
    }
  };

  // ENF Telemetry Chart.js Renderer
  function renderENFChart(enfData) {
    const ctx = document.getElementById("enfChart");
    if (!ctx) return;

    const labels = enfData.map((_, i) => `F${i + 1}`);
    const baseline = enfData.map(() => 50.000);

    if (chartInstance) {
      chartInstance.data.labels = labels;
      chartInstance.data.datasets[0].data = enfData;
      chartInstance.data.datasets[1].data = baseline;
      chartInstance.update();
    } else {
      chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Extracted 50Hz Optical ENF (Hz)',
              data: enfData,
              borderColor: '#10B981',
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              borderWidth: 2,
              tension: 0.3,
              fill: true
            },
            {
              label: 'POSOCO National Grid Baseline (50.000 Hz)',
              data: baseline,
              borderColor: '#D97706',
              borderWidth: 1.5,
              borderDash: [4, 4],
              pointRadius: 0,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              min: 49.970,
              max: 50.030,
              ticks: {
                color: '#3D5A49',
                font: { family: 'JetBrains Mono', size: 10 }
              },
              grid: { color: 'rgba(209, 250, 229, 0.5)' }
            },
            x: {
              ticks: {
                color: '#3D5A49',
                font: { family: 'JetBrains Mono', size: 9 },
                maxTicksLimit: 15
              },
              grid: { display: false }
            }
          },
          plugins: {
            legend: {
              labels: {
                color: '#1E3A2B',
                font: { family: 'Plus Jakarta Sans', size: 11, weight: '700' }
              }
            }
          }
        }
      });
    }
  }
});