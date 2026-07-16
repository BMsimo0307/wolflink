import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from app.websockets.manager import manager
from app.db.database import get_db
from app.db import models
from app.services.game_engine import GameEngine

router = APIRouter()

# Store current round per room in memory
room_rounds = {}

@router.websocket("/ws/rooms/{room_code}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, room_code: str, client_id: str, db: Session = Depends(get_db)):
    await manager.connect(room_code, client_id, websocket)
    try:
        # Notify lobby update
        await broadcast_lobby_update(room_code, db)

        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            event_type = message.get("type")

            if event_type == "start_game":
                engine = GameEngine(db)
                await engine.start_game(room_code)

            elif event_type == "next_phase":
                phase = message.get("data", {}).get("phase", "day")
                round_num = message.get("data", {}).get("round", 1)
                room_rounds[room_code] = round_num
                engine = GameEngine(db)
                await engine.change_phase(room_code, phase, round_num)

            elif event_type == "player_action":
                action_data = message.get("data", {})
                action_type = action_data.get("action_type")
                target_id = action_data.get("target_id")
                current_round = room_rounds.get(room_code, 1)
                engine = GameEngine(db)
                await engine.handle_player_action(
                    room_code, client_id, action_type, target_id, current_round
                )

            elif event_type == "eliminate_player":
                # Narrator manually eliminates a player after day vote
                data = message.get("data", {})
                player_id = data.get("player_id")
                player_name = data.get("player_name", "?")
                if player_id:
                    player = db.query(models.Player).filter(models.Player.id == player_id).first()
                    if player:
                        player.is_alive = False
                        db.commit()
                # Notify all clients
                await manager.broadcast_to_room({
                    "type": "player_eliminated",
                    "data": {"name": player_name}
                }, room_code)
                # Send narrator updated player list
                room = db.query(models.Room).filter(models.Room.code == room_code).first()
                if room:
                    players = db.query(models.Player).filter(models.Player.room_id == room.id).all()
                    await manager.send_personal_message({
                        "type": "narrator_status_update",
                        "data": {
                            "actions": [],
                            "players": [{"id": p.id, "name": p.name, "is_alive": p.is_alive} for p in players]
                        }
                    }, room_code, "narrator")

            elif event_type == "skip_vote":
                # Narrator skips the vote — broadcast to all players
                await manager.broadcast_to_room({
                    "type": "vote_skipped",
                    "data": {}
                }, room_code)

            elif event_type == "debate_started":
                # Re-broadcast to all players so their timers start
                seconds = message.get("data", {}).get("seconds", 40)
                await manager.broadcast_to_room({
                    "type": "debate_started",
                    "data": {"seconds": seconds}
                }, room_code)

            elif event_type == "end_game":
                # Narrator ends the game manually
                room = db.query(models.Room).filter(models.Room.code == room_code).first()
                if room:
                    room.status = models.RoomStatus.FINISHED
                    db.commit()
                await manager.broadcast_to_room({
                    "type": "game_over",
                    "data": {"winner": "narrator_ended", "message": "Le narrateur a mis fin à la partie."}
                }, room_code)

    except WebSocketDisconnect:
        manager.disconnect(room_code, client_id)
        await broadcast_lobby_update(room_code, db)


async def broadcast_lobby_update(room_code: str, db: Session):
    room = db.query(models.Room).filter(models.Room.code == room_code).first()
    if not room:
        return

    players = db.query(models.Player).filter(models.Player.room_id == room.id).all()
    players_data = [{"id": p.id, "name": p.name, "is_alive": p.is_alive} for p in players]

    await manager.broadcast_to_room({
        "type": "lobby_update",
        "data": {
            "players": players_data,
            "status": room.status.value
        }
    }, room_code)
