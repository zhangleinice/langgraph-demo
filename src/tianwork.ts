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

const AppAnnotation = Annotation.Root({
  messages: MessagesAnnotation.spec.messages,
  next: Annotation<"generatePageAgent" | "analysisAgent" | "talkAgent" | "userInput" | "FINISH">({
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
  modelName: "Qwen3-235B-A22B",
  temperature: 0,
  configuration: {
    baseURL: "https://api.kr777.top/v1",
    apiKey: process.env.QWEN_API_KEY,
  },
});

const RouteSchema = z.object({
  next: z.enum(["generatePageAgent", "analysisAgent", "talkAgent", "userInput", "FINISH"]),
  reason: z.string(),
});

const supervisorNode = async (state: AppState): Promise<Partial<AppState>> => {
  const lastMsg = state.messages.at(-1)?.content?.toString() ?? "";
  const agentResult = state.agentResult;

  const systemPrompt = `你是调度中枢，根据对话决定下一步：
- generatePageAgent: 用户要生成网页/HTML/React代码
- analysisAgent: 用户要数据分析、SQL查询、同业分析
- talkAgent: 普通对话、问答、闲聊
- userInput: 信息不足，需要向用户追问
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

const generatePageAgent = async (state: AppState): Promise<Partial<AppState>> => {
  const task = state.messages.at(-1)?.content?.toString() ?? "";
  const response = await model.invoke([
    new SystemMessage("你是网页开发专家，根据需求生成简洁的HTML或React代码。"),
    new HumanMessage(task),
  ]);
  const agentResult = response.content.toString();
  console.log(`[generatePageAgent] 生成完毕`);
  return {
    messages: [new AIMessage(`[网页生成结果]\n${agentResult}`)],
    agentResult,
  };
};

const analysisAgent = async (state: AppState): Promise<Partial<AppState>> => {
  const task = state.messages.at(-1)?.content?.toString() ?? "";
  const response = await model.invoke([
    new SystemMessage("你是数据分析专家，根据自然语言生成SQL查询并解释结果。"),
    new HumanMessage(task),
  ]);
  const agentResult = response.content.toString();
  console.log(`[analysisAgent] 分析完毕`);
  return {
    messages: [new AIMessage(`[分析结果]\n${agentResult}`)],
    agentResult,
  };
};

const talkAgent = async (state: AppState): Promise<Partial<AppState>> => {
  const response = await model.invoke([
    new SystemMessage("你是友好的全能助手，回答用户问题。"),
    ...state.messages.slice(-6),
  ]);
  const agentResult = response.content.toString();
  console.log(`[talkAgent] 回复完毕`);
  return {
    messages: [new AIMessage(agentResult)],
    agentResult,
  };
};

const userInputNode = async (): Promise<Partial<AppState>> => {
  return {
    messages: [new AIMessage("请补充更多信息以便继续处理任务。")],
    agentResult: "",
  };
};

const workflow = new StateGraph(AppAnnotation)
  .addNode("supervisor", supervisorNode)
  .addNode("generatePageAgent", generatePageAgent)
  .addNode("analysisAgent", analysisAgent)
  .addNode("talkAgent", talkAgent)
  .addNode("userInput", userInputNode)
  .addEdge(START, "supervisor")
  .addConditionalEdges("supervisor", (s) => s.next, {
    generatePageAgent: "generatePageAgent",
    analysisAgent: "analysisAgent",
    talkAgent: "talkAgent",
    userInput: "userInput",
    FINISH: END,
  })
  .addEdge("generatePageAgent", "supervisor")
  .addEdge("analysisAgent", "supervisor")
  .addEdge("talkAgent", "supervisor")
  .addEdge("userInput", END);

const app = workflow.compile({ checkpointer: new MemorySaver() });

async function main() {
  console.log("\n=== tianwork: 真实 LLM supervisor demo ===");

  const config = { configurable: { thread_id: "demo-001" } };
  const inputs = [
    "帮我生成一个简单的登录页面HTML",
    "查询各银行存款利率并做对比分析",
    "你好，介绍一下你自己",
  ];

  for (const userMsg of inputs) {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`用户: ${userMsg}`);
    const result = await app.invoke({ messages: [new HumanMessage(userMsg)] }, config);
    const last = result.messages.at(-1)?.content?.toString() ?? "";
    console.log(`最终回复: ${last.slice(0, 200)}${last.length > 200 ? "..." : ""}`);
  }
}

main();
