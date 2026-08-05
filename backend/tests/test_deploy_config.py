from pathlib import Path


def test_cors_origins_parsing(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://app.vercel.app, http://localhost:3000/")
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    from app import config as config_mod

    origins = config_mod._cors_origins()
    assert origins == ["https://app.vercel.app", "http://localhost:3000"]


def test_cors_origins_merges_frontend_url(monkeypatch):
    monkeypatch.setenv(
        "CORS_ORIGINS",
        "https://smart-book-stationery-webapp.vercel.app",
    )
    monkeypatch.setenv("FRONTEND_URL", "https://smartbookstore.vercel.app")
    from app import config as config_mod

    origins = config_mod._cors_origins()
    assert origins == [
        "https://smart-book-stationery-webapp.vercel.app",
        "https://smartbookstore.vercel.app",
    ]


def test_upload_root_used(app, tmp_path, monkeypatch):
    from app.routes.uploads_routes import product_upload_dir

    monkeypatch.setitem(app.config, "UPLOAD_ROOT", str(tmp_path))
    with app.app_context():
        dest = product_upload_dir()
        assert dest == Path(tmp_path) / "products"
        assert dest.is_dir()
