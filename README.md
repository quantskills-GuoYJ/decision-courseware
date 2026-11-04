# decision-courseware

决策模型互动课件（第0课起），经 GitHub Pages 公开托管。

## 在线地址

部署后访问：`https://quantskills-GuoYJ.github.io/decision-courseware/`

## 学习日志提交

页面主按钮：**一键提交给学习**（POST JSON 到 Grok Bot webhook）。

配置方式（任选）：

1. 页面内「Webhook 设置」→ 粘贴 URL + sender key → 保存到本机 `localStorage`（`dm_webhook_url` / `dm_webhook_key`）
2. 可选同目录 `webhook-config.js`：`window.COURSE_WEBHOOK = { url, key }`（**不要把真实密钥推到公开仓库**）

请求体示例：

```json
{
  "markdown": "@决策模型学习\n\n# …",
  "json": { "lesson": "…", "notes": "…", "sectionNotes": {}, "uiState": {}, "events": [] },
  "course": "第0课",
  "source": "decision-courseware"
}
```

请求头：`Authorization: Bearer <key>`，`Content-Type: application/json`。

CORS / 网络失败时会 toast 并回退「复制到剪贴板」。

## 本地文件

源文件同步维护于工作区 `/workspace/slides/decision-course/`。
