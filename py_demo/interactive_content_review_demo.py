"""
综合实战：交互式内容审核工作流 (内存版)
功能：
- 自动内容分析
- 流式输出分析进度
- 多级人工审核（interrupts）
- In-Memory checkpoint (程序重启即重置)
- 执行历史追溯
"""

import os
import re
import time
from operator import add
from typing import Annotated, Literal, TypedDict

# 核心导入：换成了 memory 模块
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

# ============================================
# 1. State 定义
# ============================================
class ContentReviewState(TypedDict, total=False):
    content_id: str
    content: str
    content_type: str

    toxicity_score: float
    spam_score: float
    quality_score: float
    ai_recommendation: str

    review_level: int
    reviewer_decisions: Annotated[list[dict], add]
    final_decision: str
    processing_steps: Annotated[list[str], add]

    created_at: str
    reviewed_at: str

# ============================================
# 2. 规则评分函数 (模拟 AI 分析)
# ============================================
def normalize_score(score: float) -> float:
    return min(max(score, 0.0), 1.0)

def score_toxicity(content: str) -> float:
    severe_words = ["废物", "蠢货", "滚", "垃圾", "去死"]
    return 0.95 if any(word in content for word in severe_words) else 0.1

def score_spam(content: str) -> float:
    if any(re.search(p, content, re.IGNORECASE) for p in [r"加微信", r"点击.*链接"]):
        return 0.95
    return 0.1

def score_quality(content: str) -> float:
    return 0.8 if "表达清晰" in content else 0.4

# ============================================
# 3. 节点 (Nodes)
# ============================================
def analyze_node(state: ContentReviewState) -> dict:
    print("🔎 正在进行多维分析...")
    t_score = normalize_score(score_toxicity(state["content"]))
    s_score = normalize_score(score_spam(state["content"]))
    q_score = normalize_score(score_quality(state["content"]))
    
    # 简单的 AI 路由建议逻辑
    if t_score > 0.7 or s_score > 0.7:
        rec = "auto_reject"
    elif t_score < 0.3 and s_score < 0.3 and q_score > 0.6:
        rec = "auto_approve"
    else:
        rec = "level1_review"

    return {
        "toxicity_score": t_score,
        "spam_score": s_score,
        "quality_score": q_score,
        "ai_recommendation": rec,
        "processing_steps": ["分析完成", "AI 建议已生成"],
    }

def level1_review_node(state: ContentReviewState) -> dict:
    """一级审核 (会在这里发生 Interrupt)"""
    print("\n" + "="*20 + " 📋 等待一级人工审核 " + "="*20)
    
    # 触发中断
    decision = interrupt({
        "type": "level1_review",
        "content": state["content"],
        "options": ["approve", "escalate", "reject"]
    })

    # 这里的代码只有在 resume 之后才会执行
    return {
        "review_level": 1,
        "reviewer_decisions": [{"level": 1, "decision": decision, "ts": time.time()}],
        "processing_steps": ["一级人工审核已提交"],
    }

def level2_review_node(state: ContentReviewState) -> dict:
    """二级审核 (高级审核)"""
    print("\n" + "="*20 + " 📋 等待二级高级审核 " + "="*20)
    
    decision = interrupt({
        "type": "level2_review",
        "previous": state["reviewer_decisions"],
        "options": ["approve", "reject", "flag"]
    })

    return {
        "review_level": 2,
        "reviewer_decisions": [{"level": 2, "decision": decision, "ts": time.time()}],
        "processing_steps": ["二级人工审核已提交"],
    }

# 最终状态处理节点
def final_process_node(state: ContentReviewState) -> dict:
    # 根据最后的决策打标
    last_dec = state["reviewer_decisions"][-1]["decision"] if state["reviewer_decisions"] else state["ai_recommendation"]
    print(f"✅ 最终决策记录中: {last_dec}")
    return {
        "final_decision": last_dec,
        "reviewed_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }

# ============================================
# 4. 构建图 (Graph)
# ============================================
workflow = StateGraph(ContentReviewState)

workflow.add_node("analyze", analyze_node)
workflow.add_node("level1_review", level1_review_node)
workflow.add_node("level2_review", level2_review_node)
workflow.add_node("finalize", final_process_node)

workflow.add_edge(START, "analyze")

# AI 建议分流
workflow.add_conditional_edges(
    "analyze",
    lambda x: x["ai_recommendation"],
    {
        "auto_approve": "finalize",
        "auto_reject": "finalize",
        "level1_review": "level1_review"
    }
)

# 一级审核后分流
workflow.add_conditional_edges(
    "level1_review",
    lambda x: x["reviewer_decisions"][-1]["decision"],
    {
        "approve": "finalize",
        "reject": "finalize",
        "escalate": "level2_review"
    }
)

workflow.add_edge("level2_review", "finalize")
workflow.add_edge("finalize", END)

# --- 关键修改：使用 MemorySaver ---
checkpointer = MemorySaver()
app = workflow.compile(checkpointer=checkpointer)

# ============================================
# 5. 演示运行
# ============================================
def run_demo():
    thread_id = "test_thread_001"
    config = {"configurable": {"thread_id": thread_id}}
    
    input_state = {
        "content": "这条内容质量还可以，表达清晰，但需要人工确认一下。",
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    print("🚀 启动工作流...")
    # 第一次运行：会停在 level1_review 的 interrupt
    for chunk in app.stream(input_state, config, stream_mode="updates"):
        print(f"运行节点: {list(chunk.keys())}")

    # 检查当前状态
    state = app.get_state(config)
    if state.next:
        print(f"\n📢 流程中断！当前节点: {state.next}")
        
        # 模拟人工通过 update_state 恢复
        print("🧑‍💻 人工操作: 提交二级审核 (escalate)")
        app.update_state(config, {
            "reviewer_decisions": [{"level": 1, "decision": "escalate", "ts": time.time()}]
        }, as_node="level1_review")

        # 继续运行：会停在 level2_review 的 interrupt
        print("\n⏩ 继续流程...")
        for chunk in app.stream(None, config, stream_mode="updates"):
             print(f"运行节点: {list(chunk.keys())}")

        # 再次模拟二级审核通过
        print("🧑‍💻 高级审核操作: 批准 (approve)")
        app.update_state(config, {
            "reviewer_decisions": [{"level": 2, "decision": "approve", "ts": time.time()}]
        }, as_node="level2_review")

        # 最后一次运行到结束
        print("\n⏩ 完成最终流程...")
        for chunk in app.stream(None, config, stream_mode="updates"):
             print(f"运行节点: {list(chunk.keys())}")

    # 打印最终状态
    final_snapshot = app.get_state(config)
    print("\n" + "="*20 + " 最终结果 " + "="*20)
    print(f"最终状态: {final_snapshot.values['final_decision']}")
    print(f"执行步骤: {final_snapshot.values['processing_steps']}")

if __name__ == "__main__":
    run_demo()