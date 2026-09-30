#!/usr/bin/env python3
"""
Deploy WebGuardian AI to a free Hugging Face Space (Docker SDK).

  pip install huggingface_hub
  HF_TOKEN=hf_xxx HF_SPACE=your-username/webguardian-ai GEMINI_API_KEY=xxx python scripts/deploy_hf.py

Environment:
  HF_TOKEN        Hugging Face access token with "write" permission (required)
  HF_SPACE        <username>/<space-name> (required)
  GEMINI_API_KEY  stored as a Space *secret* (optional; can also be set in the Space settings)
  GEMINI_MODEL    optional model override

Use --dry-run to build the upload folder without contacting Hugging Face.
"""
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

SPACE_HEADER = """---
title: WebGuardian AI
emoji: 🛡️
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 8080
pinned: false
short_description: Autonomous AI website QA agent
---

"""

# Not needed to run the app; keeps the upload small.
EXCLUDE = [".github", "docs/screenshots"]


def space_url(space: str) -> str:
    owner, name = space.split("/", 1)
    host = re.sub(r"[^a-z0-9-]", "-", f"{owner}-{name}".lower())
    return f"https://{host}.hf.space"


def build_folder(target: Path) -> None:
    """Exports the committed tree (git archive) and adds the Space README header."""
    archive = target / "src.tar"
    subprocess.run(["git", "archive", "--format=tar", "-o", str(archive), "HEAD"], cwd=REPO_ROOT, check=True)
    with tarfile.open(archive) as tar:
        tar.extractall(target, filter="data")
    archive.unlink()
    for rel in EXCLUDE:
        shutil.rmtree(target / rel, ignore_errors=True)
    readme = target / "README.md"
    readme.write_text(SPACE_HEADER + readme.read_text(encoding="utf-8"), encoding="utf-8")


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    space = os.environ.get("HF_SPACE", "").strip()
    token = os.environ.get("HF_TOKEN", "").strip()
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", space):
        print("Set HF_SPACE to <username>/<space-name>, e.g. HF_SPACE=jane/webguardian-ai", file=sys.stderr)
        return 1
    url = space_url(space)

    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        build_folder(folder)
        files = [p for p in folder.rglob("*") if p.is_file()]
        print(f"Prepared {len(files)} files for {space} → {url}")
        if dry_run:
            print((folder / "README.md").read_text(encoding="utf-8")[:400])
            return 0
        if not token:
            print("Set HF_TOKEN to a Hugging Face token with write access.", file=sys.stderr)
            return 1

        from huggingface_hub import HfApi

        api = HfApi(token=token)
        api.create_repo(space, repo_type="space", space_sdk="docker", exist_ok=True)

        api.add_space_variable(space, "PUBLIC_BASE_URL", url)
        api.add_space_variable(space, "MAX_CONCURRENT_AUDITS", "1")
        if os.environ.get("GEMINI_MODEL"):
            api.add_space_variable(space, "GEMINI_MODEL", os.environ["GEMINI_MODEL"])
        if os.environ.get("GEMINI_API_KEY"):
            api.add_space_secret(space, "GEMINI_API_KEY", os.environ["GEMINI_API_KEY"])
            print("GEMINI_API_KEY stored as a Space secret.")
        else:
            print("No GEMINI_API_KEY given — add it under Space → Settings → Variables and secrets.")

        api.upload_folder(
            folder_path=str(folder),
            repo_id=space,
            repo_type="space",
            commit_message="Deploy WebGuardian AI",
        )

    print(f"\nUploaded. The Space is building (first build takes ~5–10 minutes).")
    print(f"  Build logs: https://huggingface.co/spaces/{space}")
    print(f"  Live app:   {url}")
    print(f"  Health:     {url}/api/health")
    return 0


if __name__ == "__main__":
    sys.exit(main())
