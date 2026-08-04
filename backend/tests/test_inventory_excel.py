"""Admin inventory Excel backup export / import."""

from decimal import Decimal
from io import BytesIO

from openpyxl import Workbook
from werkzeug.security import generate_password_hash

from app.extensions.db import db
from app.models import Product, User


def _admin_token(client, app):
    with app.app_context():
        user = User(
            name="Excel Admin",
            email="excel-admin@test.local",
            password_hash=generate_password_hash("password123"),
            role="owner",
        )
        db.session.add(user)
        db.session.commit()

    login = client.post(
        "/api/auth/login",
        json={"email": "excel-admin@test.local", "password": "password123"},
    )
    assert login.status_code == 200, login.get_json()
    return login.get_json()["token"]


def _seed_product(app):
    with app.app_context():
        product = Product(
            name="Excel Backup Book",
            price=Decimal("9.50"),
            stock=3,
            department="textbooks",
            isbn="9780000000001",
            is_active=True,
        )
        db.session.add(product)
        db.session.flush()
        product.set_grades(["Grade 1"])
        db.session.commit()
        return product.id


def test_export_inventory_excel(client, app):
    _seed_product(app)
    token = _admin_token(client, app)
    res = client.get(
        "/api/admin/inventory/export",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert (
        res.mimetype
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert res.data[:2] == b"PK"


def test_import_inventory_excel_creates_row(client, app):
    token = _admin_token(client, app)

    wb = Workbook()
    ws = wb.active
    ws.append(
        [
            "id",
            "name",
            "department",
            "quantity",
            "price",
            "description",
            "author",
            "publisher",
            "vendor",
            "isbn",
            "school",
            "grades",
            "image_url",
            "is_active",
        ]
    )
    ws.append(
        [
            "",
            "Imported From Excel",
            "stationery",
            12,
            4.25,
            "desc",
            "",
            "",
            "Acme",
            "9781111111111",
            "",
            "Grade 2; Grade 3",
            "",
            "yes",
        ]
    )
    buf = BytesIO()
    wb.save(buf)

    res = client.post(
        "/api/admin/inventory/import",
        headers={"Authorization": f"Bearer {token}"},
        data={"file": (BytesIO(buf.getvalue()), "backup.xlsx")},
        content_type="multipart/form-data",
    )
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert body["data"]["created"] >= 1

    with app.app_context():
        product = Product.query.filter_by(name="Imported From Excel").first()
        assert product is not None
        assert product.department == "stationery"
        assert product.stock == 12
        assert "Grade 2" in product.get_grades()
