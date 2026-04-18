import { Annotation, END } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { z } from "zod";

// 1. 团队成员定义
export const members = ["researcher", "chart_generator"] as const;

// 2. 状态机数据结构
export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  // 记录下一个要执行的节点名
  next: Annotation<string>({
    reducer: (x, y) => y ?? x ?? END,
    default: () => END,
  }),
});

// 3. 路由工具（主管决策的协议）
export const routingTool = {
  name: "route",
  description: "选择下一个执行角色或结束任务。",
  schema: z.object({
    next: z.enum([END, ...members]),
  }),
};