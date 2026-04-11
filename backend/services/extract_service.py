"""
Medical extraction service — uses Ollama (fully offline LLM) to extract
structured medical fields from a transcript.
Default model: phi3:mini (fast, small, good at structured JSON output).
Falls back gracefully if Ollama is not running.
"""
import json
from typing import Dict, Any


EXTRACT_PROMPT = """
Extract medical data from the text into a valid JSON object.

STRICT RULES:
1. Mutual Exclusivity: If a condition is listed in "Disease", do NOT mention it in "AdditionalNotes".
2. "Disease" Field: Contains ONLY the name of the diagnosed condition (e.g., "Diabetes", "Flu").
3. "AdditionalNotes" Field: Contains context, medicines, duration, or habits. It must NOT restate the disease name.

Return ONLY a JSON object with these exact keys (use null for unknown values):
- "Name"            (string or null)
- "Age"             (string or null)
- "Gender"          (string or null)
- "Disease"         (string or null)
- "Education"       (string or null)
- "EmotionalState"  (string or null) — mood/feeling e.g. "Anxious", "Calm"
- "AdditionalNotes" (string or null) — meds, symptoms, timeline. NO disease names.

Text: "{text}"
"""

SYSTEM_MSG = "You are a helpful medical assistant. Reply with only a JSON object, no markdown."


def extract(text: str) -> Dict[str, Any]:
    """
    Extract structured medical fields from transcript text using Ollama (offline).
    Returns a dict with medical fields, or {"skipped": True} if Ollama is unavailable.
    """
    from config import Config
    from openai import OpenAI

    prompt = EXTRACT_PROMPT.format(text=text)

    try:
        client = OpenAI(base_url=Config.OLLAMA_BASE_URL, api_key="ollama")
        completion = client.chat.completions.create(
            model=Config.OLLAMA_EXTRACT_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_MSG},
                {"role": "user", "content": prompt},
            ],
            max_tokens=512,
            temperature=0,
        )
        content = (completion.choices[0].message.content or "{}").strip()

        # Strip markdown code fences if model adds them
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        content = content.rsplit("```", 1)[0].strip()

        return json.loads(content)

    except json.JSONDecodeError as e:
        print(f"[Extract] JSON parse error: {e}")
        return {"error": "Model did not return valid JSON"}
    except Exception as e:
        err = str(e)
        if "connection" in err.lower() or "refused" in err.lower():
            return {
                "skipped": True,
                "reason": (
                    f"Ollama not running. Start it with: ollama serve  "
                    f"(model: {Config.OLLAMA_EXTRACT_MODEL})"
                ),
            }
        print(f"[Extract] Error: {e}")
        return {"error": err}
