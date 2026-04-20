# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作提供指导。

## 常用命令

使用 `tsx` 直接运行任意文件（无需构建）：

```bash
npx tsx <文件路径>
```

示例：
```bash
npx tsx assistant.ts
npx tsx analysis.ts
npx tsx interactive.ts
npx tsx muti_agent/supervisor_demo.ts
npx tsx src/tiangong_multi_agent.ts
npx tsx src/tianwork.ts
```

运行前需在 `.env` 中配置 `QWEN_API_KEY`（通过 `dotenv/config` 加载）。项目未配置 lint 或测试脚本。

## 架构说明

这是一个 LangGraph 学习项目，用 TypeScript 演示多智能体编排模式。

### 根目录演示文件（独立运行）

| 文件 | 核心概念 |
|---|---|
| `assistant.ts` | `MemorySaver` 检查点持久化 + `extractNode` 异步提取事实与偏好 |
| `analysis.ts` | Zod 校验 LLM 输出 → `ConditionalEdges` 条件路由（通过 / 拒绝 / 人工审核） |
| `interactive.ts` | `interrupt()` 暂停图执行，`updateState()` 注入人工决策，`stream(null)` 从断点恢复 |
| `muti_agent/supervisor_demo.ts` | Supervisor 模式：LLM 将任务路由到三个专属子代理之一 |

### `src/tiangong/` — 模块化多智能体系统

主系统，生产风格。图拓扑：

```
START → bootstrap → supervisor → [generatePageAgent | analysisAgent | talkAgent | userInput | END]
                        ↑________________子代理执行完毕后回环___________________|
```

关键文件：

- `state.ts` — `TiangongAnnotation`：在 `MessagesAnnotation` 基础上扩展了 `next`、`selectedAgent`、`agentResult`、`pendingQuestion`、`supervisorReason`、`toolTrace`、`finalAnswer`，所有字段均使用最后写入覆盖的 reducer。
- `model.ts` — 单例 `ChatOpenAI`，通过 `QWEN_API_KEY` 指向 Qwen3-235B-A22B 端点。
- `router/supervisor.ts` — 唯一调用 LLM 的节点。若 `state.agentResult` 已有值则直接短路返回 `FINISH`（防止重复路由）；否则调用 LLM，用 Zod 解析 `{next, reason}` JSON。
- `nodes/bootstrap.ts` — 每轮开始时重置 `agentResult`、`toolTrace` 等瞬态字段。
- `agents/` — 工作节点（`page-agent.ts`、`analysis-agent.ts`、`talk-agent.ts`）。模块化系统中使用 mock 字符串模板工具；`src/tianwork.ts` 是平铺替代版，每个代理均调用真实 LLM。
- `tools/` — 普通 TypeScript 函数（非 LangChain `tool()` 包装），通过正则匹配任务字符串来分支输出。
- `shared/utils.ts` — `latestHumanText()` 从消息数组末尾反向查找最后一条 `HumanMessage`；意图分类函数（`looksLikePageRequest` 等）已定义，但当前路由完全委托给 LLM supervisor。
- `graph.ts` — 组装并导出 `app = workflow.compile({ checkpointer: new MemorySaver() })`。

### 模型配置

所有文件均使用 `ChatOpenAI` 并配置自定义 `baseURL` 指向第三方 Qwen 端点。`@langchain/anthropic` 已安装但当前演示中未使用。
