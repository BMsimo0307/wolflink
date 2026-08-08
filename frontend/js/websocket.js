// WS_BASE est dérivé de BACKEND_URL défini dans api.js
// En dev : ws://localhost:8000  |  En prod : wss://VOTRE_APP.onrender.com
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws';
const WS_BASE = `${WS_PROTOCOL}://${BACKEND_URL.replace(/^https?:\/\//, '')}/ws/rooms`;
let socket = null;

const GameSocket = {
    connect(roomCode, clientId, isNarrator = false) {
        if (socket) socket.close();

        socket = new WebSocket(`${WS_BASE}/${roomCode}/${clientId}`);

        socket.onopen = () => {
            console.log('WS Connected to room', roomCode);
            if (isNarrator) {
                UI.showScreen('screen-lobby');
                document.getElementById('btn-start-game').classList.remove('hidden');
                document.getElementById('lobby-status').innerText = 'Vous êtes le narrateur. Partagez le code ci-dessus !';
            } else {
                UI.showScreen('screen-lobby');
            }
        };

        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            console.log('WS:', msg);

            switch (msg.type) {
                case 'lobby_update':
                    UI.updateLobby(msg.data);
                    break;

                case 'game_started':
                    // Player receives their role
                    GameState.myRole = msg.data.role;
                    UI.showRole(msg.data.role);
                    break;

                case 'phase_changed':
                    this.handlePhaseChanged(msg.data);
                    break;

                case 'night_action_request':
                    // Server asks this player to perform their night action
                    this.handleNightActionRequest(msg.data);
                    break;

                case 'seer_result':
                    // Seer receives the result of their investigation
                    alert(`👁️ Ce joueur est dans le camp : ${msg.data.camp === 'wolf' ? '🐺 Loups' : '🏘️ Village'}`);
                    UI.showWaiting('🌙 C\'est la nuit', 'Votre vision est terminée. Attendez le jour...');
                    break;

                case 'witch_info':
                    // Witch receives the wolf victim info
                    this.handleWitchInfo(msg.data);
                    break;

                case 'action_confirmed':
                    UI.showWaiting('🌙 C\'est la nuit', 'Votre action a été enregistrée. Attendez...');
                    break;

                case 'night_results':
                    // Narrator receives the full night results
                    UI.showNightResults(msg.data);
                    // Update phase indicator to show day
                    document.getElementById('current-phase-icon').innerText = '☀️';
                    document.getElementById('current-phase-text').innerText = 'Résultats';
                    break;

                case 'narrator_status_update':
                    if (msg.data.players) {
                        GameState.alivePlayers = msg.data.players.filter(p => p.is_alive);
                        UI.updateNarratorStatus(msg.data.actions);
                        UI.updateNarratorPlayers(msg.data.players);
                    } else {
                        UI.updateNarratorStatus(msg.data.actions);
                    }
                    break;

                case 'narrator_action_notification':
                    if (GameState.isNarrator) {
                        UI.addNarratorLog(msg.data);
                    }
                    break;

                case 'player_eliminated':
                    // All players are notified of a day elimination
                    if (!GameState.isNarrator) {
                        UI.showWaiting(
                            `💀 ${msg.data.name} a été éliminé(e)`,
                            'Le narrateur va continuer la partie.'
                        );
                    }
                    break;

                case 'vote_skipped':
                    if (!GameState.isNarrator) {
                        UI.showWaiting('🗳️ Pas d’élimination', 'Le village a décidé de ne pas voter.');
                    }
                    break;

                case 'debate_started':
                    if (!GameState.isNarrator) {
                        UI.showDebateTimer(msg.data.seconds);
                    }
                    break;

                case 'game_over':
                    UI.showGameOver(msg.data);
                    break;
            }
        };

        socket.onerror = (error) => {
            console.error('WS Error:', error);
        };

        socket.onclose = () => {
            console.log('WS Disconnected');
        };
    },

    handlePhaseChanged(data) {
        if (GameState.isNarrator) {
            // Narrator sees the dashboard update
            const isNight = data.phase === 'night';
            document.getElementById('current-phase-icon').innerText = isNight ? '🌙' : '☀️';
            document.getElementById('current-phase-text').innerText = isNight ? 'Nuit' : 'Jour';
            document.getElementById('current-round').innerText = data.round || GameState.currentRound;

            document.getElementById('btn-start-night').classList.toggle('hidden', isNight);
            document.getElementById('btn-start-day').classList.toggle('hidden', !isNight);

            if (!isNight) {
                // Dismiss results on day
                document.getElementById('narrator-results').classList.add('hidden');
            }
        } else {
            // Player sees a phase change
            if (data.phase === 'night') {
                // If this player has no night action, just show waiting
                const hasAction = ['WEREWOLF', 'SEER', 'WITCH', 'GUARD'].includes(GameState.myRole);
                if (!hasAction) {
                    UI.showWaiting('🌙 Le village s\'endort...', 'Vous n\'avez aucune action de nuit. Attendez le jour.');
                }
                // If they have an action, the server will send night_action_request
            } else {
                // Day phase
                UI.showWaiting('☀️ Le village se réveille', 'Le narrateur va annoncer les événements de la nuit.');
            }
        }
    },

    handleNightActionRequest(data) {
        const alivePlayers = data.alive_players || [];

        UI.showNightAction(GameState.myRole, alivePlayers, GameState.myRole, {
            myId: GameState.myId,
            onAction: (actionType, targetId) => {
                this.sendPlayerAction(actionType, targetId);
            }
        });
    },

    handleWitchInfo(data) {
        // Show witch panel
        const victimName = data.victim_name || 'Personne';
        document.getElementById('witch-victim-name').innerText = victimName;
        document.getElementById('witch-panel').classList.remove('hidden');

        const canSave = data.can_save;
        const canPoison = data.can_poison;

        const saveBtn = document.getElementById('btn-witch-save');
        const nothingBtn = document.getElementById('btn-witch-nothing');
        const poisonTargets = document.getElementById('witch-poison-targets');
        const noPoisonBtn = document.getElementById('btn-witch-no-poison');

        if (!canSave) {
            saveBtn.classList.add('hidden');
        } else {
            saveBtn.classList.remove('hidden');
        }

        saveBtn.onclick = () => {
            this.sendPlayerAction('SAVE', data.victim_id);
        };

        nothingBtn.onclick = () => {
            // Don't save, check for poison
            if (canPoison) {
                saveBtn.classList.add('hidden');
                nothingBtn.classList.add('hidden');
            } else {
                this.sendPlayerAction('WITCH_PASS', null);
            }
        };

        if (canPoison && data.alive_players) {
            UI.buildTargetButtons(poisonTargets, data.alive_players, () => {});
            noPoisonBtn.onclick = () => {
                this.sendPlayerAction('WITCH_PASS', null);
            };
            // Add confirm for poison
            poisonTargets.addEventListener('click', (e) => {
                const btn = e.target.closest('.target-btn');
                if (btn) {
                    // Show confirmation
                    setTimeout(() => {
                        if (confirm(`Empoisonner ${btn.innerText} ?`)) {
                            this.sendPlayerAction('POISON', btn.dataset.playerId);
                        }
                    }, 100);
                }
            });
        } else {
            poisonTargets.innerHTML = '';
            noPoisonBtn.classList.add('hidden');
        }

        UI.showScreen('screen-night-action');
        document.getElementById('night-action-title').innerText = '🧪 Nuit — Sorcière';
        document.getElementById('night-action-desc').innerText = '';
        document.getElementById('night-action-targets').innerHTML = '';
        document.getElementById('btn-confirm-action').classList.add('hidden');
    },

    // --- Sending messages ---
    sendStartGame() {
        this._send({ type: 'start_game' });
    },

    sendPhaseChange(phase, round) {
        this._send({ type: 'next_phase', data: { phase, round } });
    },

    sendPlayerAction(actionType, targetId) {
        this._send({ type: 'player_action', data: { action_type: actionType, target_id: targetId } });
    },

    sendEliminatePlayer(playerId, playerName) {
        this._send({ type: 'eliminate_player', data: { player_id: playerId, player_name: playerName } });
    },

    sendSkipVote() {
        this._send({ type: 'skip_vote' });
    },

    sendEndGame() {
        this._send({ type: 'end_game' });
    },

    sendDebateStart(seconds) {
        this._send({ type: 'debate_started', data: { seconds } });
    },

    _send(obj) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(obj));
        }
    }
};
