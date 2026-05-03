import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

// 初始化一个专门负责工具内部生成的轻量模型
const toolModel = new ChatOpenAI({
  modelName: "deepseek-v4-flash", 
  temperature: 0,
  configuration: {
    baseURL: "https://api.kr777.top/v1", 
    apiKey: process.env.DEEPSEEK_API_KEY,
  },
});

// ========== 1. 核心思考工具：Sequential Thinking (逻辑保持一致) ==========
export const sequentialThinkingTool = tool(
  async (input) => {
    const { thought, toDoList, thoughtNumber, totalThoughts, isRevision } = input;
    console.log(`\n[Thinking] ${thoughtNumber}/${totalThoughts}: ${thought.slice(0, 50)}...`);
    
    return `## 思考记录 #${thoughtNumber}/${totalThoughts}
### 当前思考: ${thought}
### 待办清单: ${toDoList}
### 状态: ${isRevision === "true" ? "已修正" : "正常推进"}`;
  },
  {
    name: "sequentialThinking",
    description: "思维链工具。在执行任何业务工具前必须调用，用于任务规划、反思和状态追踪。",
    schema: z.object({
      thought: z.string().describe("当前的思考步骤"),
      toDoList: z.string().describe("动态待办事项列表"),
      thoughtNumber: z.string().describe("当前思考编号"),
      totalThoughts: z.string().describe("估计总步骤数"),
      isRevision: z.string().describe('是否修改先前的思考，传"true"或"false"'),
      nextThoughtNeeded: z.string().describe('是否需要下一步思考'),
    }),
  }
);

// ========== 2. 需求分析工具 (由 AI 动态生成 PRD) ==========
export const requirementAnalysisTool = tool(
  async ({ task }) => {
    const response = await toolModel.invoke([
      new SystemMessage("你是一个资深产品经理。请将用户的页面需求转化为专业的 PRD 文档，包含背景、功能拆解、交互流程。使用 Markdown 格式。"),
      new HumanMessage(`原始需求：${task}`),
    ]);
    return response.content.toString();
  },
  {
    name: "requirementAnalysis",
    description: "需求分析专家。将模糊需求转化为标准 PRD。",
    schema: z.object({ task: z.string().describe("用户原始需求描述") }),
  }
);

// ========== 3. 技术方案设计工具 (由 AI 动态生成方案) ==========
export const technicalDesignTool = tool(
  async ({ prd }) => {
    const response = await toolModel.invoke([
      new SystemMessage("你是一个前端架构师。请根据 PRD 设计技术方案：包括组件拆解、状态管理方案、核心逻辑。"),
      new HumanMessage(`PRD内容：${prd}`),
    ]);
    return response.content.toString();
  },
  {
    name: "technicalDesign",
    description: "架构设计专家。根据 PRD 产出前端实施方案。",
    schema: z.object({ prd: z.string().describe("PRD 文档内容") }),
  }
);

// ========== 4. 代码生成工具 (由 AI 动态编写代码) ==========
export const generateReactCodeTool = tool(
  async ({ design, apiInfo }) => {
    const response = await toolModel.invoke([
      new SystemMessage("你是一个高级 React 开发。根据技术方案编写高质量代码。要求：使用 Tailwind CSS、Ant Design 或 Lucide 图标，代码要整洁且包含注释。"),
      new HumanMessage(`设计方案：${design}\n接口信息：${apiInfo || "无"}`),
    ]);
    return response.content.toString();
  },
  {
    name: "generateCode",
    description: "编码专家。根据设计方案生成完整的 React 代码。",
    schema: z.object({
      design: z.string().describe("技术设计稿内容"),
      apiInfo: z.string().optional().describe("可选的接口信息"),
    }),
  }
);

// ========== 5. 代码审查工具 (由 AI 动态评审) ==========
export const codeReviewTool = tool(
  async ({ code }) => {
    const response = await toolModel.invoke([
      new SystemMessage("你是一个代码审计专家。请检查以下代码的性能、安全性和逻辑问题，并给出评分和改进建议。"),
      new HumanMessage(code),
    ]);
    return response.content.toString();
  },
  {
    name: "codeReview",
    description: "代码评审专家。对生成的代码进行质量把控。",
    schema: z.object({ code: z.string().describe("需要审查的代码内容") }),
  }
);

// API 查询工具（保持模拟或根据需要接入真实搜索）
export const apiSearchTool = tool(
  async ({ query }) => {
    return `查询到模拟接口信息：POST /api/v1/action，参数：{ data: string }，建议根据具体业务 Mock 数据。`;
  },
  {
    name: "apiSearch",
    description: "接口查询工具。获取后端 API 定义。",
    schema: z.object({ query: z.string() }),
  }
);

// ========== 其他Agent的简单工具 ==========

export const simpleAnalysisTool = (query: string): string => {
  return `## 数据分析结果

根据查询: "${query}"

### 分析结论:
- 数据趋势: 稳定增长
- 关键指标: 正常范围
- 建议: 继续观察

（这是一个简化的分析工具示例）`;
};

export const simpleChatTool = (message: string): string => {
  return `收到消息: "${message}"\n\n这是一个简单的对话响应。`;
};
