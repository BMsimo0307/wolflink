import json
from typing import Dict, List, Any
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # Dictionary mapping room_code to a dictionary of client_id -> WebSocket
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, room_code: str, client_id: str, websocket: WebSocket):
        await websocket.accept()
        if room_code not in self.active_connections:
            self.active_connections[room_code] = {}
        self.active_connections[room_code][client_id] = websocket

    def disconnect(self, room_code: str, client_id: str):
        if room_code in self.active_connections:
            if client_id in self.active_connections[room_code]:
                del self.active_connections[room_code][client_id]
            if not self.active_connections[room_code]:
                del self.active_connections[room_code]

    async def send_personal_message(self, message: dict, room_code: str, client_id: str):
        if room_code in self.active_connections and client_id in self.active_connections[room_code]:
            ws = self.active_connections[room_code][client_id]
            await ws.send_text(json.dumps(message))

    async def broadcast_to_room(self, message: dict, room_code: str):
        if room_code in self.active_connections:
            for connection in self.active_connections[room_code].values():
                await connection.send_text(json.dumps(message))

manager = ConnectionManager()
