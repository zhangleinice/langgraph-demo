import "dotenv/config";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  StateGraph,
  START,
  END,
  Annotation,
  MessagesAnnotation,
  MemorySaver,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
  sequentialThinkingTool,
  requirementAnalysisTool,
  technicalDesignTool,
  apiSearchTool,
  generateReactCodeTool,
  codeReviewTool,
  simpleAnalysisTool,
} from "./tools";

const AppAnnotation = Annotation.Root({
  messages: MessagesAnnotation.spec.messages,
  next: Annotation<"generatePageAgent" | "analysisAgent" | "talkAgent" | "FINISH">({
    reducer: (_, b) => b,
    default: () => "talkAgent",
  }),
  agentResult: Annotation<string>({
    reducer: (_, b) => b ?? "",
    default: () => "",
  }),
});
type AppState = typeof AppAnnotation.State;

const model = new ChatOpenAI({
  modelName: "deepseek-v4-flash",
  temperature: 0,
  configuration: {
    baseURL: "https://api.kr777.top/v1",
    apiKey: process.env.DEEPSEEK_API_KEY,
  },
});

const RouteSchema = z.object({
  next: z.enum(["generatePageAgent", "analysisAgent", "talkAgent", "FINISH"]),
  reason: z.string(),
});

const supervisorNode = async (state: AppState): Promise<Partial<AppState>> => {
  const lastMsg = state.messages.at(-1)?.content?.toString() ?? "";
  const agentResult = state.agentResult;

  const systemPrompt = `你是调度中枢，根据对话决定下一步：
- generatePageAgent: 用户要生成网页/HTML/React代码、前端页面
- analysisAgent: 用户要数据分析、SQL查询、同业分析
- talkAgent: 普通对话、问答、闲聊
- FINISH: 任务已完成，结束对话

${agentResult ? `上一个子agent的结果: ${agentResult}` : ""}

只返回 JSON: {"next": "...", "reason": "..."}`;

  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(`用户最新消息: ${lastMsg}`),
  ]);

  const content = response.content.toString();
  const jsonMatch = content.match(/\{[\s\S]*?\}/);
  let next: AppState["next"] = "talkAgent";
  try {
    const parsed = RouteSchema.parse(JSON.parse(jsonMatch?.[0] ?? "{}"));
    next = parsed.next;
    console.log(`\n[Supervisor] → ${next}  (${parsed.reason})`);
  } catch {
    console.log("[Supervisor] 解析失败，默认 talkAgent");
  }
  return { next, agentResult: "" };
};

// ========== 核心：原生 Tool Binding 的生页面Agent ==========

// 1. 定义工具集（sequentialThinking 放在第一位，引导 AI 先思考）
const pageGenTools = [
  sequentialThinkingTool,
  requirementAnalysisTool,
  technicalDesignTool,
  apiSearchTool,
  generateReactCodeTool,
  codeReviewTool,
];

// 2. 创建 ToolNode（自动执行工具）
const pageGenToolNode = new ToolNode(pageGenTools);

// 3. 绑定工具到模型
const modelWithTools = model.bindTools(pageGenTools);

// 4. Agent节点：调用模型决策
const callPageGenAgent = async (state: AppState): Promise<Partial<AppState>> => {
  console.log(`\n[generatePageAgent] 开始处理...`);

  const systemPrompt = `你是一个专业的前端开发Agent，负责生成网页代码。

你的工作流程（严格按照顺序）：
1. **首先调用 sequentialThinking** - 分析任务，制定计划，列出待办事项
2. 调用 requirementAnalysis - 分析用户需求
3. **调用 sequentialThinking** - 思考技术方案的选择
4. 调用 technicalDesign - 设计技术方案
5. **调用 sequentialThinking** - 决定是否需要查询API
6. 可选调用 apiSearch - 查询API接口（如果需要）
7. **调用 sequentialThinking** - 准备生成代码
8. 调用 generateCode - 生成React代码
9. **调用 sequentialThinking** - 评估是否需要代码审查
10. 可选调用 codeReview - 审查代码质量
11. **调用 sequentialThinking** - 总结完成情况
12. 完成后直接返回最终结果，不再调用工具

重要规则：
- ⚠️ 每次执行其他工具前，必须先调用 sequentialThinking 进行思考规划
- 在 sequentialThinking 中设置清晰的 toDoList
- 使用 thoughtNumber 和 totalThoughts 跟踪进度
- 如果发现之前的决策有问题，使用 isRevision="true" 修正
- 当所有工具都执行完毕，最后一次调用 sequentialThinking 总结，然后返回结果给用户`;

  const response = await modelWithTools.invoke([
    new SystemMessage(systemPrompt),
    ...state.messages,
  ]);

  return { messages: [response] };
};

// 5. 判断是否继续调用工具
function shouldContinuePageGen(state: AppState): "tools" | "supervisor" {
  const lastMessage = state.messages.at(-1);

  // 检查是否有 tool_calls
  if (lastMessage && "tool_calls" in lastMessage) {
    const toolCalls = (lastMessage as any).tool_calls;
    if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
      console.log(`🔧 准备调用工具: ${toolCalls.map((tc: any) => tc.name).join(", ")}`);
      return "tools";
    }
  }

  // 没有工具调用，任务完成
  console.log("✅ 生页面Agent任务完成");

  return "supervisor";
}

// ========== 其他简化的Agent ==========

const analysisAgent = async (state: AppState): Promise<Partial<AppState>> => {
  const task = state.messages.at(-1)?.content?.toString() ?? "";
  console.log(`[analysisAgent] 正在分析...`);

  const result = simpleAnalysisTool(task);

  return {
    messages: [new AIMessage(`[分析结果]\n${result}`)],
    agentResult: result,
  };
};

const talkAgent = async (state: AppState): Promise<Partial<AppState>> => {
  const response = await model.invoke([
    new SystemMessage("你是友好的全能助手，简洁地回答用户问题。"),
    ...state.messages.slice(-6),
  ]);
  const agentResult = response.content.toString();
  console.log(`[talkAgent] 回复完毕`);
  return {
    messages: [new AIMessage(agentResult)],
    agentResult,
  };
};

// ========== 构建工作流 ==========

const workflow = new StateGraph(AppAnnotation)
  .addNode("supervisor", supervisorNode)
  .addNode("generatePageAgent", callPageGenAgent)
  .addNode("pageGenTools", pageGenToolNode) // 工具执行节点
  .addNode("analysisAgent", analysisAgent)
  .addNode("talkAgent", talkAgent)
  .addEdge(START, "supervisor")
  .addConditionalEdges("supervisor", (s) => s.next, {
    generatePageAgent: "generatePageAgent",
    analysisAgent: "analysisAgent",
    talkAgent: "talkAgent",
    FINISH: END,
  })
  // 核心：生页面Agent的循环逻辑
  .addConditionalEdges("generatePageAgent", shouldContinuePageGen, {
    tools: "pageGenTools",
    supervisor: "supervisor",
  })
  .addEdge("pageGenTools", "generatePageAgent") // 工具执行完回到Agent
  .addEdge("analysisAgent", "supervisor")
  .addEdge("talkAgent", "supervisor");

const app = workflow.compile({ checkpointer: new MemorySaver() });

async function main() {
  console.log("\n=== tianwork: 原生 Tool Binding ReAct 演示 ===");
  console.log("重点：使用 bindTools + ToolNode，AI自主决策调用工具\n");

  const config = { configurable: { thread_id: "demo-001" } };
  const inputs = [
    "帮我生成一个用户登录页面",
    "生成一个购物车页面",
  ];

  for (const userMsg of inputs) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`👤 用户: ${userMsg}`);
    console.log("=".repeat(70));

    const result = await app.invoke({ messages: [new HumanMessage(userMsg)] }, config);
    const last = result.messages.at(-1)?.content?.toString() ?? "";

    console.log(`\n${"=".repeat(70)}`);
    console.log(`🤖 最终输出:`);
    console.log("=".repeat(70));
    console.log(last.slice(0, 1000));
    if (last.length > 1000) {
      console.log("\n... (输出过长，已截断) ...");
    }
  }

  console.log("\n\n✅ 演示完成！");
  console.log("\n核心亮点:");
  console.log("1. ✅ 使用 LangChain 原生 tool() 包装工具");
  console.log("2. ✅ 使用 bindTools() 将工具绑定到模型");
  console.log("3. ✅ 使用 ToolNode 自动执行工具，无需手写 if/else");
  console.log("4. ✅ AI 根据工具描述自主决策调用顺序");
  console.log("5. ✅ 自动循环：Agent → Tools → Agent，直到任务完成");
  console.log("6. ✅ 集成 sequentialThinking 工具，实现深度思考与自我修正");
  console.log("7. ✅ 类似 OpenAI o1 的'思考时间'，显著提升决策质量");
}

main();
