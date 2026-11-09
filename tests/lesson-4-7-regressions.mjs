/**
 * Regressions from the preview review of lessons 4–7, plus button results on lesson 2.
 * python3 -m http.server 8765 && node tests/lesson-4-7-regressions.mjs
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
await page.click("#normBtn");
await page.reload({ waitUntil: "networkidle0" });
const norm = await page.evaluate(() => ({
  text: document.getElementById("normOut").textContent,
  lab: window.__dmLessonState.snapshot().lab
}));
check("choice normalization survives reload", norm.text.indexOf("0.50") >= 0 && norm.lab.normText.indexOf("0.50") >= 0, norm.text);
check("score result is exported", norm.lab.scoreText && norm.lab.scoreText.indexOf("期望分") >= 0, norm.lab.scoreText);

await open("第4课-证据与泄漏.html");
const rows = await page.evaluate(() => ({
  fit: document.querySelectorAll("#fitRows tr").length,
  held: document.querySelectorAll("#evalRows tr").length,
  formula: document.body.textContent
}));
check("lesson 4 shows 8 fit rows", rows.fit === 8, String(rows.fit));
check("lesson 4 shows 5 held-out rows", rows.held === 5, String(rows.held));
check("lesson 4 formula is on the page", rows.formula.indexOf("平均 NLL") >= 0 && rows.formula.indexOf("ECE") >= 0 && rows.formula.indexOf("0.05") >= 0, rows.formula);
await page.click("[data-q-group='q1'] button[data-choice='no']");
await page.click("#runLeak");
const leak = await page.$eval("#leakOut", (el) => el.textContent);
const detail = await page.$eval("#leakDetail", (el) => el.textContent);
check("honest fit-NLL is separate from peeked held-out ECE", leak.indexOf("诚实") >= 0 && leak.indexOf("最小化平均 NLL") >= 0 && leak.indexOf("0.45") >= 0, leak);
check("peeking minimizes held-out ECE", leak.indexOf("偷看") >= 0 && leak.indexOf("最小化 ECE") >= 0 && leak.indexOf("1.45") >= 0 && leak.indexOf("不是留出") >= 0, leak);
check("bin counts are visible", detail.indexOf("留出") >= 0 && detail.indexOf("n=") >= 0 && detail.indexOf("p=") >= 0, detail);
await page.reload({ waitUntil: "networkidle0" });
const leakKept = await page.evaluate(() => ({
  text: document.getElementById("leakOut").textContent,
  lab: window.__dmLessonState.snapshot().lab
}));
check("leak comparison survives reload and export", leakKept.text.indexOf("偷看") >= 0 && leakKept.lab.leakText.indexOf("诚实") >= 0 && leakKept.lab.leakDetail.indexOf("n=") >= 0, leakKept.text);
await page.$eval("[data-section-note='q1']", (el) => { el.value = "选 T 用哪一份"; });
await page.evaluate(() => document.querySelector("[data-section-note='q1']").nextElementSibling.click());
await page.waitForFunction(() => document.getElementById("askLog").innerText.indexOf("选 T 用哪一份") >= 0);
await page.$eval("#askReply", (el) => { el.value = "拟合集选，留出集报"; });
await page.click("#askSend");
await page.waitForFunction(() => document.getElementById("askLog").innerText.indexOf("已经问完") >= 0);
await page.reload({ waitUntil: "networkidle0" });
const ask4 = await page.evaluate(() => ({
  log: document.getElementById("askLog").innerText,
  source: document.getElementById("askOut").textContent
}));
check("lesson 4 keeps the answer and local label", ask4.log.indexOf("拟合集选，留出集报") >= 0 && ask4.log.indexOf("已经问完") >= 0 && ask4.source.indexOf("本机引导提问") >= 0 && ask4.source.indexOf("本课追问") < 0, ask4.source + "\n" + ask4.log);

await open("第5课-期望与代价.html");
const euIntro = await page.evaluate(() => document.body.innerText);
check("neutral zero and break-even are stated", euIntro.indexOf("收益固定为 0") >= 0 && euIntro.indexOf("打平") >= 0 && euIntro.indexOf("严格为正") >= 0 && euIntro.indexOf("≥") >= 0, euIntro);
await page.click("[data-q-group='q1'] button[data-choice='neg']");
const eu = await page.$eval("#euOut", (el) => el.textContent);
check("0.55 with gain 1 and loss 3 is -0.80 and 0.75 is break-even", eu.indexOf("-0.80") >= 0 && eu.indexOf("0.75") >= 0 && eu.indexOf("收益是 0") >= 0 && eu.indexOf("不是普遍最优") >= 0, eu);
await page.$eval("#cost", (el) => { el.value = "1"; el.dispatchEvent(new Event("input", { bubbles: true })); });
await page.reload({ waitUntil: "networkidle0" });
const euKept = await page.evaluate(() => ({
  cost: document.getElementById("cost").value,
  text: document.getElementById("euOut").textContent,
  lab: window.__dmLessonState.snapshot().lab
}));
check("lesson 5 cost and comparison survive reload", euKept.cost === "1" && euKept.text.indexOf("0.50") >= 0 && euKept.text.indexOf("严格为正") >= 0 && euKept.lab.euText.indexOf("0.50") >= 0 && euKept.lab.cost === "1", euKept.text);

await open("第6课-分布变化.html");
const shiftRows = await page.evaluate(() => ({
  fit: document.querySelectorAll("#fitRows tr").length,
  held: document.querySelectorAll("#heldRows tr").length,
  logits: document.querySelectorAll("#logitRows tr").length,
  both: document.querySelectorAll("#bothRows tr").length
}));
check("lesson 6 lists every split", shiftRows.fit === 8 && shiftRows.held === 5 && shiftRows.logits === 5 && shiftRows.both === 5, JSON.stringify(shiftRows));
await page.click("[data-q-group='q1'] button[data-choice='no']");
await page.click("#runShift");
const shift = await page.$eval("#shiftOut", (el) => el.textContent);
check("in-sample ECE is labeled and is not the baseline", shift.indexOf("样本内") >= 0 && shift.indexOf("不能把它放在留出 ECE 旁边") >= 0, shift);
check("held-out is the reference", shift.indexOf("留出集 n=5") >= 0 && shift.indexOf("T = 0.45") >= 0, shift);
check("bootstrap interval is reproducible and does not claim drift", shift.indexOf("20261109") >= 0 && shift.indexOf("0.043 到 0.628") >= 0 && shift.indexOf("不能根据这两个点估计说已经发生漂移") >= 0 && shift.indexOf("没有 p 值") >= 0, shift);
check("joint change cannot isolate a cause", shift.indexOf("只能来自分数") >= 0 && shift.indexOf("不能分辨是分数还是标签") >= 0, shift);
check("dependence and sample size are stated", shift.indexOf("相邻误差相关") >= 0 && shift.indexOf("原样重复") >= 0 && shift.indexOf("n=40") >= 0, shift);
await page.reload({ waitUntil: "networkidle0" });
const shiftKept = await page.evaluate(() => window.__dmLessonState.snapshot());
check("shift report is in the export after reload", shiftKept.lab.shiftText.indexOf("样本内") >= 0 && shiftKept.lab.shiftText.indexOf("20261109") >= 0 && shiftKept.v === "dm-lesson-note-v1", shiftKept.lab.shiftText);

await open("第7课-离线决策.html");
const known = await page.evaluate(() => document.body.innerText);
check("event is defined before the payoff", known.indexOf("事件「是」") >= 0 && known.indexOf("P(是) = 0.62") >= 0 && known.indexOf("+1") >= 0 && known.indexOf("−3") >= 0 && known.indexOf("收益都是 0") >= 0, known);
check("switch is a classroom policy", known.indexOf("不是校准好的漂移检测器") >= 0 && known.indexOf("不计算 p 值") >= 0, known);
await page.click("[data-q-group='q1'] button[data-choice='hold']");
await page.$eval("#shift", (el) => { el.checked = false; el.dispatchEvent(new Event("change", { bubbles: true })); });
await page.reload({ waitUntil: "networkidle0" });
const policy = await page.evaluate(() => ({
  on: document.getElementById("shift").checked,
  text: document.getElementById("policyOut").textContent,
  lab: window.__dmLessonState.snapshot().lab
}));
check("policy switch and comparison survive reload", policy.on === false && policy.text.indexOf("开关关着") >= 0 && policy.text.indexOf("0.62") >= 0 && policy.text.indexOf("0.75") >= 0 && policy.lab.shift === false && policy.lab.policyText.indexOf("不自动的收益是 0") >= 0, policy.text);
await page.$eval("[data-section-note='q1']", (el) => { el.value = "先问事件"; });
await page.evaluate(() => document.querySelector("[data-section-note='q1']").nextElementSibling.click());
await page.waitForFunction(() => document.getElementById("askLog").innerText.indexOf("先问事件") >= 0);
await page.$eval("#askReply", (el) => { el.value = "先不自动"; });
await page.click("#askSend");
await page.waitForFunction(() => document.getElementById("askLog").innerText.indexOf("已经问完") >= 0 && document.getElementById("askLog").innerText.indexOf("不是自适应学伴") >= 0);
await page.reload({ waitUntil: "networkidle0" });
const ask7 = await page.evaluate(() => ({
  log: document.getElementById("askLog").innerText,
  source: document.getElementById("askOut").textContent,
  posts: window.__posts.length
}));
check("lesson 7 follow-up keeps answer and local label", ask7.log.indexOf("先不自动") >= 0 && ask7.source.indexOf("本机引导提问") >= 0 && ask7.posts === 0, ask7.source + "\n" + ask7.log);

await browser.close();
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true }));
