(function () {
  "use strict";
  var cfg = window.COURSE_LESSON;
  if (!cfg || !cfg.id || !cfg.storageKey) return;

  var PROGRESS_KEY = "dm_course_progress_v1";

  function readState() {
    try {
      var v = JSON.parse(localStorage.getItem(cfg.storageKey) || "{}");
      if (!v || typeof v !== "object" || Array.isArray(v)) return {};
      return v;
    } catch (e) { return {}; }
  }
  function writeState(state) {
    try { localStorage.setItem(cfg.storageKey, JSON.stringify(state)); } catch (e) {}
  }
  function readProgress() {
    try {
      var v = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
      if (!v || typeof v !== "object" || Array.isArray(v)) return {};
      return v;
    } catch (e) { return {}; }
  }
  function writeProgress(done) {
    var all = readProgress();
    all[cfg.id] = !!done;
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(all)); } catch (e) {}
  }

  var state = readState();
  if (!state.q || typeof state.q !== "object") state.q = {};
  if (!state.follow || typeof state.follow !== "object") state.follow = {};
  if (!state.feynman || typeof state.feynman !== "object") state.feynman = {};
  if (!state.ask || typeof state.ask !== "object") state.ask = { step: 0, asked: false, draft: "" };
  delete state.ask.busy;
  delete state.ask.abort;
  var askBusy = false;
  var askAbort = null;
  if (!state.sectionNotes || typeof state.sectionNotes !== "object") state.sectionNotes = {};
  if (!state.lab || typeof state.lab !== "object" || Array.isArray(state.lab)) state.lab = {};
  if (cfg.id === "lesson-1" && state.lab.fitText == null) {
    try {
      var oldFit = localStorage.getItem("dm_lesson1_fit");
      if (oldFit) state.lab.fitText = oldFit;
    } catch (eFit) {}
  }
  if (typeof state.note !== "string") state.note = "";

  function persist() {
    var busy = state.ask && state.ask.busy;
    var abort = state.ask && state.ask.abort;
    if (state.ask) {
      delete state.ask.busy;
      delete state.ask.abort;
    }
    writeState(state);
    refreshProgress();
    if (busy) state.ask.busy = busy;
    if (abort) state.ask.abort = abort;
  }

  function groupEls(group) {
    return {
      root: group,
      buttons: Array.prototype.slice.call(group.querySelectorAll("button[data-choice]")),
      hint: group.querySelector("[data-hint]"),
      status: group.querySelector("[data-status]"),
      retry: group.querySelector("[data-retry]"),
      explain: group.querySelector("[data-explain-body]")
    };
  }

  function paintQuestion(group) {
    var ui = groupEls(group);
    var id = group.getAttribute("data-q-group");
    var rec = state.q[id] || { phase: "open", choice: "" };
    ui.buttons.forEach(function (btn) {
      btn.classList.remove("wrong", "picked");
      btn.disabled = rec.phase !== "open";
      if (rec.choice && btn.getAttribute("data-choice") === rec.choice && rec.phase !== "open") {
        btn.classList.add(rec.phase === "ok" ? "picked" : "wrong");
      }
    });
    if (ui.hint) ui.hint.hidden = rec.phase !== "hint";
    if (ui.retry) ui.retry.hidden = rec.phase !== "hint";
    if (ui.explain) ui.explain.hidden = rec.phase !== "ok";
    if (ui.status) {
      ui.status.className = "status" + (rec.phase === "ok" ? " ok" : rec.phase === "hint" ? " bad" : "");
      ui.status.textContent = rec.phase === "ok" ? "已答对。解释已打开。" : rec.phase === "hint" ? "还没对。先看提示，再试一次。" : "";
    }
    var unlock = group.getAttribute("data-unlock");
    if (unlock) {
      var target = document.querySelector(unlock);
      if (target) target.hidden = rec.phase !== "ok";
    }
  }

  function onChoose(group, btn) {
    var id = group.getAttribute("data-q-group");
    var rec = state.q[id] || { phase: "open", choice: "" };
    if (rec.phase !== "open") return;
    var ok = btn.getAttribute("data-correct") === "true";
    state.q[id] = { phase: ok ? "ok" : "hint", choice: btn.getAttribute("data-choice") || "" };
    persist();
    paintQuestion(group);
    var ui = groupEls(group);
    if (!ok && ui.retry) {
      try { ui.retry.focus(); } catch (e) {}
    }
  }

  function onRetry(group) {
    var id = group.getAttribute("data-q-group");
    state.q[id] = { phase: "open", choice: "" };
    persist();
    paintQuestion(group);
    var first = group.querySelector("button[data-choice]");
    if (first) {
      try { first.focus(); } catch (e) {}
    }
  }

  document.querySelectorAll("[data-q-group]").forEach(function (group) {
    var id = group.getAttribute("data-q-group");
    if (!state.q[id]) state.q[id] = { phase: "open", choice: "" };
    group.querySelectorAll("button[data-choice]").forEach(function (btn) {
      btn.addEventListener("click", function () { onChoose(group, btn); });
    });
    var retry = group.querySelector("[data-retry]");
    if (retry) retry.addEventListener("click", function () { onRetry(group); });
    paintQuestion(group);
  });

  function bindPhrase(selector, bagName, okText) {
  document.querySelectorAll(selector).forEach(function (box) {
    var id = box.getAttribute("data-follow") || box.getAttribute("data-feynman");
    var area = box.querySelector("textarea");
    var check = box.querySelector("[data-follow-check]");
    var retry = box.querySelector("[data-follow-retry]");
    var status = box.querySelector("[data-follow-status]");
    var need = (box.getAttribute("data-need") || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    if (!state[bagName][id]) state[bagName][id] = { phase: "open", text: "" };
    if (area && !area.value) area.value = state[bagName][id].text || "";

    function paint() {
      var rec = state[bagName][id];
      var checks = rec.checks ? rec.checks.length : 0;
      if (status) {
        status.className = "status" + (rec.phase === "ok" ? " ok" : rec.phase === "hint" ? " bad" : "");
        if (rec.phase === "ok") status.textContent = okText + (checks ? "已核对 " + checks + " 次，可以改完再核对。" : "");
        else if (rec.phase === "hint") status.textContent = "词面自检还没通过：" + (rec.missing || "") + "。这不是语义批改，不代写。";
        else status.textContent = "";
      }
      if (retry) retry.hidden = rec.phase === "open";
      if (area) area.disabled = false;
    }
    function saveText() {
      var phase = state[bagName][id].phase;
      state[bagName][id].text = area ? area.value : "";
      if (phase !== "ok" && phase !== "hint") state[bagName][id].phase = "open";
      persist();
    }
    if (area) area.addEventListener("input", saveText);
    if (check) check.addEventListener("click", function () {
      var text = area ? String(area.value || "") : "";
      var verdict = phraseVerdict(text, need);
      var prev = state[bagName][id] || {};
      var checks = (prev.checks || []).concat([{ text: text, phase: verdict.phase }]).slice(-12);
      state[bagName][id] = { phase: verdict.phase, text: text, missing: verdict.missing, checks: checks };
      persist();
      paint();
    });
    if (retry) retry.addEventListener("click", function () {
      state[bagName][id].phase = "open";
      state[bagName][id].missing = "";
      persist();
      paint();
      if (area) {
        area.disabled = false;
        try { area.focus(); } catch (e) {}
      }
    });
    paint();
    });
  }
  function conceptHit(text, word) {
    var t = String(text || "");
    if (word === "概率") return /概率|置信|(?:^|[^a-z])p(?:[^a-z]|$)/i.test(t);
    if (word === "门槛") return /门槛|阈值|θ|theta/i.test(t);
    if (word === "留出") return /留出|测试集|held-?out/i.test(t);
    if (word === "拟合") return /拟合|选\s*T|估计/i.test(t);
    if (word === "校准") return /校准|calibration/i.test(t);
    if (word === "代价") return /代价|损失|成本|cost/i.test(t);
    if (word === "可靠") return /可靠|ECE|校准/i.test(t);
    if (word === "重新") return /重新|再算|重算/i.test(t);
    if (word === "窗口") return /窗口|新的一批|新数据/i.test(t);
    if (word === "标签") return /标签|标注/i.test(t);
    if (word === "不自动") return /不自动|转人工|先不自动/i.test(t);
    if (word === "0.75") return /0\.75|0\.750|3\s*\/\s*4|四分之三/.test(t);
    return t.indexOf(word) >= 0;
  }
  function conceptNegated(text, word) {
    var t = String(text || "");
    if (word === "概率") {
      if (/不是拒答概率|并非拒答概率/.test(t)) return false;
      return /不是概率|没有概率|并非概率/.test(t);
    }
    if (word === "门槛") return /不是门槛|没有门槛|并非门槛/.test(t);
    return new RegExp("不是" + word + "|没有" + word).test(t);
  }
  function keywordSalad(text, need) {
    var t = String(text || "");
    need.forEach(function (word) { t = t.split(word).join(" "); });
    t = t.replace(/概率|门槛|留出|拟合|校准|代价|可靠|重新|窗口|标签|不自动/g, " ");
    t = t.replace(/[pPθ0-9.\s，。、！？!?,.；;：:“”"'（）()\-]/g, "");
    return t.length < 4;
  }
  function phraseVerdict(text, need) {
    var raw = String(text || "");
    if (!raw.trim()) return { phase: "hint", missing: "先写一句，再核对" };
    if (keywordSalad(raw, need)) return { phase: "hint", missing: "只有关键词，不像一句解释" };
    var missing = [];
    need.forEach(function (word) {
      if (conceptNegated(raw, word)) missing.push(word + "（这句在否定它）");
      else if (!conceptHit(raw, word)) missing.push(word);
    });
    if (missing.length) return { phase: "hint", missing: "还缺 " + missing.join("、") };
    return { phase: "ok", missing: "" };
  }

  bindPhrase("[data-follow]", "follow", "词面自检通过，不是语义批改。");
  bindPhrase("[data-feynman]", "feynman", "词面自检通过，不是语义批改。");

  document.querySelectorAll("section[data-q-group]").forEach(function (sec) {
    var id = sec.getAttribute("data-q-group");
    if (!id || sec.querySelector("[data-section-note]")) return;
    var label = document.createElement("label");
    label.textContent = "本节评论";
    var area = document.createElement("textarea");
    area.setAttribute("data-section-note", id);
    var status = document.createElement("p");
    status.className = "status";
    status.setAttribute("data-section-status", id);
    status.setAttribute("role", "status");
    sec.appendChild(label);
    sec.appendChild(area);
    sec.appendChild(status);
  });

  document.querySelectorAll("[data-section-note]").forEach(function (area) {
    var id = area.getAttribute("data-section-note");
    if (!id) return;
    if (!area.value && state.sectionNotes[id]) area.value = state.sectionNotes[id];
    var status = document.querySelector('[data-section-status="' + id + '"]');
    var timer = null;
    area.addEventListener("input", function () {
      if (status) { status.className = "status"; status.textContent = "输入中…"; }
      clearTimeout(timer);
      timer = setTimeout(function () {
        state.sectionNotes[id] = area.value;
        persist();
        if (status) {
          status.className = "status ok";
          status.textContent = area.value.trim() ? "已保存本机" : "";
        }
      }, 400);
    });
  });

  var note = document.getElementById("lessonNote");
  var noteStatus = document.getElementById("lessonNoteStatus");
  if (note) {
    if (!note.value) note.value = state.note || "";
    var noteTimer = null;
    function markSaved() {
      state.note = note.value;
      persist();
      if (noteStatus) {
        noteStatus.className = "status ok";
        noteStatus.textContent = note.value.trim() ? "已保存本机" : "";
      }
    }
    if (state.note && noteStatus) {
      noteStatus.className = "status ok";
      noteStatus.textContent = "已保存本机";
    }
    note.addEventListener("input", function () {
      if (noteStatus) {
        noteStatus.className = "status";
        noteStatus.textContent = "输入中…";
      }
      clearTimeout(noteTimer);
      noteTimer = setTimeout(markSaved, 400);
    });
  }

  var askSend = document.getElementById("askSend");
  var askOut = document.getElementById("askOut");
  var askReply = document.getElementById("askReply");
  var promptSource = Array.isArray(cfg.offlinePrompts) && cfg.offlinePrompts.length
    ? cfg.offlinePrompts
    : ["你这句里，哪一个词是你最没把握的？只答那一个。"];
  var prompts = [];
  var seenPrompt = {};
  promptSource.forEach(function (item) {
    var text = String(item || "").trim();
    if (!text || seenPrompt[text]) return;
    seenPrompt[text] = true;
    prompts.push(text);
  });
  var LOCAL_DONE = "本机写好的问题已经问完。这不是自适应学伴。可以改本节评论后再发送，或在学伴接入后点重试。";
  if (!Array.isArray(state.ask.turns)) state.ask.turns = [];
  if (state.ask.asked && !state.ask.turns.length) {
    state.ask.mode = state.ask.mode || "local";
    state.ask.turns = [{ role: "assistant", source: "local", text: prompts[0] }];
    state.ask.step = Math.max(1, state.ask.step || 1);
  }
  var askLog = document.getElementById("askLog");
  if (!askLog && askOut) {
    askLog = document.createElement("div");
    askLog.id = "askLog";
    askLog.className = "out";
    askOut.parentNode.insertBefore(askLog, askOut);
  }
  var askIntro = document.querySelector("#ask p");
  if (askIntro) {
    askIntro.textContent = "发送并追问使用上面「本节评论」里的原文，不使用费曼那一格。下面的框只用来回答刚出现的问题。本机问题是写好的有限几句，问完会说明结束。";
  }
  if (askReply) {
    var replyLabel = document.querySelector("label[for='askReply']");
    if (replyLabel) replyLabel.textContent = "回答这一问";
  }
  if (askSend) askSend.textContent = "发送回答";
  if (askReply && state.ask.draft && !askReply.value) askReply.value = state.ask.draft;
  if (askReply) {
    askReply.addEventListener("input", function () {
      state.ask.draft = askReply.value;
      persist();
    });
  }
  function tutorUrl() {
    var configured = "";
    if (window.COURSE_TUTOR && window.COURSE_TUTOR.url) configured = String(window.COURSE_TUTOR.url).trim();
    if (!configured) configured = "https://dm-course.vibeniubi.com/api/tutor";
    var host = "";
    try { host = String(location.host || "").toLowerCase(); } catch (e) {}
    if (host === "dm-course.vibeniubi.com" && configured.replace(/\/+$/, "") === "https://dm-course.vibeniubi.com/api/tutor") {
      return "/api/tutor";
    }
    return configured;
  }
  function capabilitiesUrl(api) {
    return String(api || "").replace(/\/api\/tutor\/?$/, "/api/tutor/capabilities");
  }
  function sourceName(source) {
    return source === "live" ? "学伴" : "本机引导提问";
  }
  function renderThread() {
    if (askLog) {
      askLog.textContent = "";
      state.ask.turns.forEach(function (turn) {
        var line = document.createElement("p");
        var who = turn.role === "user" ? "我" : sourceName(turn.source || state.ask.mode || "local");
        line.textContent = who + "：" + turn.text;
        askLog.appendChild(line);
      });
    }
    if (!askOut) return;
    askOut.className = "status";
    if (!state.ask.turns.length) askOut.textContent = "";
    else askOut.textContent = "来源：" + sourceName(state.ask.mode || "local");
  }
  function pushTurn(role, text, source) {
    state.ask.turns.push({ role: role, text: String(text || "").slice(0, 2000), source: source });
    if (state.ask.turns.length > 24) state.ask.turns = state.ask.turns.slice(-24);
  }
  function askedLocal(text) {
    return state.ask.turns.some(function (turn) {
      return turn.role === "assistant" && turn.text === text;
    });
  }
  function nextLocalQuestion() {
    var i;
    for (i = 0; i < prompts.length; i++) {
      if (!askedLocal(prompts[i])) {
        pushTurn("assistant", prompts[i], "local");
        state.ask.step = i + 1;
        state.ask.done = false;
        return;
      }
    }
    state.ask.step = prompts.length;
    state.ask.done = true;
    if (!askedLocal(LOCAL_DONE)) pushTurn("assistant", LOCAL_DONE, "local");
  }
  function localContinue(preface) {
    state.ask.mode = "local";
    state.ask.asked = true;
    if (preface) pushTurn("assistant", preface, "local");
    if (!state.ask.done) nextLocalQuestion();
    persist();
    renderThread();
  }
  function readSseText(res, onEvent) {
    var sse = { buf: "", event: "", data: [] };
    function dispatch() {
      if (!sse.event && !sse.data.length) return;
      var raw = sse.data.join("\n");
      var name = sse.event || "message";
      sse.event = "";
      sse.data = [];
      var payload = {};
      if (raw) { try { payload = JSON.parse(raw); } catch (e) { payload = { msg: raw }; } }
      onEvent(name, payload);
    }
    function line(one) {
      if (one === "") { dispatch(); return; }
      if (one.indexOf("event:") === 0) { sse.event = one.slice(6).trim(); return; }
      if (one.indexOf("data:") === 0) {
        var v = one.slice(5);
        if (v.charAt(0) === " ") v = v.slice(1);
        sse.data.push(v);
      }
    }
    function consume(text) {
      sse.buf += text;
      var parts = sse.buf.split(/\n/);
      sse.buf = parts.pop();
      parts.forEach(line);
    }
    if (!res.body || !res.body.getReader) {
      return res.text().then(function (text) { consume(text); if (sse.buf) line(sse.buf); dispatch(); });
    }
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    function pump() {
      return reader.read().then(function (result) {
        if (result.done) { if (sse.buf) line(sse.buf); dispatch(); return; }
        consume(decoder.decode(result.value, { stream: true }));
        return pump();
      });
    }
    return pump();
  }
  function finishAsk() {
    askBusy = false;
    askAbort = null;
    if (askSend) askSend.textContent = "发送回答";
  }
  function liveAsk(api, message, modeName) {
    askBusy = true;
    if (askSend) askSend.textContent = "停止";
    var acc = "";
    var stopped = false;
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    askAbort = function () { stopped = true; if (ctrl) ctrl.abort(); };
    if (askOut) { askOut.className = "status"; askOut.textContent = "正在问学伴…"; }
    var history = state.ask.turns.filter(function (turn) {
      return turn.role === "user" || turn.role === "assistant";
    }).slice(-8).map(function (turn) {
      return { role: turn.role, content: turn.text };
    });
    var body = {
      mode: modeName || "socratic",
      lessonId: cfg.id,
      message: message,
      answers: { note: state.note || "", sectionNotes: state.sectionNotes || {} },
      history: history,
      locale: "zh-Hans"
    };
    var opts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    if (ctrl) opts.signal = ctrl.signal;
    fetch(api, opts).then(function (res) {
      if (!res.ok) throw new Error("http");
      return readSseText(res, function (name, payload) {
        if (name === "token") acc += payload && payload.t != null ? String(payload.t) : "";
        if (name === "error") throw new Error("sse");
      });
    }).then(function () {
      if (stopped) return;
      pushTurn("assistant", acc || "（学伴没有返回文字）", "live");
      state.ask.mode = "live";
      finishAsk();
      persist();
      renderThread();
    }).catch(function () {
      if (stopped) return;
      finishAsk();
      localContinue("学伴暂时不可用，已改用本机引导提问。");
    });
  }
  function routeAsk(message) {
    if (askBusy) return false;
    var api = tutorUrl();
    askBusy = true;
    if (askSend) askSend.textContent = "停止";
    fetch(capabilitiesUrl(api), { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("cap");
      return res.json();
    }).then(function (cap) {
      var lessons = cap && Array.isArray(cap.lessons) ? cap.lessons : [];
      if (lessons.indexOf(cfg.id) >= 0) {
        liveAsk(api, message, "socratic");
      } else {
        finishAsk();
        localContinue("");
      }
    }).catch(function () {
      finishAsk();
      localContinue("");
    });
    return true;
  }
  function sendSectionComment(text) {
    var raw = String(text || "").trim();
    if (!raw) {
      if (askOut) { askOut.className = "status bad"; askOut.textContent = "先写本节评论，再发送并追问。"; }
      return;
    }
    pushTurn("user", raw, state.ask.mode || "local");
    persist();
    routeAsk(raw);
  }
  document.querySelectorAll("[data-section-note]").forEach(function (area) {
    if (area.getAttribute("data-ask-wired")) return;
    area.setAttribute("data-ask-wired", "1");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "act";
    btn.textContent = "发送并追问";
    btn.addEventListener("click", function () { sendSectionComment(area.value); });
    area.insertAdjacentElement("afterend", btn);
  });
  if (askSend) {
    askSend.addEventListener("click", function () {
      if (askBusy) {
        if (askAbort) { askAbort(); finishAsk(); return; }
        if (askOut) { askOut.className = "status"; askOut.textContent = "上一条还在发送。这一句先留在输入框里。"; }
        return;
      }
      var replyText = askReply ? String(askReply.value || "").trim() : "";
      if (!state.ask.turns.length) {
        if (askOut) { askOut.className = "status bad"; askOut.textContent = "先在本节评论下点发送并追问。"; }
        return;
      }
      if (!replyText) {
        if (askOut) { askOut.className = "status bad"; askOut.textContent = "先写下对这一问的回答，再发送。"; }
        return;
      }
      pushTurn("user", replyText, state.ask.mode || "local");
      state.ask.draft = "";
      if (askReply) askReply.value = "";
      persist();
      if (!routeAsk(replyText) && askReply) askReply.value = replyText;
    });
  }
  var retryAsk = document.getElementById("askRetry");
  if (retryAsk) retryAsk.addEventListener("click", function () {
    var last = state.ask.turns[state.ask.turns.length - 1];
    if (last && last.role === "user") routeAsk(last.text);
    else if (askOut) { askOut.className = "status bad"; askOut.textContent = "先在本节评论下点发送并追问。"; }
  });
  renderThread();

  var exportBtn = document.getElementById("exportLesson");
  if (exportBtn) {
    exportBtn.addEventListener("click", function () {
      var payload = {
        v: "dm-lesson-note-v1",
        lessonId: cfg.id,
        savedAt: new Date().toISOString(),
        note: state.note || "",
        questions: state.q,
        follow: state.follow,
        feynman: state.feynman,
        sectionNotes: state.sectionNotes || {},
        lab: state.lab || {},
        conversation: (state.ask && state.ask.turns) || [],
        askMode: (state.ask && state.ask.mode) || ""
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = cfg.id + "-dm-lesson-note-v1.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      var exportStatus = document.getElementById("exportStatus");
      if (exportStatus) {
        exportStatus.className = "status ok";
        exportStatus.textContent = "已下载 dm-lesson-note-v1。这不是第0课的 dm-learnlog-v1。";
      }
    });
  }

  function refreshProgress() {
    var questionsOk = true;
    document.querySelectorAll("[data-q-group]").forEach(function (group) {
      var id = group.getAttribute("data-q-group");
      if (!state.q[id] || state.q[id].phase !== "ok") questionsOk = false;
    });
    var followOk = true;
    document.querySelectorAll("[data-follow]").forEach(function (box) {
      var id = box.getAttribute("data-follow");
      if (!state.follow[id] || state.follow[id].phase !== "ok") followOk = false;
    });
    document.querySelectorAll("[data-feynman]").forEach(function (box) {
      var id = box.getAttribute("data-feynman");
      if (!state.feynman[id] || state.feynman[id].phase !== "ok") followOk = false;
    });
    writeProgress(questionsOk && followOk);
  }
  var filledDefault = false;
  document.querySelectorAll("[data-persist]").forEach(function (el) {
    var key = el.getAttribute("data-persist");
    if (!key) return;
    if (state.lab[key] != null) {
      if (el.type === "checkbox") el.checked = !!state.lab[key];
      else el.value = String(state.lab[key]);
    } else {
      state.lab[key] = el.type === "checkbox" ? !!el.checked : el.value;
      filledDefault = true;
    }
    function saveLab() {
      state.lab[key] = el.type === "checkbox" ? el.checked : el.value;
      persist();
    }
    el.addEventListener("input", saveLab);
    el.addEventListener("change", saveLab);
  });
  if (filledDefault) persist();
  window.__dmLessonState = {
    getLab: function (key, fallback) { return state.lab[key] == null ? fallback : state.lab[key]; },
    setLab: function (key, value) { state.lab[key] = value; persist(); },
    snapshot: function () {
      return {
        v: "dm-lesson-note-v1",
        lessonId: cfg.id,
        note: state.note || "",
        questions: state.q,
        follow: state.follow,
        feynman: state.feynman,
        sectionNotes: state.sectionNotes || {},
        lab: state.lab || {},
        conversation: (state.ask && state.ask.turns) || [],
        askMode: (state.ask && state.ask.mode) || ""
      };
    }
  };

  refreshProgress();
})();
