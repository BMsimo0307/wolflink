// ─────────────────────────────────────────────────────────────
//  CONFIGURATION
//  En développement : le backend tourne sur localhost:8000
//  En production    : remplacez BACKEND_URL par votre URL Render
//  Exemple : const BACKEND_URL = 'https://wolflink-backend.onrender.com';
// ─────────────────────────────────────────────────────────────
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://${window.location.hostname}:8000`
    : 'https://wolflink.onrender.com'; // ← Remplacer après déploiement Render

const API_BASE = `${BACKEND_URL}/api`;

const API = {
    async createRoom(roles) {
        try {
            const response = await fetch(`${API_BASE}/rooms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: { roles } })
            });
            if (!response.ok) throw new Error('Failed to create room');
            return await response.json();
        } catch (error) {
            console.error(error);
            alert('Erreur de connexion au serveur.');
            return null;
        }
    },

    async joinRoom(code, playerName) {
        try {
            const response = await fetch(`${API_BASE}/rooms/${code}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: playerName })
            });
            if (!response.ok) {
                const err = await response.json();
                alert(err.detail || 'Erreur lors de la jonction.');
                return null;
            }
            return await response.json();
        } catch (error) {
            console.error(error);
            alert('Erreur de connexion au serveur.');
            return null;
        }
    }
};
