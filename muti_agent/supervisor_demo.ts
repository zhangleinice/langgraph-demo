import "dotenv/config";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";

// --- 1. 路由决策 Schema ---
const RouteSchema = z.object({
    route: z.enum(["math", "research", "writer"]),
    reason: z.string(),
});

// --- 2. 状态定义 ---
const SupervisorAnnotation = Annotation.Root({
    task:   Annotation<string>({ reducer: (a, b) => b ?? a, default: () => "" }),
    route:  Annotation<"math" | "research" | "writer" | "">({ reducer: (a, b) => b ?? a, default: () => "" }),
    result: Annotation<string>({ reducer: (a, b) => b ?? a, default: () => "" }),
});
type SupervisorState = typeof SupervisorAnnotation.State;

// --- 3. 模型配置 ---
// const model = new ChatOpenAI({
//     modelName: "Qwen3-235B-A22B",
//     temperature: 0,
//     configuration: {
//         baseURL: "https://api.kr777.top/v1",
//         apiKey: process.env.QWEN_API_KEY,
//     },
// });
const model = new ChatOpenAI({
    modelName: "deepseek-v4-flash", 
    temperature: 0,
    configuration: {
        baseURL: "https://api.kr777.top/v1", 
        apiKey: process.env.DEEPSEEK_API_KEY, 
    },
});

// --- 4. Supervisor 节点：决策路由 ---
const supervisorNode = async (state: SupervisorState): Promise<Partial<SupervisorState>> => {
    const systemPrompt = `你是一个任务分发器。根据用户任务，选择合适的子代理：
- math: 数学计算、比较数字
- research: 解释概念、查找信息
- writer: 改写、总结、润色文本

必须返回 JSON 格式: {"route": "math"|"research"|"writer", "reason": "原因"}`;

    const response = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(`任务: ${state.task}`),
    ]);

    const content = response.content.toString();
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    let route: "math" | "research" | "writer" = "research";
    try {
        const parsed = RouteSchema.parse(JSON.parse(jsonMatch![0]));
        route = parsed.route;
        console.log(`[Supervisor] 选择: ${route} - ${parsed.reason}`);
    } catch (e) {
        console.log("[Supervisor] 解析失败，默认 research");
    }

    return { route };
};

// --- 5. 子代理节点 ---
const mathAgent = async (state: SupervisorState): Promise<Partial<SupervisorState>> => {
    const response = await model.invoke([
        new SystemMessage("你是数学专家，只做计算和数字比较，给出简洁答案。"),
        new HumanMessage(state.task),
    ]);
    const result = response.content.toString();
    console.log(`[MathAgent] ${result}`);
    return { result };
};

const researchAgent = async (state: SupervisorState): Promise<Partial<SupervisorState>> => {
    const response = await model.invoke([
        new SystemMessage("你是知识专家，解释概念和查找信息，给出简洁答案。"),
        new HumanMessage(state.task),
    ]);
    const result = response.content.toString();
    console.log(`[ResearchAgent] ${result}`);
    return { result };
};

const writerAgent = async (state: SupervisorState): Promise<Partial<SupervisorState>> => {
    const response = await model.invoke([
        new SystemMessage("你是写作专家，负责改写、总结和润色文本，给出简洁答案。"),
        new HumanMessage(state.task),
    ]);
    const result = response.content.toString();
    console.log(`[WriterAgent] ${result}`);
    return { result };
};

// --- 6. 构建图 ---
const workflow = new StateGraph(SupervisorAnnotation)
    .addNode("supervisor",      supervisorNode)
    .addNode("math_agent",      mathAgent)
    .addNode("research_agent",  researchAgent)
    .addNode("writer_agent",    writerAgent)
    .addEdge(START, "supervisor")
    .addConditionalEdges("supervisor", (state) => state.route, {
        math:     "math_agent",
        research: "research_agent",
        writer:   "writer_agent",
    })
    .addEdge("math_agent",     END)
    .addEdge("research_agent", END)
    .addEdge("writer_agent",   END);

const app = workflow.compile();

// --- 7. Demo ---
async function main() {
    console.log("\n=== 流程图 ===");
    console.log(app.getGraph().drawMermaid());

    const tasks = [
        "计算 1234 × 5678 等于多少？",
        "什么是量子纠缠？",
        "把这段话改写得更正式：'这东西挺好用的，大家都喜欢'",
    ];

    for (const task of tasks) {
        console.log(`\n>>> 任务: ${task}`);
        const state = await app.invoke({ task });
        console.log(`>>> 结果: ${state.result}`);
    }
}

main();
