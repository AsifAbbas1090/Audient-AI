"""
Extraction routes:
  POST /api/extract — extract structured medical fields from transcript text
"""
from flask import Blueprint, request, jsonify
from services import extract_service

extract_bp = Blueprint("extract", __name__)


@extract_bp.route("/api/extract", methods=["POST"])
def extract_info():
    """
    Extract structured medical data from a transcript.
    Body: { "text": "full transcript string" }
    """
    data = request.get_json()
    if not data or not data.get("text"):
        return jsonify({"error": "Request body must include 'text' field"}), 400

    result = extract_service.extract(data["text"])
    return jsonify(result)
