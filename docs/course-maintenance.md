# 维护说明

这页给改课件的人，不放进课程目录。

## 日志

- 第0课提交仍是锁定的 `dm-learnlog-v1`（`learning-log.schema.json`）。不要把第1–7课的作答塞进这个结构。
- 第1–7课导出是另一个信封：`dm-lesson-note-v1`。原有 `v`、`lessonId`、`savedAt`、`note`、`questions`、`follow`、`feynman`、`sectionNotes` 保持。可以多出 `lab`、`conversation`、`askMode`。没有新字段的旧文件仍然有效。

## 学伴

- 现有线上 Worker 仍可能只按第0课批改。页面先读 `GET /api/tutor/capabilities`，只有返回的课号里有本课才发送；否则用标明「本机引导提问」的有限问题。候选 Worker 尚未部署。
- `worker/index.js` 是对照家长提供的基线写的修正稿，不是已部署字节。密钥仍只读 `env.WEBHOOK_URL`、`env.WEBHOOK_KEY`、`env.WEBHOOK_KEY_OBF`、`env.WEBHOOK_KEY_B64`、`env.AI`、`env.ALLOW_ORIGIN`、`env.PAGES_ORIGIN`。
- 修正点：在校准集上拟合的温度缩放算校准，不能因为同时出现「温度」和「校准」就判错；`noul` 是 P(是)，拒答是门槛策略。
- 线上允许的来源仍是 GitHub Pages、自定义域名和现有 Worker 域名。不要把 `localhost` 加进这份名单。单独的预览 Worker 可以设置 `DEV_ALLOW_ORIGINS`（逗号分隔）。`/api/tutor/capabilities` 只报告 `devOriginConfigured` 是真还是假，不写出那个来源。本机页面打到线上接口被浏览器拦住，是预期结果，不是候选学伴失败。候选的真实模型还没有在预览服务上测过。在同意之前不部署线上。
- 部署和线上回归由家长做。部署前把 `PAGES_ORIGIN` 指到要服务的页面版本。

## 检查

```bash
python3 -m http.server 8765
node tests/course-journey.mjs
node tests/lesson-1-3-regressions.mjs
node tests/lesson-4-7-regressions.mjs
node --test worker/tutor-policy.test.mjs worker/tutor-lessons.test.mjs
```
