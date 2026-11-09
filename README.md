# decision-courseware

决策模型互动课件（第0课起），经 GitHub Pages 公开托管。

## 在线地址

部署后访问：`https://quantskills-GuoYJ.github.io/decision-courseware/`

站点根路径 `index.html` 仍是第0课全文，和第0课文件保持同一份，避免改掉已经在用的入口。课程目录是 `课程目录.html`，机器可读清单是 `course-manifest.json`。页脚旧文案「≈8 课」不是大纲。

本地预览：

```bash
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/课程目录.html`。交互检查：

```bash
node tests/course-journey.mjs
```

需要本机的 Chrome，以及可用的 `puppeteer-core`（脚本会从 `/tmp/viztest` 或当前目录解析）。学伴与提交的默认地址仍是 `https://dm-course.vibeniubi.com/api/tutor` 和 `/submit`。第1–3课不调用学伴：现有 Worker 只有第0课知识。

## 学习日志提交

页面主按钮：**一键提交给学习**。公开 Pages 把同一份学习日志 JSON POST 到 CORS 代理（密钥不在浏览器）：

`https://dm-course.vibeniubi.com/submit`

`webhook-config.js` 设置 `window.COURSE_SUBMIT.url` 为该地址，并让 `window.COURSE_WEBHOOK` 保持空。页面若发现 `COURSE_SUBMIT.url`，提交时不带 `Authorization`。Worker 持有真实 webhook URL 与 key，并代发 `Authorization: Bearer`。

允许的浏览器来源只有 `https://quantskills-guoyj.github.io`。更新后请对本页 **硬刷新**（绕过缓存的 `index.html` / `webhook-config.js`）。

备用（代理不可用时）：

1. 页面内「Webhook 设置」→ 粘贴 URL + sender key → 保存到本机 `localStorage`（`dm_webhook_url` / `dm_webhook_key`）。此时才带 `Authorization: Bearer`。
2. 不要把真实 webhook URL 或 key 写进公开仓库。

请求失败时仍会把 Markdown 复制到剪贴板。

请求体示例：

```json
{
  "markdown": "@决策模型学习\n\n# …",
  "json": { "lesson": "…", "notes": "…", "sectionNotes": {}, "uiState": {}, "events": [] },
  "course": "第0课",
  "source": "decision-courseware"
}
```

代理请求头：`Content-Type: application/json`（无浏览器 Authorization）。直连 webhook 备用路径才加 `Authorization: Bearer <key>`。

## 本地文件

源文件同步维护于工作区 `/workspace/slides/decision-course/`。

## Learning log schema

Submit payload uses locked schema **`dm-learnlog-v1`** (`learning-log.schema.json`). The public site only knows the Worker proxy URL. Webhook URL and sender key stay on the Worker (or in private localStorage). Never commit them.
