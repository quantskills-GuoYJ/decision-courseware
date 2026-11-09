# 第0课学习日志 · 字段一页纸（dm-learnlog-v1 · 已锁定）

第1–7课不使用这个结构。它们的本机导出是另一个信封 `dm-lesson-note-v1`：`v`、`lessonId`、`savedAt`、`note`、`questions`、`follow`、`feynman`、`sectionNotes`。不要把那些字段并进 `dm-learnlog-v1`。

目标：只给 @决策模型学习 诊盲点用的**最小充分信号**，不是按钮流水账。

## 顶层

| 字段 | 含义 |
|------|------|
| `v` | Schema 版本锁定：`dm-learnlog-v1` |
| `course` / `lessonId` | 课号：`第0课` / `lesson-0` |
| `submittedAt` | 提交时刻（ISO8601 UTC） |
| `sections[]` | 各节费曼 + 评论 |
| `items[]` | `quiz` / `predict_reveal` / `contract_draft` |
| `snapshot` | 提交瞬间终态（只一次） |

## 1. 费曼复述 · `sections[].feynman`

| 字段 | 含义 |
|------|------|
| `id` / `title` | 节：`contrast` `flow` `demo` `calib` `agent` `products` |
| `feynman.text` | 1–2 句自己的话；可空 |
| `feynman.restated` | 非空文本 → `true` |
| `feynman.status` | `已复述` / `未复述`（空也可提交，标未复述） |

## 2. 预测再揭晓 · `items[]` 且 `type: predict_reveal`

操作**前**先选「你以为会发生什么」，再看实际结果。

| 字段 | 含义 |
|------|------|
| `item_id` | 如 `pr-gate-fuzzy` |
| `sectionId` | 所属节 |
| `prompt` | 揭晓前问句 |
| `prediction` | 事先选项 |
| `reveal` | 实际终态标签 |
| `correct` | 预测是否命中 |

## 3. 概念题 · `items[]` 且 `type: quiz`

| 字段 | 含义 |
|------|------|
| `item_id` | 如 `qz-prob-vs-dm` |
| `prompt` | 题干（如「像概率 ≠ 决策模型」） |
| `choice` | 所选选项 |
| `correct` | 对错 |
| `answerKey` | 可选标准答案，便于对照 |

## 4. 平仓契约草稿 · `items[]` 且 `type: contract_draft`

主张②：写出 state / questions 再拖门槛。

| 字段 | 含义 |
|------|------|
| `item_id` | 如 `cd-flat-contract` |
| `state` | 状态草稿；可空 |
| `questions` | 钉死选项/问题草稿；可空 |

## 5. 主动疑问 · `sections[].comments`

各节评论框**原文**；无则 `""`。

## 6. 关键快照 · `snapshot`（提交那一刻一次）

| 字段 | 含义 |
|------|------|
| `threshold` | 终值（= `threshold_to`，canonical） |
| `threshold_from` | 进入课件时初值 |
| `threshold_to` | 提交瞬间终值 |
| `threshold_edits` | 改动次数（去抖后，非拖动帧） |
| `compareView` | `both` / `llm` / `dm` |
| `triState` | Agent 三态 `high` / `mid` / `low` |
| `scenario` | `fuzzy` / `calib` |
| `pFlat` | 当前场景平仓概率 |
| `gate` | `pass` / `block` |

---

## 明确不记（refuse）

- 对比视图来回切换的**中间轨迹**
- 门槛滑条**每一次拖动中间值**（只认 `threshold_from/to/edits` + 预测-揭晓终选）
- 场景按钮反复点按的流水（终态进 `snapshot.scenario`）
- 页面滚动、悬停、纯浏览、节访问流水
- 未完成的拖动手势、动画帧

文件：`learning-log.schema.json` · `learning-log.example.json`
