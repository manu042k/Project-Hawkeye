"""LLM provider factory — returns a LangChain BaseChatModel.

Primary:    Ollama      (local, free)   — model string: "ollama:<name>" or bare "<name>:<tag>"
Fallback 1: Groq        (cloud API)    — model string: "groq:<name>",        requires GROQ_API_KEY
Fallback 2: OpenRouter  (cloud API)    — model string: "openrouter:<name>",   requires OPENROUTER_API_KEY
"""
from __future__ import annotations

import os

from langchain_core.language_models import BaseChatModel

_DEFAULT_MODEL = "ollama:qwen3.5:2b"
_DEFAULT_OLLAMA_HOST = "http://localhost:11434"
_GROQ_BASE_URL = "https://api.groq.com/openai/v1"
_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def get_llm(
    model: str = _DEFAULT_MODEL,
    *,
    ollama_host: str = _DEFAULT_OLLAMA_HOST,
    groq_api_key: str | None = None,
    openrouter_api_key: str | None = None,
) -> BaseChatModel:
    """Parse the model string and return the appropriate LangChain chat model.

    Model string formats:
    - ``"ollama:<name>"``          or bare ``"<name>:<tag>"`` (no slash) → ChatOllama
    - ``"groq:<name>"``           → ChatOpenAI pointed at Groq API
    - ``"openrouter:<provider/name>"`` → ChatOpenAI pointed at OpenRouter API

    Raises:
        ValueError: if the format is unrecognized or API key is absent.
    """
    if model.startswith("ollama:"):
        return _make_ollama(model.removeprefix("ollama:"), host=ollama_host)

    if model.startswith("groq:"):
        model_name = model.removeprefix("groq:")
        return _make_groq(model_name, api_key=groq_api_key)

    if model.startswith("openrouter:"):
        model_name = model.removeprefix("openrouter:")
        return _make_openrouter(model_name, api_key=openrouter_api_key)

    # Bare "name:tag" format (e.g. "qwen3.5:2b") — treat as Ollama.
    if ":" in model and "/" not in model:
        return _make_ollama(model, host=ollama_host)

    # Slash-separated (e.g. "openai/gpt-oss-120b") — treat as Groq.
    if "/" in model:
        return _make_groq(model, api_key=groq_api_key)

    raise ValueError(
        f"Unrecognized model string {model!r}. "
        "Use 'ollama:<name>', 'groq:<name>', 'openrouter:<provider/name>', "
        "or bare '<name>:<tag>' format."
    )


def _make_ollama(model_name: str, *, host: str) -> BaseChatModel:
    from langchain_ollama import ChatOllama
    return ChatOllama(model=model_name, base_url=host, temperature=0)


def _make_groq(model_name: str, *, api_key: str | None) -> BaseChatModel:
    from langchain_openai import ChatOpenAI
    resolved_key = api_key or os.environ.get("GROQ_API_KEY") or ""
    if not resolved_key:
        raise ValueError(
            f"GROQ_API_KEY environment variable is not set. "
            f"Required to use Groq model {model_name!r}."
        )
    return ChatOpenAI(
        model=model_name,
        base_url=_GROQ_BASE_URL,
        api_key=resolved_key,
        temperature=0,
    )


def _make_openrouter(model_name: str, *, api_key: str | None) -> BaseChatModel:
    from langchain_openai import ChatOpenAI
    resolved_key = api_key or os.environ.get("OPENROUTER_API_KEY") or ""
    if not resolved_key:
        raise ValueError(
            f"OPENROUTER_API_KEY environment variable is not set. "
            f"Required to use OpenRouter model {model_name!r}."
        )
    return ChatOpenAI(
        model=model_name,
        base_url=_OPENROUTER_BASE_URL,
        api_key=resolved_key,
        temperature=0,
        default_headers={
            "HTTP-Referer": "https://github.com/project-hawkeye",
            "X-Title": "Project Hawkeye",
        },
    )
