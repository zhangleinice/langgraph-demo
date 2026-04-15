# 🤖 LangGraph 实战学习笔记：从记忆到流程控制

本项目通过两个核心 Demo 演示了 AI Agent 开发的核心支柱：**状态持久化**与**结构化流程控制**。

---

## 💡 核心知识点总结

### 1. 记忆管理：存得全、用得精
在实际工程中，AI 的“记忆”被分为三个层级，确保在成本与智能之间取得平衡：
* **物理底座 (`checkpointer`)**: 自动、无损地保存所有对话 `messages`。即使服务器重启，只要 `thread_id` 一致，历史永远都在。
* **滑动窗口 (`slice`)**: 每次只取最新 10 条消息发给 AI。能有效节省 Token，提高响应速度，防止信息过载。
* **精华提纯 (`extractNode`)**: 异步提取对话中的核心事实（如：用户偏好、特定背景）。即便对话到了 100 轮，关键信息依然能通过 `SystemMessage` 生效。

### 2. 状态机工程：流程可控、确定性强
* **条件分支 (`addConditionalEdges`)**: LLM 扮演“交警”，根据 `analyze` 节点的分析结果动态决定走 `decide`（自动处理）还是 `human_review`（人工复核）。
* **结构化输出校验 (`Zod`)**: 通过 Zod 强校验大模型输出的 JSON 格式，确保不稳定的模型输出能转化为稳定的 TypeScript 类型。
* **人机协作 (Human-in-the-loop)**: 架构设计中预留人工干预接口，解决 AI 无法处理的高风险或模糊决策。

---

## 🛠️ 系统架构 (Mermaid)

```mermaid
graph TD
    START((开始)) --> analyze[分析节点: LLM 风险识别]
    analyze -- 自动分流逻辑 --> route{判断分支}
    route -- 低/中风险 --> decide[决策节点: 自动审批]
    route -- 高风险 --> human_review[人工节点: 待后台审核]
    decide --> END((结束))
    human_review --> END((结束))