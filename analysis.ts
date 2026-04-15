import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { StateGraph, START, END } from "@langchain/langgraph";

// --- 1. 结构化 Schema 定义 ---
const AnalysisSchema = z.object({
    has_issues: z.boolean(),
    issues: z.array(z.string()),
    severity: z.enum(["low", "medium", "high"]),
    confidence: z.number(),
});

type Analysis = z.infer<typeof AnalysisSchema>;

// --- 2. 状态接口定义 ---
interface AgentModerationState {
    content: string;
    analysis: Analysis | null;
    decision: "approved" | "rejected" | "needs_review" | "";
    reason: string;
    confidence: number;
}

// --- 3. 模型配置 (使用你提供的 Key 和 BaseURL) ---
const model = new ChatOpenAI({
    modelName: "Qwen3-235B-A22B",
    temperature: 0,
    configuration: {
        baseURL: "https://api.kr777.top/v1",
        apiKey: "sk-1aGn6WbXfzfvYSWCGBuPjewsSk1zzIcJ53y2wFSKYG6RDO0U",
    },
});

// --- 4. 节点逻辑 ---

const analyzeContent = async (state: AgentModerationState): Promise<Partial<AgentModerationState>> => {
    const systemPrompt = `你是一个内容审核助手。分析给定的内容，判断是否包含不当语言、垃圾信息或敏感话题。
请必须只返回 JSON，格式如下：
{
  "has_issues": true/false,
  "issues": ["原因1", "原因2"],
  "severity": "low"/"medium"/"high",
  "confidence": 0.95
}`;

    const response = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(`待审核内容：${state.content}`),
    ]);

    const rawText = response.content.toString();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);

    let analysis: Analysis;
    try {
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        analysis = AnalysisSchema.parse(parsed);
    } catch (e) {
        analysis = { has_issues: false, issues: [], severity: "low", confidence: 0 };
    }

    return { analysis };
};

const makeAgentDecision = async (state: AgentModerationState): Promise<Partial<AgentModerationState>> => {
    const { analysis } = state;
    if (!analysis) return { decision: "needs_review" as const };

    if (!analysis.has_issues) {
        return {
            decision: "approved" as const,
            reason: "内容正常，无违规迹象",
            confidence: analysis.confidence,
        };
    }

    if (analysis.severity === "medium") {
        return {
            decision: "rejected" as const,
            reason: `自动拒绝：检测到${analysis.issues.join("、")}`,
            confidence: analysis.confidence,
        };
    }

    return {
        decision: "needs_review" as const,
        reason: "高风险内容，转人工核实"
    };
};

const humanReviewPlaceholder = async (): Promise<Partial<AgentModerationState>> => {
    return {
        decision: "needs_review" as const,
        reason: "系统已自动分发至人工审核后台"
    };
};

// --- 5. 路由函数 ---
const shouldAutoDecide = (state: AgentModerationState): "decide" | "review" => {
    const { analysis } = state;
    if (analysis?.has_issues && analysis.severity === "high") {
        return "review";
    }
    return "decide";
};

// --- 6. 构建图 ---
const workflow = new StateGraph<AgentModerationState>({
    channels: {
        content: { reducer: (a, b) => b ?? a, default: () => "" },
        analysis: { reducer: (a, b) => b ?? a, default: () => null },
        decision: { reducer: (a, b) => b ?? a, default: () => "" as const },
        reason: { reducer: (a, b) => b ?? a, default: () => "" },
        confidence: { reducer: (a, b) => b ?? a, default: () => 0 },
    }
})
    .addNode("analyze", analyzeContent)
    .addNode("decide", makeAgentDecision)
    .addNode("human_review", humanReviewPlaceholder)
    .addEdge(START, "analyze")
    .addConditionalEdges("analyze", shouldAutoDecide, {
        decide: "decide",
        review: "human_review",
    })
    .addEdge("decide", END)
    .addEdge("human_review", END);

export const agentApp = workflow.compile();

// --- 7. 执行 Demo 与 打印图 ---
async function runDemo() {
    // 1. 打印流程图代码 (Mermaid)
    console.log("\n=== 流程图 Mermaid 代码 (复制到 mermaid.live 查看) ===");
    console.log(agentApp.getGraph().drawMermaid());
    console.log("====================================================\n");

    const testCases = [
        "这是一条正常的评论。",
        "你真是个废物，AAAAA，买买买！"
    ];

    for (const text of testCases) {
        console.log(`\n>>> 正在审核: "${text}"`);
        const result = await agentApp.invoke({ content: text });

        console.log(`[决策]: ${result.decision}`);
        console.log(`[原因]: ${result.reason}`);
        console.log(`[置信度]: ${result.confidence}`);
    }
}

runDemo();