import { START, StateGraph, END } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { TavilySearch } from "@langchain/tavily";

// 引入另外两个文件
import { AgentState, members, routingTool } from "./routing";
import { chartTool } from "./chart";

// --- 初始化模型 ---
const llm = new ChatOpenAI({
  modelName: "Qwen3-235B-A22B",
  configuration: {
    baseURL: "https://api.kr777.top/v1",
    apiKey: process.env.QWEN_API_KEY,
  },
  temperature: 0,
});

// --- 定义主管 (Supervisor) ---
const supervisorPrompt = ChatPromptTemplate.fromMessages([
  ["system", "你是一个团队主管，负责协调：{members}。任务完成后请选 FINISH。"],
  new MessagesPlaceholder("messages"),
  ["human", "根据对话历史，谁应该执行下一步？可选：{options}"],
]);

// 1. 先异步填充变量
const formattedPrompt = await supervisorPrompt.partial({ 
    options: [END, ...members].join(", "), 
    members: members.join(", ") 
});

// 2. 再构建 pipe 链条
const supervisorChain = formattedPrompt
  .pipe(llm.bindTools([routingTool], { tool_choice: "route" }))
  .pipe((x: any) => ({ 
      next: x.tool_calls?.[0]?.args?.next || END 
  }));

// --- 定义 Worker 节点 ---
const researcherAgent = createReactAgent({
  llm,
  tools: [new TavilySearch()],
  stateModifier: "你负责网页搜索数据。",
});

const chartGenAgent = createReactAgent({
  llm,
  tools: [chartTool],
  stateModifier: "你负责根据数据绘图。",
});

// 节点转换函数
const researcherNode = async (state: typeof AgentState.State) => {
  const res = await researcherAgent.invoke(state);
  return { messages: [new HumanMessage({ ...res.messages.at(-1), name: "researcher" } as any)] };
};

const chartNode = async (state: typeof AgentState.State) => {
  const res = await chartGenAgent.invoke(state);
  return { messages: [new HumanMessage({ ...res.messages.at(-1), name: "chart_generator" } as any)] };
};

// --- 构建图 ---
const workflow = new StateGraph(AgentState)
  .addNode("researcher", researcherNode)
  .addNode("chart_generator", chartNode)
  .addNode("supervisor", supervisorChain);

// 连线：Worker -> 主管
members.forEach((m) => workflow.addEdge(m, "supervisor"));
// 连线：主管 -> 根据 next 决定去向
workflow.addConditionalEdges("supervisor", (x) => x.next);
workflow.addEdge(START, "supervisor");

const app = workflow.compile();

// 运行
async function main() {
  const inputs = { messages: [new HumanMessage("查询2023年国产电动车销量前三名并画图")] };
  const stream = await app.stream(inputs);
  for await (const chunk of stream) {
    console.log(chunk);
  }
}

main();