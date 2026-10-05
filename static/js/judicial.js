document.addEventListener("DOMContentLoaded", () => {
  const caseSel = document.getElementById("judicialCaseSelector");
  const affidavitPreview = document.getElementById("judicialAffidavitPreview");
  const btnDownload = document.getElementById("btnJudicialDownload");
  let activeCase = "case_101";

  fetch("/api/cases").then(r => r.json()).then(data => {
    caseSel.innerHTML = "";
    data.cases.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.case_id || c;
      opt.innerText = (c.fir_number || c).toUpperCase();
      caseSel.appendChild(opt);
    });
    loadAffidavit(caseSel.value);
  });

  caseSel.addEventListener("change", (e) => loadAffidavit(e.target.value));

  function loadAffidavit(caseId) {
    activeCase = caseId;
    fetch(`/api/certificate/${caseId}`).then(r => r.text()).then(text => {
      affidavitPreview.innerText = text;
    });
  }

  btnDownload.addEventListener("click", () => {
    window.location.href = `/api/certificate/${activeCase}`;
  });
});