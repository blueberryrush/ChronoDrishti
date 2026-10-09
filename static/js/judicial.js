document.addEventListener("DOMContentLoaded", () => {
  const caseSel = document.getElementById("judicialCaseSelector");
  const affidavitPreview = document.getElementById("judicialAffidavitPreview");
  const btnDownload = document.getElementById("btnJudicialDownload");
  let activeCase = "case_101";

  fetch("/api/cases")
    .then(r => r.json())
    .then(data => {
      caseSel.innerHTML = "";
      if (data.cases && data.cases.length > 0) {
        data.cases.forEach(c => {
          const opt = document.createElement("option");
          opt.value = c.case_id || c;
          opt.innerText = (c.fir_number || c.case_id || c).toUpperCase();
          caseSel.appendChild(opt);
        });
        activeCase = caseSel.value;
        loadAffidavit(activeCase);
      } else {
        affidavitPreview.innerText = "No cases available in vault.";
      }
    })
    .catch(err => {
      console.error("Error fetching cases for judicial portal:", err);
      affidavitPreview.innerText = "Error loading cases.";
    });

  caseSel.addEventListener("change", (e) => {
    activeCase = e.target.value;
    loadAffidavit(activeCase);
  });

  function loadAffidavit(caseId) {
    if (!caseId) return;
    affidavitPreview.innerText = "Generating statutory Section 63 affidavit...";
    fetch(`/api/certificate/${caseId}`)
      .then(r => r.text())
      .then(text => {
        affidavitPreview.innerText = text;
      })
      .catch(err => {
        console.error("Error loading certificate:", err);
        affidavitPreview.innerText = "Error generating certificate affidavit.";
      });
  }

  btnDownload.addEventListener("click", () => {
    if (activeCase) {
      window.location.href = `/api/certificate/${activeCase}`;
    }
  });
});