window.registerDomListeners = function () {
  document.getElementById("route-search-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const startName = document.getElementById("start-stop").value.trim().toLowerCase();
    const endName = document.getElementById("end-stop").value.trim().toLowerCase();
    window.findMatchingRoutes(startName, endName);
    window.bottomSheet?.open?.('half');
  });

  document.getElementById("reverse-direction-btn")?.addEventListener("click", () => {
    const startInput = document.getElementById("start-stop");
    const endInput = document.getElementById("end-stop");
    [startInput.value, endInput.value] = [endInput.value, startInput.value];
    window.findMatchingRoutes(startInput.value.trim(), endInput.value.trim());
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const selectedTab = btn.getAttribute("data-tab");
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((tab) => tab.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(selectedTab)?.classList.add("active");
    });
  });

  const infoPanel = document.getElementById("info-panel");
  const expandBtn = document.getElementById("expand-info-btn");
  expandBtn?.addEventListener("click", () => {
    const isCollapsed = infoPanel.classList.contains("collapsed");
    infoPanel.classList.toggle("collapsed", !isCollapsed);
    infoPanel.classList.toggle("expanded", isCollapsed);
    expandBtn.textContent = isCollapsed ? "⬇️" : "⬆️";
  });

  if (window.innerWidth <= 768 && infoPanel) {
    infoPanel.classList.add("collapsed");
  }
};

// ако се показва разписание през stopPanel -> отваряме панела
window.showSchedulePanel = (html) => {
  const panel = document.getElementById('schedule-panel');
  if (!panel) return;
  document.getElementById('schedule-content').innerHTML = decodeURIComponent(html);
  panel.style.display = 'block';
  // подсигуряваме видимост и на инфо панела на мобилно:
  if (window.bottomSheet?.initBottomSheet && window.innerWidth <= 768) {
    const ip = document.getElementById('info-panel');
    if (ip) { ip.style.height = '55vh'; ip.classList.add('expanded'); }
  }
};