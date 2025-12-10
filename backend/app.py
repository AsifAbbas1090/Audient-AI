from flask import Flask, request, jsonify
from flask_cors import CORS
import whisper
import os
from werkzeug.utils import secure_filename
import uuid
import torch
import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

os.makedirs('temp', exist_ok=True)

# Load Whisper model at startup; default to high accuracy 'large-v3'
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
MODEL_NAME = os.getenv('WHISPER_MODEL', 'base') # Changed default to 'base' for faster testing if needed, or keep large-v3
model = whisper.load_model(MODEL_NAME, device=DEVICE)

client = OpenAI() # Uses OPENAI_API_KEY from .env

@app.route('/api/extract', methods=['POST'])
def extract_info():
    data = request.json
    print(f"DEBUG: /api/extract called with data: {data}")
    if not data or 'text' not in data:
        return jsonify({"error": "No text provided"}), 400
    
    transcription = data['text']
    
    try:
        prompt = f"""
        Extract medical data from the text into a valid JSON object.
        
        STRICT RULES:
        1. Mutual Exclusivity: If a condition is listed in "Disease", do NOT mention it in "AdditionalNotes".
        2. "Disease" Field: Contains ONLY the name of the diagnosed condition (e.g., "Diabetes", "Flu").
        3. "AdditionalNotes" Field: Contains context, medicines, duration, or habits. It must NOT restate the disease name.

        Return ONLY a JSON object with these keys:
        - "Name" (string or null)
        - "Age" (string or null)
        - "Gender" (string or null)
        - "Disease" (string or null): The specific condition name.
        - "Education" (string or null)
        - "EmotionalState" (string or null): Mood/feeling (e.g. "Anxious").
        - "AdditionalNotes" (string or null): Meds, symptoms, timeline. NO DISEASE NAMES.

        Text: "{transcription}"
        """
        
        completion = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a helpful medical assistant that extracts structured data from text."},
                {"role": "user", "content": prompt}
            ],
            response_format={ "type": "json_object" }
        )
        
        content = completion.choices[0].message.content
        extracted_data = json.loads(content)
        print(f"DEBUG: Extracted JSON: {extracted_data}")
        return jsonify(extracted_data)
        
    except Exception as e:
        print(f"Error extracting info: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})


@app.route('/transcribe', methods=['GET'])
@app.route('/api/transcribe', methods=['GET'])
def transcribe_get():
    return jsonify({"error": "Use POST multipart/form-data with field 'file'"}), 405


@app.route('/transcribe', methods=['POST'])
@app.route('/api/transcribe', methods=['POST'])
def transcribe_audio():
    if 'file' not in request.files:
        return jsonify({"error": "file field is required"}), 400

    audio_file = request.files['file']
    if audio_file.filename == '':
        return jsonify({"error": "empty filename"}), 400

    original_name = secure_filename(audio_file.filename)
    base_name, ext = os.path.splitext(original_name)
    if not base_name:
        base_name = str(uuid.uuid4())
    ext = (ext or '').lower()

    # Save original upload
    input_path = os.path.join('temp', f"{base_name}{ext}")
    audio_file.save(input_path)
    source_for_whisper = input_path

    try:
        result = model.transcribe(
            source_for_whisper,
            language='en',
            task='transcribe',
            fp16=(DEVICE != 'cpu')
        )
        text = result.get('text', '')
        print(f"DEBUG: Transcribed text len: {len(text)}. Content: '{text}'")
        return jsonify({"text": text})
    finally:
        try:
            if os.path.exists(input_path):
                # os.remove(input_path) # Commented out for debugging
                pass
        except Exception:
            pass


if __name__ == '__main__':
    port = int(os.getenv('PORT', '5000'))
    app.run(host='0.0.0.0', port=port)


