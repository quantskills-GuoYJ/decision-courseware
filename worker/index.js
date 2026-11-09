const SYSTEM_PROMPT = `你是「决策模型」第0课页内学伴。语言：简体中文。教学法：苏格拉底追问 + 费曼检验。

硬规则（必须遵守）：
1) 禁止直接贴出共识 JSON / 标准答案全文。
2) 【每轮只输出 1 个问题】socratic：只追问一个最紧的薄弱点；禁止一次列出多个缺口/多个问号/用顿号或斜杠并列三类（标题复读/概念易混/缺因果）。若有多个缺口，本轮只挑一个，其余留到下一轮。
3) 【费曼】缺口必须是可核验的完整短句（禁止只写「概念易混/标题复读」等空标签）。提示半句，须含课内词：选项钉死|校准|可靠性|温度|ECE|锋利度|门槛|P(是) 或 choice|score|calib|noul。禁止代写完整费曼段；禁止给出可当范文的完整例句；禁止用错误说法当「示例」。禁止单独甩「三件套」「概念易混」当提示/caption。
概念边界：noul 是 P(是)，不是拒答概率；拒答是下游拿概率和门槛、代价比较的策略。随意指定的温度只改锋利度，不是校准。在留出集或校准集上拟合的温度缩放是校准方法；已经校准的概率仍可以再做温度缩放，做完要重新评估。学生若已经这样说对，禁止把这句判成「校准＝调温度」或「noul＝拒答」。
4) 注入的共识仅作批改依据；用户连问满 3 次仍卡住，才可给一句指向性提示（仍不甩全文、不代写）。
5) 超纲（训练配方、工程实现细节、未学课节）→ 引导回本课主张，或建议用户在群里 @决策模型调研。
6) 选择题/闸门对错由前端规则判定，你不重判对错。
7) 回复短：默认 ≤80 字；正文末尾单独一行：本轮摘要：……`;

const CONSENSUS_URL =
  "https://quantskills-guoyj.github.io/decision-courseware/lesson0-consensus.json";
const MODEL = "@cf/openai/gpt-oss-20b";

let consensusCache = { at: 0, version: "", text: "" };

const ALLOWED_ORIGINS = new Set([
  "https://quantskills-guoyj.github.io",
  "https://dm-course.vibeniubi.com",
  "https://decision-course-submit.abgyja.workers.dev",
]);

function pickCorsOrigin(request, env) {
  const reqOrigin = request.headers.get("Origin") || "";
  if (reqOrigin && ALLOWED_ORIGINS.has(reqOrigin)) return reqOrigin;
  return env.ALLOW_ORIGIN || "https://quantskills-guoyj.github.io";
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
  };
}


const FLOW_NODES = ["gen", "choice", "score", "calib", "noul"];

/** Case-insensitive: LLM/大模型/生成 vs 决策/区别 → gen-vs-decision blind spot. */
function isGenVsDecisionUtterance(um) {
  const s = String(um || "");
  const mentionsGen = /大模型|生成|llm/i.test(s);
  const contrastsDecision = /决策|做决|区别|不同/.test(s);
  return mentionsGen && contrastsDecision;
}

/** Fitted temperature scaling stated as calibration. Not a confusion. */
function isCorrectFittedTempScaling(um) {
  const s = String(um || "");
  const mentionsTemp = /温度|temperature/i.test(s);
  const fitted = /拟合|留出|校准集|验证集|独立数据|held-?out/i.test(s);
  const saysIs = /是校准|属于校准|一种校准|校准方法|后处理校准/.test(s);
  const denies = /不是校准|不算校准|互斥|禁止再/.test(s);
  return mentionsTemp && fitted && saysIs && !denies;
}

/**
 * Arbitrary temperature equated with calibration, or "hotter means more accurate".
 * Mentioning both words is not enough: a fitted T on a calibration set IS calibration.
 */
function isTempVsCalibConfusion(um) {
  const s = String(um || "");
  if (isCorrectFittedTempScaling(s)) return false;
  const tempAsAccuracy =
    /温度|temperature/i.test(s) && /越准|更准|更准确|才准|就准|变准/.test(s);
  const equates =
    /校准就是[^。\n]{0,12}温度|温度就是[^。\n]{0,12}校准|校准等于调温度|把校准说成调温度|只是调温度|只是锋利/.test(s);
  const sliderIsCalib = /随意|滑块|随便/.test(s) && /温度/.test(s) && /就是校准|等于校准/.test(s);
  return tempAsAccuracy || equates || sliderIsCalib;
}

/** noul described as P(yes), with refusal kept as a later policy. */
function isCorrectNoulAccount(um) {
  const s = String(um || "");
  if (!/noul/i.test(s)) return false;
  const pYes = /P\(是\)|是的概率|「是」的概率|是否问题/.test(s);
  const refusalNotHead = /不是拒答|不是这个头|拒答是/.test(s);
  return pYes && refusalNotHead;
}

/** Learner equates the noul head itself with refusal probability. */
function isNoulAsRefusal(um) {
  const s = String(um || "");
  if (isCorrectNoulAccount(s)) return false;
  return /noul/i.test(s) && /拒答概率|就是拒答|等于拒答/.test(s);
}

/**
 * Internal kind for templates (not shown bare to user).
 * gen-output | title-repeat | calib-mix | missing-score | refuse
 */
function classifyFeynmanKind(um, modelGap) {
  const s = String(um || "");
  const g = String(modelGap || "");
  if (isNoulAsRefusal(s)) return "noul-mix";
  // Chart1 blind spot first — keep flow/choice even if 概率 appears
  if (isGenVsDecisionUtterance(s) || (/输出/.test(s) && /不同|区别/.test(s))) return "gen-output";
  // Chart2 only when they equate arbitrary temperature with calibration.
  // A correct "fitted temperature scaling is calibration" must not land here.
  if (isCorrectFittedTempScaling(s)) return "calib-ok";
  if (isCorrectNoulAccount(s)) return "noul-ok";
  if (
    isTempVsCalibConfusion(s) ||
    /把校准说成调温度|校准当成调温度|概念易混/.test(g)
  )
    return "calib-mix";
  if (/标题复读/.test(g) || (/决策模型/.test(s) && s.length < 24 && !/选项|校准|打分|拒答|输出|温度/.test(s)))
    return "title-repeat";
  if (/分数|概率|把握|打分|依据/.test(s) || /缺因果|打分|依据/.test(g)) return "missing-score";
  if (/把生成当决策|生成/.test(g)) return "gen-output";
  if (/标题复读/.test(g)) return "title-repeat";
  if (/缺因果/.test(g)) return "missing-score";
  return "title-repeat";
}

/** focus priority: 输出/选项/钉死→choice; 分数/概率/把握→score; 可靠/ECE/温度→calib; noul 词本身→noul. 拒答 alone is a policy, not the noul node. */
function focusFromSignals(um, gapSentence, kind) {
  const s = String(um || "") + " " + String(gapSentence || "");
  if (kind === "noul-mix" || kind === "noul-ok" || /noul/i.test(s)) return "noul";
  if (/输出|选项|钉死/.test(s)) return "choice";
  if (/分数|概率|把握|打分|依据/.test(s)) return "score";
  if (/可靠|ECE|温度|锋利|校准/.test(s)) return "calib";
  if (kind === "missing-score") return "score";
  if (kind === "calib-mix" || kind === "calib-ok") return "calib";
  return "choice"; // title-repeat / gen-output default
}

function gapSentenceForKind(kind) {
  switch (kind) {
    case "gen-output":
      return "只说了输出不同，没点出选项钉死/校准/门槛";
    case "title-repeat":
      return "只复读标题，没点出选项钉死这一环";
    case "calib-mix":
      return "把随意调温度当成校准，没分开拟合的温度缩放和可靠性";
    case "calib-ok":
      return "已说明拟合的温度缩放是校准，未把它误当成随意拖的 T";
    case "missing-score":
      return "有选项但没点出打分/依据（score）";
    case "noul-mix":
      return "把 noul 说成拒答概率，noul 是 P(是)";
    case "noul-ok":
      return "已把 noul 说成 P(是)，拒答留在门槛策略";
    default:
      return "只复读标题，没点出选项钉死这一环";
  }
}

function tipForKind(kind) {
  switch (kind) {
    case "gen-output":
      return "先看 choice：选项是否钉死";
    case "title-repeat":
      return "补上选项钉死（choice）";
    case "calib-mix":
      return "随意 T 只改锋利度；拟合的温度缩放才是校准";
    case "calib-ok":
      return "留出集上的 ECE 要和拟合集分开报";
    case "missing-score":
      return "补上 score：打分/依据";
    case "noul-mix":
      return "noul 记 P(是)，拒答看门槛";
    case "noul-ok":
      return "门槛策略和 P(是) 已经分开";
    default:
      return "补上选项钉死（choice）";
  }
}

function captionForFocus(focus) {
  switch (focus) {
    case "choice":
      return "先看选项钉死（choice）";
    case "score":
      return "补上打分/依据（score）";
    case "calib":
      return "拟合的温度缩放是校准；随意 T 不是";
    case "reliability":
      return "拟合的温度缩放是校准；随意 T 不是";
    case "sharpness":
      return "随意 T 只改锋利度";
    case "noul":
      return "noul 是 P(是)，拒答看门槛";
    default:
      return "先看选项钉死（choice）";
  }
}

function isBareGapTag(s) {
  const t = String(s || "").trim();
  return !t || /^(标题复读|概念易混|缺因果|把生成当决策)$/.test(t) || t.length < 8;
}

function hasLessonWords(s) {
  return /选项钉死|校准|拒答|可靠性|温度|ECE|锋利度?|choice|score|calib|noul|打分|依据|选项|钉死/.test(
    String(s || "")
  );
}

const CALIB_CURVE_NODES = ["sharpness", "reliability"];
const CALIB_CURVE_CAPTION = "随意T只改锋利度；拟合的温度缩放是校准";

/** Normalize calib-curve focus: calib→reliability; only sharpness|reliability. */
function calibCurveFocus(raw) {
  const f = String(raw || "");
  if (f === "sharpness") return "sharpness";
  // alias calib → reliability (调研约定)
  return "reliability";
}

/** SSE done viz — flow (chart1) or calib-curve (chart2); REQUIRED for feynman when a gap exists. */
function buildTutorViz(mode, clampedText, userMessage) {
  const text = String(clampedText || "");
  const um = String(userMessage || "");
  const m = text.match(/缺口[:：]\s*([^\n]+)/);
  const gapLine = m ? m[1].trim() : "";
  if (mode !== "feynman" && !gapLine && !isGenVsDecisionUtterance(um)) return undefined;
  const kind = classifyFeynmanKind(um, gapLine);
  const gapSentence = isBareGapTag(gapLine) ? gapSentenceForKind(kind) : gapLine;

  // Chart2 when temperature and calibration are the topic, including a correct account.
  if (mode === "feynman" && (kind === "calib-mix" || kind === "calib-ok" || isTempVsCalibConfusion(um))) {
    return {
      type: "calib-curve",
      nodes: CALIB_CURVE_NODES.slice(),
      focus: calibCurveFocus("reliability"),
      compare: "temp-vs-calib",
      caption: CALIB_CURVE_CAPTION.slice(0, 40),
    };
  }

  // Chart1: gen-vs-decision flow
  const focus = focusFromSignals(um, gapSentence, kind);
  let caption = captionForFocus(focus).slice(0, 40);
  if (/^三件套$|^概念易混$/.test(caption) || !hasLessonWords(caption)) {
    caption = captionForFocus(focus).slice(0, 40);
  }
  return {
    type: "flow",
    nodes: FLOW_NODES.slice(),
    focus,
    compare: "gen-vs-decision",
    caption,
  };
}

function clampTutorOutput(mode, text, userMessage) {
  let t = String(text || "").trim();
  // strip optional markdown / labels noise
  t = t.replace(/^```[\s\S]*?```$/g, "").trim();
  const um = String(userMessage || "");
  if (mode === "socratic") {
    let question = "";
    const m = t.match(/追问[:：]\s*([^\n]*?[？?])/);
    if (m) question = m[1].trim();
    if (!question) {
      const q = t.split(/[？?]/);
      if (q.length > 1) question = q[0].replace(/^.*追问[:：]\s*/, "").trim();
    }
    if (!question) {
      // model blank / no question mark → hard fallback, still exactly 1 ask
      question = "若去掉「选项钉死」，还能否单靠校准概率称为决策模型？";
    }
    // keep only first ?
    question = question.split(/[？?]/)[0].trim() + "？";
    let abs = "";
    const am = t.match(/本轮摘要[:：]\s*([^\n]+)/);
    if (am) abs = am[1].trim().slice(0, 40);
    if (!abs) abs = "单点追问";
    t = "追问：" + question + "\n本轮摘要：" + abs;
  } else if (mode === "feynman") {
    const gapRaw = (t.match(/缺口[:：]\s*([^\n]+)/) || [, ""])[1].trim();
    const tipRaw = (t.match(/提示[:：]\s*([^\n]+)/) || [, ""])[1].trim();
    const absRaw = (t.match(/本轮摘要[:：]\s*(.+)/) || [, ""])[1].trim();
    const kind = classifyFeynmanKind(um, gapRaw);
    let gapSentence = gapRaw;
    if (isBareGapTag(gapSentence) || (isGenVsDecisionUtterance(um) && /概念易混|标题复读|缺因果|把生成当决策/.test(gapSentence))) {
      gapSentence = gapSentenceForKind(kind);
    }
    // Force gen-output sentence when utterance is clearly LLM-vs-decision / 输出不同
    if (isCorrectFittedTempScaling(um)) {
      if (/把校准说成|校准≠调温度|不是调温度锋利度|校准看可靠性\/ECE，不是/.test(gapSentence)) {
        gapSentence = gapSentenceForKind("calib-ok");
      }
    } else if (isCorrectNoulAccount(um)) {
      if (/不会时要拒答|noul 拒答|不会则拒答/.test(gapSentence)) {
        gapSentence = gapSentenceForKind("noul-ok");
      }
    } else if (isGenVsDecisionUtterance(um) || (/输出/.test(um) && /不同|区别/.test(um))) {
      gapSentence = gapSentenceForKind("gen-output");
    } else if (isTempVsCalibConfusion(um)) {
      gapSentence = gapSentenceForKind("calib-mix");
    } else if (isNoulAsRefusal(um)) {
      gapSentence = gapSentenceForKind("noul-mix");
    }
    gapSentence = gapSentence.replace(/[。！？.!?]+$/, "").slice(0, 48);
    let tipClean = tipRaw.replace(/[。！？.!?].*$/, "").trim().slice(0, 36);
    if (isCorrectFittedTempScaling(um) && /不是调温度|校准≠|不是调温度锋利度/.test(tipClean)) tipClean = "";
    if (isCorrectNoulAccount(um) && /noul 拒答|不会时走 noul/.test(tipClean)) tipClean = "";
    const tipBad =
      !tipClean ||
      /大模型|llm|用于做出决策|用来做决策|做出决策|三件套|^概念易混$/i.test(tipClean) ||
      !hasLessonWords(tipClean);
    const tipKind =
      isGenVsDecisionUtterance(um) || kind === "gen-output"
        ? "gen-output"
        : isCorrectFittedTempScaling(um)
          ? "calib-ok"
          : isTempVsCalibConfusion(um)
          ? "calib-mix"
          : isNoulAsRefusal(um)
            ? "noul-mix"
            : isCorrectNoulAccount(um)
              ? "noul-ok"
              : kind;
    if (tipBad) tipClean = tipForKind(tipKind);
    let absClean = absRaw.slice(0, 40);
    if (!absClean || isBareGapTag(absClean) || /概念易混|标题复读|缺因果|三件套/.test(absClean)) {
      absClean = gapSentence.slice(0, 40);
    }
    t = "缺口：" + gapSentence + "\n提示：" + tipClean + "\n本轮摘要：" + absClean;
  }
  if (!t.trim()) {
    t =
      mode === "feynman"
        ? "缺口：" +
          gapSentenceForKind("title-repeat") +
          "\n提示：" +
          tipForKind("title-repeat") +
          "\n本轮摘要：" +
          gapSentenceForKind("title-repeat").slice(0, 40)
        : "追问：若去掉「选项钉死」，还能否单靠校准概率称为决策模型？\n本轮摘要：单点追问";
  }
  return t;
}

function sseEncode(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function loadConsensus(preferredVersion) {
  const now = Date.now();
  if (consensusCache.text && now - consensusCache.at < 5 * 60 * 1000) {
    return consensusCache;
  }
  const res = await fetch(CONSENSUS_URL, { cf: { cacheTtl: 300 } });
  if (!res.ok) throw new Error("consensus_fetch_" + res.status);
  const json = await res.json();
  const text = JSON.stringify(json);
  const version =
    preferredVersion ||
    (json && (json.v || json.version) ? String(json.v || json.version) : "live");
  consensusCache = { at: now, version, text };
  return consensusCache;
}

function buildMessages(body, consensusText) {
  const mode = body.mode === "feynman" ? "feynman" : "socratic";
  const modeHint =
    mode === "feynman"
      ? [
          "当前 mode=feynman。",
          "输出格式严格三行：",
          "缺口：<可核验完整短句，禁止空标签「概念易混/标题复读」；例：只说了输出不同，没点出选项钉死/校准/门槛>",
          "提示：<半句，须含课内词 选项钉死|校准|门槛|P(是) 或 choice|score|calib|noul；禁止完整例句、错误说法、「三件套」>",
          "本轮摘要：<≤20字，勿只写空标签>",
          "noul 是 P(是)，不是拒答概率。拒答是门槛策略。",
          "在留出集上拟合的温度缩放是校准；随意指定的 T 不是。学生说对时不要写成校准≠调温度。",
          "示例（可模仿结构，勿照抄）：",
          "缺口：只说了输出不同，没点出选项钉死/校准/门槛",
          "提示：先看 choice：选项是否钉死",
          "本轮摘要：未点选项钉死",
          "若把随意调温度当成校准：",
          "缺口：把随意调温度当成校准，没分开拟合的温度缩放和可靠性",
          "提示：随意 T 只改锋利度；拟合的温度缩放才是校准",
          "本轮摘要：随意T不是校准",
        ].join("\n")
      : [
          "当前 mode=socratic。",
          "输出格式严格两行：",
          "追问：<只含一个问号的一句话>",
          "本轮摘要：<≤20字>",
          "禁止讲解定义、禁止一次多个问题、禁止列举多个缺口名。",
          "示例：",
          "追问：若选项未钉死，校准概率还能单独称为决策模型吗？",
          "本轮摘要：追问选项钉死",
        ].join("\n");
  const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  const system = [
    SYSTEM_PROMPT,
    modeHint,
    "lessonId=" + (body.lessonId || "lesson-0"),
    "consensusVersion=" + (body.consensusVersion || "live"),
    "【批改依据·禁止原文甩出】共识 JSON：",
    consensusText.slice(0, 12000),
    "【用户作答快照】",
    JSON.stringify(answers).slice(0, 4000),
  ].join("\n");

  const messages = [{ role: "system", content: system }];
  for (const h of history) {
    if (!h || !h.content) continue;
    const role = h.role === "assistant" ? "assistant" : "user";
    messages.push({ role, content: String(h.content).slice(0, 2000) });
  }
  const userMsg = String(body.message || "").slice(0, 4000);
  if (!history.length || history[history.length - 1].content !== userMsg) {
    messages.push({
      role: "user",
      content:
        mode === "feynman"
          ? "请批改我的费曼改写：\n" + userMsg
          : userMsg || "我卡住了，请按薄弱点追问一个问题。",
    });
  }
  return { mode, messages };
}

function extractSummary(fullText) {
  const m = String(fullText || "").match(/本轮摘要[:：]\s*(.+)\s*$/m);
  if (m) return m[1].trim().slice(0, 120);
  const line = String(fullText || "")
    .trim()
    .split(/\n/)
    .filter(Boolean)
    .pop();
  return (line || "").slice(0, 80);
}

async function handleTutor(request, env, cors) {
  if (!env.AI) {
    return Response.json(
      { ok: false, error: "AI binding missing" },
      { status: 500, headers: cors }
    );
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "invalid json" },
      { status: 400, headers: cors }
    );
  }
  if (!body || (body.mode !== "socratic" && body.mode !== "feynman")) {
    return Response.json(
      { ok: false, error: "mode must be socratic|feynman" },
      { status: 400, headers: cors }
    );
  }

  let consensus;
  try {
    consensus = await loadConsensus(body.consensusVersion);
  } catch (e) {
    return Response.json(
      { ok: false, error: "consensus_unavailable", detail: String(e && e.message || e) },
      { status: 502, headers: cors }
    );
  }

  const { mode, messages } = buildMessages(body, consensus.text);
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    let full = "";
    try {

      const aiStream = await env.AI.run(MODEL, {
        messages,
        stream: true,
        max_tokens: 256,
        temperature: 0.2,
      });

      const dec = new TextDecoder();
      let buf = "";

      async function consumeTextChunk(textPiece) {
        buf += textPiece;
        const parts = buf.split("\n");
        buf = parts.pop() || "";
        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload);
            const t =
              (j.response !== undefined && j.response) ||
              (j.content !== undefined && j.content) ||
              (j.text !== undefined && j.text) ||
              (j.output_text !== undefined && j.output_text) ||
              (j.choices && j.choices[0] && (
                (j.choices[0].delta && j.choices[0].delta.content) ||
                j.choices[0].text ||
                (j.choices[0].message && j.choices[0].message.content)
              )) ||
              "";
            if (t) full += t;
          } catch {
            /* ignore partial json */
          }
        }
      }

      async function consumeValue(value) {
        if (value == null) return;
        if (typeof value === "string") {
          // may be raw token or SSE line
          if (value.startsWith("data:") || value.includes("\n")) {
            await consumeTextChunk(value.endsWith("\n") ? value : value + "\n");
          } else {
            full += value;
          }
          return;
        }
        if (value instanceof Uint8Array || ArrayBuffer.isView(value)) {
          await consumeTextChunk(dec.decode(value, { stream: true }));
          return;
        }
        if (typeof value === "object") {
          const t =
            (value.response != null && String(value.response)) ||
            (value.token != null && String(value.token)) ||
            (value.content != null && String(value.content)) ||
            (value.text != null && String(value.text)) ||
            (value.output_text != null && String(value.output_text)) ||
            (value.choices && value.choices[0] && (
              (value.choices[0].delta && value.choices[0].delta.content) ||
              value.choices[0].text ||
              (value.choices[0].message && value.choices[0].message.content)
            )) ||
            "";
          if (t) full += t;
        }
      }

      if (aiStream && typeof aiStream[Symbol.asyncIterator] === "function") {
        for await (const chunk of aiStream) {
          await consumeValue(chunk);
        }
        if (buf.trim()) await consumeTextChunk("\n");
      } else if (aiStream && typeof aiStream.getReader === "function") {
        const r = aiStream.getReader();
        while (true) {
          const { done, value } = await r.read();
          if (done) break;
          await consumeValue(value);
        }
        if (buf.trim()) await consumeTextChunk("\n");
      } else if (aiStream && typeof aiStream === "object" && aiStream.response) {
        full = String(aiStream.response);
      }

      if (!full.trim()) {
        const once = await env.AI.run(MODEL, {
          messages,
          max_tokens: 256,
          temperature: 0.2,
        });
        full = String((once && (once.response || once.result || once.text)) || "");
        if (!full && once && once.choices) {
          full = String((once.choices[0] && (once.choices[0].message && once.choices[0].message.content || once.choices[0].text)) || "");
        }
      }

      full = clampTutorOutput(mode, full, body.message);
      // emit clamped final as SSE tokens (chunked for UX)
      if (full) {
        const step = 2;
        for (let i = 0; i < full.length; i += step) {
          await writer.write(encoder.encode(sseEncode("token", { t: full.slice(i, i + step) })));
        }
      }
      const summary = extractSummary(full);
      await writer.write(
        encoder.encode(
          sseEncode("done", {
            summary,
            mode,
            consensusVersion: consensus.version,
            viz: buildTutorViz(mode, full, body.message),
          })
        )
      );
    } catch (e) {
      await writer.write(
        encoder.encode(
          sseEncode("error", {
            code: "tutor_failed",
            msg: String(e && e.message || e).slice(0, 200),
          })
        )
      );
    } finally {
      try {
        await writer.close();
      } catch {
        /* ignore */
      }
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export {
  isCorrectFittedTempScaling,
  isTempVsCalibConfusion,
  isCorrectNoulAccount,
  isNoulAsRefusal,
  classifyFeynmanKind,
  clampTutorOutput,
  buildTutorViz,
  gapSentenceForKind,
  tipForKind,
  captionForFocus,
};

export default {
  async fetch(request, env) {
    const origin = pickCorsOrigin(request, env);
    const cors = corsHeaders(origin);
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }
      const u = new URL(request.url);
      const webhookUrl = env.WEBHOOK_URL || "";
      let webhookKey = "";
      // Resolve key: OBF (reverse+b64) preferred; B64 secret may be OBF-encoded or plain b64 or raw.
      function tryDecodeKey(raw, mode) {
        try {
          if (mode === "obf") return atob(String(raw).split("").reverse().join(""));
          if (mode === "b64") return atob(String(raw));
        } catch (_) {}
        return "";
      }
      if (env.WEBHOOK_KEY_OBF) webhookKey = tryDecodeKey(env.WEBHOOK_KEY_OBF, "obf");
      if (!webhookKey && env.WEBHOOK_KEY_B64) {
        const raw = String(env.WEBHOOK_KEY_B64);
        webhookKey = tryDecodeKey(raw, "obf") || tryDecodeKey(raw, "b64") || raw;
      }
      if (!webhookKey && env.WEBHOOK_KEY) webhookKey = String(env.WEBHOOK_KEY);

      if (request.method === "GET" && u.pathname === "/health") {
        return Response.json(
          {
            ok: true,
            hasUrl: Boolean(webhookUrl),
            hasKey: Boolean(webhookKey),
            hasAI: Boolean(env.AI),
            tutor: true,
          },
          { headers: cors }
        );
      }

      if (request.method === "POST" && u.pathname === "/api/tutor") {
        return handleTutor(request, env, cors);
      }

      // Same-origin front door: serve Pages HTML/assets so /api/tutor is same-host
      if (request.method === "GET" || request.method === "HEAD") {
        const pagesBase =
          env.PAGES_ORIGIN ||
          "https://cdn.jsdelivr.net/gh/quantskills-GuoYJ/decision-courseware@7bfb41b76b92cba8a2ede66c41bac1097e7ec33a";
        let path = u.pathname;
        if (path === "/" || path === "") path = "/index.html";
        const upstreamUrl = pagesBase.replace(/\/$/, "") + path + u.search;
        const upstream = await fetch(upstreamUrl, {
          method: request.method,
          headers: request.headers,
          redirect: "follow",
        });
        const headers = new Headers(upstream.headers);
        headers.set("Cache-Control", "public, max-age=60");
        // Strip framing restrictions from upstream if any
        headers.delete("X-Frame-Options");
        headers.delete("Content-Security-Policy");
        const lower = path.toLowerCase();
        const isHtml = lower.endsWith(".html") || lower.endsWith(".htm") || path === "/index.html";
        if (isHtml) {
          headers.set("Content-Type", "text/html; charset=utf-8");
        } else if (lower.endsWith(".json")) {
          headers.set("Content-Type", "application/json; charset=utf-8");
        } else if (lower.endsWith(".js")) {
          headers.set("Content-Type", "text/javascript; charset=utf-8");
        } else if (lower.endsWith(".css")) {
          headers.set("Content-Type", "text/css; charset=utf-8");
        }
        // On custom-domain / non-workers.dev hosts, force same-origin tutor
        // so clients that block *.workers.dev still work.
        if (isHtml && request.method === "GET") {
          let html = await upstream.text();
          const tutorBoot =
            "<script>window.COURSE_TUTOR=Object.assign({},window.COURSE_TUTOR||{},{url:location.origin+\"/api/tutor\"});</script>";
          if (html.includes("</head>")) {
            html = html.replace("</head>", tutorBoot + "</head>");
          } else {
            html = tutorBoot + html;
          }
          // Also rewrite any leftover absolute workers.dev tutor URLs in source
          html = html.split("decision-course-submit.abgyja.workers.dev").join(u.host);
          headers.delete("Content-Length");
          return new Response(html, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers,
          });
        }
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers,
        });
      }

      if (request.method === "POST" && (u.pathname === "/submit" || u.pathname === "/")) {
        if (!webhookUrl || !webhookKey) {
          return Response.json(
            { ok: false, error: "missing secrets" },
            { status: 500, headers: cors }
          );
        }
        const payload = await request.json();
        const upstream = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + webhookKey,
            "X-Automation-Key": webhookKey,
          },
          body: JSON.stringify(payload),
        });
        const text = await upstream.text();
        return Response.json(
          { ok: upstream.ok, status: upstream.status, body: text.slice(0, 500) },
          { status: upstream.status, headers: cors }
        );
      }

      return Response.json({ ok: false, error: "not found" }, { status: 404, headers: cors });
    } catch (e) {
      return Response.json(
        { ok: false, error: String(e && e.message || e) },
        { status: 500, headers: cors }
      );
    }
  },
};
