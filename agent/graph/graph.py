from langgraph.graph import StateGraph, END
from graph.state import ConversationState
from graph.nodes import classify_intent, extract_data, build_response

def create_agent_graph():
    workflow = StateGraph(ConversationState)

    # Three-node pipeline: classify intent → extract data → build response
    workflow.add_node("classify", classify_intent)
    workflow.add_node("extract", extract_data)
    workflow.add_node("respond", build_response)

    # Set entry point
    workflow.set_entry_point("classify")

    # Linear flow: classify → extract → respond → END
    workflow.add_edge("classify", "extract")
    workflow.add_edge("extract", "respond")
    workflow.add_edge("respond", END)

    # Compile
    app = workflow.compile()
    return app

agent_app = create_agent_graph()
