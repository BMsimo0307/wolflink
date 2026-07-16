// Global game state
const GameState = {
    currentRoom: null,
    isNarrator: false,
    myId: null,
    myRole: null,
    currentRound: 1,
    currentPhase: 'day',
    alivePlayers: [],   // kept up-to-date by narrator_status_update
    debateInterval: null,
    debateSecondsLeft: 40,
    selectedVoteTarget: null
};

// ─────────────────────────────────────────────
//  DEBATE TIMER
// ─────────────────────────────────────────────
const DEBATE_SECONDS = 40;
const CIRCUMFERENCE = 283; // 2π × 45

function startDebate() {
    const panel     = document.getElementById('debate-panel');
    const circle    = document.getElementById('timer-circle');
    const textEl    = document.getElementById('timer-text');
    const startBtn  = document.getElementById('btn-start-debate');

    // Reset visuals
    GameState.debateSecondsLeft = DEBATE_SECONDS;
    circle.classList.remove('urgent');
    circle.style.strokeDashoffset = 0;
    textEl.innerText = DEBATE_SECONDS;

    panel.classList.remove('hidden');
    startBtn.classList.add('hidden');

    // Broadcast to players that debate started
    GameSocket.sendDebateStart(DEBATE_SECONDS);

    clearInterval(GameState.debateInterval);
    GameState.debateInterval = setInterval(() => {
        GameState.debateSecondsLeft--;

        const progress = GameState.debateSecondsLeft / DEBATE_SECONDS;
        circle.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
        textEl.innerText = GameState.debateSecondsLeft;

        if (GameState.debateSecondsLeft <= 10) {
            circle.classList.add('urgent');
        }

        if (GameState.debateSecondsLeft <= 0) {
            stopDebate(true);
        }
    }, 1000);
}

function stopDebate(autoEnded = false) {
    clearInterval(GameState.debateInterval);
    GameState.debateInterval = null;

    document.getElementById('debate-panel').classList.add('hidden');
    document.getElementById('btn-start-debate').classList.remove('hidden');

    if (autoEnded) {
        // Automatically open the vote panel after debate ends
        openVotePanel();
    }
}

// ─────────────────────────────────────────────
//  VOTE PANEL
// ─────────────────────────────────────────────
function openVotePanel() {
    const panel = document.getElementById('vote-panel');
    const container = document.getElementById('vote-targets');
    const confirmBtn = document.getElementById('btn-confirm-vote');

    GameState.selectedVoteTarget = null;
    confirmBtn.disabled = true;
    container.innerHTML = '';
    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth' });

    // Show alive players as targets
    GameState.alivePlayers.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'target-btn';
        btn.innerText = p.name;
        btn.dataset.playerId = p.id;
        btn.addEventListener('click', () => {
            container.querySelectorAll('.target-btn').forEach(b => b.classList.remove('vote-selected'));
            btn.classList.add('vote-selected');
            GameState.selectedVoteTarget = { id: p.id, name: p.name };
            confirmBtn.disabled = false;
        });
        container.appendChild(btn);
    });
}

function closeVotePanel() {
    document.getElementById('vote-panel').classList.add('hidden');
    GameState.selectedVoteTarget = null;
}

// ─────────────────────────────────────────────
//  DOM READY
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

    // --- Navigation ---
    document.getElementById('btn-show-create').addEventListener('click', () => UI.showScreen('screen-create'));
    document.getElementById('btn-show-join').addEventListener('click', () => UI.showScreen('screen-join'));

    document.querySelectorAll('.btn-back').forEach(btn => {
        btn.addEventListener('click', () => UI.showScreen('screen-home'));
    });

    // --- Create Room ---
    document.getElementById('btn-create-room').addEventListener('click', async () => {
        const checkboxes = document.querySelectorAll('.roles-selection input:checked');
        const roles = Array.from(checkboxes).map(cb => cb.value);

        if (roles.length === 0) {
            alert('Sélectionnez au moins un rôle.');
            return;
        }

        const room = await API.createRoom(roles);
        if (room) {
            GameState.currentRoom = room.code;
            GameState.isNarrator = true;
            GameState.myId = 'narrator';
            document.getElementById('lobby-room-code').innerText = room.code;
            GameSocket.connect(room.code, 'narrator', true);
        }
    });

    // --- Join Room ---
    document.getElementById('btn-join-room').addEventListener('click', async () => {
        const code = document.getElementById('input-room-code').value.trim().toUpperCase();
        const name = document.getElementById('input-player-name').value.trim();

        if (code.length !== 6) { alert('Le code doit contenir 6 caractères.'); return; }
        if (!name)              { alert('Veuillez entrer votre prénom ou pseudo.'); return; }

        const player = await API.joinRoom(code, name);
        if (player) {
            GameState.currentRoom = code;
            GameState.myId = player.id;
            document.getElementById('lobby-room-code').innerText = code;
            GameSocket.connect(code, player.id, false);
        }
    });

    // --- Narrator: Start Game ---
    document.getElementById('btn-start-game').addEventListener('click', () => {
        GameSocket.sendStartGame();
        UI.showScreen('screen-narrator');
    });

    // --- Narrator: Start Night ---
    document.getElementById('btn-start-night').addEventListener('click', () => {
        GameState.currentPhase = 'night';
        // Hide day-only controls
        document.getElementById('btn-start-debate').classList.add('hidden');
        document.getElementById('debate-panel').classList.add('hidden');
        closeVotePanel();
        GameSocket.sendPhaseChange('night', GameState.currentRound);
    });

    // --- Narrator: Start Day ---
    document.getElementById('btn-start-day').addEventListener('click', () => {
        GameState.currentPhase = 'day';
        GameState.currentRound++;
        GameSocket.sendPhaseChange('day', GameState.currentRound);

        document.getElementById('current-phase-icon').innerText = '☀️';
        document.getElementById('current-phase-text').innerText = 'Jour';
        document.getElementById('current-round').innerText = GameState.currentRound;

        document.getElementById('btn-start-night').classList.remove('hidden');
        document.getElementById('btn-start-day').classList.add('hidden');
        document.getElementById('btn-start-debate').classList.remove('hidden');
    });

    // --- Narrator: Debate Timer ---
    document.getElementById('btn-start-debate').addEventListener('click', startDebate);
    document.getElementById('btn-stop-debate').addEventListener('click', () => {
        stopDebate(false);
        openVotePanel();   // open vote manually when stopped early
    });

    // --- Narrator: Vote Confirm ---
    document.getElementById('btn-confirm-vote').addEventListener('click', () => {
        if (!GameState.selectedVoteTarget) return;
        const { id, name } = GameState.selectedVoteTarget;
        if (confirm(`Éliminer ${name} ?`)) {
            GameSocket.sendEliminatePlayer(id, name);
            closeVotePanel();
        }
    });

    // --- Narrator: Skip Vote ---
    document.getElementById('btn-skip-vote').addEventListener('click', () => {
        closeVotePanel();
        GameSocket.sendSkipVote();
    });

    // --- Narrator: End Game ---
    document.getElementById('btn-end-game').addEventListener('click', () => {
        if (confirm('Terminer la partie maintenant ?')) {
            GameSocket.sendEndGame();
        }
    });

    // --- Narrator: Dismiss night results ---
    document.getElementById('btn-dismiss-results').addEventListener('click', () => {
        document.getElementById('narrator-results').classList.add('hidden');
    });

    // --- Player: Role seen ---
    document.getElementById('btn-role-seen').addEventListener('click', () => {
        UI.showWaiting('En attente...', 'Vous avez vu votre rôle. Attendez les instructions du narrateur.');
    });

    // --- Game Over: New game ---
    document.getElementById('btn-new-game').addEventListener('click', () => {
        window.location.reload();
    });
});
