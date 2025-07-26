window.showSchedulePanel = function (encodedHtml) {
  const panel = document.getElementById("schedule-panel");
  const content = document.getElementById("schedule-content");
  if (!panel || !content) return;

  const decodedHtml = decodeURIComponent(encodedHtml);
  content.innerHTML = decodedHtml;
  panel.style.display = "block";
};
