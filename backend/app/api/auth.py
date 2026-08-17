import base64
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db import models
from app.schemas import schemas

router = APIRouter()

SECRET_KEY = "wolflink-secret-jwt-key-for-local-auth"

def create_simple_token(user_id: str) -> str:
    # A simple lightweight JWT-like token for stateless auth without external heavy dependencies
    payload = {
        "sub": user_id,
        "exp": int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())
    }
    raw = json.dumps(payload).encode('utf-8')
    return base64.b64encode(raw).decode('utf-8')

def decode_simple_token(token: str) -> Optional[str]:
    try:
        raw = base64.b64decode(token.encode('utf-8')).decode('utf-8')
        payload = json.loads(raw)
        if payload.get("exp", 0) < int(datetime.now(timezone.utc).timestamp()):
            return None
        return payload.get("sub")
    except Exception:
        return None

@router.post("/guest", response_model=schemas.TokenResponse)
def guest_login(guest_in: schemas.GuestAuthInput, db: Session = Depends(get_db)):
    name = guest_in.name.strip() or f"Invité-{uuid.uuid4().hex[:4]}"
    user = models.User(
        name=name,
        provider="guest"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_simple_token(user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user
    }

@router.post("/google", response_model=schemas.TokenResponse)
def google_login(auth_in: schemas.GoogleAuthInput, db: Session = Depends(get_db)):
    # Parse Google JWT payload (base64 decode of middle part of JWT)
    try:
        parts = auth_in.credential.split(".")
        if len(parts) != 3:
            raise HTTPException(status_code=400, detail="Token Google invalide")
        
        # Add base64 padding if needed
        payload_b64 = parts[1]
        payload_b64 += "=" * ((4 - len(payload_b64) % 4) % 4)
        payload_json = json.loads(base64.b64decode(payload_b64).decode('utf-8'))

        email = payload_json.get("email")
        name = payload_json.get("name") or payload_json.get("given_name") or "Joueur Google"
        avatar_url = payload_json.get("picture")
        sub = payload_json.get("sub")

        if not email or not sub:
            raise HTTPException(status_code=400, detail="Données Google incomplètes")

        # Find existing user or create one
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            user = models.User(
                email=email,
                name=name,
                avatar_url=avatar_url,
                provider="google",
                provider_id=sub
            )
            db.add(user)
        else:
            user.name = name
            user.avatar_url = avatar_url

        db.commit()
        db.refresh(user)

        token = create_simple_token(user.id)
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": user
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur d'authentification Google: {str(e)}")

@router.get("/me", response_model=schemas.UserResponse)
def get_me(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Non autorisé")
    
    token = authorization.split(" ")[1]
    user_id = decode_simple_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    return user
