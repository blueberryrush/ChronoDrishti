document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("fieldUploadForm");
  const btnSubmit = document.getElementById("btnSubmitIngest");
  const ingestFileName = document.getElementById("ingestFileName");
  const ingestHash = document.getElementById("ingestHash");
  const processingStatus = document.getElementById("processingStatus");

  if (form) {
    form.addEventListener("submit", function(e) {
      e.preventDefault();

      const formData = new FormData(this);
      btnSubmit.innerText = "⚙️ PROCESSING OPENCV CLAHE & COMPUTING SHA-256...";
      btnSubmit.disabled = true;
      if (processingStatus) processingStatus.innerText = "Processing CLAHE & SHA-256...";

      fetch("/api/cases/upload", {
        method: "POST",
        body: formData
      })
      .then(res => {
        if (!res.ok) throw new Error("Upload failed");
        return res.json();
      })
      .then(data => {
        if (ingestFileName) ingestFileName.innerText = data.filename || "Uploaded File";
        if (ingestHash) ingestHash.innerText = data.hash || "Hash generated";
        if (processingStatus) processingStatus.innerText = "COMPLETED (CLAHE Stream Ready)";

        alert(`✅ Media successfully ingested into WORM Vault!\nCase ID: ${data.case_id}\nMaster SHA-256: ${data.hash}`);

        btnSubmit.innerText = "🔒 EXECUTE WRITE-BLOCK BITSTREAM INGESTION & LOCK HASH ➔";
        btnSubmit.disabled = false;
      })
      .catch(err => {
        console.error("Upload error:", err);
        alert("⚠️ Ingestion error: " + err.message);
        if (processingStatus) processingStatus.innerText = "Error during ingestion";
        btnSubmit.innerText = "🔒 EXECUTE WRITE-BLOCK BITSTREAM INGESTION & LOCK HASH ➔";
        btnSubmit.disabled = false;
      });
    });
  }
});