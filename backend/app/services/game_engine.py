import random
from sqlalchemy.orm import Session
from app.db import models
from app.websockets.manager import manager


class GameEngine:
    """Core game engine handling role distribution, night actions, and resolution."""

    def __init__(self, db: Session):
        self.db = db

    def distribute_roles(self, room: models.Room):
        """Shuffle and assign roles to players."""
        players = self.db.query(models.Player).filter(models.Player.room_id == room.id).all()

        roles_pool = list(room.settings.get("roles", [])) if room.settings else []

        # Fill remaining slots with villagers
        while len(roles_pool) < len(players):
            roles_pool.append(models.RoleEnum.VILLAGER.value)

        # Trim if too many roles
        roles_pool = roles_pool[:len(players)]

        random.shuffle(roles_pool)

        for i, player in enumerate(players):
            player.role = models.RoleEnum(roles_pool[i])

        self.db.commit()

    async def start_game(self, room_code: str):
        """Start the game: change status and distribute roles."""
        room = self.db.query(models.Room).filter(models.Room.code == room_code).first()
        if not room:
            return

        room.status = models.RoomStatus.PLAYING
        self.db.commit()

        self.distribute_roles(room)

        # Send each player their role privately
        players = self.db.query(models.Player).filter(models.Player.room_id == room.id).all()
        for player in players:
            await manager.send_personal_message({
                "type": "game_started",
                "data": {
                    "role": player.role.value
                }
            }, room_code, player.id)

        # Send narrator the players list
        players_data = [{"id": p.id, "name": p.name, "is_alive": p.is_alive} for p in players]
        await manager.send_personal_message({
            "type": "narrator_status_update",
            "data": {
                "actions": [],
                "players": players_data
            }
        }, room_code, "narrator")

    async def start_night(self, room_code: str, round_number: int):
        """Start the night phase: notify all players and request actions from special roles."""
        room = self.db.query(models.Room).filter(models.Room.code == room_code).first()
        if not room:
            return

        # Broadcast phase change to everyone
        await manager.broadcast_to_room({
            "type": "phase_changed",
            "data": {"phase": "night", "round": round_number}
        }, room_code)

        # Get alive players
        alive_players = self.db.query(models.Player).filter(
            models.Player.room_id == room.id,
            models.Player.is_alive == True
        ).all()

        alive_data = [{"id": p.id, "name": p.name} for p in alive_players]

        # Track which roles need to act
        action_roles = []

        # Send night action requests to each special role
        for player in alive_players:
            if player.role == models.RoleEnum.WEREWOLF:
                action_roles.append({"role": "🐺 Loup-Garou", "done": False})
                await manager.send_personal_message({
                    "type": "night_action_request",
                    "data": {"alive_players": alive_data}
                }, room_code, player.id)

            elif player.role == models.RoleEnum.SEER:
                action_roles.append({"role": "👁️ Voyante", "done": False})
                await manager.send_personal_message({
                    "type": "night_action_request",
                    "data": {"alive_players": alive_data}
                }, room_code, player.id)

            elif player.role == models.RoleEnum.GUARD:
                action_roles.append({"role": "🛡️ Garde", "done": False})
                await manager.send_personal_message({
                    "type": "night_action_request",
                    "data": {"alive_players": alive_data}
                }, room_code, player.id)

            elif player.role == models.RoleEnum.WITCH:
                action_roles.append({"role": "🧪 Sorcière", "done": False})
                # Witch gets info later, after wolves vote

        # Send narrator the expected actions status
        await manager.send_personal_message({
            "type": "narrator_status_update",
            "data": {
                "actions": action_roles,
                "players": [{"id": p.id, "name": p.name, "is_alive": p.is_alive} for p in alive_players]
            }
        }, room_code, "narrator")

    async def handle_player_action(self, room_code: str, client_id: str, action_type: str, target_id: str, round_number: int):
        """Process a player's night action."""
        room = self.db.query(models.Room).filter(models.Room.code == room_code).first()
        if not room:
            return

        player = self.db.query(models.Player).filter(models.Player.id == client_id).first()
        if not player:
            return

        # Handle witch pass (no DB action needed)
        if action_type == "WITCH_PASS":
            await manager.send_personal_message({
                "type": "action_confirmed",
                "data": {"message": "Vous avez choisi de passer."}
            }, room_code, client_id)
            await self._check_night_complete(room, room_code, round_number)
            return

        # Handle seer result
        if action_type == "SEE":
            target = self.db.query(models.Player).filter(models.Player.id == target_id).first()
            if target:
                camp = "wolf" if target.role == models.RoleEnum.WEREWOLF else "village"
                await manager.send_personal_message({
                    "type": "seer_result",
                    "data": {"camp": camp, "player_name": target.name}
                }, room_code, client_id)

            # Record the action
            action = models.GameAction(
                room_id=room.id,
                round_number=round_number,
                actor_id=client_id,
                target_id=target_id,
                action_type=models.ActionType.SEE
            )
            self.db.add(action)
            self.db.commit()
            await self._check_night_complete(room, room_code, round_number)
            return

        # Map string to enum
        action_map = {
            "KILL": models.ActionType.KILL,
            "PROTECT": models.ActionType.PROTECT,
            "SAVE": models.ActionType.SAVE,
            "POISON": models.ActionType.POISON,
        }

        db_action_type = action_map.get(action_type)
        if not db_action_type:
            return

        # Record the action in database
        action = models.GameAction(
            room_id=room.id,
            round_number=round_number,
            actor_id=client_id,
            target_id=target_id,
            action_type=db_action_type
        )
        self.db.add(action)
        self.db.commit()

        # Confirm to the player
        await manager.send_personal_message({
            "type": "action_confirmed",
            "data": {"message": "Votre action a été enregistrée."}
        }, room_code, client_id)

        # After wolf votes, send witch info
        if action_type == "KILL":
            await self._check_wolf_votes_and_notify_witch(room, room_code, round_number)

        # Check if all night actions are complete
        await self._check_night_complete(room, room_code, round_number)

    async def _check_wolf_votes_and_notify_witch(self, room, room_code, round_number):
        """After wolves have all voted, notify the witch of the victim."""
        alive_wolves = self.db.query(models.Player).filter(
            models.Player.room_id == room.id,
            models.Player.role == models.RoleEnum.WEREWOLF,
            models.Player.is_alive == True
        ).all()

        wolf_actions = self.db.query(models.GameAction).filter(
            models.GameAction.room_id == room.id,
            models.GameAction.round_number == round_number,
            models.GameAction.action_type == models.ActionType.KILL
        ).all()

        # All wolves have voted?
        if len(wolf_actions) >= len(alive_wolves):
            # Determine the wolf victim (majority vote or first target)
            target_counts = {}
            for a in wolf_actions:
                target_counts[a.target_id] = target_counts.get(a.target_id, 0) + 1

            victim_id = max(target_counts, key=target_counts.get)
            victim = self.db.query(models.Player).filter(models.Player.id == victim_id).first()

            # Find witch (if alive)
            witch = self.db.query(models.Player).filter(
                models.Player.room_id == room.id,
                models.Player.role == models.RoleEnum.WITCH,
                models.Player.is_alive == True
            ).first()

            if witch:
                # Check if witch has potions left
                save_used = self.db.query(models.GameAction).filter(
                    models.GameAction.room_id == room.id,
                    models.GameAction.actor_id == witch.id,
                    models.GameAction.action_type == models.ActionType.SAVE
                ).count() > 0

                poison_used = self.db.query(models.GameAction).filter(
                    models.GameAction.room_id == room.id,
                    models.GameAction.actor_id == witch.id,
                    models.GameAction.action_type == models.ActionType.POISON
                ).count() > 0

                alive_players = self.db.query(models.Player).filter(
                    models.Player.room_id == room.id,
                    models.Player.is_alive == True
                ).all()

                await manager.send_personal_message({
                    "type": "witch_info",
                    "data": {
                        "victim_name": victim.name if victim else "Personne",
                        "victim_id": victim_id,
                        "can_save": not save_used,
                        "can_poison": not poison_used,
                        "alive_players": [{"id": p.id, "name": p.name} for p in alive_players if p.id != witch.id]
                    }
                }, room_code, witch.id)

    async def _check_night_complete(self, room, room_code, round_number):
        """Check if all expected night actions have been received."""
        alive_players = self.db.query(models.Player).filter(
            models.Player.room_id == room.id,
            models.Player.is_alive == True
        ).all()

        actions = self.db.query(models.GameAction).filter(
            models.GameAction.room_id == room.id,
            models.GameAction.round_number == round_number
        ).all()

        action_actor_ids = set(a.actor_id for a in actions)

        # Check each special role
        all_done = True
        status_list = []

        for p in alive_players:
            if p.role == models.RoleEnum.WEREWOLF:
                done = p.id in action_actor_ids
                status_list.append({"role": "🐺 Loup-Garou", "done": done})
                if not done:
                    all_done = False
            elif p.role == models.RoleEnum.SEER:
                done = p.id in action_actor_ids
                status_list.append({"role": "👁️ Voyante", "done": done})
                if not done:
                    all_done = False
            elif p.role == models.RoleEnum.GUARD:
                done = p.id in action_actor_ids
                status_list.append({"role": "🛡️ Garde", "done": done})
                if not done:
                    all_done = False
            elif p.role == models.RoleEnum.WITCH:
                done = p.id in action_actor_ids
                status_list.append({"role": "🧪 Sorcière", "done": done})
                if not done:
                    all_done = False

        # Update narrator status
        await manager.send_personal_message({
            "type": "narrator_status_update",
            "data": {
                "actions": status_list,
                "players": [{"id": p.id, "name": p.name, "is_alive": p.is_alive} for p in alive_players]
            }
        }, room_code, "narrator")

        # If all actions received, resolve the night automatically
        if all_done and len(status_list) > 0:
            await self.resolve_night(room_code, round_number)

    async def resolve_night(self, room_code: str, round_number: int):
        """Resolve all night actions and send results to narrator."""
        room = self.db.query(models.Room).filter(models.Room.code == room_code).first()
        if not room:
            return

        actions = self.db.query(models.GameAction).filter(
            models.GameAction.room_id == room.id,
            models.GameAction.round_number == round_number
        ).all()

        # 1. Determine wolf target (majority vote)
        kills = [a for a in actions if a.action_type == models.ActionType.KILL]
        protects = [a for a in actions if a.action_type == models.ActionType.PROTECT]
        saves = [a for a in actions if a.action_type == models.ActionType.SAVE]
        poisons = [a for a in actions if a.action_type == models.ActionType.POISON]

        wolf_target_id = None
        wolf_target_name = None
        if kills:
            target_counts = {}
            for k in kills:
                target_counts[k.target_id] = target_counts.get(k.target_id, 0) + 1
            wolf_target_id = max(target_counts, key=target_counts.get)
            victim = self.db.query(models.Player).filter(models.Player.id == wolf_target_id).first()
            wolf_target_name = victim.name if victim else None

        # 2. Check protection
        protected_ids = set(p.target_id for p in protects)
        guard_target_name = None
        if protects:
            guard_target = self.db.query(models.Player).filter(models.Player.id == protects[0].target_id).first()
            guard_target_name = guard_target.name if guard_target else None

        # 3. Check witch save
        saved_ids = set(s.target_id for s in saves)
        witch_saved = len(saves) > 0

        # 4. Determine deaths
        dead_players = []

        # Wolf kill (if not protected and not saved)
        if wolf_target_id and wolf_target_id not in protected_ids and wolf_target_id not in saved_ids:
            target = self.db.query(models.Player).filter(models.Player.id == wolf_target_id).first()
            if target:
                target.is_alive = False
                dead_players.append(target.name)

        # Poison kill
        witch_poisoned_name = None
        for poison in poisons:
            target = self.db.query(models.Player).filter(models.Player.id == poison.target_id).first()
            if target:
                target.is_alive = False
                dead_players.append(target.name)
                witch_poisoned_name = target.name

        self.db.commit()

        # Send detailed results to narrator
        await manager.send_personal_message({
            "type": "night_results",
            "data": {
                "round": round_number,
                "wolf_target": wolf_target_name,
                "guard_target": guard_target_name,
                "witch_saved": witch_saved,
                "witch_poisoned": witch_poisoned_name,
                "dead": dead_players
            }
        }, room_code, "narrator")

    async def change_phase(self, room_code: str, phase: str, round_number: int = 1):
        """Handle phase changes from narrator."""
        if phase == "night":
            await self.start_night(room_code, round_number)
        else:
            # Day phase - just broadcast
            await manager.broadcast_to_room({
                "type": "phase_changed",
                "data": {"phase": "day", "round": round_number}
            }, room_code)
