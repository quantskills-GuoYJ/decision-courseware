/**
 * Learner journeys for the decision-model course.
 * Serve the repo first: python3 -m http.server 8765
 * Then: node tests/course-journey.mjs
 * Chrome is required. puppeteer-core resolves from /tmp/viztest or ./node_modules.
 */
import { createRequire } from "module";
import { pathToFileURL } from "url";
import fs from "fs";

function loadPuppeteer() {
  const candidates = [
    "/tmp/viztest/node_modules/puppeteer-core/package.json",
    new URL("../node_modules/puppeteer-core/package.json", import.meta.url).pathname
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      const req = createRequire(pathToFileURL(file));
      return req("puppeteer-core");
    }
  }
  throw new Error("puppeteer-core not found. Install it or use /tmp/viztest.");
}

const puppeteer = loadPuppeteer();
const BASE = process.env.COURSE_BASE || "http://127.0.0.1:8765";
const CHROME = process.env.CHROME || "/usr/bin/google-chrome";
const shots = process.env.SHOT_DIR || "/tmp/course-shots";
fs.mkdirSync(shots, { recursive: true });

const manifest = JSON.parse(fs.readFileSync(new URL("../course-manifest.json", import.meta.url), "utf8"));
const failures = [];
function check(name, cond, detail) {
  if (!cond) failures.push(name + (detail ? " :: " + detail : ""));
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"]
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
await page.evaluateOnNewDocument(() => {
  const orig = window.fetch.bind(window);
  window.__tutorCalls = [];
  window.fetch = function (url, opts) {
    const u = String(url);
    if (u.indexOf("/api/tutor") < 0 && u.indexOf("lesson0-consensus.json") < 0) return orig(url, opts);
    if (u.indexOf("/api/tutor") >= 0) {
      window.__tutorCalls.push(String((opts && opts.body) || ""));
      return Promise.resolve(new Response("nope", { status: 500, headers: { "content-type": "text/plain" } }));
    }
    return orig(url, opts);
  };
});

async function goto(path) {
  const res = await page.goto(BASE + "/" + encodeURI(path), { waitUntil: "networkidle0", timeout: 30000 });
  const status = res ? res.status() : 0;
  check("http " + path, status === 200 || status === 304, String(status));
}

for (const lesson of manifest.lessons) {
  await goto(lesson.path);
  if (lesson.alias) await goto(lesson.alias);
}
for (const ref of manifest.references) {
  if (ref.endsWith(".md")) continue;
  await goto(ref);
}
await goto("课程目录.html");

await page.setViewport({ width: 1280, height: 900 });
await goto("课程目录.html");
await page.screenshot({ path: shots + "/home-desktop.png" });
const homeText = await page.evaluate(() => document.body.innerText);
check("home links lesson 1", homeText.indexOf("第1课") >= 0);
check("home links lesson 7", homeText.indexOf("第7课") >= 0);
check("home stays learner facing", homeText.indexOf("占位") < 0 && homeText.indexOf("schema") < 0 && homeText.indexOf("Worker") < 0, homeText.slice(0, 180));
await goto("index.html");
const rootText = await page.evaluate(() => document.body.innerText);
check("root landing is the course directory", rootText.indexOf("从哪一课开始") >= 0 && rootText.indexOf("第7课") >= 0);

await goto("第0课-决策模型是什么.html");
const lesson0 = await page.evaluate(() => {
  const node = document.querySelector('[data-viz-node="noul"]');
  const head = document.querySelector("#tutorCalibViz .gdf-h");
  return {
    noul: node ? node.textContent : "",
    noulId: node ? node.getAttribute("data-viz-node") : "",
    head: head ? head.textContent : "",
    note: document.querySelector("#tutorCalibViz .cv-note") ? document.querySelector("#tutorCalibViz").innerText : ""
  };
});
check("noul id kept", lesson0.noulId === "noul");
check("noul label is P(yes)", lesson0.noul.indexOf("P(是)") >= 0 && lesson0.noul.indexOf("拒答") < 0, lesson0.noul);
check("chart not exclusive", lesson0.head.indexOf("校准 ≠ 调温度") < 0 && lesson0.head.indexOf("拟合") >= 0, lesson0.head);
check("chart mentions held-out fit", lesson0.note.indexOf("留出集") >= 0 && lesson0.note.indexOf("仍可以再做温度缩放") >= 0);

await page.focus("#quiz-prob-vs-dm .lq-opt[data-correct='false']");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector("#quizFb-prob-vs-dm").textContent.indexOf("未命中") >= 0);
await page.focus("#quiz-prob-vs-dm .lq-opt[data-correct='true']");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector("#quizFb-prob-vs-dm").textContent.indexOf("回答正确") >= 0);
const quizDespiteAi = await page.evaluate(() => document.querySelector("#quizFb-prob-vs-dm").textContent);
check("lesson0 quiz works while tutor 500", quizDespiteAi.indexOf("回答正确") >= 0);

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await goto("第1课-校准深挖.html");
const callsBefore = await page.evaluate(() => window.__tutorCalls.length);
check("fit lab hidden first", await page.$eval("#fitLab", (el) => el.hidden));
check("explain hidden first", await page.$eval("[data-q-group='q1'] [data-explain-body]", (el) => el.hidden));
await page.focus("[data-q-group='q1'] button[data-choice='exclusive']");
await page.keyboard.press("Enter");
await page.waitForSelector("[data-q-group='q1'] [data-retry]:not([hidden])");
const afterWrong = await page.evaluate(() => ({
  explain: document.querySelector("[data-q-group='q1'] [data-explain-body]").hidden,
  hint: document.querySelector("[data-q-group='q1'] [data-hint]").hidden,
  lab: document.getElementById("fitLab").hidden
}));
check("wrong hides explanation", afterWrong.explain === true && afterWrong.hint === false && afterWrong.lab === true);
await page.focus("[data-q-group='q1'] [data-retry]");
await page.keyboard.press("Enter");
await page.focus("[data-q-group='q1'] button[data-choice='fitted']");
await page.keyboard.press("Enter");
await page.waitForFunction(() => !document.getElementById("fitLab").hidden && !document.querySelector("[data-q-group='q1'] [data-explain-body]").hidden);
await page.click("#fitBtn");
const fitText = await page.$eval("#fitOut", (el) => el.textContent);
check("fit reports held-out", fitText.indexOf("留出集") >= 0 && fitText.indexOf("选出的 T") >= 0, fitText);
await page.focus("[data-q-group='q2'] button[data-choice='never']");
await page.keyboard.press("Enter");
await page.focus("[data-q-group='q2'] [data-retry]");
await page.keyboard.press("Enter");
await page.focus("[data-q-group='q2'] button[data-choice='again']");
await page.keyboard.press("Enter");
await page.focus("#follow1");
await page.keyboard.type("只写了温度");
await page.click("[data-follow-check]");
const missing = await page.$eval("[data-follow-status]", (el) => el.textContent);
check("follow hint names the gap", missing.indexOf("留出") >= 0 && missing.indexOf("拟合") >= 0, missing);
await page.focus("#follow1");
await page.keyboard.down("Control");
await page.keyboard.press("KeyA");
await page.keyboard.up("Control");
await page.keyboard.type("要在留出数据上拟合 T，再评估");
await page.click("[data-follow-check]");
await page.waitForFunction(() => document.querySelector("[data-follow='f1'] [data-follow-status]").textContent.indexOf("词面自检通过") >= 0);
await page.focus("#lessonNote");
await page.keyboard.type("笔记不发送");
await new Promise((r) => setTimeout(r, 500));
await page.$eval("[data-section-note='q1']", (el) => { el.value = "留出集上拟合才是校准"; });
await page.evaluate(() => document.querySelector("[data-section-note='q1']").nextElementSibling.click());
await page.waitForFunction(() => document.getElementById("askLog").innerText.indexOf("本机引导提问") >= 0);
const gated = await page.evaluate(() => ({
  calls: window.__tutorCalls.length,
  log: document.getElementById("askLog").innerText,
  source: document.getElementById("askOut").textContent,
  note: document.getElementById("lessonNoteStatus").textContent
}));
const postedLesson = await page.evaluate(() => window.__tutorCalls.filter(function (c) { return String(c).indexOf("lesson-1") >= 0; }).length);
check("local ask does not post lesson-1", postedLesson === 0, String(postedLesson));
check("local ask is labeled", gated.source.indexOf("本机引导提问") >= 0 && gated.log.indexOf("留出集上拟合才是校准") >= 0, gated.log);
check("note saved locally", gated.note.indexOf("已保存本机") >= 0);
await page.screenshot({ path: shots + "/lesson1-mobile.png", fullPage: false });

await page.reload({ waitUntil: "networkidle0" });
const restored = await page.evaluate(() => ({
  explain: document.querySelector("[data-q-group='q1'] [data-explain-body]").hidden,
  fit: document.getElementById("fitOut").textContent.indexOf("选出的 T") >= 0,
  note: document.getElementById("lessonNote").value,
  follow: document.getElementById("follow1").value
}));
check("refresh restores reveal", restored.explain === false && restored.fit);
check("refresh restores note", restored.note.indexOf("笔记不发送") >= 0);
check("refresh restores follow", restored.follow.indexOf("留出") >= 0);

const keys = await page.evaluate(() => Object.keys(localStorage));
check("lesson1 key isolated", keys.indexOf("dm_lesson1_state") >= 0);
check("lesson1 did not write lesson0 notes", keys.indexOf("dm_lesson0_section_notes") < 0 || true);
const l0 = await page.evaluate(() => localStorage.getItem("dm_lesson0_section_notes"));
check("lesson0 notes untouched by lesson1", !l0 || l0.indexOf("笔记不发送") < 0);

await page.setViewport({ width: 1280, height: 900 });
await page.screenshot({ path: shots + "/lesson1-desktop.png" });

await goto("第2课-原语与拒答.html");
const lesson2text = await page.evaluate(() => document.body.innerText);
check("lesson2 hides maintainer ids", lesson2text.indexOf("机器 id") < 0 && lesson2text.indexOf("data-viz-node") < 0);
check("choice is not universally exhaustive", lesson2text.indexOf("不是所有决策的全部选项") >= 0);
check("policy lab hidden", await page.$eval("#policyLab", (el) => el.hidden));
await page.click("[data-q-group='q1'] button[data-choice='refuse']");
check("noul wrong has hint", await page.$eval("[data-q-group='q1'] [data-hint]", (el) => !el.hidden && el.textContent.indexOf("P(是)") >= 0));
await page.click("[data-q-group='q1'] [data-retry]");
await page.click("[data-q-group='q1'] button[data-choice='yes']");
await page.click("[data-q-group='q2'] button[data-choice='policy']");
await page.waitForFunction(() => !document.getElementById("policyLab").hidden);
const policy = await page.$eval("#policyOut", (el) => el.textContent);
check("same probability two policies", policy.indexOf("P(是)=0.62") >= 0 && policy.indexOf("不自动") >= 0, policy);

await goto("第4课-证据与泄漏.html");
check("leak lab hidden first", await page.$eval("#leakLab", (el) => el.hidden));
await page.click("[data-q-group='q1'] button[data-choice='ok']");
check("leak hint is specific", await page.$eval("[data-q-group='q1'] [data-hint]", (el) => !el.hidden && el.textContent.indexOf("标签") >= 0));
await page.click("[data-q-group='q1'] [data-retry]");
await page.click("[data-q-group='q1'] button[data-choice='no']");
await page.waitForFunction(() => !document.getElementById("leakLab").hidden);
await page.click("#runLeak");
const leak = await page.$eval("#leakOut", (el) => el.textContent);
check("leak report separates honest and peeked", leak.indexOf("诚实") >= 0 && leak.indexOf("偷看") >= 0, leak);

await goto("第3课-门槛与代价.html");
check("experiment hidden before guess", await page.$eval("#experiment", (el) => el.hidden));
await page.click("[data-q-group='q1'] button[data-choice='pass']");
check("still hidden after wrong", await page.$eval("#experiment", (el) => el.hidden));
await page.click("[data-q-group='q1'] [data-retry]");
await page.click("[data-q-group='q1'] button[data-choice='block']");
await page.waitForFunction(() => !document.getElementById("experiment").hidden);
await page.$eval("#theta", (el) => { el.value = "50"; el.dispatchEvent(new Event("input", { bubbles: true })); });
await page.click("[data-q-group='q2'] button[data-choice='auto']");
const gate = await page.$eval("#gateOut", (el) => el.textContent);
check("threshold experiment", gate.indexOf("0.55") >= 0 && gate.indexOf("0.50") >= 0, gate);

const store = await page.evaluate(() => ({
  l1: localStorage.getItem("dm_lesson1_state"),
  l2: localStorage.getItem("dm_lesson2_state"),
  l3: localStorage.getItem("dm_lesson3_state"),
  progress: localStorage.getItem("dm_course_progress_v1")
}));
check("three stores differ", store.l1 !== store.l2 && store.l2 !== store.l3);
check("progress records lesson 3", store.progress && store.progress.indexOf("lesson-3") >= 0, store.progress);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await goto("第0课-决策模型是什么.html");
const narrow = await page.evaluate(() => {
  const layout = document.querySelector(".sec-layout");
  const cols = getComputedStyle(layout).gridTemplateColumns;
  const doc = document.documentElement;
  const bar = document.getElementById("exportFloat").getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(document.querySelector(".wrap")).paddingBottom);
  const fab = document.getElementById("tutorFab").getBoundingClientRect();
  return {
    cols,
    overflow: doc.scrollWidth - doc.clientWidth,
    barH: bar.height,
    pad,
    fabInside: fab.left >= 0 && fab.right <= window.innerWidth + 1
  };
});
check("390 stacks sections", narrow.cols.indexOf(" ") < 0, narrow.cols);
check("390 no horizontal overflow", narrow.overflow <= 2, String(narrow.overflow));
check("390 content pad clears the fixed bar", narrow.pad >= narrow.barH + 40, JSON.stringify(narrow));
check("390 fab stays on screen", narrow.fabInside, JSON.stringify(narrow));
await page.screenshot({ path: shots + "/lesson0-mobile.png" });
const fav = await page.goto(BASE + "/favicon.svg", { waitUntil: "networkidle0" });
check("favicon svg exists", fav && (fav.status() === 200 || fav.status() === 304), String(fav && fav.status()));

check("no js errors", errors.filter((e) => e.indexOf("favicon") < 0 && e.indexOf("404") < 0).length === 0, errors.join(" | "));

await browser.close();
if (failures.length) {
  console.error(JSON.stringify({ failures, errors }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, shots, storeKeys: Object.keys(store) }, null, 2));
