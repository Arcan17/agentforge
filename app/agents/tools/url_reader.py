"""URL reader tool — fetches and extracts clean text from a web page."""

import httpx
from bs4 import BeautifulSoup
from langchain_core.tools import tool

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Tags whose content we strip entirely
_REMOVE_TAGS = {"script", "style", "nav", "footer", "header", "aside", "form"}
_MAX_CHARS = 8000  # truncate to keep token usage reasonable


@tool
def url_reader(url: str) -> dict:
    """Fetch a URL and extract readable text content.

    Args:
        url: The full URL to fetch and parse.

    Returns:
        Dict with keys: url, title, text (up to 8000 chars), error (if any).
    """
    try:
        with httpx.Client(
            timeout=settings.request_timeout_seconds,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; AgentForge/1.0)"},
        ) as client:
            response = client.get(url)
            response.raise_for_status()

        soup = BeautifulSoup(response.text, "lxml")

        # Remove noise tags
        for tag in soup(list(_REMOVE_TAGS)):
            tag.decompose()

        title = soup.title.string.strip() if soup.title else ""
        text = soup.get_text(separator=" ", strip=True)
        # Collapse excessive whitespace
        text = " ".join(text.split())

        logger.debug("url_reader_ok", url=url[:80], chars=len(text))
        return {"url": url, "title": title, "text": text[:_MAX_CHARS], "error": None}

    except Exception as exc:
        logger.warning("url_reader_failed", url=url[:80], error=str(exc))
        return {"url": url, "title": "", "text": "", "error": str(exc)}
