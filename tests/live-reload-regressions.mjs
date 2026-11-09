/**
 * Live follow-up must survive reload. The shared lesson engine is used by lessons 1–7.
 * python3 -m http.server 8765 && node tests/live-reload-regressions.mjs
 */
import { createRequire } from "module";
import { pathToFileURL } from "url";

function loadPuppeteer() {
  const file = "/tmp/viztest/node_modules/puppeteer-core/package.json";
  const req = createRequire(pathToFileURL(file));
  return req("puppeteer-core");
}
const puppeteer = loadPuppeteer();
const BASE = process.env.COURSE_BASE || "http://127.0.0.1:8765";
const failures = [];
function check(name, cond, detail) {
  if (!cond) failures.push(name + (detail ? " :: " + String(detail).slice(0, 500) : ""));
}
const lessons = [
  ["lesson-1", "第1课-校准深挖.html", "dm_lesson1_state"],
  ["lesson-2", "第2课-原语与拒答.html", "dm_lesson2_state"],
  ["lesson-3", "第3课-门槛与代价.html", "dm_lesson3_state"],
  ["lesson-4", "第4课-证据与泄漏.html", "dm_lesson4_state"],
  ["lesson-5", "第5课-期望与代价.html", "dm_lesson5_state"],
  ["lesson-6", "第6课-分布变化.html", "dm_lesson6_state"],
  ["lesson-7", "第7课-离线决策.html", "dm_lesson7_state"],
];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"]
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 985 });
await page.evaluateOnNewDocument(() => {
  const orig = window.fetch.bind(window);
  window.__posts = [];
  window.__failTutor = false;
  window.__hang = false;
  window.__hangCap = false;
  window.__hangStream = false;
  window.fetch = function (url, opts) {
    const u = String(url);
    if (u.indexOf("/api/tutor") < 0) return orig(url, opts);
    if (window.__hangCap && u.indexOf("/capabilities") >= 0) return new Promise(() => {});
    if (u.indexOf("/capabilities") >= 0) {
      return Promise.resolve(new Response(JSON.stringify({
        ok: true,
        lessons: ["lesson-1", "lesson-2", "lesson-3", "lesson-4", "lesson-5", "lesson-6", "lesson-7"]
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    const body = opts && opts.body ? String(opts.body) : "";
    window.__posts.push(body);
    if (window.__hangStream && opts && String(opts.method || "").toUpperCase() === "POST") {
      return Promise.resolve(new Response(new ReadableStream({ start: function () {} }), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" }
      }));
    }
    if (window.__hang) return new Promise(() => {});
    if (window.__failTutor) {
      const err = "event: error\ndata: {\"code\":\"tutor_failed\",\"msg\":\"boom\"}\n\n";
      return Promise.resolve(new Response(err, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
    }
    const ok = "event: token\ndata: {\"t\":\"学伴这一问：先说依据？\"}\n\nevent: done\ndata: {\"summary\":\"单点\"}\n\n";
    return Promise.resolve(new Response(ok, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
  };
});

async function open(path) {
  await page.goto(BASE + "/" + encodeURI(path), { waitUntil: "networkidle0" });
}

for (const [id, file, key] of lessons) {
  await open(file);
  await page.$eval("[data-section-note='q1']", (el) => { el.value = "第一句 " + el.closest("body") && "想问依据"; });
  await page.evaluate((lesson) => {
    document.querySelector("[data-section-note='q1']").value = "想问依据 " + lesson;
    document.querySelector("[data-section-note='q1']").nextElementSibling.click();
  }, id);
  await page.waitForFunction(() => document.getElementById("askLog").innerText.indexOf("学伴这一问") >= 0);
  await page.reload({ waitUntil: "networkidle0" });
  const stored = await page.evaluate((storageKey) => {
    const raw = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return {
      busy: raw.ask && raw.ask.busy,
      log: document.getElementById("askLog").innerText,
      source: document.getElementById("askOut").textContent
    };
  }, key);
  check(id + " reload does not keep busy", stored.busy !== true, JSON.stringify(stored));
  check(id + " reload keeps the live source label", stored.source.indexOf("来源：学伴") >= 0, stored.source);
  await page.$eval("#askReply", (el) => { el.value = "第二句回答"; });
  const before = await page.evaluate(() => window.__posts.length);
  await page.click("#askSend");
  await page.waitForFunction(() => window.__posts.length >= 1 && document.getElementById("askLog").innerText.indexOf("第二句回答") >= 0);
  const after = await page.evaluate(() => ({
    n: window.__posts.length,
    body: window.__posts[window.__posts.length - 1] || "",
    log: document.getElementById("askLog").innerText,
    input: document.getElementById("askReply").value,
    source: document.getElementById("askOut").textContent
  }));
  check(id + " second answer is posted after reload", after.n > before && after.body.indexOf("第二句回答") >= 0, after.body);
  check(id + " second answer stays in the thread", after.log.indexOf("第二句回答") >= 0, after.log);
  check(id + " second answer keeps the live source label", after.source.indexOf("来源：学伴") >= 0, after.source);
}

await open("第1课-校准深挖.html");
await page.evaluate(() => {
  window.__failTutor = true;
  window.__posts = [];
  document.querySelector("[data-section-note='q1']").value = "错误也要留下";
  document.querySelector("[data-section-note='q1']").nextElementSibling.click();
});
await page.waitForFunction(() => document.getElementById("askOut").textContent.indexOf("本机引导提问") >= 0);
await page.reload({ waitUntil: "networkidle0" });
await page.evaluate(() => { window.__failTutor = true; });
await page.$eval("#askReply", (el) => { el.value = "失败后的下一句"; });
await page.click("#askSend");
await page.waitForFunction(() => {
  const source = document.getElementById("askOut").textContent;
  const label = document.getElementById("askSend").textContent;
  return document.getElementById("askLog").innerText.indexOf("失败后的下一句") >= 0 && source.indexOf("本机引导提问") >= 0 && label.indexOf("发送回答") >= 0;
});
const failed = await page.evaluate(() => ({
  log: document.getElementById("askLog").innerText,
  source: document.getElementById("askOut").textContent,
  input: document.getElementById("askReply").value,
  label: document.getElementById("askSend").textContent
}));
check("tutor_failed stays on the local label", failed.source.indexOf("本机引导提问") >= 0 && failed.source.indexOf("学伴") < 0, failed.source);
check("tutor_failed still accepts the next answer", failed.log.indexOf("失败后的下一句") >= 0 && failed.input === "" && failed.label.indexOf("发送回答") >= 0, failed.log + " / " + failed.label);

await open("第1课-校准深挖.html");
await page.evaluate(() => {
  window.__hangCap = true;
  document.querySelector("[data-section-note='q1']").value = "挂起的一句";
  document.querySelector("[data-section-note='q1']").nextElementSibling.click();
});
await page.waitForFunction(() => document.getElementById("askSend").textContent.indexOf("停止") >= 0);
await page.click("#askSend");
await page.waitForFunction(() => document.getElementById("askSend").textContent.indexOf("发送回答") >= 0);
const stoppedCap = await page.evaluate(() => ({
  log: document.getElementById("askLog").innerText,
  input: document.getElementById("askReply").value
}));
check("stopping a hung capabilities request keeps the comment", stoppedCap.log.indexOf("挂起的一句") >= 0, stoppedCap.log);
await page.evaluate(() => { window.__hangCap = false; });
await page.$eval("#askReply", (el) => { el.value = "挂起后还能答"; });
await page.click("#askSend");
await page.waitForFunction(() => document.getElementById("askLog").innerText.indexOf("挂起后还能答") >= 0 && window.__posts.some((body) => body.indexOf("挂起后还能答") >= 0));

await open("第2课-原语与拒答.html");
await page.evaluate(() => {
  window.__hangStream = true;
  window.__posts = [];
  document.querySelector("[data-section-note='q1']").value = "流挂起";
  document.querySelector("[data-section-note='q1']").nextElementSibling.click();
});
await page.waitForFunction(() => window.__posts.length >= 1 && document.getElementById("askSend").textContent.indexOf("停止") >= 0);
await page.click("#askSend");
await page.waitForFunction(() => document.getElementById("askSend").textContent.indexOf("发送回答") >= 0);
const stoppedStream = await page.evaluate(() => document.getElementById("askLog").innerText);
check("stopping a hung stream keeps the comment", stoppedStream.indexOf("流挂起") >= 0, stoppedStream);
await page.evaluate(() => { window.__hangStream = false; });
await page.$eval("#askReply", (el) => { el.value = "流恢复后"; });
await page.click("#askSend");
await page.waitForFunction(() => document.getElementById("askLog").innerText.indexOf("流恢复后") >= 0 && document.getElementById("askOut").textContent.indexOf("来源：学伴") >= 0);

await browser.close();
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, lessons: lessons.length }));
