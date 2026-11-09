import test from "node:test";
import assert from "node:assert/strict";
import {
  isCorrectFittedTempScaling,
  isTempVsCalibConfusion,
  isNoulAsRefusal,
  classifyFeynmanKind,
  clampTutorOutput,
  buildTutorViz,
} from "./index.js";

const fittedOk =
  "在独立校准集上拟合的温度缩放是一种校准方法，测试集再看 ECE。随意拖的 T 不是这个方法。已经校准的概率仍可以再做温度缩放。";
const tempEquated = "校准就是把温度调高让概率更尖";
const hotter = "温度越高模型越准";
const noulOk = "noul 是 P(是)。拒答不是这个头，而是拿概率和门槛比的策略。";
const noulBad = "noul 就是拒答概率";
const gen = "大模型和决策模型输出不同";

test("fitted temperature scaling is not classified as confusion", () => {
  assert.equal(isCorrectFittedTempScaling(fittedOk), true);
  assert.equal(isTempVsCalibConfusion(fittedOk), false);
  assert.equal(classifyFeynmanKind(fittedOk, "把校准说成调温度/锋利度"), "calib-ok");
});

test("equating arbitrary temperature with calibration is still a mix-up", () => {
  assert.equal(isTempVsCalibConfusion(tempEquated), true);
  assert.equal(isTempVsCalibConfusion(hotter), true);
  assert.equal(classifyFeynmanKind(tempEquated, ""), "calib-mix");
});

test("clamp does not overwrite a correct fitted explanation with the old false gap", () => {
  const out = clampTutorOutput(
    "feynman",
    "缺口：把校准说成调温度/锋利度，没点出可靠性\n提示：校准看可靠性/ECE，不是调温度锋利度\n本轮摘要：校准≠调温度",
    fittedOk
  );
  assert.equal(out.includes("把校准说成调温度"), false);
  assert.equal(out.includes("不会则拒答"), false);
  assert.match(out, /拟合的温度缩放是校准|留出集/);
  const viz = buildTutorViz("feynman", out, fittedOk);
  assert.equal(viz.type, "calib-curve");
  assert.equal(viz.focus, "reliability");
  assert.equal(viz.caption.includes("校准≠调温度"), false);
  assert.match(viz.caption, /拟合/);
});

test("arbitrary temperature claim still opens the reliability chart", () => {
  const out = clampTutorOutput(
    "feynman",
    "缺口：标题复读\n提示：三件套\n本轮摘要：概念易混",
    tempEquated
  );
  assert.match(out, /随意调温度|锋利度|拟合/);
  const viz = buildTutorViz("feynman", out, tempEquated);
  assert.equal(viz.type, "calib-curve");
  assert.equal(viz.compare, "temp-vs-calib");
});

test("correct noul account is not rewritten as refusal-equals-noul", () => {
  assert.equal(isNoulAsRefusal(noulOk), false);
  const out = clampTutorOutput(
    "feynman",
    "缺口：没点出不会时要拒答（noul）\n提示：不会时走 noul 拒答\n本轮摘要：拒答",
    noulOk
  );
  assert.equal(/不会时要拒答|不会时走 noul 拒答/.test(out), false);
  assert.match(out, /P\(是\)/);
  const viz = buildTutorViz("feynman", out, noulOk);
  assert.equal(viz.type, "flow");
  assert.equal(viz.focus, "noul");
  assert.match(viz.caption, /P\(是\)/);
  assert.equal(viz.caption.includes("不会则拒答"), false);
});

test("calling noul a refusal probability is corrected", () => {
  assert.equal(isNoulAsRefusal(noulBad), true);
  const out = clampTutorOutput(
    "feynman",
    "缺口：标题复读\n提示：三件套\n本轮摘要：标题复读",
    noulBad
  );
  assert.match(out, /P\(是\)/);
  assert.match(out, /门槛/);
});

test("generative contrast still uses the flow chart", () => {
  const out = clampTutorOutput(
    "feynman",
    "缺口：概念易混\n提示：三件套\n本轮摘要：概念易混",
    gen
  );
  const viz = buildTutorViz("feynman", out, gen);
  assert.equal(viz.type, "flow");
  assert.equal(viz.compare, "gen-vs-decision");
  assert.equal(viz.focus, "choice");
  assert.equal(out.includes("选项钉死"), true);
});

test("secret bindings and routes stay in the source", () => {
  return import("fs").then((fs) => {
    const src = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");
    assert.match(src, /env\.WEBHOOK_URL/);
    assert.match(src, /env\.WEBHOOK_KEY/);
    assert.match(src, /pathname === "\/health"/);
    assert.match(src, /pathname === "\/api\/tutor"/);
    assert.match(src, /pathname === "\/submit"/);
    assert.match(src, /tutor_failed/);
    assert.equal(src.includes("Bearer sk-"), false);
  });
});
