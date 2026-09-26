"""One-shot local setup helper: writes .env.local from the Supabase project.

Run with:  python3 scripts/setup-env.py
Requires SUPABASE_ACCESS_TOKEN in the environment. The generated .env.local is
gitignored; only .env.example (with placeholders) is committed.
"""

import json
import os
import pathlib
import subprocess
import sys

PROJECT_REF = os.environ.get("PANDAWOK_SUPABASE_REF", "xjbtsryidznsxqlynmfa")
ROOT = pathlib.Path(__file__).resolve().parent.parent

TEMPLATE = """# Panda Wok :: environment
# Public values, safe to ship in the browser bundle.
NEXT_PUBLIC_SUPABASE_URL={url}
NEXT_PUBLIC_SUPABASE_ANON_KEY={publishable}

# Server-only. Never import this in a Client Component.
SUPABASE_SERVICE_ROLE_KEY={secret}

# Public origin used for canonical URLs, the sitemap and structured data.
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Optional AI provider. When unset, the platform uses the deterministic
# database-grounded provider instead of failing.
AI_PROVIDER_KIND=
AI_BASE_URL=
AI_MODEL=
AI_API_KEY=
AI_FALLBACK_MODEL=

# Optional transactional email. Unset means broadcasts stay in-app only.
RESEND_API_KEY=
EMAIL_FROM=
"""


def main() -> int:
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token:
        print("SUPABASE_ACCESS_TOKEN is not set", file=sys.stderr)
        return 1

    out = subprocess.run(
        [
            "curl",
            "-s",
            "-H",
            f"Authorization: Bearer {token}",
            f"https://api.supabase.com/v1/projects/{PROJECT_REF}/api-keys?reveal=true",
        ],
        capture_output=True,
        text=True,
        check=True,
    ).stdout

    keys = json.loads(out)
    publishable = next(
        (
            k["api_key"]
            for k in keys
            if isinstance(k.get("api_key"), str)
            and k["api_key"].startswith("sb_publishable")
        ),
        None,
    ) or next(k["api_key"] for k in keys if k.get("name") == "anon")
    secret = next(k["api_key"] for k in keys if k.get("type") == "secret")

    body = TEMPLATE.format(
        url=f"https://{PROJECT_REF}.supabase.co",
        publishable=publishable,
        secret=secret,
    )
    (ROOT / ".env.local").write_text(body)

    # The committed template documents every supported variable, including the
    # per-provider AI blocks, so it is richer than what this script can produce.
    # Only write it when absent; never clobber the documented version.
    example = ROOT / ".env.example"
    if not example.exists():
        example.write_text(
            body.replace(secret, "your-service-role-key").replace(
                publishable, "your-publishable-key"
            )
        )
        print("wrote .env.local and a starter .env.example")
    else:
        print("wrote .env.local (.env.example left as-is)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
