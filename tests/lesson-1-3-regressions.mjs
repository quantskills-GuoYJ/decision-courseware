/**
 * Regressions from the preview review of lessons 1–3.
 * python3 -m http.server 8765 && node tests/lesson-1-3-regressions.mjs
 */
import { createRequire } from "module";
import { pathToFileURL } from "url";
import fs from "fs";

function loadPuppeteer() {
  const file = "/tmp/viztest/node_modules/puppeteer-core/package.json";
  const req = createRequire(pathToFileURL(file));
  return req("puppeteer-core");
}
const puppeteer = loadPuppeteer();
const BASE = process.env.COURSE_BASE || "http://127.0.0.1:8765";
const failures = [];
function check(name, cond, detail) {
  if (!cond) failures.push(name + (detail ? " :: " + detail : ""));
}

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
  window.fetch = function (url, opts) {
    const u = String(url);
    if (u.indexOf("/api/tutor") < 0) return orig(url, opts);
    if (opts && opts.method === "POST") window.__posts.push(String(opts.body || ""));
    return Promise.resolve(new Response("no", { status: 404 }));
  };
});

async function open(path) {
  await page.goto(BASE + "/" + encodeURI(path), { waitUntil: "networkidle0" });
}

await open("第2课-原语与拒答.html");
await page.$eval("[data-section-note='q1']", (el) => { el.value = "0.20 到底是什么"; });
await page.evaluate(() => document.querySelector("[data-section-note='q1']").nextElementSibling.click());
await page.waitForFunction(() => document.getElementById("askLog").innerText.indexOf("0.20 到底是什么") >= 0);
const firstQ = await page.$eval("#askLog", (el) => el.innerText);
await page.$eval("#askReply", (el) => { el.value = "是 P(是)"; });
await page.click("#askSend");
await page.waitForFunction(() => {
  const t = document.getElementById("askLog").innerText;
  return t.indexOf("是 P(是)") >= 0 && t.indexOf("互斥") >= 0;
});
const second = await page.$eval("#askLog", (el) => el.innerText);
check("answer is kept and the next local question differs", second.indexOf(firstQ.trim()) !== 0 || second.length > firstQ.length);
check("second prompt is not a repeat of the first", (second.match(/0\.20 是 P\(是\) 还是拒答概率/g) || []).length === 1, second);
await page.reload({ waitUntil: "networkidle0" });
const reloaded = await page.evaluate(() => ({
  log: document.getElementById("askLog").innerText,
  source: document.getElementById("askOut").textContent
}));
check("reload keeps the answer", reloaded.log.indexOf("是 P(是)") >= 0, reloaded.log);
check("reload keeps local label", reloaded.source.indexOf("本机引导提问") >= 0 && reloaded.source.indexOf("本课追问") < 0, reloaded.source);
await page.$eval("#askReply", (el) => { el.value = "已有仓位时"; });
await page.click("#askSend");
await page.waitForFunction(() => document.getElementById("askLog").innerText.indexOf("已经问完") >= 0);
const done = await page.$eval("#askLog", (el) => el.innerText);
check("finite local questions say they are finished", done.indexOf("不是自适应学伴") >= 0, done);
check("lesson 2 did not post", await page.evaluate(() => window.__posts.length) === 0);
await page.$eval("#scoreMass", (el) => { el.value = "0"; el.dispatchEvent(new Event("input", { bubbles: true })); });
const lowScore = await page.$eval("#scoreLine", (el) => el.textContent);
await page.$eval("#scoreMass", (el) => { el.value = "41"; el.dispatchEvent(new Event("input", { bubbles: true })); });
const highScore = await page.evaluate(() => ({
  text: document.getElementById("scoreLine").textContent,
  widths: Array.from(document.querySelectorAll("#scoreBars i")).map((el) => el.style.width)
}));
check("score at 0.41 shows exact probabilities and the rounding gap", highScore.text.indexOf("0.1475") >= 0 && highScore.text.indexOf("1.0000") >= 0 && highScore.text.indexOf("1.01") >= 0 && highScore.text.indexOf("四舍五入") >= 0, highScore.text);
check("expected score moves when mass moves to the top bin", highScore.text.indexOf("3.525") >= 0 && lowScore.indexOf("2.500") >= 0 && highScore.text !== lowScore, highScore.text);
check("bars use the exact mass", highScore.widths[4] === "41%" && highScore.widths[0] !== highScore.widths[4], highScore.widths.join(","));

await open("第1课-校准深挖.html");
await page.$eval("[data-section-note='q1']", (el) => { el.value = "本节评论已保存"; el.dispatchEvent(new Event("input", { bubbles: true })); });
await new Promise((r) => setTimeout(r, 500));
await page.click("#askSend");
const lesson1msg = await page.$eval("#askOut", (el) => el.textContent);
check("empty answer does not demand the separate note", lesson1msg.indexOf("先写一句笔记") < 0 && lesson1msg.indexOf("本节评论") >= 0, lesson1msg);

await open("第3课-门槛与代价.html");
await page.evaluate(() => {
  const el = document.getElementById("theta");
  el.value = "50";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const fp = document.getElementById("fpCost");
  if (fp) { fp.value = "2"; fp.dispatchEvent(new Event("input", { bubbles: true })); }
});
await page.$eval("[data-section-note='q1']", (el) => { el.value = "想问门槛"; });
await page.evaluate(() => document.querySelector("[data-section-note='q1']").nextElementSibling.click());
await page.waitForFunction(() => document.getElementById("askLog").innerText.indexOf("想问门槛") >= 0);
await page.reload({ waitUntil: "networkidle0" });
const theta = await page.$eval("#theta", (el) => el.value);
check("theta survives reload", theta === "50", theta);
const snap = await page.evaluate(() => window.__dmLessonState.snapshot());
check("export includes slider", snap.lab && snap.lab.theta === "50", JSON.stringify(snap.lab));
check("export includes conversation", JSON.stringify(snap.conversation).indexOf("想问门槛") >= 0);
check("export keeps envelope", snap.v === "dm-lesson-note-v1" && snap.lessonId === "lesson-3");

await page.$eval("#fy1", (el) => { el.value = "p 低于门槛，所以先不自动"; });
await page.evaluate(() => document.querySelector("[data-feynman='fy'] [data-follow-check]").click());
const fyOk = await page.$eval("[data-feynman='fy'] [data-follow-status]", (el) => el.textContent);
const fyEnabled = await page.$eval("#fy1", (el) => el.disabled);
check("p counts as 概率", fyOk.indexOf("词面自检通过") >= 0, fyOk);
check("accepted text stays editable", fyEnabled === false);
await page.$eval("#fy1", (el) => { el.value = "概率门槛"; });
await page.evaluate(() => document.querySelector("[data-feynman='fy'] [data-follow-check]").click());
const salad = await page.$eval("[data-feynman='fy'] [data-follow-status]", (el) => el.textContent);
check("keyword salad does not pass", salad.indexOf("词面自检通过") < 0, salad);
await page.$eval("#fy1", (el) => { el.value = "不是概率，只写了门槛二字旁边"; });
await page.evaluate(() => document.querySelector("[data-feynman='fy'] [data-follow-check]").click());
const neg = await page.$eval("[data-feynman='fy'] [data-follow-status]", (el) => el.textContent);
check("negated 概率 does not pass", neg.indexOf("否定") >= 0, neg);
const revisions = await page.evaluate(() => window.__dmLessonState.snapshot().feynman.fy.checks.length);
check("revisions are kept", revisions >= 3, String(revisions));

await page.click("[data-q-group='q1'] button[data-choice='block']");
await page.waitForFunction(() => !document.getElementById("experiment").hidden);
const cost = await page.$eval("#costOut", (el) => el.textContent);
const gate = await page.$eval("#gateOut", (el) => el.textContent);
const compared = await page.$eval("#policyCompare", (el) => el.textContent);
check("fp fn comparison is concrete", cost.indexOf("误自动") >= 0 && cost.indexOf("漏自动") >= 0 && cost.indexOf("代价分界") >= 0, cost);
check("hand threshold and cost boundary are different rules", gate.indexOf("手选门槛") >= 0 && gate.indexOf("可以自动") >= 0 && compared.indexOf("不一致") >= 0 && compared.indexOf("不是算错") >= 0, gate + "\n" + compared);

await browser.close();
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true }));
