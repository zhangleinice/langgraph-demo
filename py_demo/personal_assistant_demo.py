import json
import os
import re
import sqlite3
from datetime import datetime
from typing import Annotated, Literal, TypedDict

from langchain.chat_models import init_chat_model
from langchain_core.messages import AnyMessage, HumanMessage, SystemMessage
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages


# 安装依赖：
# pip install -U langgraph langgraph-checkpoint-sqlite langchain langchain-openai


def merge_facts(old: list[str] | None, new: list[str] | None) -> list[str]:
    old = old or []
    new = new or []

    merged = list(old)
    for item in new:
        if item and item not in merged:
            merged.append(item)
    return merged


def increment_count(old: int | None, new: int | None) -> int:
    return (old or 0) + (new or 0)


class PersonalAssistantState(TypedDict, total=False):
    # 短期记忆
    messages: Annotated[list[AnyMessage], add_messages]

    # 长期记忆
    user_name: str
    user_id: str
    learned_facts: Annotated[list[str], merge_facts]
    preferences: dict

    # 元数据
    session_started: str
    message_count: Annotated[int, increment_count]



model = init_chat_model(
    "Qwen3-235B-A22B",
    model_provider="openai",
    base_url="https://api.kr777.top/v1",
    api_key=process.env.QWEN_API_KEY,
    temperature=0.0,
)


def parse_json_text(text: str) -> dict:
    text = text.strip()

    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()

    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        text = match.group(0)

    data = json.loads(text)
    return data


# =========================
# 节点实现
# =========================
def chat_node(state: PersonalAssistantState) -> dict:
    """主聊天节点"""
    messages = state["messages"]
    user_name = state.get("user_name", "朋友")
    facts = state.get("learned_facts", [])
    preferences = state.get("preferences", {})

    # 窗口策略：只保留最近 10 条消息作为上下文
    recent_messages = messages[-10:]

    system_prompt = f"""
你是 {user_name} 的私人助理。

已知信息：
{chr(10).join(f"- {fact}" for fact in facts) if facts else "（暂无）"}

用户偏好：
{chr(10).join(f"- {k}: {v}" for k, v in preferences.items()) if preferences else "（暂无）"}

请提供友好、个性化的帮助。
""".strip()

    full_messages = [SystemMessage(content=system_prompt)] + recent_messages
    response = model.invoke(full_messages)

    return {
        "messages": [response],
        "message_count": 1,
    }


def should_extract(state: PersonalAssistantState) -> Literal["extract", "end"]:
    messages = state.get("messages", [])
    if len(messages) >= 2:
        return "extract"
    return "end"


def extract_learnings_node(state: PersonalAssistantState) -> dict:
    """提取学习内容"""
    messages = state["messages"]

    # 只分析最近的一轮对话（用户 + 助手）
    if len(messages) < 2:
        return {}

    recent_exchange = messages[-2:]

    extraction_prompt = f"""
从以下对话中提取关于用户的新信息：

用户：{recent_exchange[0].content if len(recent_exchange) > 0 else ""}
助手：{recent_exchange[1].content if len(recent_exchange) > 1 else ""}

提取：
1. 新的事实（例如：“用户喜欢咖啡”、“用户在北京工作”）
2. 新的偏好（例如：语言、风格、饮食、时间安排）

只返回 JSON：
{{
  "facts": ["fact1", "fact2"],
  "preferences": {{
    "key1": "value1"
  }}
}}
""".strip()

    response = model.invoke([HumanMessage(content=extraction_prompt)])
    raw_text = response.content if isinstance(response.content, str) else str(response.content)

    try:
        extracted = parse_json_text(raw_text)
    except Exception:
        print("************ 提取 JSON 失败，原始输出如下 ************")
        print(raw_text)
        return {}

    new_facts = extracted.get("facts", [])
    new_preferences = extracted.get("preferences", {})

    if not new_facts and not new_preferences:
        return {}

    print("************ 有新的需要提取的信息 ************")
    print(json.dumps(extracted, ensure_ascii=False, indent=2))

    merged_preferences = dict(state.get("preferences", {}))
    merged_preferences.update(new_preferences)

    return {
        "learned_facts": new_facts,
        "preferences": merged_preferences,
    }


# =========================
# 构建图
# =========================
graph = StateGraph(PersonalAssistantState)

graph.add_node("chat", chat_node)
graph.add_node("extract", extract_learnings_node)

graph.add_edge(START, "chat")
graph.add_conditional_edges(
    "chat",
    should_extract,
    {
        "extract": "extract",
        "end": END,
    },
)
graph.add_edge("extract", END)

DB_PATH = os.path.join(os.path.dirname(__file__), "personal_assistant.db")
checkpointer = SqliteSaver(sqlite3.connect(DB_PATH, check_same_thread=False))

app = graph.compile(checkpointer=checkpointer)


# =========================
# 使用示例
# =========================
def print_turn(title: str) -> None:
    print("\n" + "=" * 60)
    print(title)
    print("=" * 60 + "\n")


def run_assistant_demo() -> None:
    print_turn("个人助理演示")

    user_config = {"configurable": {"thread_id": "user-alice"}}

    initial_state = {
        "messages": [],
        "user_name": "Alice",
        "user_id": "alice-001",
        "learned_facts": [],
        "preferences": {},
        "session_started": datetime.now().isoformat(),
        "message_count": 0,
    }

    conversations = [
        "你好，我叫 Alice，我喜欢喝咖啡，回答尽量简洁一点。",
        "我在北京工作，以后优先用中文和我交流。",
        "嗨，我又回来了！今天帮我推荐一个适合安静办公的地方。",
    ]

    current_state = initial_state

    for idx, user_text in enumerate(conversations, start=1):
        print(f"🙋 {current_state.get('user_name', '用户')}: {user_text}")

        payload = {"messages": [HumanMessage(content=user_text)]}
        if idx == 1:
            payload.update(current_state)

        result = app.invoke(payload, config=user_config)
        assistant_message = result["messages"][-1]

        print(f"🤖 助理: {assistant_message.content}")
        print(f"📌 learned_facts: {result.get('learned_facts', [])}")
        print(
            "⚙️ preferences:",
            json.dumps(result.get("preferences", {}), ensure_ascii=False, indent=2),
        )
        print(f"🧮 message_count: {result.get('message_count', 0)}")

        current_state = result

    history = list(app.get_state_history(user_config))

    print("\n📜 完整对话历史：")
    print(f"总共 {len(history)} 个 checkpoints")

    print_turn("Mermaid 流程图")
    print(app.get_graph().draw_mermaid())

    print("\n✅ 演示完成！")


if __name__ == "__main__":
    run_assistant_demo()
