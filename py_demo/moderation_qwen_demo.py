import json
import os
import re
from typing import Literal, TypedDict

from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph



class AgentModerationState(TypedDict):
    """审核流程的共享状态。

    约定：
    - `content` 由入口写入，表示待审核文本。
    - `analysis` 由 `analyze` 节点写入，包含结构化审核结果。
    - `decision` / `reason` / `confidence` 由 `decide` 或 `human_review` 节点写入终态。
    """

    content: str
    analysis: dict
    decision: str  # approved | rejected | needs_review
    reason: str
    confidence: float



model = init_chat_model(
    "Qwen3-235B-A22B",
    model_provider="openai",
    base_url="https://api.kr777.top/v1",
    api_key="sk-1aGn6WbXfzfvYSWCGBuPjewsSk1zzIcJ53y2wFSKYG6RDO0U",
    temperature=0.0,
)
# temperature=0 保持输出稳定，便于结构化 JSON 解析。
# 这里沿用示例中的 provider/base_url 组合，实际项目建议改为环境变量配置。


def parse_json_text(text: str) -> dict:
    """从模型输出中提取并规范化 JSON 结果。

    该函数处理两类常见噪声：
    1. 模型将 JSON 包在 Markdown 代码块（```json ... ```）中；
    2. 模型在 JSON 前后附带说明文字。

    返回值会统一为固定字段结构，便于后续分支逻辑直接消费。
    解析失败时会抛出 `json.loads` 的异常，让调用方显式感知错误。
    """

    text = text.strip()

    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()

    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        text = match.group(0)

    data = json.loads(text)
    return {
        "has_issues": bool(data.get("has_issues", False)),
        "issues": list(data.get("issues", [])),
        "severity": data.get("severity", "low"),
        "confidence": float(data.get("confidence", 0.0)),
    }


def analyze_content(state: AgentModerationState) -> dict:
    """调用 LLM 对文本进行审核分析，并写回 `analysis` 字段。"""
    content = state["content"]

    system_prompt = """你是一个内容审核助手。分析给定的内容，判断是否包含：
1. 不当语言（脏话、侮辱、辱骂）
2. 垃圾信息（广告、刷屏、导流、诈骗）
3. 敏感话题（政治极端、暴力、色情、违法）

请只返回 JSON，不要输出任何额外解释。格式如下：
{
  "has_issues": true/false,
  "issues": ["issue1", "issue2"],
  "severity": "low"/"medium"/"high",
  "confidence": 0.0
}
"""

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"待审核内容：{content}"),
    ]

    response = model.invoke(messages)
    raw_text = response.content
    if not isinstance(raw_text, str):
        raw_text = str(raw_text)

    # 将模型自由文本转为稳定结构，供后续规则分支使用。
    analysis = parse_json_text(raw_text)
    return {"analysis": analysis}


# 根据分析结果决定走自动决策还是人工复核分支。
def should_auto_decide(state: AgentModerationState) -> Literal["decide", "review"]:
    
    analysis = state["analysis"]

    # 高风险内容统一走人工复核，避免误杀或漏判。
    if analysis["has_issues"] and analysis["severity"] == "high":
        return "review"

    return "decide"

# 在可自动处理时生成审核结论。
def make_agent_decision(state: AgentModerationState) -> dict:
    analysis = state["analysis"]

    if not analysis["has_issues"]:
        return {
            "decision": "approved",
            "reason": "内容正常，无违规迹象",
            "confidence": analysis["confidence"],
        }

    if analysis["severity"] == "medium":
        return {
            "decision": "rejected",
            "reason": f"检测到{'、'.join(analysis['issues'])}，已自动拒绝",
            "confidence": analysis["confidence"],
        }

    return {
        "decision": "needs_review",
        "reason": "存在潜在风险，建议人工复核",
        "confidence": analysis["confidence"],
    }

# 人工审核占位节点
def human_review_placeholder(_: AgentModerationState) -> dict:

    return {
        "decision": "needs_review",
        "reason": "已转人工审核",
        "confidence": 1.0,
    }


# 构建状态图：START -> analyze -> (decide | human_review) -> END
agent_graph = StateGraph(AgentModerationState)

agent_graph.add_node("analyze", analyze_content)
agent_graph.add_node("decide", make_agent_decision)
agent_graph.add_node("human_review", human_review_placeholder)

agent_graph.add_edge(START, "analyze")
# 条件分支函数返回的字符串，需要与映射表 key 一一对应。
agent_graph.add_conditional_edges(
    "analyze",
    should_auto_decide,
    {
        "decide": "decide",
        "review": "human_review",
    },
)
agent_graph.add_edge("decide", END)
agent_graph.add_edge("human_review", END)

agent_app = agent_graph.compile()


def run_demo() -> None:
    """运行一组样例，展示审核分析与最终决策。"""
    test_cases = [
        "这是一条正常的评论。",
        "这包含脏话的内容，你真是个废物。",
        "AAAAAAA 买买买！！！",
        "讨论政治和暴力内容的话题。",
        "点击链接加微信领取返利。",
    ]

    print("=== Agent 实现结果 ===")

    for text in test_cases:
        result = agent_app.invoke(
            {
                "content": text,
                "analysis": {},
                "decision": "",
                "reason": "",
                "confidence": 0.0,
            }
        )

        print(f"\n内容: {result['content']}")
        print("分析:", json.dumps(result["analysis"], ensure_ascii=False, indent=2))
        print(f"决策: {result['decision']}")
        print(f"原因: {result['reason']}")
        print(f"置信度: {result['confidence']}")


def show_graph() -> None:
    """打印 Mermaid 文本，便于在外部工具中可视化流程图。"""
    print("\n=== 流程图 Mermaid 代码 ===")
    # 这里只输出 Mermaid 文本，不在本地渲染图像。
    print(agent_app.get_graph().draw_mermaid())
    print("\n提示：将上方文本复制到 https://mermaid.live/ 即可查看流程图")


if __name__ == "__main__":
    run_demo()
    show_graph()
