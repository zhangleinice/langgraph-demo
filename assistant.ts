import {
    StateGraph,
    START,
    END,
    Annotation,
    MessagesAnnotation
} from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";


// 1. 定义状态 (State) 
const AssistantAnnotation = Annotation.Root({
    // 1. 继承内置的消息列表（自带 add_messages 逻辑）
    messages: MessagesAnnotation.spec.messages,

    // 2. 长期记忆：事实列表
    learnedFacts: Annotation<string[]>({
        reducer: (old, _new) => Array.from(new Set([...(old ?? []), ...(_new ?? [])])),
        default: () => [],
    }),

    // 3. 偏好设置
    preferences: Annotation<Record<string, string>>({
        reducer: (old, _new) => ({ ...old, ..._new }),
        default: () => ({}),
    }),

    userName: Annotation<string>(),

    messageCount: Annotation<number>({
        reducer: (old, _new) => (old ?? 0) + (_new ?? 0),
        default: () => 0,
    }),
});

// 2. 初始化模型
const model = new ChatOpenAI({
    modelName: "Qwen3-235B-A22B",
    apiKey: "sk-1aGn6WbXfzfvYSWCGBuPjewsSk1zzIcJ53y2wFSKYG6RDO0U",
    configuration: {
        baseURL: "https://api.kr777.top/v1",
    },
    temperature: 0,
});

/**
 * 对话，取历史记忆和偏好
 */
const chatNode = async (state: typeof AssistantAnnotation.State) => {
    // 这个 state 就是那个“临时变量”,相当于useState
    const { messages, learnedFacts, preferences, userName } = state;

    const systemPrompt = `
  你是 ${userName || "朋友"} 的私人助理。
  已知事实: ${learnedFacts.join(", ") || "暂无"}
  用户偏好: ${JSON.stringify(preferences)}
  请提供友好且个性化的回答。`;

    const response = await model.invoke([
        new SystemMessage(systemPrompt),
        // 只取最近10条。省钱（Token）、提速（响应快）、去噪（防干扰）。让 AI 专注于当前的聊天语境。
        ...messages.slice(-10),
    ]);

    return {
        messages: [response],
        messageCount: 1,
    };
};

/**
 * 提取新信息（只取事实，偏好），
 * 数据清洗 / 用户画像。
 */
const extractNode = async (state: typeof AssistantAnnotation.State) => {
    const lastTwoMessages = state.messages.slice(-2);
    if (lastTwoMessages.length < 2) return {};

    const extractionPrompt = `
  从对话中提取新事实和偏好。
  用户: ${lastTwoMessages[0].content}
  助手: ${lastTwoMessages[1].content}
  只返回 JSON 格式: {"facts": [], "preferences": {}}`;

    const response = await model.invoke([new HumanMessage(extractionPrompt)]);

    // 简单的正则解析 JSON（逻辑同 Python 版）
    try {
        const content = typeof response.content === 'string' ? response.content : "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);
            console.log("--- 提取到新信息 ---", data);
            return {
                learnedFacts: data.facts || [],
                preferences: data.preferences || {},
            };
        }
    } catch (e) {
        console.error("解析失败");
    }
    return {};
};

// 4. 构建工作流
const workflow = new StateGraph(AssistantAnnotation)
    .addNode("chat", chatNode)
    .addNode("extract", extractNode)
    .addEdge(START, "chat")
    .addConditionalEdges("chat", (state) => {
        // 简单的路由逻辑
        return state.messages.length >= 2 ? "extract" : END;
    }, {
        extract: "extract",
        [END]: END,
    })
    .addEdge("extract", END);


// 1. 显式创建一个内存存储实例，持久化存储到内存
// memory 并不是空的，它在你每次 invoke 结束的那一刹那，被框架“强行”塞进了数据。
// 像 Axios 的拦截器，自动存
// 自动存的全量message，持久化
const memory = new MemorySaver();

// 5. 编译与运行
// const app = workflow.compile();

// 使用记忆功能，持久化存储到内存
const app = workflow.compile({ checkpointer: memory });

// 测试演示
async function main() {
    const config = { configurable: { thread_id: "alice-123" } };

    // 默认信息
    const input = {
        messages: [new HumanMessage("我叫 Alice，我超级喜欢喝冰美式咖啡！")],
        userName: "Alice",
    };

    console.log("--- 开始对话 ---");
    const result = await app.invoke(input, config);

    console.log("助理回复:", result.messages[result.messages.length - 1].content);
    console.log("当前记忆:", result.learnedFacts);
}

main();