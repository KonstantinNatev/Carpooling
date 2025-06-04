const puppeteer = require("puppeteer");
const fs = require("fs");

const lines = JSON.parse(fs.readFileSync("lines-for-schedule.json", "utf-8"));

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
  });
  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
  );

  fs.mkdirSync("schedules", { recursive: true });

  await page.goto("https://www.sofiatraffic.bg/bg/transport/schedules", {
    waitUntil: "domcontentloaded",
  });

  await new Promise((res) => setTimeout(res, 5000));

  await page.waitForSelector("input[placeholder='Линия']", { timeout: 10000 });

  for (const line of lines) {
    console.log(`🔍 Търсене на линия: ${line.name}`);

    const inputSelector = "input[placeholder='Линия']";
    const input = await page.$(inputSelector);

    if (!input) {
      console.warn("⚠️ Не е намерено поле за търсене.");
      continue;
    }

    // Изчисти с клик и Backspace
    await input.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await input.type(line.name, { delay: 100 });

    // Изчакай да се появи резултат, съдържащ точно името
    try {
      await page.waitForFunction(
        (selector, text) => {
          return Array.from(document.querySelectorAll(selector)).some(
            (el) => el.textContent.trim().toLowerCase() === text.toLowerCase()
          );
        },
        { timeout: 7000 },
        "ul li.cursor-pointer span",
        line.name
      );
    } catch {
      console.warn(`⚠️ Не се появи точен резултат за '${line.name}'`);
      continue;
    }

    // Клик на точния съвпадащ <li>
    const clicked = await page.evaluate((lineName) => {
      const items = Array.from(
        document.querySelectorAll("ul li.cursor-pointer")
      );
      const normalized = lineName.toLowerCase().replace(/^x/, "");

      const match = items.find((li) => {
        const span = li.querySelector("span");
        if (!span) return false;
        const text = span.textContent.trim().toLowerCase();
        return text === lineName.toLowerCase() || text === normalized;
      });

      if (match) {
        match.click();
        return true;
      }

      return false;
    }, line.name);

    if (!clicked) {
      console.warn(`⚠️ Линията ${line.name} не беше намерена в списъка.`);
      continue;
    }

    console.log("⏳ Изчакване на заявката /trip/getSchedule...");

    const response = await page
      .waitForResponse(
        (res) =>
          res.url().includes("/trip/getSchedule") &&
          res.request().method() === "POST",
        { timeout: 10000 }
      )
      .catch(() => null);

    if (!response) {
      console.warn("❌ Неуспешна заявка /trip/getSchedule.");
      continue;
    }

    const json = await response.json();
    const name = json.line?.name || "unknown";
    const extId = json.line?.ext_id || "no_extid";
    const filename = `schedules/${extId}_${name}.json`;

    fs.writeFileSync(filename, JSON.stringify(json, null, 2), "utf-8");
    console.log(`✅ Записан файл: ${filename}`);

    await new Promise((res) => setTimeout(res, 1000)); // Пауза
  }

  console.log("🏁 Всички линии обработени.");
  await browser.close();
})();
