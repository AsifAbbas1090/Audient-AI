"""Unit tests for template schema validation."""
import unittest

from services.template_service import validate_schema, validate_schema_for_draft


class TestValidateSchema(unittest.TestCase):
    def test_valid_minimal(self):
        schema = {
            "sections": [
                {"id": "a", "label": "Condition", "source_key": "disease", "visible": True},
                {"id": "b", "label": "Notes", "source_key": "additional_notes", "visible": True},
            ]
        }
        out = validate_schema(schema)
        self.assertEqual(len(out["sections"]), 2)

    def test_rejects_duplicate_id(self):
        schema = {
            "sections": [
                {"id": "x", "label": "A", "source_key": "disease", "visible": True},
                {"id": "x", "label": "B", "source_key": "additional_notes", "visible": True},
            ]
        }
        with self.assertRaises(ValueError) as ctx:
            validate_schema(schema)
        self.assertIn("Duplicate", str(ctx.exception))

    def test_rejects_empty_source_key(self):
        schema = {
            "sections": [
                {"id": "a", "label": "X", "source_key": "", "visible": True},
            ]
        }
        with self.assertRaises(ValueError):
            validate_schema(schema)

    def test_rejects_invalid_custom_key(self):
        schema = {
            "sections": [
                {"id": "a", "label": "Bad", "source_key": "Not Snake", "visible": True},
            ]
        }
        with self.assertRaises(ValueError):
            validate_schema(schema)

    def test_accepts_custom_snake_key(self):
        schema = {
            "sections": [
                {"id": "a", "label": "Custom", "source_key": "custom_allergy", "visible": True},
            ]
        }
        out = validate_schema(schema)
        self.assertEqual(out["sections"][0]["source_key"], "custom_allergy")

    def test_rejects_all_hidden(self):
        schema = {
            "sections": [
                {"id": "a", "label": "A", "source_key": "disease", "visible": False},
                {"id": "b", "label": "B", "source_key": "additional_notes", "visible": False},
            ]
        }
        with self.assertRaises(ValueError) as ctx:
            validate_schema(schema)
        self.assertIn("visible", str(ctx.exception).lower())


class TestValidateSchemaDraft(unittest.TestCase):
    def test_allows_empty_source_key(self):
        schema = {
            "sections": [
                {"id": "draft1", "label": "Incomplete", "source_key": "", "visible": True},
                {"id": "b", "label": "OK", "source_key": "disease", "visible": True},
            ]
        }
        out = validate_schema_for_draft(schema)
        self.assertEqual(len(out["sections"]), 2)


if __name__ == "__main__":
    unittest.main()
