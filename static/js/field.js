document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("fieldIngestForm");
  const logsContainer = document.getElementById("fieldLogsContainer");

  function loadLogs() {
    fetch("/api/audit-logs/case_101").then(r => r.json()).then(data => {
      logsContainer.innerHTML = "";
      data.logs.forEach(l => {
        const div = document.createElement("div");
        div.innerHTML = `<div><span class="text-dim">[${l.created_at || l.timestamp}]</span> <strong>${l.action}:</strong> ${l.details}</div>`;
        logsContainer.appendChild(div);
      });
    });
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fir = document.getElementById("fiFir").value;
    const ps = document.getElementById("fiPS").value;
    const dev = document.getElementById("fiDevice").value;
    const off = document.getElementById("fiOfficer").value;

    fetch("/api/cases/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fir_number: fir, police_station: ps, seized_device: dev, officer: off })
    })
    .then(r => r.json())
    .then(res => {
      alert(`Media Artifact Ingested Successfully!\nGenerated SHA-256: ${res.hash}`);
      form.reset();
      loadLogs();
    });
  });

  loadLogs();
});