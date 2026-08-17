// ─────────────────────────────────────────────────────────────
//  AUTHENTICATION & USER PROFILE MANAGEMENT
// ─────────────────────────────────────────────────────────────

const Auth = {
    user: null,
    token: null,

    init() {
        const storedUser = localStorage.getItem('wolflink_user');
        const storedToken = localStorage.getItem('wolflink_token');

        if (storedUser && storedToken) {
            try {
                this.user = JSON.parse(storedUser);
                this.token = storedToken;
                this.updateUI();
            } catch (e) {
                this.logout();
            }
        }
    },

    getUser() {
        return this.user;
    },

    getToken() {
        return this.token;
    },

    async loginGuest(name) {
        try {
            const response = await fetch(`${API_BASE}/auth/guest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            if (!response.ok) throw new Error('Guest login failed');
            const data = await response.json();
            this.setSession(data.user, data.access_token);
            return data.user;
        } catch (err) {
            console.error(err);
            alert('Erreur lors de la connexion invité.');
            return null;
        }
    },

    async handleGoogleCallback(credentialResponse) {
        try {
            const response = await fetch(`${API_BASE}/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: credentialResponse.credential })
            });
            if (!response.ok) throw new Error('Google auth failed');
            const data = await response.json();
            this.setSession(data.user, data.access_token);
        } catch (err) {
            console.error(err);
            alert('Erreur de connexion Google.');
        }
    },

    setSession(user, token) {
        this.user = user;
        this.token = token;
        localStorage.setItem('wolflink_user', JSON.stringify(user));
        localStorage.setItem('wolflink_token', token);
        this.updateUI();
    },

    logout() {
        this.user = null;
        this.token = null;
        localStorage.removeItem('wolflink_user');
        localStorage.removeItem('wolflink_token');
        this.updateUI();
    },

    updateUI() {
        const profileBar = document.getElementById('user-profile-bar');
        const authSection = document.getElementById('auth-section');
        const userNameEl = document.getElementById('user-profile-name');
        const userAvatarEl = document.getElementById('user-profile-avatar');
        const playerInput = document.getElementById('input-player-name');

        if (this.user) {
            if (profileBar) profileBar.classList.remove('hidden');
            if (authSection) authSection.classList.add('hidden');
            if (userNameEl) userNameEl.innerText = this.user.name;
            if (userAvatarEl) {
                if (this.user.avatar_url) {
                    userAvatarEl.src = this.user.avatar_url;
                    userAvatarEl.style.display = 'block';
                } else {
                    userAvatarEl.style.display = 'none';
                }
            }
            // Auto-fill join input
            if (playerInput && !playerInput.value) {
                playerInput.value = this.user.name;
            }
        } else {
            if (profileBar) profileBar.classList.add('hidden');
            if (authSection) authSection.classList.remove('hidden');
        }
    }
};

// Global Google callback for GSI SDK
window.handleGoogleCallback = (response) => {
    Auth.handleGoogleCallback(response);
};

document.addEventListener('DOMContentLoaded', () => {
    Auth.init();

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => Auth.logout());
    }

    const guestBtn = document.getElementById('btn-guest-login');
    if (guestBtn) {
        guestBtn.addEventListener('click', () => {
            const guestInput = document.getElementById('input-guest-name');
            const name = guestInput ? guestInput.value.trim() : '';
            if (!name) {
                alert('Veuillez entrer un pseudo pour le mode Invité.');
                return;
            }
            Auth.loginGuest(name);
        });
    }
});
