from typing import TypedDict

from langgraph.graph import END, START, StateGraph

# 定义状态
class State(TypedDict, total=False):
    message: str


# 定义节点
def greet(_: State) -> State:
    return {"message": "Hello"}


def add_emoji(state: State) -> State:
    return {"message": f"{state['message']} 👋"}

# 构件图
builder = StateGraph(State)
builder.add_node("greet", greet)
builder.add_node("add_emoji", add_emoji)

builder.add_edge(START, "greet")
builder.add_edge("greet", "add_emoji")
builder.add_edge("add_emoji", END)

# 编译图
graph = builder.compile()


if __name__ == "__main__":
    print("=== stream ===")
    for event in graph.stream({}):
        print(event)

    print("\n=== result ===")
    result = graph.invoke({})
    print(result)

    print("\n=== mermaid ===")
    print(graph.get_graph().draw_mermaid())

