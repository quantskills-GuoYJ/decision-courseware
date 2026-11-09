# 维护说明

这页给改课件的人，不放进课程目录。

## 日志

- 第0课提交仍是锁定的 `dm-learnlog-v1`（`learning-log.schema.json`）。不要把第1–7课的作答塞进这个结构。
- 第1–7课导出是另一个信封：`dm-lesson-note-v1`，字段为 `v`、`lessonId`、`savedAt`、`note`、`questions`、`follow`、`feynman`。

## 学伴

- 现有线上 Worker 只按第0课批改。本仓库的页面在第1–7课不调用 `lessonId` 为其他课的 `/api/tutor`。
- `worker/index.js` 是对照家长提供的基线写的修正稿，不是已部署字节。密钥仍只读 `env.WEBHOOK_URL`、`env.WEBHOOK_KEY`、`env.WEBHOOK_KEY_OBF`、`env.WEBHOOK_KEY_B64`、`env.AI`、`env.ALLOW_ORIGIN`、`env.PAGES_ORIGIN`。
- 修正点：在校准集上拟合的温度缩放算校准，不能因为同时出现「温度」和「校准」就判错；`noul` 是 P(是)，拒答是门槛策略。
- 部署和线上回归由家长做。部署前把 `PAGES_ORIGIN` 指到要服务的页面版本。

## 检查

```bash
python3 -m http.server 8765
node tests/course-journey.mjs
node --test worker/tutor-policy.test.mjs
```
