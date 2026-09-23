"""The one Anthropic client both extractors share."""

import os
from functools import lru_cache

import anthropic
from dotenv import load_dotenv

load_dotenv()

MODEL = "claude-opus-5"


class LLMConfigurationError(Exception):
    pass


@lru_cache(maxsize=1)
def get_client() -> anthropic.Anthropic:
    """Build the client once, on first use.

    A missing key fails here with a plain message instead of somewhere
    inside the SDK. Failures are not cached, so setting the key later in
    the same process (tests, a reloaded .env) makes the next call succeed.
    """
    api_key = os.getenv("LLM_API_KEY")
    if not api_key:
        raise LLMConfigurationError(
            "LLM_API_KEY is not configured. Set it in the backend .env file."
        )
    return anthropic.Anthropic(api_key=api_key)
