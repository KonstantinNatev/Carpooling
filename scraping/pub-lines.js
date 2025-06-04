const puppeteer = require("puppeteer");
const fs = require("fs");

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto("https://www.sofiatraffic.bg/bg/public-transport", {
    waitUntil: "networkidle2",
  });

  const extractedLines = await page.evaluate(() => {
    const app = document.querySelector("#app");
    if (!app || !app.dataset.page) return [];

    try {
      const data = JSON.parse(app.dataset.page);
      const linesByType = data?.props?.linesByType || {};

      const result = [];

      for (const type in linesByType) {
        const lines = linesByType[type];
        for (const line of lines) {
          result.push({
            line_id: line.id,
            name: line.name,
            ext_id: line.ext_id,
            type: line.type,
            color: line.tr_color,
            icon: line.tr_icon,
            isWeekend: 1, // или друга логика ако искаш да го изчисляваш
          });
        }
      }

      return result;
    } catch (e) {
      return [{ error: "⚠️ Проблем с JSON парсване", message: e.message }];
    }
  });

  fs.writeFileSync(
    "lines-for-schedule.json",
    JSON.stringify(extractedLines, null, 2),
    "utf-8"
  );
  console.log("✅ Записано: lines-for-schedule.json");

  await browser.close();
})();
