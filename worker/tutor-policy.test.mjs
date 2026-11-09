import test from "node:test";
import assert from "node:assert/strict";
import {
  isCorrectFittedTempScaling,
  isTempVsCalibConfusion,
  isNoulAsRefusal,
  classifyFeynmanKind,
  clampTutorOutput,
  buildTutorViz,
  pickCorsOrigin,
  capabilitiesPayload,
  collectTutorEvents,
  driveGeneration,
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

test("contrast and mixed temperature accounts are not stamped as one verdict", () => {
  const falseGap = "缺口：把随意调温度当成校准，没分开拟合的温度缩放和可靠性\n提示：随意 T 只改锋利度；拟合的温度缩放才是校准\n本轮摘要：随意T不是校准";
  const A = "在留出集上拟合的温度缩放是一种校准方法。随意指定的温度不是校准。";
  const B = "随意的温度只是锋利度，不是校准。留出集拟合的温度缩放是校准方法。";
  const C = "在校准集上拟合的温度缩放是一种校准方法，而且温度越高越准。";
  const english = "Fitted temperature scaling on a held-out set is a calibration method. An arbitrary temperature is not calibration.";
  const punct = "在留出集上拟合的温度缩放是一种校准方法；随意指定的温度不是校准";
  for (const text of [A, B, english, punct]) {
    const out = clampTutorOutput("feynman", falseGap, text, "lesson-0");
    assert.equal(out.includes("把随意调温度当成校准"), false, text + "\n" + out);
    assert.match(out, /拟合|held-out|calibration/i, out);
  }
  assert.equal(isCorrectFittedTempScaling(C), false);
  const mixed = clampTutorOutput("feynman", "缺口：已说明拟合的温度缩放是校准\n提示：留出集上的 ECE 要和拟合集分开报\n本轮摘要：说对了", C, "lesson-1");
  assert.match(mixed, /越准/);
  assert.equal(mixed.includes("未把它误当成随意拖的 T"), false, mixed);
});

test("negated noul refusal is not rewritten into the accusation", () => {
  const D = "noul 是 P(是)，不能把它当成拒答概率。";
  const variants = [
    D,
    "noul是P(是)；不能把它当成拒答概率",
    "noul is P(yes); it is not a refusal probability.",
    "noul 是 P(yes)。不能把它当成拒答概率。",
  ];
  const badModel = "缺口：把 noul 说成拒答概率，noul 是 P(是)\n提示：随意 T 只改锋利度\n本轮摘要：温度";
  for (const text of variants) {
    const out = clampTutorOutput("feynman", badModel, text, "lesson-0");
    assert.equal(out.includes("把 noul 说成拒答概率"), false, text + "\n" + out);
    assert.equal(/锋利度|把随意调温度/.test(out), false, out);
    assert.match(out, /P\(是\)|P\(yes\)/i, out);
  }
  const garbage = clampTutorOutput("feynman", "@@@\n不是三行", D, "lesson-2");
  assert.equal(garbage.includes("把 noul 说成拒答概率"), false, garbage);
});

test("punctuation and negation do not invent an accusation", () => {
  const accusing = [
    "缺口：把随意调温度当成校准，没分开拟合的温度缩放和可靠性\n提示：随意 T 只改锋利度\n本轮摘要：随意T不是校准",
    "缺口：把 noul 说成拒答概率，noul 是 P(是)\n提示：随意 T 只改锋利度\n本轮摘要：标题复读",
    "缺口：标题复读\n提示：三件套\n本轮摘要：标题复读",
  ];
  const fitted = "在留出集上拟合的温度缩放是一种校准方法";
  const arbitrary = "随意指定的温度不是校准";
  for (const sep of ["。", "；", "，", "、", ";", ",", "但"]) {
    const text = fitted + sep + arbitrary;
    for (const gap of accusing) {
      const out = clampTutorOutput("feynman", gap, text, "lesson-0");
      assert.equal(out.includes("把随意调温度当成校准"), false, sep + "\n" + out);
      assert.equal(out.includes("标题复读"), false, out);
      assert.match(out, /拟合/, out);
    }
  }
  const softened = ["温度越高并不会更准", "温度越高，不会更准", "不会更准", "温度越高并不是更准"];
  const unclear = ["noul 和拒答都要分清", "noul 到底是什么？", "温度和校准都要看。"];
  for (const text of softened.concat(unclear)) {
    for (const gap of accusing) {
      const out = clampTutorOutput("feynman", gap, text, "lesson-0");
      assert.equal(out.includes("把随意调温度当成校准"), false, text + "\n" + out);
      assert.equal(out.includes("把 noul 说成拒答概率"), false, text + "\n" + out);
      assert.equal(out.includes("标题复读"), false, text + "\n" + out);
      assert.equal(out.includes("并不成立"), false, text + "\n" + out);
      assert.match(out, /还是/, text + "\n" + out);
    }
  }
});

test("generation deadline covers a hung stream and a hung fallback", async () => {
  let streamClosed = false;
  const hanging = {
    [Symbol.asyncIterator]() {
      return {
        next() { return new Promise(() => {}); },
        return() { streamClosed = true; return Promise.resolve({ done: true }); },
      };
    },
  };
  await assert.rejects(
    driveGeneration(() => hanging, null, 40, async (value) => String(value || "")),
    /ai_timeout/
  );
  assert.equal(streamClosed, true);

  let fallbackStarted = false;
  const empty = {
    [Symbol.asyncIterator]() {
      return { next() { return Promise.resolve({ done: true }); } };
    },
  };
  await assert.rejects(
    driveGeneration(
      () => empty,
      () => { fallbackStarted = true; return new Promise(() => {}); },
      40,
      async (value) => String(value || "")
    ),
    /ai_timeout/
  );
  assert.equal(fallbackStarted, true);

  const fast = {
    [Symbol.asyncIterator]() {
      let n = 0;
      return {
        next() {
          n += 1;
          if (n === 1) return Promise.resolve({ value: "一句", done: false });
          return Promise.resolve({ done: true });
        },
      };
    },
  };
  let fallbackCalled = false;
  let got = "";
  await driveGeneration(
    () => fast,
    () => { fallbackCalled = true; return "不应调用"; },
    500,
    async (value) => { got += String(value || ""); return String(value || ""); }
  );
  assert.equal(got, "一句");
  assert.equal(fallbackCalled, false);
});

test("no kind displays an accusation the learner did not affirm", () => {
  const users = [
    "这里只写了概率",
    "打分",
    "依据",
    "分数",
    "把握",
    "输出看一下",
    "决策模型",
    "hello",
    "qzx wpl",
    "",
    "???",
  ];
  const gaps = [
    "缺口：把随意调温度当成校准，后面还有很长的一句没有根据的指责\n提示：随意 T 只改锋利度；拟合的温度缩放才是校准\n本轮摘要：把随意调温度当成校准",
    "缺口：把 noul 说成拒答概率，并且用很长的句子重复这个没有根据的判断\n提示：不会时走 noul 拒答\n本轮摘要：把 noul 说成拒答概率",
    "@@@\n把随意调温度当成校准\n把 noul 说成拒答概率\n标题复读",
    "缺口：" + "把随意调温度当成校准".repeat(6) + "\n提示：" + "把 noul 说成拒答概率".repeat(4),
  ];
  const accusation = /把随意调温度当成校准|把 noul 说成拒答|标题复读|只复读标题|说成了越准|越高越准并不成立/;
  for (const user of users) {
    for (const gap of gaps) {
      for (const lessonId of ["lesson-0", "lesson-3", "lesson-4", undefined]) {
        const out = clampTutorOutput("feynman", gap, user, lessonId);
        assert.equal(accusation.test(out), false, JSON.stringify({ user, lessonId, out }));
        assert.match(out, /还是|？/, out);
      }
    }
  }
  const enMixed = "Fitted temperature scaling on a held-out set is a calibration method. Hotter is more accurate.";
  assert.equal(isCorrectFittedTempScaling(enMixed), false);
  const mixedOut = clampTutorOutput(
    "feynman",
    "缺口：已说明拟合的温度缩放是校准，未把它误当成随意拖的 T\n提示：留出集\n本轮摘要：说对了",
    enMixed,
    "lesson-1"
  );
  assert.match(mixedOut, /越准/);
  assert.equal(mixedOut.includes("未把它误当成随意拖的 T"), false, mixedOut);
  const stillWrong = clampTutorOutput("feynman", gaps[0], "校准就是把温度调高", "lesson-0");
  assert.match(stillWrong, /把随意调温度当成校准/);
  const stillNoul = clampTutorOutput("feynman", gaps[1], "noul 就是拒答概率", "lesson-0");
  assert.match(stillNoul, /把 noul 说成拒答/);
});

test("an unclear temperature sentence is a question, not an invented gap", () => {
  const out = clampTutorOutput(
    "feynman",
    "缺口：标题复读\n提示：三件套\n本轮摘要：标题复读",
    "温度和校准都要看。",
    "lesson-0"
  );
  assert.equal(out.includes("把随意调温度当成校准"), false, out);
  assert.match(out, /还是/);
});

test("old live consensus cannot replace the embedded correction", async () => {
  const old = JSON.stringify({ v: 1, note: "校准 ≠ 调温度。不会则拒答（noul）。" });
  const result = await collectTutorEvents(
    { mode: "socratic", lessonId: "lesson-0", message: "我卡住了", history: [], answers: {} },
    {
      aiRun: async () => "追问：只问一个？\n本轮摘要：单点",
      loadConsensus: async () => ({ version: "1", text: old })
    }
  );
  const system = result.messages[0].content;
  assert.match(system, /noul 是 P\(是\)/);
  assert.match(system, /拟合的温度缩放是校准/);
  assert.equal(system.includes("不会则拒答"), false);
  assert.equal(system.includes("校准 ≠ 调温度"), false);
});

test("localhost is not on the production allowlist", () => {
  const local = { headers: { get: () => "http://127.0.0.1:8765" } };
  const named = { headers: { get: () => "http://localhost:8765" } };
  assert.equal(pickCorsOrigin(local, {}).includes("127.0.0.1"), false);
  assert.equal(pickCorsOrigin(named, {}).includes("localhost"), false);
  assert.equal(pickCorsOrigin(local, { DEV_ALLOW_ORIGINS: "http://127.0.0.1:8765" }), "http://127.0.0.1:8765");
  assert.equal(capabilitiesPayload({}).devOriginConfigured, false);
  assert.equal(capabilitiesPayload({ DEV_ALLOW_ORIGINS: "http://127.0.0.1:8765" }).devOriginConfigured, true);
  assert.equal(JSON.stringify(capabilitiesPayload({ DEV_ALLOW_ORIGINS: "http://127.0.0.1:8765" })).includes("127.0.0.1"), false);
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
    assert.equal(src.includes("7bfb41b"), false);
  });
});
