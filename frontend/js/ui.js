const UI = {
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => {
            s.classList.remove('active');
            s.classList.add('hidden');
        });
        const target = document.getElementById(screenId);
        if (target) {
            target.classList.remove('hidden');
            target.classList.add('active');
        }
    },

    updateLobby(data) {
        const list = document.getElementById('players-list');
        list.innerHTML = '';
        document.getElementById('player-count').innerText = data.players.length;

        data.players.forEach(p => {
            const li = document.createElement('li');
            li.innerText = p.name;
            list.appendChild(li);
        });
    },

    ROLE_DATA: {
        'VILLAGER':  { emoji: '🏘️', name: 'Villageois',  camp: 'Village',  desc: 'Vous n\'avez aucun pouvoir particulier. Débusquez les loups pendant le jour !' },
        'WEREWOLF':  { emoji: '🐺', name: 'Loup-Garou',  camp: 'Loups',    desc: 'Chaque nuit, choisissez une victime à dévorer avec vos alliés.' },
        'SEER':      { emoji: '👁️', name: 'Voyante',     camp: 'Village',  desc: 'Chaque nuit, découvrez le camp d\'un joueur de votre choix.' },
        'WITCH':     { emoji: '🧪', name: 'Sorcière',    camp: 'Village',  desc: 'Vous possédez 2 potions : une de vie (sauver) et une de mort (empoisonner). Chacune utilisable une seule fois.' },
        'GUARD':     { emoji: '🛡️', name: 'Garde',       camp: 'Village',  desc: 'Chaque nuit, protégez un joueur de l\'attaque des loups.' },
        'HUNTER':    { emoji: '🏹', name: 'Chasseur',    camp: 'Village',  desc: 'Si vous mourez, vous emportez un joueur de votre choix dans la tombe.' }
    },

    showRole(roleName) {
        const data = this.ROLE_DATA[roleName] || { emoji: '❓', name: roleName, camp: '?', desc: '' };

        document.getElementById('player-role-emoji').innerText = data.emoji;
        document.getElementById('player-role-name').innerText = data.name;
        document.getElementById('player-role-camp').innerText = `Camp : ${data.camp}`;
        document.getElementById('player-role-desc').innerText = data.desc;

        this.showScreen('screen-role');
    },

    showWaiting(title, text) {
        document.getElementById('waiting-title').innerText = title || 'En attente...';
        document.getElementById('waiting-text').innerText = text || 'Le narrateur prépare la prochaine phase.';
        this.showScreen('screen-waiting');
    },

    // Build target buttons for night actions
    buildTargetButtons(container, players, onSelect) {
        container.innerHTML = '';
        let selectedId = null;

        players.forEach(p => {
            const btn = document.createElement('button');
            btn.className = 'target-btn';
            btn.innerText = p.name;
            btn.dataset.playerId = p.id;
            btn.addEventListener('click', () => {
                container.querySelectorAll('.target-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedId = p.id;
                onSelect(p.id, p.name);
            });
            container.appendChild(btn);
        });

        return () => selectedId;
    },

    // Show night action screen for a specific role
    showNightAction(role, alivePlayers, playerRole, callbacks) {
        const titleEl = document.getElementById('night-action-title');
        const descEl = document.getElementById('night-action-desc');
        const targetsContainer = document.getElementById('night-action-targets');
        const confirmBtn = document.getElementById('btn-confirm-action');
        const witchPanel = document.getElementById('witch-panel');

        // Reset state
        targetsContainer.innerHTML = '';
        confirmBtn.classList.add('hidden');
        witchPanel.classList.add('hidden');

        if (role === 'WEREWOLF') {
            titleEl.innerText = '🐺 Nuit — Loup-Garou';
            descEl.innerText = 'Choisissez votre victime :';

            // Filter out werewolves from targets
            const targets = alivePlayers.filter(p => p.id !== callbacks.myId);
            this.buildTargetButtons(targetsContainer, targets, (id) => {
                confirmBtn.classList.remove('hidden');
            });

            confirmBtn.onclick = () => {
                const selected = targetsContainer.querySelector('.selected');
                if (selected) {
                    callbacks.onAction('KILL', selected.dataset.playerId);
                    confirmBtn.classList.add('hidden');
                }
            };
        }
        else if (role === 'SEER') {
            titleEl.innerText = '👁️ Nuit — Voyante';
            descEl.innerText = 'Choisissez un joueur à espionner :';

            const targets = alivePlayers.filter(p => p.id !== callbacks.myId);
            this.buildTargetButtons(targetsContainer, targets, (id) => {
                confirmBtn.classList.remove('hidden');
            });

            confirmBtn.onclick = () => {
                const selected = targetsContainer.querySelector('.selected');
                if (selected) {
                    callbacks.onAction('SEE', selected.dataset.playerId);
                    confirmBtn.classList.add('hidden');
                }
            };
        }
        else if (role === 'GUARD') {
            titleEl.innerText = '🛡️ Nuit — Garde';
            descEl.innerText = 'Choisissez un joueur à protéger :';

            const targets = alivePlayers.filter(p => p.id !== callbacks.myId);
            this.buildTargetButtons(targetsContainer, targets, (id) => {
                confirmBtn.classList.remove('hidden');
            });

            confirmBtn.onclick = () => {
                const selected = targetsContainer.querySelector('.selected');
                if (selected) {
                    callbacks.onAction('PROTECT', selected.dataset.playerId);
                    confirmBtn.classList.add('hidden');
                }
            };
        }
        else if (role === 'WITCH') {
            titleEl.innerText = '🧪 Nuit — Sorcière';
            descEl.innerText = '';
            witchPanel.classList.remove('hidden');
            // Witch logic is handled separately via websocket events
        }
        else {
            // Villager / Hunter (no night action)
            this.showWaiting('🌙 C\'est la nuit', 'Vous n\'avez aucune action à effectuer. Attendez le jour...');
            return;
        }

        this.showScreen('screen-night-action');
    },

    // Update narrator action status
    updateNarratorStatus(statusData) {
        const container = document.getElementById('actions-status');
        container.innerHTML = '';

        statusData.forEach(item => {
            const div = document.createElement('div');
            div.className = 'action-status-item';
            const statusClass = item.done ? 'status-done' : 'status-pending';
            const statusText = item.done ? '✅ Terminé' : '⏳ En attente';
            div.innerHTML = `<span>${item.role}</span><span class="${statusClass}">${statusText}</span>`;
            container.appendChild(div);
        });
    },

    // Add real-time log for narrator
    addNarratorLog(data) {
        const container = document.getElementById('narrator-live-logs');
        const list = document.getElementById('live-logs-list');
        
        container.classList.remove('hidden');

        const li = document.createElement('li');
        li.className = 'live-log-item';
        
        let actionDesc = '';
        if (data.action_type === 'WITCH_PASS') {
            actionDesc = 'a décidé de passer.';
        } else if (data.action_type === 'SEE') {
            actionDesc = `a regardé le rôle de <strong>${data.target_name || 'quelqu\'un'}</strong>.`;
        } else if (data.action_type === 'KILL') {
            actionDesc = `veut dévorer <strong>${data.target_name}</strong>.`;
        } else if (data.action_type === 'PROTECT') {
            actionDesc = `protège <strong>${data.target_name}</strong>.`;
        } else if (data.action_type === 'SAVE') {
            actionDesc = `a utilisé la potion de vie sur <strong>${data.target_name}</strong>.`;
        } else if (data.action_type === 'POISON') {
            actionDesc = `a utilisé la potion de mort sur <strong>${data.target_name}</strong>.`;
        } else {
            actionDesc = `a fait l'action ${data.action_type}.`;
        }

        const roleEmoji = this.ROLE_DATA[data.role] ? this.ROLE_DATA[data.role].emoji : '❓';
        
        li.innerHTML = `
            <span class="log-time">${new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span>
            <span class="log-text">${roleEmoji} <strong>${data.player_name}</strong> ${actionDesc}</span>
        `;
        
        list.prepend(li); // add to top
    },

    // Show night results to narrator
    showNightResults(data) {
        const resultsBox = document.getElementById('narrator-results');
        const content = document.getElementById('results-content');
        resultsBox.classList.remove('hidden');

        let html = `<p class="hint">Tour ${data.round}</p>`;

        if (data.wolf_target) {
            html += `<div class="result-line">🐺 Cible des loups : <strong>${data.wolf_target}</strong></div>`;
        }
        if (data.guard_target) {
            html += `<div class="result-line result-saved">🛡️ Protégé : <strong>${data.guard_target}</strong></div>`;
        }
        if (data.witch_saved) {
            html += `<div class="result-line result-saved">💚 Potion de vie utilisée</div>`;
        }
        if (data.witch_poisoned) {
            html += `<div class="result-line result-death">☠️ Empoisonné : <strong>${data.witch_poisoned}</strong></div>`;
        }

        html += `<hr class="divider"><p><strong>Résultat final :</strong></p>`;

        if (data.dead && data.dead.length > 0) {
            data.dead.forEach(name => {
                html += `<div class="result-line result-death">💀 ${name} est mort(e).</div>`;
            });
        } else {
            html += `<div class="result-line result-saved">🎉 Personne n'est mort cette nuit !</div>`;
        }

        content.innerHTML = html;
    },

    // Update narrator player list
    updateNarratorPlayers(players) {
        const list = document.getElementById('narrator-players-list');
        list.innerHTML = '';
        players.forEach(p => {
            const li = document.createElement('li');
            li.innerText = `${p.name}`;
            if (!p.is_alive) li.classList.add('dead');
            list.appendChild(li);
        });
    },

    // Show a live countdown timer to players during debate
    showDebateTimer(totalSeconds) {
        const waitingTitle = document.getElementById('waiting-title');
        const waitingText  = document.getElementById('waiting-text');
        this.showScreen('screen-waiting');
        waitingTitle.innerText = '💬 Débat en cours';
        waitingText.innerText  = `${totalSeconds} secondes pour débattre et voter !`;

        let remaining = totalSeconds;
        const interval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(interval);
                waitingText.innerText = 'Le débat est terminé !';
            } else {
                waitingText.innerText = `${remaining} secondes restantes...`;
            }
        }, 1000);
    },

    // Show game over screen
    showGameOver(data) {
        const msg = document.getElementById('gameover-message');
        const isWolvesWin = data.winner === 'wolves';
        msg.innerHTML = `
            <div class="role-emoji">${isWolvesWin ? '🐺' : '🏨'}</div>
            <h2>${isWolvesWin ? 'Les Loups ont gagné !' : 'Le Village a gagné !'}</h2>
            <p>${data.message || ''}</p>
        `;
        this.showScreen('screen-gameover');
    }
};
