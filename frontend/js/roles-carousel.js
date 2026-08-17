// ─────────────────────────────────────────────────────────────
//  INTERACTIVE ROLES CAROUSEL SHOWCASE
// ─────────────────────────────────────────────────────────────

const ROLES_DATA = [
    {
        id: 'werewolf',
        name: 'Loup-Garou',
        camp: 'Camp des Loups-Garous',
        campClass: 'camp-wolves',
        emoji: '🐺',
        desc: 'Durant la nuit, les Loups-Garous se réunissent pour voter l\'élimination d\'un joueur. Pendant la journée, ils doivent éviter d\'être démasqués.'
    },
    {
        id: 'seer',
        name: 'Voyante',
        camp: 'Camp du Village',
        campClass: 'camp-village',
        emoji: '👁️',
        desc: 'Chaque nuit, la Voyante peut découvrir le rôle secret d\'un joueur de son choix. Elle doit utiliser ses informations sans se faire repérer.'
    },
    {
        id: 'witch',
        name: 'Sorcière',
        camp: 'Camp du Village',
        campClass: 'camp-village',
        emoji: '🧪',
        desc: 'Dispose de deux potions à usage unique : une potion de guérison pour sauver la victime des loups, et une potion de mort pour éliminer un joueur.'
    },
    {
        id: 'guard',
        name: 'Garde',
        camp: 'Camp du Village',
        campClass: 'camp-village',
        emoji: '🛡️',
        desc: 'Chaque nuit, le Garde protège un joueur de son choix contre l\'attaque des Loups-Garous. Il ne peut pas protéger le même joueur deux nuits consécutives.'
    },
    {
        id: 'hunter',
        name: 'Chasseur',
        camp: 'Camp du Village',
        campClass: 'camp-village',
        emoji: '🏹',
        desc: 'Si le Chasseur est éliminé (par les loups ou par le vote du village), il a le pouvoir de répliquer immédiatement en tirant sur un joueur de son choix.'
    },
    {
        id: 'cupid',
        name: 'Cupidon',
        camp: 'Camp du Village',
        campClass: 'camp-village',
        emoji: '💘',
        desc: 'Au début de la partie, Cupidon désigne deux joueurs qui deviennent Amoureux. Si l\'un meurt, l\'autre meurt immédiatement de chagrin.'
    },
    {
        id: 'littlegirl',
        name: 'Petite Fille',
        camp: 'Camp du Village',
        campClass: 'camp-village',
        emoji: '👧',
        desc: 'Peut entre-ouvrir les yeux pendant la nuit pour tenter de reconnaître les Loups-Garous. Mais si les loups la surprennent, elle meurt instantanément.'
    },
    {
        id: 'mayor',
        name: 'Maire / Capitaine',
        camp: 'Camp du Village',
        campClass: 'camp-village',
        emoji: '🎖️',
        desc: 'Élu par le village. Sa voix compte double lors des votes de jour. S\'il meurt, il désigne immédiatement son successeur.'
    },
    {
        id: 'villager',
        name: 'Simple Villageois',
        camp: 'Camp du Village',
        campClass: 'camp-village',
        emoji: '🧑‍🌾',
        desc: 'N\'a aucun pouvoir particulier la nuit. Son arme principale est son analyse, sa persuasion et son vote lors des débats de jour.'
    }
];

let currentRoleIndex = 0;

function renderCarousel() {
    const heroEmoji = document.getElementById('showcase-role-emoji');
    const roleName = document.getElementById('showcase-role-name');
    const roleCamp = document.getElementById('showcase-role-camp');
    const roleDesc = document.getElementById('showcase-role-desc');
    const track = document.getElementById('carousel-track');

    if (!track) return;

    const activeRole = ROLES_DATA[currentRoleIndex];

    // Update Hero display
    if (heroEmoji) heroEmoji.innerText = activeRole.emoji;
    if (roleName) roleName.innerText = activeRole.name;
    if (roleCamp) {
        roleCamp.innerText = activeRole.camp;
        roleCamp.className = `showcase-camp ${activeRole.campClass}`;
    }
    if (roleDesc) roleDesc.innerText = activeRole.desc;

    // Render Track items
    track.innerHTML = '';
    ROLES_DATA.forEach((role, idx) => {
        const card = document.createElement('div');
        card.className = `carousel-card ${idx === currentRoleIndex ? 'active' : ''} ${role.campClass}`;
        card.innerHTML = `
            <div class="card-icon">${role.emoji}</div>
            <span class="card-title">${role.name}</span>
        `;
        card.addEventListener('click', () => {
            currentRoleIndex = idx;
            renderCarousel();
        });
        track.appendChild(card);
    });

    // Scroll active card into view smoothly
    const activeCard = track.children[currentRoleIndex];
    if (activeCard) {
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

function nextRole() {
    currentRoleIndex = (currentRoleIndex + 1) % ROLES_DATA.length;
    renderCarousel();
}

function prevRole() {
    currentRoleIndex = (currentRoleIndex - 1 + ROLES_DATA.length) % ROLES_DATA.length;
    renderCarousel();
}

document.addEventListener('DOMContentLoaded', () => {
    renderCarousel();

    const prevBtn = document.getElementById('btn-carousel-prev');
    const nextBtn = document.getElementById('btn-carousel-next');

    if (prevBtn) prevBtn.addEventListener('click', prevRole);
    if (nextBtn) nextBtn.addEventListener('click', nextRole);
});
