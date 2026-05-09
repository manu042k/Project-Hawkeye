"""LLM provider factory — returns a LangChain BaseChatModel.

Primary:  Ollama      (local, free)  — model string: "ollama:<name>" or bare "<name>:<tag>"
         vLLM        (local, free)  — model string: "vllm:<name>",       requires VLLM_BASE_URL (default: http://localhost:8001)
Fallback: Groq        (cloud API)   — model string: "groq:<name>",       requires GROQ_API_KEY
         OpenRouter   (cloud API)   — model string: "openrouter:<name>", requires OPENROUTER_API_KEY
         NVIDIA NIM   (cloud API)   — model string: "nvidia:<name>",     requires NVIDIA_API_KEY
"""
from __future__ import annotations

import os

from langchain_core.language_models import BaseChatModel

_DEFAULT_MODEL = "ollama:qwen3.5:2b"
_DEFAULT_OLLAMA_HOST = "http://localhost:11434"
_GROQ_BASE_URL = "https://api.groq.com/openai/v1"
_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
_VLLM_BASE_URL = "http://localhost:8001/v1"


_VISION_KEYWORDS = (
    "gpt-4o", "gpt-4-vision",
    "claude-3", "claude-sonnet", "claude-opus", "claude-haiku",
    "gemini", "gemma", "llava", "vision",
    "nemotron", "omni", "qianfan-ocr",
    "qwen2.5-vl", "qwen2-vl", "qwenvl",
)



def is_vision_capable(model: str) -> bool:
    """Return True if the model supports vision (image inputs).

    Checks for known vision-capable model name substrings. Ollama models
    without vision keywords (e.g. 'qwen3.5:2b') return False. Defaults to
    False for unrecognised models to avoid sending images to text-only APIs.
    """
    normalized = model.lower()
    return any(kw in normalized for kw in _VISION_KEYWORDS)


def get_llm(
    model: str = _DEFAULT_MODEL,
    *,
    ollama_host: str = _DEFAULT_OLLAMA_HOST,
    groq_api_key: str | None = None,
) -> BaseChatModel:
    """Parse the model string and return the appropriate LangChain chat model.

    Model string formats:
    - ``"ollama:<name>"``  or bare ``"<name>:<tag>"`` (no slash) → ChatOllama
    - ``"groq:<name>"``   → ChatOpenAI pointed at Groq API

    Raises:
        ValueError: if the format is unrecognized or GROQ_API_KEY is absent
            when a groq model is requested.
    """
    if model.startswith("ollama:"):
        return _make_ollama(model.removeprefix("ollama:"), host=ollama_host)

    if model.startswith("groq:"):
        model_name = model.removeprefix("groq:")
        return _make_groq(model_name, api_key=groq_api_key)

    if model.startswith("openrouter:"):
        model_name = model.removeprefix("openrouter:")
        return _make_openrouter(model_name)

    if model.startswith("nvidia:"):
        model_name = model.removeprefix("nvidia:")
        return _make_nvidia(model_name)

    if model.startswith("vllm:"):
        model_name = model.removeprefix("vllm:")
        return _make_vllm(model_name)

    # Bare "name:tag" format (e.g. "qwen3.5:2b") — treat as Ollama.
    if ":" in model and "/" not in model:
        return _make_ollama(model, host=ollama_host)

    # Slash-separated (e.g. "openai/gpt-oss-120b") — treat as Groq.
    if "/" in model:
        return _make_groq(model, api_key=groq_api_key)

    raise ValueError(
        f"Unrecognized model string {model!r}. "
        "Use 'ollama:<name>', 'groq:<name>', or bare '<name>:<tag>' format."
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


def _make_openrouter(model_name: str) -> BaseChatModel:
    from langchain_openai import ChatOpenAI
    api_key = os.environ.get("OPENROUTER_API_KEY") or ""
    if not api_key:
        raise ValueError(
            "OPENROUTER_API_KEY environment variable is not set. "
            f"Required to use OpenRouter model {model_name!r}."
        )
    return ChatOpenAI(
        model=model_name,
        base_url=_OPENROUTER_BASE_URL,
        api_key=api_key,
        temperature=0,
    )


def _make_nvidia(model_name: str) -> BaseChatModel:
    from langchain_nvidia_ai_endpoints import ChatNVIDIA
    api_key = os.environ.get("NVIDIA_API_KEY") or ""
    if not api_key:
        raise ValueError(
            "NVIDIA_API_KEY environment variable is not set. "
            f"Required to use NVIDIA NIM model {model_name!r}."
        )
    return ChatNVIDIA(
        model=model_name,
        api_key=api_key,
        temperature=0,
    )


def _make_vllm(model_name: str) -> BaseChatModel:
    from langchain_openai import ChatOpenAI
    base_url = os.environ.get("VLLM_BASE_URL", _VLLM_BASE_URL)
    return ChatOpenAI(
        model=model_name,
        base_url=base_url,
        api_key="vllm",  # vLLM doesn't require a real key
        temperature=0,
    )
