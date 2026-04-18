import { Annotation, StateGraph, START, END, interrupt, MemorySaver } from "@langchain/langgraph";

// ============================================
// 1. 定义 State
// ============================================
const ContentReviewAnnotation = Annotation.Root({
    content: Annotation<string>,
    toxicity_score: Annotation<number>,
    ai_recommendation: Annotation<string>,

    // 这里的 reducer 确保人工决策是追加而不是覆盖
    reviewer_decisions: Annotation<any[]>({
        reducer: (state, update) => state.concat(update),
        default: () => [],
    }),
    final_decision: Annotation<string>,
});


// 程序自动分析
const analyzeNode = async (state: typeof ContentReviewAnnotation.State) => {
    console.log(`🔎 正在分析内容: "${state.content}"`);

    const severeWords = ["废物", "蠢货", "垃圾"];
    const count = severeWords.filter(word => state.content.includes(word)).length;

    let recommendation = "level1_review"; // 默认：进入人工（会暂停）
    if (count === 0) recommendation = "auto_approve"; // 0个敏感词：自动通过
    if (count >= 2) recommendation = "auto_reject";   // 2个及以上：自动拒绝

    return {
        toxicity_score: count,
        ai_recommendation: recommendation,
    };
};

// 一级审核节点：包含 interrupt，会触发暂停
const level1ReviewNode = async (state: typeof ContentReviewAnnotation.State) => {
    console.log("\n--- 📋 命中人工审核规则：流程已在此处【暂停】 ---");

    // 抛出暂停信号，第二次运行时 decision 会被赋值
    // 实际生产中，展示给前端，人工审核后，后端执行后续逻辑
    const decision = interrupt({
        // 数据透传
        // 通过这个参数，审核后台可以直接从 app.getState() 中读到这条内容，展示在屏幕上，而不需要再去数据库里翻一遍。
        sample_content: state.content,
        // 它告诉审核界面：“这里你只有两个选择，要么点‘通过’，要么点‘拒绝’。”
        options: ["approve", "reject"]
    }) as string;

    return {
        reviewer_decisions: [{ level: 1, decision, ts: Date.now() }],
    };
};

// 终点节点
const finalizeNode = (decision: string) => (state: typeof ContentReviewAnnotation.State) => {
    console.log(`🏁 流程最终终点：${decision}`);
    return { final_decision: decision };
};

// ============================================
// 3. 构建图 (Graph Construction)
// ============================================
const workflow = new StateGraph(ContentReviewAnnotation)
    .addNode("analyze", analyzeNode)
    .addNode("level1_review", level1ReviewNode)
    .addNode("approve", finalizeNode("approved"))
    .addNode("reject", finalizeNode("rejected"))

    .addEdge(START, "analyze")

    // AI 自动分流逻辑
    .addConditionalEdges("analyze", (state) => state.ai_recommendation, {
        "auto_approve": "approve",
        "auto_reject": "reject",
        "level1_review": "level1_review"
    })

    // 人工审核后的逻辑分流
    .addConditionalEdges("level1_review", (state) => {
        const lastDecision = state.reviewer_decisions.at(-1)?.decision;
        return lastDecision === "approve" ? "approve" : "reject";
    }, {
        "approve": "approve",
        "reject": "reject"
    })

    .addEdge("approve", END)
    .addEdge("reject", END);

// ============================================
// 4. 运行与验证
// ============================================
async function runDemo() {

    // 存储
    const checkpointer = new MemorySaver();
    const app = workflow.compile({ checkpointer });
    const config = { configurable: { thread_id: "test_001" } };

    // --- 【此处修改内容来验证不同结果】 ---
    // 1. "今天天气不错" -> 直接【同意】
    // 2. "你个废物蠢货" -> 直接【拒绝】
    // 3. "你真是个废物" -> 触发【暂停】
    const initialState = { content: "你真是个废物" };

    console.log("🚀 启动流程...");
    for await (const chunk of await app.stream(initialState, config)) {
        console.log("运行节点:", Object.keys(chunk));
    }

    // 检查是否中断
    const state = await app.getState(config);
    if (state.next.length > 0) {
        console.log("\n⚠️ 状态：流程正在等待人工干预...");

        console.log("🧑‍💻 模拟人工操作：提交【同意】决策");

        // updateState 人工改结果
        await app.updateState(config, {
            reviewer_decisions: [{ level: 1, decision: "approve", ts: Date.now() }]
        }, "level1_review");

        console.log("⏩ 决策注入成功，继续执行后续逻辑...");

        // 重新启动程序
        for await (const chunk of await app.stream(null, config)) {
            console.log("后续运行节点:", Object.keys(chunk));
        }
    }

    const finalState = await app.getState(config);
    console.log("\n✅ 演示结束，最终状态库值:", finalState.values.final_decision || "尚未完成");
}

runDemo();