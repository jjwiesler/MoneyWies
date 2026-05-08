import json
import uuid
from pathlib import Path
from typing import Optional, List

from db import init_db, _DEFAULT_DB

WORKSPACES_FILE = Path(__file__).parent / "workspaces.json"
BACKEND_DIR = Path(__file__).parent


def load_workspaces() -> List[dict]:
    if not WORKSPACES_FILE.exists():
        return []
    return json.loads(WORKSPACES_FILE.read_text())


def save_workspaces(workspaces: List[dict]):
    WORKSPACES_FILE.write_text(json.dumps(workspaces, indent=2))


def get_workspace_by_token(token: str) -> Optional[dict]:
    for ws in load_workspaces():
        if ws["token"] == token:
            return ws
    return None


def get_workspace_db_path(ws: dict) -> Path:
    return BACKEND_DIR / f"{ws['id']}.db"


def list_workspaces_public() -> List[dict]:
    return [{"id": ws["id"], "name": ws["name"]} for ws in load_workspaces()]


def create_workspace(name: str) -> dict:
    workspaces = load_workspaces()
    ws = {
        "id": str(uuid.uuid4()),
        "name": name,
        "token": str(uuid.uuid4()),
    }
    workspaces.append(ws)
    save_workspaces(workspaces)
    init_db(get_workspace_db_path(ws))
    return ws


def ensure_default_workspace():
    """On first run: if no workspaces.json, create a Personal workspace using the existing DB."""
    if WORKSPACES_FILE.exists():
        return
    ws_id = str(uuid.uuid4())
    token = str(uuid.uuid4())
    ws = {"id": ws_id, "name": "Personal", "token": token}
    existing_db = _DEFAULT_DB
    target_db = get_workspace_db_path(ws)
    if existing_db.exists() and not target_db.exists():
        existing_db.rename(target_db)
    save_workspaces([ws])
    init_db(target_db)
    return ws
