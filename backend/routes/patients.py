"""
Patient (thread) routes:
  GET    /api/patients              — list my patients (with session counts + PAT codes)
  POST   /api/patients              — create a new patient thread (auto-generates PAT-XXXX)
  GET    /api/patients/:id          — thread detail: patient info + all linked sessions
  PATCH  /api/patients/:id          — update patient info
  DELETE /api/patients/:id          — delete patient (unlinks sessions)
  GET    /api/patients/search       — fuzzy name search within my patients
  PATCH  /api/conversations/:id/patient — link / unlink a session to a patient thread
"""
from flask import Blueprint, jsonify, request, g
from extensions import db
from models.patient import Patient, generate_pat_code
from models.conversation import Conversation
from utils.auth import require_auth

patients_bp = Blueprint("patients", __name__)


# ── List ──────────────────────────────────────────────────────────────────────

@patients_bp.route("/api/patients", methods=["GET"])
@require_auth
def list_patients():
    q     = (request.args.get("q") or "").strip()
    limit = min(int(request.args.get("limit", 50)), 100)

    query = Patient.query.filter_by(created_by=g.user_id)
    if q:
        query = query.filter(Patient.name.ilike(f"%{q}%"))

    patients = query.order_by(Patient.name.asc()).limit(limit).all()
    return jsonify({
        "patients": [p.to_dict_with_stats() for p in patients],
        "total": len(patients),
    }), 200


# ── Create ────────────────────────────────────────────────────────────────────

@patients_bp.route("/api/patients", methods=["POST"])
@require_auth
def create_patient():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    pat_code = generate_pat_code(g.user_id)

    patient = Patient(
        patient_code    = pat_code,
        name            = name,
        age             = (data.get("age")             or "").strip() or None,
        gender          = (data.get("gender")          or "").strip() or None,
        contact         = (data.get("contact")         or "").strip() or None,
        medical_history = (data.get("medical_history") or "").strip() or None,
        created_by      = g.user_id,
    )
    db.session.add(patient)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"patient": patient.to_dict_with_stats()}), 201


# ── Get single (thread view) ──────────────────────────────────────────────────

@patients_bp.route("/api/patients/<string:patient_id>", methods=["GET"])
@require_auth
def get_patient(patient_id: str):
    patient = Patient.query.get(patient_id)
    if not patient:
        return jsonify({"error": "Patient not found"}), 404
    if patient.created_by != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Access denied"}), 403
    return jsonify({"patient": patient.to_dict_full()}), 200


# ── Update ────────────────────────────────────────────────────────────────────

@patients_bp.route("/api/patients/<string:patient_id>", methods=["PATCH"])
@require_auth
def update_patient(patient_id: str):
    patient = Patient.query.get(patient_id)
    if not patient:
        return jsonify({"error": "Patient not found"}), 404
    if patient.created_by != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Access denied"}), 403

    data = request.get_json() or {}
    for field in ("name", "age", "gender", "contact", "medical_history"):
        if field in data:
            val = (data[field] or "").strip() or None
            if field == "name" and not val:
                return jsonify({"error": "name cannot be empty"}), 400
            setattr(patient, field, val)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"patient": patient.to_dict_with_stats()}), 200


# ── Delete ────────────────────────────────────────────────────────────────────

@patients_bp.route("/api/patients/<string:patient_id>", methods=["DELETE"])
@require_auth
def delete_patient(patient_id: str):
    patient = Patient.query.get(patient_id)
    if not patient:
        return jsonify({"error": "Patient not found"}), 404
    if patient.created_by != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Access denied"}), 403

    try:
        db.session.delete(patient)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({"message": "Patient deleted"}), 200


# ── Name-match detection (for "existing patient" banner) ──────────────────────

@patients_bp.route("/api/patients/match", methods=["GET"])
@require_auth
def match_patient_by_name():
    """
    Returns patients whose name closely matches the query — used by the
    frontend to show the "We found an existing patient" banner before linking.
    """
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify({"matches": []}), 200

    patients = (
        Patient.query
        .filter_by(created_by=g.user_id)
        .filter(Patient.name.ilike(f"%{q}%"))
        .limit(5)
        .all()
    )
    return jsonify({"matches": [p.to_dict_with_stats() for p in patients]}), 200


# ── Link / unlink patient to a conversation ───────────────────────────────────

@patients_bp.route("/api/conversations/<string:conv_id>/patient", methods=["PATCH"])
@require_auth
def link_patient(conv_id: str):
    """
    Body: { patient_id: "<uuid>" }  — link
          { patient_id: null }       — unlink
    """
    conv = Conversation.query.get(conv_id)
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404
    if conv.user_id and conv.user_id != g.user_id and g.user_role != "admin":
        return jsonify({"error": "Access denied"}), 403
    if conv.status == "approved" and g.user_role != "admin":
        return jsonify({"error": "Record is approved and locked"}), 403

    data       = request.get_json() or {}
    patient_id = data.get("patient_id")

    if patient_id:
        patient = Patient.query.get(patient_id)
        if not patient:
            return jsonify({"error": "Patient not found"}), 404
        if patient.created_by != g.user_id and g.user_role != "admin":
            return jsonify({"error": "Access denied to this patient"}), 403
        conv.patient_id = patient_id
    else:
        conv.patient_id = None

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    result = conv.to_dict()
    if conv.patient:
        result["patient"] = conv.patient.to_dict()
    return jsonify({"conversation": result}), 200
