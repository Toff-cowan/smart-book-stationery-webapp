import json

from app.services.gemini_booklist_service import _parse_books_payload


def test_parse_gemini_books_payload():
    raw = json.dumps(
        {
            "grade": "Grade 4",
            "school": None,
            "books": [
                {
                    "title": "New Junior English Revised",
                    "author": "Haydn Richards, Pamela Mordecai, Grace Walker Gordon",
                },
                {"title": "  ", "author": None},
                {
                    "title": "Rediscovering Mathematics for the Caribbean Grade 4",
                    "author": "Dr. Adrian Mandara",
                },
            ],
        }
    )
    parsed = _parse_books_payload(raw)
    assert parsed["grade"] == "Grade 4"
    assert len(parsed["books"]) == 2
    assert parsed["books"][0]["title"] == "New Junior English Revised"


def test_parse_gemini_books_payload_fenced():
    raw = """```json
{"grade": null, "school": null, "books": [{"title": "Oxford Student Dictionary", "author": null}]}
```"""
    parsed = _parse_books_payload(raw)
    assert len(parsed["books"]) == 1
    assert parsed["books"][0]["author"] is None
