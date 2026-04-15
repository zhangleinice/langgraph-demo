from typing import Literal, TypedDict

from langgraph.graph import END, START, StateGraph


# 定义状态
class State(TypedDict, total=False):
    temperature: int
    advice: str


# 定义节点
def check(state: State) -> State:
    temperature = state["temperature"]
    print(f"温度: {temperature}°C")
    return {}


def route_by_temperature(state: State) -> Literal["cold", "warm", "hot"]:
    temperature = state["temperature"]
    if temperature < 15:
        return "cold"
    if temperature < 28:
        return "warm"
    return "hot"


def cold(_: State) -> State:
    return {"advice": "建议：穿外套，注意保暖！"}


def warm(_: State) -> State:
    return {"advice": "建议：穿短袖，记得防晒！"}


def hot(_: State) -> State:
    return {"advice": "建议：尽量待在室内，注意补水降温！"}


# 构建图
builder = StateGraph(State)
builder.add_node("check", check)
builder.add_node("cold", cold)
builder.add_node("warm", warm)
builder.add_node("hot", hot)

builder.add_edge(START, "check")
builder.add_conditional_edges(
    "check",
    route_by_temperature,
    {
        "cold": "cold",
        "warm": "warm",
        "hot": "hot",
    },
)
builder.add_edge("cold", END)
builder.add_edge("warm", END)
builder.add_edge("hot", END)

# 编译图
graph = builder.compile()


if __name__ == "__main__":
    cases = [10, 25, 35]

    for temperature in cases:
        print(f"\n=== temperature={temperature} ===")
        result = graph.invoke({"temperature": temperature})
        print(result["advice"])

    print("\n=== mermaid ===")
    print(graph.get_graph().draw_mermaid())
