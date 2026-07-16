import random
import string
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db import models
from app.schemas import schemas

router = APIRouter()

def generate_room_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

@router.post("/", response_model=schemas.RoomResponse, status_code=status.HTTP_201_CREATED)
def create_room(room_in: schemas.RoomCreate, db: Session = Depends(get_db)):
    code = generate_room_code()
    # Ensure code is unique (though very likely)
    while db.query(models.Room).filter(models.Room.code == code).first():
        code = generate_room_code()
        
    db_room = models.Room(
        code=code,
        settings=room_in.settings,
        status=models.RoomStatus.WAITING
    )
    db.add(db_room)
    db.commit()
    db.refresh(db_room)
    return db_room

@router.get("/{code}", response_model=schemas.RoomResponse)
def get_room(code: str, db: Session = Depends(get_db)):
    db_room = db.query(models.Room).filter(models.Room.code == code).first()
    if not db_room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    return db_room

@router.post("/{code}/join", response_model=schemas.PlayerResponse)
def join_room(code: str, player_in: schemas.PlayerCreate, db: Session = Depends(get_db)):
    db_room = db.query(models.Room).filter(models.Room.code == code).first()
    if not db_room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
        
    if db_room.status != models.RoomStatus.WAITING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Game has already started or finished")
        
    db_player = models.Player(
        room_id=db_room.id,
        name=player_in.name
    )
    db.add(db_player)
    db.commit()
    db.refresh(db_player)
    return db_player
