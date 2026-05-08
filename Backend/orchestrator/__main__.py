import io
import sys
from pathlib import Path

# On Windows, reconfigure stdout/stderr to UTF-8 before Rich is imported
# (the default CP1252 encoding cannot encode Rich's box-drawing characters).
if sys.platform == "win32":
    if hasattr(sys.stdout, "buffer"):
        sys.stdout = io.TextIOWrapper(
            sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True
        )
    if hasattr(sys.stderr, "buffer"):
        sys.stderr = io.TextIOWrapper(
            sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True
        )

# Load .env from the Backend directory (parent of this package) so GROQ_API_KEY
# and other secrets are available without manual export.
try:
    from dotenv import load_dotenv
    _env_file = Path(__file__).parent.parent / ".env"
    if _env_file.exists():
        load_dotenv(_env_file, override=False)  # override=False: real env vars take precedence
except ImportError:
    pass  # python-dotenv not installed — rely on environment variables

from orchestrator.cli.main import cli  # noqa: E402

if __name__ == "__main__":
    cli()
