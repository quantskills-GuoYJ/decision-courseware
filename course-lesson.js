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
  if (askSend) {
    askSend.addEventListener("click", function () {
      var noteText = note ? String(note.value || "").trim() : "";
      var replyText = askReply ? String(askReply.value || "").trim() : "";
      if (!noteText && !replyText && !state.ask.asked) {
        if (askOut) {
          askOut.className = "status bad";
          askOut.textContent = "先写一句笔记，再发送并追问。";
        }
        return;
      }
      if (state.ask.asked && replyText) {
        state.ask.step = Math.min(prompts.length - 1, (state.ask.step || 0) + 1);
        state.ask.draft = "";
        if (askReply) askReply.value = "";
      }
      state.ask.asked = true;
      persist();
      paintAsk();
    });
  }
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
        feynman: state.feynman
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
