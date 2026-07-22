"""Booklist photo preprocessing + OCR (EasyOCR).

Pipeline:
1. Validate upload (type/size/basic quality)
2. OpenCV preprocess (resize, grayscale, contrast, denoise, threshold,
   perspective correction, light shadow reduction)
3. EasyOCR text detection
4. Spatial line grouping + title/author parsing
5. Filter headings, prices, stationery noise
"""

from __future__ import annotations

import base64
import logging
import re
from dataclasses import dataclass

import numpy as np

logger = logging.getLogger(__name__)

_reader = None
_reader_error: str | None = None

MAX_IMAGE_BYTES = 12 * 1024 * 1024
MIN_IMAGE_BYTES = 8 * 1024
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif", "heic", "heif"}

# Headings / stationery / form junk commonly printed on school lists
_NOISE_EXACT = {
    "name",
    "title",
    "author",
    "authors",
    "publisher",
    "isbn",
    "price",
    "qty",
    "quantity",
    "item",
    "items",
    "no",
    "no.",
    "#",
    "subject",
    "subjects",
    "grade",
    "form",
    "class",
    "page",
    "pages",
    "total",
    "subtotal",
    "booklist",
    "book list",
    "required books",
    "recommended",
    "optional",
    "compulsory",
    "stationery",
    "supplies",
    "school",
    "student",
    "parent",
    "signature",
    "date",
}

_NOISE_CONTAINS = (
    "exercise book",
    "exercise books",
    "notebook",
    "note book",
    "ballpoint",
    "ball point",
    "pen pack",
    "pencil",
    "eraser",
    "ruler",
    "geometry set",
    "compass",
    "protractor",
    "crayon",
    "marker",
    "highlighter",
    "glue stick",
    "scissors",
    "folder",
    "binder",
    "calculator",
    "uniform",
    "please note",
    "all students",
    "must purchase",
    "available at",
    "brought to school",
)

_PRICE_RE = re.compile(
    r"(^|\$|jmd|usd|cad|£|€)\s*\d{1,5}([.,]\d{2})?\s*$",
    re.IGNORECASE,
)
_QTY_ONLY_RE = re.compile(r"^(\d+|x\d+|qty\.?\s*\d+)$", re.IGNORECASE)
_ISBN_RE = re.compile(r"\b(97[89][-\s]?\d{1,5}[-\s]?\d{1,7}[-\s]?\d{1,7}[-\s]?\d)\b")
_BY_AUTHOR_RE = re.compile(
    r"^(?P<title>.+?)\s+(?:by|–|-|—|:)\s+(?P<author>[A-Za-z][A-Za-z .,'-]{1,80})$",
    re.IGNORECASE,
)
_AUTHOR_FIRST_RE = re.compile(
    r"^(?P<author>[A-Z][A-Za-z .,'-]{1,40}),\s*(?P<title>.+)$",
)
_LEADING_INDEX_RE = re.compile(r"^(\(?\d{1,3}\)?[.)]|[A-Za-z][.)]|[-•*▪●])\s+")
_SUBJECT_HEADING_RE = re.compile(
    r"^(english|math(s|ematics)?|science|biology|chemistry|physics|"
    r"history|geography|spanish|french|religious|literature|ict|"
    r"information technology|social studies|integrated science|"
    r"principles of|csec|cape|cxc)\b",
    re.IGNORECASE,
)


@dataclass
class OcrBox:
    text: str
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def cx(self) -> float:
        return (self.x1 + self.x2) / 2.0

    @property
    def cy(self) -> float:
        return (self.y1 + self.y2) / 2.0

    @property
    def height(self) -> float:
        return max(1.0, self.y2 - self.y1)


def _get_reader():
    """Lazy-load EasyOCR (heavy; first call downloads models)."""
    global _reader, _reader_error
    if _reader is not None:
        return _reader
    if _reader_error:
        raise RuntimeError(_reader_error)
    try:
        import easyocr  # type: ignore

        _reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        return _reader
    except Exception as exc:  # pragma: no cover
        _reader_error = (
            "EasyOCR is not available. Install OCR extras: "
            "pip install easyocr opencv-python-headless rapidfuzz"
        )
        logger.exception("EasyOCR failed to load")
        raise RuntimeError(_reader_error) from exc


def _order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def _deskew_and_warp(image_bgr: np.ndarray) -> np.ndarray:
    import cv2  # type: ignore

    working = image_bgr.copy()
    h, w = working.shape[:2]
    scale = 1200 / max(h, w) if max(h, w) > 1200 else 1.0
    if scale < 1.0:
        working = cv2.resize(working, (int(w * scale), int(h * scale)))

    gray = cv2.cvtColor(working, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 40, 140)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:12]

    page = None
    min_area = working.shape[0] * working.shape[1] * 0.15
    for contour in contours:
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
        if len(approx) == 4 and cv2.contourArea(approx) > min_area:
            page = approx.reshape(4, 2).astype("float32")
            break

    if page is None:
        return image_bgr

    rect = _order_points(page / scale if scale < 1.0 else page)
    (tl, tr, br, bl) = rect
    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_w = max(int(width_a), int(width_b))
    max_h = max(int(height_a), int(height_b))
    if max_w < 80 or max_h < 80:
        return image_bgr

    dst = np.array(
        [[0, 0], [max_w - 1, 0], [max_w - 1, max_h - 1], [0, max_h - 1]],
        dtype="float32",
    )
    matrix = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(image_bgr, matrix, (max_w, max_h))


def _reduce_shadows(gray: np.ndarray) -> np.ndarray:
    import cv2  # type: ignore

    dilated = cv2.dilate(gray, np.ones((7, 7), np.uint8))
    bg = cv2.medianBlur(dilated, 21)
    diff = 255 - cv2.absdiff(gray, bg)
    return cv2.normalize(diff, None, 0, 255, cv2.NORM_MINMAX)


def preprocess_document(image_bgr: np.ndarray) -> np.ndarray:
    """Full OpenCV preprocess for OCR accuracy."""
    import cv2  # type: ignore

    warped = _deskew_and_warp(image_bgr)

    # Cap very large images while keeping readable text.
    h, w = warped.shape[:2]
    max_side = 1800
    if max(h, w) > max_side:
        scale = max_side / max(h, w)
        warped = cv2.resize(
            warped,
            (int(w * scale), int(h * scale)),
            interpolation=cv2.INTER_AREA,
        )
    elif max(h, w) < 900:
        scale = 900 / max(h, w)
        warped = cv2.resize(
            warped,
            (int(w * scale), int(h * scale)),
            interpolation=cv2.INTER_CUBIC,
        )

    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    gray = _reduce_shadows(gray)
    gray = cv2.fastNlMeansDenoising(gray, None, 12, 7, 21)

    # Contrast enhancement
    clahe = cv2.createCLAHE(clipLimit=2.4, tileGridSize=(8, 8))
    gray = clahe.apply(gray)

    # Mild unsharp mask
    blur = cv2.GaussianBlur(gray, (0, 0), 1.2)
    sharp = cv2.addWeighted(gray, 1.5, blur, -0.5, 0)

    # Keep a grayscale 3-channel image for EasyOCR (binarization alone can hurt DNNs)
    rgbish = cv2.cvtColor(sharp, cv2.COLOR_GRAY2BGR)

    # Also prepare a thresholded variant; we'll OCR both and merge.
    binary = cv2.adaptiveThreshold(
        sharp, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 12
    )
    binary_bgr = cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)
    return rgbish, binary_bgr


def _decode_image(data: bytes, filename: str | None = None) -> np.ndarray:
    import cv2  # type: ignore

    ext = (filename or "").rsplit(".", 1)[-1].lower() if filename and "." in filename else ""
    if ext in {"heic", "heif"}:
        try:
            from io import BytesIO

            from PIL import Image  # type: ignore
            import pillow_heif  # type: ignore

            pillow_heif.register_heif_opener()
            pil = Image.open(BytesIO(data)).convert("RGB")
            return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
        except Exception as exc:
            raise ValueError(
                "HEIC images need pillow-heif. Convert to JPG/PNG, or run: "
                "pip install pillow-heif"
            ) from exc

    arr = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(
            "Could not read image. Use JPG, JPEG, PNG, or HEIC of the booklist."
        )
    return image


def _validate_image_quality(image_bgr: np.ndarray) -> None:
    h, w = image_bgr.shape[:2]
    if h < 200 or w < 200:
        raise ValueError(
            "Image is too small for reliable OCR. Use a clearer, closer photo."
        )
    # Very dark / blank frames
    mean = float(np.mean(image_bgr))
    if mean < 18:
        raise ValueError("Image is too dark. Retake with better lighting.")
    if mean > 245:
        raise ValueError("Image is overexposed or blank. Retake the photo.")


def _bbox_stats(bbox) -> tuple[float, float, float, float]:
    xs = [float(p[0]) for p in bbox]
    ys = [float(p[1]) for p in bbox]
    return min(xs), min(ys), max(xs), max(ys)


def _run_ocr(image_bgr: np.ndarray) -> list[OcrBox]:
    import cv2  # type: ignore

    reader = _get_reader()
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    raw = reader.readtext(
        rgb,
        detail=1,
        paragraph=False,
        contrast_ths=0.05,
        adjust_contrast=0.7,
        text_threshold=0.5,
        low_text=0.3,
        link_threshold=0.3,
        canvas_size=2560,
        mag_ratio=1.4,
    )
    boxes: list[OcrBox] = []
    for item in raw:
        if len(item) < 3:
            continue
        bbox, text, conf = item[0], item[1], float(item[2])
        text = " ".join(str(text).split()).strip()
        if not text:
            continue
        x1, y1, x2, y2 = _bbox_stats(bbox)
        boxes.append(
            OcrBox(
                text=text,
                confidence=conf,
                x1=x1,
                y1=y1,
                x2=x2,
                y2=y2,
            )
        )
    return boxes


def _group_into_lines(boxes: list[OcrBox]) -> list[list[OcrBox]]:
    if not boxes:
        return []
    ordered = sorted(boxes, key=lambda b: (b.cy, b.x1))
    lines: list[list[OcrBox]] = []
    current: list[OcrBox] = [ordered[0]]
    for box in ordered[1:]:
        ref = current[0]
        # Same line if vertical centers are close relative to text height
        threshold = max(ref.height, box.height) * 0.7
        if abs(box.cy - ref.cy) <= threshold:
            current.append(box)
        else:
            lines.append(sorted(current, key=lambda b: b.x1))
            current = [box]
    lines.append(sorted(current, key=lambda b: b.x1))
    return lines


def _clean_fragment(text: str) -> str:
    text = _LEADING_INDEX_RE.sub("", text)
    text = text.replace("|", " ").replace("•", " ")
    text = re.sub(r"[^\w\s&:.,'\-()/]", " ", text)
    return " ".join(text.split()).strip(" -–—:")


def _is_noise_line(text: str) -> bool:
    cleaned = _clean_fragment(text)
    if not cleaned:
        return True
    key = cleaned.casefold()
    if key in _NOISE_EXACT:
        return True
    if _QTY_ONLY_RE.match(cleaned):
        return True
    if _PRICE_RE.search(cleaned) and sum(ch.isalpha() for ch in cleaned) < 6:
        return True
    if _SUBJECT_HEADING_RE.match(cleaned) and len(cleaned.split()) <= 4:
        return True
    for needle in _NOISE_CONTAINS:
        if needle in key:
            return True
    letters = sum(ch.isalpha() for ch in cleaned)
    if letters < 4:
        return True
    # Mostly digits / codes
    if letters / max(1, len(cleaned)) < 0.35:
        return True
    return False


def _parse_title_author(line: str) -> tuple[str, str | None]:
    cleaned = _clean_fragment(line)
    cleaned = _ISBN_RE.sub("", cleaned)
    cleaned = _PRICE_RE.sub("", cleaned)
    cleaned = " ".join(cleaned.split()).strip(" -–—:")

    match = _BY_AUTHOR_RE.match(cleaned)
    if match:
        title = match.group("title").strip(" -–—:")
        author = match.group("author").strip(" -–—:")
        if len(title) >= 3:
            return title, author or None

    match = _AUTHOR_FIRST_RE.match(cleaned)
    if match and "," in cleaned:
        title = match.group("title").strip(" -–—:")
        author = match.group("author").strip(" -–—:")
        if len(title) >= 3 and len(author.split()) <= 5:
            return title, author or None

    return cleaned, None


def _merge_boxes(a: list[OcrBox], b: list[OcrBox]) -> list[OcrBox]:
    """Prefer higher-confidence overlapping text from two OCR passes."""
    merged = list(a)
    for box in b:
        duplicate = False
        for existing in merged:
            same_row = abs(existing.cy - box.cy) <= max(existing.height, box.height) * 0.7
            same_text = existing.text.casefold() == box.text.casefold()
            if same_row and same_text:
                duplicate = True
                if box.confidence > existing.confidence:
                    existing.confidence = box.confidence
                    existing.text = box.text
                break
        if not duplicate:
            merged.append(box)
    return merged


def extract_titles_from_image(data: bytes, filename: str | None = None) -> dict:
    """
    Preprocess + OCR a booklist photo.
    Returns editable title/author rows with OCR confidence (0–100).
    """
    import cv2  # type: ignore

    image = _decode_image(data, filename=filename)
    _validate_image_quality(image)
    enhanced, binary = preprocess_document(image)

    boxes = _merge_boxes(_run_ocr(enhanced), _run_ocr(binary))
    line_groups = _group_into_lines(boxes)

    rows: list[dict] = []
    seen: set[str] = set()
    for idx, group in enumerate(line_groups):
        joined = " ".join(box.text for box in group)
        joined = " ".join(joined.split())
        if _is_noise_line(joined):
            continue
        title, author = _parse_title_author(joined)
        if _is_noise_line(title):
            continue
        if len(title) < 4:
            continue

        key = f"{title.casefold()}|{(author or '').casefold()}"
        if key in seen:
            continue
        seen.add(key)

        conf = float(np.mean([b.confidence for b in group])) if group else 0.0
        rows.append(
            {
                "id": f"ocr-{idx}",
                "text": title,
                "title": title,
                "author": author,
                "confidence": round(conf * 100, 1),
                "raw": joined,
            }
        )

    ok, buf = cv2.imencode(".jpg", enhanced, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
    preview_b64 = base64.b64encode(buf.tobytes()).decode("ascii") if ok else None

    return {
        "lines": rows,
        "count": len(rows),
        "preview_jpeg_base64": preview_b64,
        "message": (
            f"Found {len(rows)} likely book title(s). "
            "Edit anything incorrect before searching inventory."
            if rows
            else "No book titles detected after filtering. "
            "Try a flatter, brighter photo or enter titles manually."
        ),
    }


def load_image_bytes_from_upload(file_storage) -> tuple[bytes, str | None]:
    filename = getattr(file_storage, "filename", None)
    if filename:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext and ext not in ALLOWED_EXTENSIONS:
            raise ValueError(
                "Unsupported format. Use JPG, JPEG, PNG, or HEIC."
            )

    raw = file_storage.read(MAX_IMAGE_BYTES + 1)
    if not raw:
        raise ValueError("Empty image upload.")
    if len(raw) < MIN_IMAGE_BYTES:
        raise ValueError("Image file is too small or corrupt.")
    if len(raw) > MAX_IMAGE_BYTES:
        raise ValueError("Image is too large (max 12 MB).")
    return raw, filename
