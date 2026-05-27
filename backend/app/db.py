import os
from pathlib import Path

from supabase import Client, create_client


_env_path = Path(__file__).resolve().parent.parent / ".env"


def _load_env_file(env_path: Path) -> None:
    """
    Load backend/.env without requiring python-dotenv or pydantic-settings.
    Existing environment variables win so deployed environments still behave normally.
    """
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_env_file(_env_path)

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

try:
    if not supabase_url or not supabase_key:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY or SUPABASE_SERVICE_ROLE_KEY must be set.")
    supabase: Client = create_client(supabase_url, supabase_key)
except Exception as e:
    import traceback

    traceback.print_exc()
    print(f"Warning: Failed to initialize Supabase client. Check .env variables. Details: {e}")
    supabase = None


def get_supabase() -> Client:
    return supabase
