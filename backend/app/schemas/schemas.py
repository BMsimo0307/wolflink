from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime
from app.db.models import RoomStatus, RoleEnum

# ---- Player Schemas ----
class PlayerBase(BaseModel):
    name: str

class PlayerCreate(PlayerBase):
    pass

class PlayerResponse(PlayerBase):
    id: str
    room_id: str
    role: Optional[RoleEnum] = None
    is_alive: bool

    model_config = ConfigDict(from_attributes=True)

# ---- Room Schemas ----
class RoomBase(BaseModel):
    settings: Optional[Dict[str, Any]] = None

class RoomCreate(RoomBase):
    pass

class RoomResponse(RoomBase):
    id: str
    code: str
    status: RoomStatus
    created_at: datetime
    players: List[PlayerResponse] = []

    model_config = ConfigDict(from_attributes=True)
