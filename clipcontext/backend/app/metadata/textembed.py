"""Text embeddings with a no-download fallback.

Primary: fastembed (ONNX, no torch). Fallback: TF-IDF character n-grams fitted on
the texts at hand, which is enough for near-duplicate detection and keyphrase MMR.
"""

from __future__ import annotations

import logging
import threading

import numpy as np

from app.core.config import get_settings

log = logging.getLogger(__name__)
_MODEL = None
_FAILED = False
_LOCK = threading.Lock()


def embed_texts(texts: list[str]) -> np.ndarray:
    global _MODEL, _FAILED
    if not texts:
        return np.zeros((0, 1), dtype=np.float32)
    if not _FAILED:
        try:
            with _LOCK:
                if _MODEL is None and not _FAILED:
                    from fastembed import TextEmbedding

                    _MODEL = TextEmbedding(get_settings().text_embedding_model)
            if _MODEL is None:
                raise RuntimeError("text embedding model failed to load earlier")
            vectors = np.array(list(_MODEL.embed(texts)), dtype=np.float32)
            return _normalize(vectors)
        except Exception as exc:
            log.warning("text embedding model unavailable (%s); using TF-IDF fallback", exc)
            _FAILED = True
    from sklearn.feature_extraction.text import TfidfVectorizer

    vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), lowercase=True)
    matrix = vectorizer.fit_transform(texts).toarray().astype(np.float32)
    return _normalize(matrix)


def _normalize(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    return vectors / np.maximum(norms, 1e-9)


def cosine_matrix(texts: list[str]) -> np.ndarray:
    vectors = embed_texts(texts)
    return vectors @ vectors.T
