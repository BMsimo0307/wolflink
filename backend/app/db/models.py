import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, Enum, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.db.database import Base

def generate_uuid():
    return str(uuid.uuid4())

class RoomStatus(str, enum.Enum):
    WAITING = "WAITING"
    PLAYING = "PLAYING"
    FINISHED = "FINISHED"

class RoleEnum(str, enum.Enum):
    VILLAGER = "VILLAGER"
    WEREWOLF = "WEREWOLF"
    SEER = "SEER"
    WITCH = "WITCH"
    GUARD = "GUARD"
    HUNTER = "HUNTER"

class ActionType(str, enum.Enum):
    KILL = "KILL"
    SAVE = "SAVE"
    POISON = "POISON"
    PROTECT = "PROTECT"
    SEE = "SEE"

class Room(Base):
    __tablename__ = "rooms"

    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    code = Column(String(6), unique=True, index=True, nullable=False)
    status = Column(Enum(RoomStatus), default=RoomStatus.WAITING, nullable=False)
    settings = Column(JSON, nullable=True) # E.g., {"roles": ["WEREWOLF", "VILLAGER"]}
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    players = relationship("Player", back_populates="room", cascade="all, delete-orphan")
    actions = relationship("GameAction", back_populates="room", cascade="all, delete-orphan")

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    email = Column(String, unique=True, index=True, nullable=True)
    name = Column(String, nullable=False)
    avatar_url = Column(String, nullable=True)
    provider = Column(String, default="guest") # "google", "discord", "apple", "guest"
    provider_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    players = relationship("Player", back_populates="user")

class Player(Base):
    __tablename__ = "players"

    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    room_id = Column(String, ForeignKey("rooms.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    name = Column(String, nullable=False)
    role = Column(Enum(RoleEnum), nullable=True)
    is_alive = Column(Boolean, default=True, nullable=False)
    ws_client_id = Column(String, nullable=True) # Used for WebSocket connection identification

    room = relationship("Room", back_populates="players")
    user = relationship("User", back_populates="players")

    # Actions performed by this player
    actions_performed = relationship("GameAction", foreign_keys="[GameAction.actor_id]", back_populates="actor")
    # Actions targeted at this player
    actions_received = relationship("GameAction", foreign_keys="[GameAction.target_id]", back_populates="target")

class GameAction(Base):
    __tablename__ = "game_actions"

    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    room_id = Column(String, ForeignKey("rooms.id"), nullable=False)
    round_number = Column(Integer, nullable=False)
    actor_id = Column(String, ForeignKey("players.id"), nullable=False)
    target_id = Column(String, ForeignKey("players.id"), nullable=True)
    action_type = Column(Enum(ActionType), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    room = relationship("Room", back_populates="actions")
    actor = relationship("Player", foreign_keys=[actor_id], back_populates="actions_performed")
    target = relationship("Player", foreign_keys=[target_id], back_populates="actions_received")
