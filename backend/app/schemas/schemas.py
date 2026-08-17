from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime
from app.db.models import RoomStatus, RoleEnum

# ---- User & Auth Schemas ----
class GoogleAuthInput(BaseModel):
    credential: str # Google ID token / credential string

class GuestAuthInput(BaseModel):
    name: str

class UserResponse(BaseModel):
    id: str
    email: Optional[str] = None
    name: str
    avatar_url: Optional[str] = None
    provider: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

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
