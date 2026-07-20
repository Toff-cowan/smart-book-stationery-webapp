import io

from decimal import Decimal

from app.extensions.db import db
from app.models import Product


def _seed_school_product(app, school="Campion College"):
    with app.app_context():
        product = Product(
            name=f"Book for {school}",
            price=Decimal("10.00"),
            stock=5,
            department=Product.DEPARTMENT_TEXTBOOKS,
            school=school,
            is_active=True,
        )
        db.session.add(product)
        db.session.commit()
        return product.id


def test_list_booklist_schools_public(client, app):
    _seed_school_product(app, "Campion College")

    all_schools = client.get("/api/booklists/schools")
    assert all_schools.status_code == 200
    names = [s["name"] for s in all_schools.get_json()["data"]]
    assert "Campion College" in names

    filtered = client.get("/api/booklists/schools?q=campion")
    assert filtered.status_code == 200
    data = filtered.get_json()["data"]
    assert len(data) == 1
    assert data[0]["name"] == "Campion College"
    assert data[0]["product_count"] >= 1


def test_guest_can_upload_new_school_booklist(client, app):
    _seed_school_product(app, "Campion College")

    blocked = client.post(
        "/api/booklists/upload",
        data={
            "school": "Campion College",
            "file": (io.BytesIO(b"%PDF-1.4 sample"), "list.pdf"),
        },
        content_type="multipart/form-data",
    )
    assert blocked.status_code == 409

    ok = client.post(
        "/api/booklists/upload",
        data={
            "school": "New High School",
            "file": (io.BytesIO(b"%PDF-1.4 sample"), "list.pdf"),
        },
        content_type="multipart/form-data",
    )
    assert ok.status_code == 201
    body = ok.get_json()
    assert body["data"]["school"] == "New High School"
    assert body["data"]["user_id"] is None

    listed = client.get("/api/booklists/schools?q=New%20High")
    assert listed.status_code == 200
    assert any(s["name"] == "New High School" for s in listed.get_json()["data"])


def test_upload_requires_school(client):
    res = client.post(
        "/api/booklists/upload",
        data={"file": (io.BytesIO(b"hello"), "notes.txt")},
        content_type="multipart/form-data",
    )
    assert res.status_code == 400
