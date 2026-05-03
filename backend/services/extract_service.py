"""
Medical extraction service.
Primary:  Groq LLM API (online, free tier) — llama-3.1-8b-instant
Fallback: Ollama (offline) — phi3:mini — used if GROQ_API_KEY is not set
"""
import json
from typing import Dict, Any


EXTRACT_PROMPT = """Extract medical data from the text below into a JSON object.

STRICT RULES:
1. If a condition is listed in "Disease", do NOT restate it in "AdditionalNotes".
2. "Disease" = only the diagnosed condition name (e.g. "Diabetes", "Flu").
3. "AdditionalNotes" = medicines, symptoms, duration, habits — NO disease names.
4. Return ONLY a raw JSON object. No markdown, no explanation.

Keys (use null for unknown):
- "Name"            string or null
- "Age"             string or null
- "Gender"          string or null
- "Disease"         string or null
- "Education"       string or null
- "EmotionalState"  string or null  (e.g. "Anxious", "Calm")
- "AdditionalNotes" string or null

Specialty context:
{specialty_context}

Apply this specialty when choosing emphasis: reflect it in Disease wording, EmotionalState (if used), and especially AdditionalNotes (medications, risk, follow-up). Do not ignore the specialty guidance above.

Text:
{text}"""

SYSTEM_MSG = "You are a medical data extraction assistant. Reply with only a JSON object."


def _parse_json(content: str) -> Dict[str, Any]:
    """Strip markdown fences and parse JSON."""
    content = content.strip()
    if content.startswith("```json"):
        content = content[7:]
    elif content.startswith("```"):
        content = content[3:]
    content = content.rsplit("```", 1)[0].strip()
    return json.loads(content)


def _extract_groq(text: str, specialty_context: str) -> Dict[str, Any]:
    """Extract using Groq LLM API."""
    from config import Config
    from groq import Groq
    from services.groq_retry import groq_call_with_retry

    client = Groq(api_key=Config.GROQ_API_KEY)
    completion = groq_call_with_retry(
        lambda: client.chat.completions.create(
            model=Config.GROQ_EXTRACT_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_MSG},
                {
                    "role": "user",
                    "content": EXTRACT_PROMPT.format(text=text, specialty_context=specialty_context),
                },
            ],
            max_tokens=512,
            temperature=0,
        )
    )
    content = (completion.choices[0].message.content or "{}").strip()
    return _parse_json(content)


def _extract_ollama(text: str, specialty_context: str) -> Dict[str, Any]:
    """Fallback: extract using Ollama (offline)."""
    from config import Config
    from openai import OpenAI

    client = OpenAI(base_url=Config.OLLAMA_BASE_URL, api_key="ollama")
    completion = client.chat.completions.create(
        model=Config.OLLAMA_EXTRACT_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_MSG},
            {
                "role": "user",
                "content": EXTRACT_PROMPT.format(text=text, specialty_context=specialty_context),
            },
        ],
        max_tokens=512,
        temperature=0,
    )
    content = (completion.choices[0].message.content or "{}").strip()
    return _parse_json(content)


_FOLLOWUP_PROMPT = """You are a clinical assistant reviewing a completed medical consultation.
Based on the transcript and extracted data below, identify 3-5 specific follow-up questions the doctor should ask at the next visit (or in a follow-up call) to fill clinical gaps or monitor the patient.

Rules:
- Be specific and clinically relevant — not generic advice.
- Focus on: missing history, unmonitored medications, unresolved symptoms, test results not yet discussed.
- Return ONLY a JSON array of question strings, no other text.

Example: ["What was the patient's blood pressure reading today?", "Has the patient had a HbA1c test in the last 3 months?"]

Extracted fields:
{extracted}

Specialty context:
{specialty_context}

Transcript:
{text}"""


def generate_followups(text: str, extracted: Dict[str, Any], specialty: str | None = None) -> list:
    """
    Generate 3-5 follow-up questions based on transcript + extracted fields.
    Returns a list of question strings, or [] on any error.
    """
    from config import Config
    from services.specialty_service import specialty_prompt_block

    if not Config.GROQ_API_KEY or not text.strip():
        return []

    import re

    try:
        from groq import Groq

        from services.groq_retry import groq_call_with_retry

        client = Groq(api_key=Config.GROQ_API_KEY)
        extracted_clean = {k: v for k, v in extracted.items() if v and v != "null"}
        extracted_str   = json.dumps(extracted_clean, indent=2)

        resp = groq_call_with_retry(
            lambda: client.chat.completions.create(
                model=Config.GROQ_EXTRACT_MODEL,
                messages=[{
                    "role": "user",
                    "content": _FOLLOWUP_PROMPT.format(
                        extracted=extracted_str,
                        specialty_context=specialty_prompt_block(specialty),
                        text=text[:3000],
                    ),
                }],
                max_tokens=400,
                temperature=0,
            )
        )
        content = (resp.choices[0].message.content or "").strip()
        match   = re.search(r'\[.*?\]', content, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as e:
        print(f"[Extract/followups] Error: {e}")
    return []


def extract(text: str, specialty: str | None = None) -> Dict[str, Any]:
    """
    Extract structured medical fields from transcript text.
    Uses Groq if GROQ_API_KEY is set, else falls back to Ollama.
    Returns {"skipped": True} if neither is available.
    """
    from config import Config
    from services.specialty_service import specialty_prompt_block

    specialty_context = specialty_prompt_block(specialty)

    # ── Try Groq first ───────────────────────────────────────────
    if Config.GROQ_API_KEY:
        try:
            return _extract_groq(text, specialty_context=specialty_context)
        except json.JSONDecodeError as e:
            print(f"[Extract/Groq] JSON parse error: {e}")
            return {"error": "Model did not return valid JSON"}
        except Exception as e:
            print(f"[Extract/Groq] Error: {e}")
            # Fall through to Ollama

    # ── Fallback: Ollama ─────────────────────────────────────────
    try:
        return _extract_ollama(text, specialty_context=specialty_context)
    except json.JSONDecodeError as e:
        print(f"[Extract/Ollama] JSON parse error: {e}")
        return {"error": "Model did not return valid JSON"}
    except Exception as e:
        err = str(e)
        if "connection" in err.lower() or "refused" in err.lower():
            return {
                "skipped": True,
                "reason": "Neither Groq API key nor Ollama is available. Set GROQ_API_KEY in .env",
            }
        print(f"[Extract/Ollama] Error: {e}")
        return {"error": err}
