const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  const collectedLogs = [];

  // Слушай всички завършени заявки
  page.on("requestfinished", async (request) => {
    const url = request.url();

    if (
      url.includes("/trip/getSchedule") ||
      url.includes("/searchLinesByName")
    ) {
      try {
        const response = await request.response();
        const text = await response.text();
        const timestamp = new Date().toISOString();

        const payload = request.postData?.() || null;

        // Добавяне към лог
        const logEntry = {
          timestamp,
          url,
          payload,
          response: text,
        };

        collectedLogs.push(logEntry);
        console.log(`📡 Засечена заявка: ${url}`);
        console.log("📦 Payload:", payload);
        console.log("✅ Отговор:", text.slice(0, 300), "...");

        // Ако е getSchedule заявка, запиши отделно файл
        if (url.includes("/trip/getSchedule")) {
          try {
            const json = JSON.parse(text);
            const name = json.line?.name || "unknown";
            const extId = json.line?.ext_id || "no_extid";
            const filename = `schedules/${extId}_${name}.json`;

            fs.mkdirSync("schedules", { recursive: true });
            fs.writeFileSync(filename, JSON.stringify(json, null, 2), "utf-8");
            console.log(`📁 Записан файл: ${filename}`);
          } catch (e) {
            console.warn("⚠️ Неуспешен запис на отделен файл:", e.message);
          }
        }
      } catch (e) {
        console.warn("⚠️ Проблем при обработка на заявка:", e.message);
      }
    }
  });

  // Отиди до сайта и изчакай ръчна навигация
  await page.goto("https://www.sofiatraffic.bg/bg/transport/schedules", {
    waitUntil: "networkidle2",
  });

  console.log("⏳ Изчакай 30 секунди за ръчна навигация...");
  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Запиши всички заявки в общ JSON файл
  fs.writeFileSync(
    "all_logs.json",
    JSON.stringify(collectedLogs.payload, null, 2),
    "utf-8"
  );
  console.log("✅ Всички данни записани в all_logs.json");

  await browser.close();
})();
