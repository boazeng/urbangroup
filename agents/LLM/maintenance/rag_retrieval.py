"""
RAG Retrieval Module - Embedding generation and similarity search.

Uses OpenAI text-embedding-3-small for vectorizing text,
and cosine similarity against DynamoDB-stored knowledge items.
"""

import os
import sys
import math
import logging
import importlib.util
from pathlib import Path

import requests

if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
    load_dotenv(env_path)

logger = logging.getLogger("urbangroup.rag_retrieval")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
EMBEDDING_MODEL = "text-embedding-3-small"  # 1536 dimensions, cheap & fast

# Lazy-loaded knowledge_db module
_knowledge_db = None


def _get_knowledge_db():
    """Lazy-load knowledge_db module."""
    global _knowledge_db
    if _knowledge_db is None:
        try:
            if "knowledge_db" in sys.modules:
                _knowledge_db = sys.modules["knowledge_db"]
            else:
                db_path = Path(__file__).resolve().parent.parent.parent.parent / "database" / "maintenance" / "knowledge_db.py"
                spec = importlib.util.spec_from_file_location("knowledge_db", db_path)
                _knowledge_db = importlib.util.module_from_spec(spec)
                sys.modules["knowledge_db"] = _knowledge_db
                spec.loader.exec_module(_knowledge_db)
        except Exception as e:
            logger.warning(f"Failed to load knowledge_db: {e}")
            return None
    return _knowledge_db


def generate_embedding(text):
    """Generate an embedding vector for text using OpenAI.

    Args:
        text: The text to embed (will be truncated to ~8000 chars)

    Returns:
        list of floats (1536 dimensions), or None on failure
    """
    if not OPENAI_API_KEY:
        logger.error("OPENAI_API_KEY not set, cannot generate embedding")
        return None

    # Truncate to avoid token limits
    text = text[:8000]

    try:
        resp = requests.post(
            "https://api.openai.com/v1/embeddings",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": EMBEDDING_MODEL,
                "input": text,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["data"][0]["embedding"]
    except Exception as e:
        logger.error(f"Failed to generate embedding: {e}")
        return None


def _cosine_similarity(a, b):
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def search_knowledge(query_text, top_k=3, min_score=0.3):
    """Search the knowledge base for items relevant to the query.

    Args:
        query_text: The text to search for (customer message)
        top_k: Number of top matches to return
        min_score: Minimum similarity score (0-1) to include

    Returns:
        list of dicts: [{id, title, content, score, tags}, ...]
        Empty list if no matches or on failure.
    """
    # Step 1: Embed the query
    query_embedding = generate_embedding(query_text)
    if not query_embedding:
        return []

    # Step 2: Load all knowledge items with embeddings
    db = _get_knowledge_db()
    if not db:
        return []

    items = db.get_all_active_with_embeddings()
    if not items:
        return []

    # Step 3: Compute similarity scores
    scored = []
    for item in items:
        embedding = item.get("embedding")
        if not embedding or len(embedding) != len(query_embedding):
            continue
        score = _cosine_similarity(query_embedding, embedding)
        if score >= min_score:
            scored.append({
                "id": item["id"],
                "title": item["title"],
                "content": item["content"],
                "score": round(score, 4),
                "tags": item.get("tags", []),
                "type": item.get("type", "manual"),
            })

    # Step 4: Sort by score and return top_k
    scored.sort(key=lambda x: x["score"], reverse=True)
    results = scored[:top_k]

    if results:
        logger.info(f"RAG: Found {len(results)} matches (top score: {results[0]['score']})")
    return results


def format_rag_context(matches):
    """Format RAG matches as text for injection into the system prompt.

    Args:
        matches: list from search_knowledge()

    Returns:
        str: Formatted context text, or empty string if no matches
    """
    if not matches:
        return ""

    lines = ["", "מידע רלוונטי מניסיון קודם (השתמש במידע זה לשיפור הניתוח):"]
    for i, m in enumerate(matches, 1):
        content = m["content"]
        # Truncate long content
        if len(content) > 300:
            content = content[:300] + "..."
        lines.append(f"{i}. {m['title']}: {content}")

    return "\n".join(lines)
