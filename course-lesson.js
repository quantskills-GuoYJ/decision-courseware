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
  if (!state.sectionNotes || typeof state.sectionNotes !== "object") state.sectionNotes = {};
  if (typeof state.note !== "string") state.note = "";

  function persist() {
    writeState(state);
    refreshProgress();
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
      if (status) {
        status.className = "status" + (rec.phase === "ok" ? " ok" : rec.phase === "hint" ? " bad" : "");
        status.textContent = rec.phase === "ok" ? okText : rec.phase === "hint" ? ("还缺：" + (rec.missing || "") + "。提示只指出缺什么，不代写。") : "";
      }
      if (retry) retry.hidden = rec.phase !== "hint";
      if (area) area.disabled = rec.phase === "ok";
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
      var missing = need.filter(function (word) { return text.indexOf(word) < 0; });
      if (!text.trim()) {
        state[bagName][id] = { phase: "hint", text: text, missing: need.join("、") };
      } else if (missing.length) {
        state[bagName][id] = { phase: "hint", text: text, missing: missing.join("、") };
      } else {
        state[bagName][id] = { phase: "ok", text: text, missing: "" };
      }
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
  bindPhrase("[data-follow]", "follow", "这句里需要的词都在。");
  bindPhrase("[data-feynman]", "feynman", "这句用自己的话碰到了要点。");

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
  var prompts = Array.isArray(cfg.offlinePrompts) && cfg.offlinePrompts.length
    ? cfg.offlinePrompts
    : ["你这句里，哪一个词是你最没把握的？只答那一个。"];
  function paintAsk() {
    if (!askOut || !state.ask.asked) return;
    var step = Math.max(0, Math.min(prompts.length - 1, state.ask.step || 0));
    askOut.className = "status";
    askOut.textContent = "本课追问：" + prompts[step];
  }
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
  function localAsk(label) {
    state.ask.mode = "local";
    state.ask.asked = true;
    persist();
    if (!askOut) return;
    var step = Math.max(0, Math.min(prompts.length - 1, state.ask.step || 0));
    askOut.className = "status";
    askOut.textContent = label + prompts[step];
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
  function liveAsk(api) {
    if (state.ask.busy) return;
    state.ask.busy = true;
    if (askSend) askSend.textContent = "停止";
    var acc = "";
    var stopped = false;
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    state.ask.abort = function () { stopped = true; if (ctrl) ctrl.abort(); };
    if (askOut) { askOut.className = "status"; askOut.textContent = "正在问学伴…"; }
    var history = (state.ask.history || []).slice(-8);
    var body = {
      mode: "socratic",
      lessonId: cfg.id,
      message: (note && note.value) || (askReply && askReply.value) || "",
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
        if (askOut && acc) { askOut.className = "status"; askOut.textContent = "学伴：" + acc; }
      });
    }).then(function () {
      if (stopped) return;
      state.ask.history = (state.ask.history || []).concat([
        { role: "user", content: String(body.message || "").slice(0, 2000) },
        { role: "assistant", content: acc.slice(0, 2000) }
      ]).slice(-8);
      state.ask.mode = "live";
      persist();
    }).catch(function () {
      if (stopped) return;
      localAsk("学伴暂时不可用，已改用本机引导提问：");
    }).then(function () {
      state.ask.busy = false;
      if (askSend) askSend.textContent = "发送并追问";
    });
  }
  if (askSend) {
    askSend.addEventListener("click", function () {
      if (state.ask.busy && state.ask.abort) { state.ask.abort(); state.ask.busy = false; if (askSend) askSend.textContent = "发送并追问"; return; }
      var noteText = note ? String(note.value || "").trim() : "";
      var replyText = askReply ? String(askReply.value || "").trim() : "";
      if (!noteText && !replyText && !state.ask.asked) {
        if (askOut) {
          askOut.className = "status bad";
          askOut.textContent = "先写一句笔记，再发送并追问。";
        }
        return;
      }
      if (state.ask.asked && replyText && state.ask.mode !== "live") {
        state.ask.step = Math.min(prompts.length - 1, (state.ask.step || 0) + 1);
        state.ask.draft = "";
        if (askReply) askReply.value = "";
      }
      var api = tutorUrl();
      fetch(capabilitiesUrl(api), { cache: "no-store" }).then(function (res) {
        if (!res.ok) throw new Error("cap");
        return res.json();
      }).then(function (cap) {
        var lessons = cap && Array.isArray(cap.lessons) ? cap.lessons : [];
        if (lessons.indexOf(cfg.id) >= 0) liveAsk(api);
        else localAsk("本机引导提问：");
      }).catch(function () {
        localAsk("本机引导提问：");
      });
    });
  }
  var retryAsk = document.getElementById("askRetry");
  if (retryAsk) retryAsk.addEventListener("click", function () { if (askSend) askSend.click(); });
  paintAsk();

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
        sectionNotes: state.sectionNotes || {}
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
  refreshProgress();
})();
