import re
import json

def parse_agent_response(response_text: str) -> dict:
    extract_match = re.search(
        r'<extract>(.*?)</extract>',
        response_text, re.DOTALL
    )
    customer_message = re.sub(
        r'<extract>.*?</extract>', '',
        response_text, flags=re.DOTALL
    ).strip()

    extract_data = None
    if extract_match:
        try:
            extract_data = json.loads(
                extract_match.group(1).strip()
            )
        except json.JSONDecodeError:
            extract_data = None

    return {
        "customer_message": customer_message,
        "extract": extract_data
    }
