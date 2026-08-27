import io

import docx2txt
from pypdf import PdfReader


class TextExtractionError(Exception):
    pass


def extract_text_from_pdf(file_bytes: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
    except Exception as exc:
        raise TextExtractionError(f"Could not read PDF file: {exc}") from exc

    if reader.is_encrypted:
        raise TextExtractionError("PDF is password-protected and cannot be read.")

    pages_text = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages_text).strip()


def extract_text_from_docx(file_bytes: bytes) -> str:
    try:
        text = docx2txt.process(io.BytesIO(file_bytes))
    except Exception as exc:
        raise TextExtractionError(f"Could not read DOCX file: {exc}") from exc

    return text.strip()


EXTRACTORS = {
    ".pdf": extract_text_from_pdf,
    ".docx": extract_text_from_docx,
}


def extract_text(extension: str, file_bytes: bytes) -> str:
    extractor = EXTRACTORS.get(extension.lower())
    if extractor is None:
        raise TextExtractionError(f"Unsupported file extension: {extension}")

    return extractor(file_bytes)
