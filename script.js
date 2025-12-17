// --- CONFIGURATION ---
const API_URL = 'https://ctf-guardia.vemad.fr/api/v1/scoreboard';
const CHALLENGES_API_URL = 'https://ctf-guardia.vemad.fr/api/v1/challenges';
const USERS_API_URL = 'https://ctf-guardia.vemad.fr/api/v1/users';
const START_DATE = new Date("2025-12-18T08:00:00").getTime();
const END_DATE = new Date("2025-12-18T12:00:00").getTime(); 
const POLL_INTERVAL = 10000; 

// --- ÉTAT ---
let previousScores = {}; 
let previousPositions = {}; // Pour suivre les positions précédentes
let userArrows = {}; // Pour mémoriser les flèches de chaque utilisateur
let notificationQueue = []; 
let isNotifying = false;
let wakeLock = null;
let lastFlagUser = null;
let lastFlagTime = null;

// --- PERSISTANCE ---
function loadPersistedState() {
    try {
        const savedArrows = localStorage.getItem('igctf_userArrows');
        const savedLastUser = localStorage.getItem('igctf_lastFlagUser');
        const savedLastTime = localStorage.getItem('igctf_lastFlagTime');
        const savedScores = localStorage.getItem('igctf_previousScores');
        const savedPositions = localStorage.getItem('igctf_previousPositions');
        
        if (savedArrows) {
            userArrows = JSON.parse(savedArrows);
            console.log('Flèches chargées:', Object.keys(userArrows).length);
        }
        if (savedLastUser && savedLastUser !== '') {
            lastFlagUser = savedLastUser;
        }
        if (savedLastTime && savedLastTime !== '0') {
            lastFlagTime = parseInt(savedLastTime);
        }
        if (savedScores) {
            previousScores = JSON.parse(savedScores);
            console.log('Scores chargés:', Object.keys(previousScores).length);
        }
        if (savedPositions) {
            previousPositions = JSON.parse(savedPositions);
            console.log('Positions chargées:', Object.keys(previousPositions).length);
        }
    } catch (e) {
        console.error('Erreur chargement état:', e);
    }
}

function savePersistedState() {
    try {
        localStorage.setItem('igctf_userArrows', JSON.stringify(userArrows));
        localStorage.setItem('igctf_lastFlagUser', lastFlagUser || '');
        localStorage.setItem('igctf_lastFlagTime', lastFlagTime ? lastFlagTime.toString() : '0');
        localStorage.setItem('igctf_previousScores', JSON.stringify(previousScores));
        localStorage.setItem('igctf_previousPositions', JSON.stringify(previousPositions));
    } catch (e) {
        console.error('Erreur sauvegarde état:', e);
    }
} 

// --- 1. NEIGE (DÉSACTIVÉE) ---
function createSnow() {
    // Neige désactivée
}

// --- 2. TIMER ---
function updateTimer() {
    const now = new Date().getTime();
    
    // Phase du CTF
    if (now < START_DATE) {
        // AVANT le début
        const distance = START_DATE - now;
        const d = Math.floor(distance / (1000 * 60 * 60 * 24));
        const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((distance % (1000 * 60)) / 1000);

        let timeString = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        if (d > 0) timeString = `${d}J ` + timeString;

        document.querySelector(".timer-label").textContent = "TEMPS AVANT DÉBUT";
        document.getElementById("countdown").innerHTML = timeString;
        document.getElementById("progress-fill").style.width = "0%";
        
    } else if (now >= START_DATE && now < END_DATE) {
        // PENDANT le CTF
        const distance = END_DATE - now;
        const h = Math.floor(distance / (1000 * 60 * 60));
        const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((distance % (1000 * 60)) / 1000);

        const timeString = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

        document.querySelector(".timer-label").textContent = "TEMPS RESTANT";
        document.getElementById("countdown").innerHTML = timeString;
        
        // Calculer la progression du CTF
        const totalDuration = END_DATE - START_DATE;
        const elapsed = now - START_DATE;
        const progress = Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100);
        document.getElementById("progress-fill").style.width = progress + "%";
        
    } else {
        // APRÈS le CTF
        document.querySelector(".timer-label").textContent = "STATUT";
        document.getElementById("countdown").innerHTML = "CTF TERMINÉ";
        document.getElementById("progress-fill").style.width = "100%";
    }
}

// --- 2b. SYSTEM STATUS ---
function updateSystemStatus() {
    const now = new Date().getTime();
    const statusElement = document.querySelector('.subtitle .blink');
    
    if (now < START_DATE) {
        // AVANT le CTF
        statusElement.textContent = 'PENDING';
        statusElement.className = 'blink pending';
    } else if (now >= START_DATE && now < END_DATE) {
        // PENDANT le CTF
        statusElement.textContent = 'ONLINE';
        statusElement.className = 'blink online';
    } else {
        // APRÈS le CTF
        statusElement.textContent = 'OFFLINE';
        statusElement.className = 'blink offline';
    }
}

// --- 3. WAKE LOCK ---
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {
                console.log('Wake Lock released');
            });
            console.log('Wake Lock activé');
        }
    } catch (err) {
        console.error('Wake Lock error:', err);
    }
}

// Réactiver le Wake Lock si la page redevient visible
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

// --- 4. DERNIER FLAG ---
function updateLastFlagDisplay() {
    const now = new Date().getTime();
    const lastFlagBox = document.querySelector('.last-flag-box');
    
    // N'afficher le dernier flag que pendant le CTF
    if (now >= START_DATE && now < END_DATE) {
        lastFlagBox.classList.remove('hidden');
        
        if (lastFlagUser && lastFlagTime) {
            const date = new Date(lastFlagTime);
            
            // Format: DD/MM/YY à HH:MM
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = String(date.getFullYear()).slice(-2);
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            
            const formattedDate = `${day}/${month}/${year} à ${hours}:${minutes}`;
            
            document.getElementById('last-flag-info').innerHTML = 
                `<strong>${lastFlagUser}</strong><br>${formattedDate}`;
        } else {
            document.getElementById('last-flag-info').textContent = 'En attente...';
        }
    } else {
        // Cacher le dernier flag avant et après le CTF
        lastFlagBox.classList.add('hidden');
    }
}

// --- 5. STATISTIQUES ---
async function fetchStatistics() {
    try {
        // Récupérer uniquement le nombre de participants depuis l'API users
        let totalParticipants = 0;
        
        const usersResponse = await fetch(USERS_API_URL);
        if (usersResponse.ok) {
            const usersData = await usersResponse.json();
            // Utiliser la pagination pour avoir le total
            totalParticipants = usersData.meta?.pagination?.total || usersData.data?.length || 0;
        }
        
        // Mettre à jour l'affichage (pas de challenges)
        document.getElementById('stat-flags').textContent = '-';
        document.getElementById('stat-challenges').textContent = '-';
        document.getElementById('stat-participants').textContent = totalParticipants || '-';
        
    } catch (e) {
        console.error("Échec récupération statistiques:", e);
        document.getElementById('stat-flags').textContent = '-';
        document.getElementById('stat-challenges').textContent = '-';
        document.getElementById('stat-participants').textContent = '-';
    }
}

// --- 5b. LISTE DES UTILISATEURS INSCRITS ---
async function fetchUsers() {
    try {
        console.log('Récupération de la liste des utilisateurs...');
        
        // Récupérer tous les utilisateurs avec pagination
        let allUsers = [];
        let page = 1;
        let hasMore = true;
        
        while (hasMore) {
            const response = await fetch(`${USERS_API_URL}?page=${page}`);
            
            if (!response.ok) {
                console.error("Erreur HTTP users:", response.status);
                break;
            }
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.error('API users ne renvoie pas du JSON');
                break;
            }
            
            const json = await response.json();
            const users = json.data || [];
            allUsers = allUsers.concat(users);
            
            // Vérifier s'il y a d'autres pages
            const pagination = json.meta?.pagination;
            if (pagination && pagination.next) {
                page = pagination.next;
            } else {
                hasMore = false;
            }
        }
        
        console.log(`${allUsers.length} utilisateurs récupérés au total`);
        
        // Trier par ID décroissant (les plus récents en premier)
        const sortedUsers = allUsers.sort((a, b) => b.id - a.id);
        
        renderUsersList(sortedUsers);
        
    } catch (e) {
        console.error("Erreur Fetch users:", e);
    }
}

// --- 6. DONNÉES ---
async function fetchScoreboard() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error("Erreur HTTP " + response.status);
        const json = await response.json();
        const users = json.data || [];
        
        // Détecter les notifications AVANT de changer l'état
        // Uniquement si on a déjà un état précédent
        if (Object.keys(previousScores).length > 0) {
            detectScoreChanges(users);
        }
        
        saveState(users); // Calculer les flèches et sauvegarder
        renderTable(users); // Afficher avec les bonnes flèches
        
    } catch (e) {
        console.error("Erreur Fetch:", e);
    }
}

function detectScoreChanges(currentUsers) {
    currentUsers.forEach(user => {
        const uid = user.account_id;
        const oldScore = previousScores[uid];
        const newScore = user.score;

        // Vérifier si c'est un vrai changement de score (pas juste un nouveau chargement)
        if (oldScore !== undefined && newScore > oldScore) {
            notificationQueue.push({
                name: user.name,
                points: newScore - oldScore
            });
            
            // Mettre à jour le dernier flag
            lastFlagUser = user.name;
            lastFlagTime = Date.now();
            updateLastFlagDisplay();
            savePersistedState();
        }
    });
    processQueue();
}

function saveState(users) {
    // Mettre à jour les flèches basées sur les changements
    users.forEach((u, index) => {
        const uid = u.account_id;
        const currentRank = index + 1;
        const oldRank = previousPositions[uid];
        const oldScore = previousScores[uid];
        const newScore = u.score;
        
        // Si c'est un nouvel utilisateur (premier chargement ou nouveau participant)
        if (oldRank === undefined || oldScore === undefined) {
            userArrows[uid] = '—';
        }
        // Si le score a changé (quelqu'un a flag)
        else if (oldScore !== undefined && newScore > oldScore) {
            // Comparer les positions
            if (currentRank < oldRank) {
                userArrows[uid] = '↑'; // Monte dans le classement
            } else if (currentRank > oldRank) {
                userArrows[uid] = '↓'; // Descend dans le classement
            } else {
                userArrows[uid] = '—'; // Même position après avoir flag
            }
        }
        // Si la position a changé sans changement de score (quelqu'un d'autre a flag)
        else if (oldRank !== undefined && currentRank !== oldRank) {
            if (currentRank < oldRank) {
                userArrows[uid] = '↑'; // Monte (poussé par quelqu'un)
            } else if (currentRank > oldRank) {
                userArrows[uid] = '↓'; // Descend (dépassé par quelqu'un)
            }
        }
        // Si aucun changement de position et aucun changement de score
        else if (oldRank !== undefined && currentRank === oldRank && oldScore === newScore) {
            // Garder la flèche actuelle si elle existe, sinon mettre un tiret
            if (userArrows[uid] === undefined) {
                userArrows[uid] = '—';
            }
            // Sinon on garde la flèche existante (ne rien faire)
        }
    });
    
    // Sauvegarder l'état actuel
    previousScores = {};
    previousPositions = {};
    users.forEach((u, index) => {
        previousScores[u.account_id] = u.score;
        previousPositions[u.account_id] = index + 1;
    });
    
    // Persister dans localStorage
    savePersistedState();
}

// --- 7. AFFICHAGE ---
// Mode LISTE UTILISATEURS (avant le CTF)
function renderUsersList(users) {
    const tbody = document.getElementById("scoreboard-body");
    const thead = document.querySelector("#scoreboard thead tr");
    const table = document.getElementById("scoreboard");
    const terminalTitle = document.querySelector(".terminal-bar .title");
    
    // Changer le titre du terminal
    terminalTitle.textContent = "root@guardia-ctf:~# ./user_list";
    
    // Ajouter classe pour désactiver les couleurs des 3 premiers
    table.classList.add('user-list-mode');
    table.classList.remove('scoreboard-mode');
    
    // Cacher les statistiques FLAGS et CHALLENGES en mode user list
    document.querySelector('.stat-item:nth-child(1)').style.display = 'none'; // FLAGS
    document.querySelector('.stat-item:nth-child(2)').style.display = 'none'; // CHALLENGES
    
    // Changer les en-têtes pour les 3 campus (sera mis à jour après le groupement)
    thead.innerHTML = `
        <th class="campus-header">LYON</th>
        <th class="campus-header">PARIS</th>
        <th class="campus-header">BORDEAUX</th>
    `;
    
    // Grouper les utilisateurs par affiliation
    const lyon = [];
    const paris = [];
    const bordeaux = [];
    
    users.forEach(user => {
        const affiliation = (user.affiliation || '').toLowerCase();
        if (affiliation.includes('lyon')) {
            lyon.push(user.name);
        } else if (affiliation.includes('paris')) {
            paris.push(user.name);
        } else if (affiliation.includes('bordeaux')) {
            bordeaux.push(user.name);
        }
    });
    
    // Mettre à jour les en-têtes avec le nombre d'utilisateurs par campus
    thead.innerHTML = `
        <th class="campus-header">LYON [${lyon.length}]</th>
        <th class="campus-header">PARIS [${paris.length}]</th>
        <th class="campus-header">BORDEAUX [${bordeaux.length}]</th>
    `;
    
    // Trouver le nombre max de lignes nécessaires
    const maxRows = Math.max(lyon.length, paris.length, bordeaux.length);
    
    tbody.innerHTML = "";
    
    // Créer les lignes avec les 3 colonnes
    for (let i = 0; i < maxRows; i++) {
        const tr = document.createElement("tr");
        
        // Numérotation décroissante : le dernier inscrit (en haut) a le numéro le plus élevé
        const lyonNum = lyon.length - i;
        const parisNum = paris.length - i;
        const bordeauxNum = bordeaux.length - i;
        
        const lyonUser = lyon[i] ? `${lyonNum}. ${lyon[i]}` : '';
        const parisUser = paris[i] ? `${parisNum}. ${paris[i]}` : '';
        const bordeauxUser = bordeaux[i] ? `${bordeauxNum}. ${bordeaux[i]}` : '';
        
        tr.innerHTML = `
            <td class="campus-cell" title="${lyon[i] || ''}">${lyonUser}</td>
            <td class="campus-cell" title="${paris[i] || ''}">${parisUser}</td>
            <td class="campus-cell" title="${bordeaux[i] || ''}">${bordeauxUser}</td>
        `;
        tbody.appendChild(tr);
    }
}

// Mode SCOREBOARD (pendant le CTF)
function renderTable(users) {
    const tbody = document.getElementById("scoreboard-body");
    const thead = document.querySelector("#scoreboard thead tr");
    const table = document.getElementById("scoreboard");
    const terminalTitle = document.querySelector(".terminal-bar .title");
    
    // Changer le titre du terminal
    terminalTitle.textContent = "root@guardia-ctf:~# ./scoreboard -top_score";
    
    // Ajouter classe pour activer les couleurs des 3 premiers
    table.classList.add('scoreboard-mode');
    table.classList.remove('user-list-mode');
    
    // Afficher les statistiques FLAGS et CHALLENGES en mode scoreboard
    document.querySelector('.stat-item:nth-child(1)').style.display = 'flex'; // FLAGS
    document.querySelector('.stat-item:nth-child(2)').style.display = 'flex'; // CHALLENGES
    
    // Changer les en-têtes pour le mode scoreboard
    thead.innerHTML = `
        <th style="width: 8%">#</th>
        <th style="width: 40%">PSEUDO</th>
        <th style="width: 30%">AFFILIATION</th>
        <th style="width: 5%"></th>
        <th style="width: 17%">SCORE</th>
    `;
    
    tbody.innerHTML = "";
    
    // Afficher les 20 premiers
    users.slice(0, 20).forEach((user, index) => {
        const tr = document.createElement("tr");
        
        const rank = index + 1;
        const uid = user.account_id;
        
        // Utiliser la flèche mémorisée pour cet utilisateur
        const arrow = userArrows[uid] || '—';
        
        // Déterminer la classe CSS pour la couleur de la flèche
        let arrowClass = 'arrow-neutral';
        if (arrow === '↑') {
            arrowClass = 'arrow-up';
        } else if (arrow === '↓') {
            arrowClass = 'arrow-down';
        }
        
        // Ajouter animation seulement si changement récent
        const oldPosition = previousPositions[uid];
        if (oldPosition !== undefined && rank !== oldPosition) {
            tr.classList.add('position-changed');
        }
        
        tr.innerHTML = `
            <td>${rank}</td>
            <td title="${user.name}">${user.name}</td>
            <td class="affiliation" title="${user.affiliation || 'N/A'}">${user.affiliation || 'N/A'}</td>
            <td class="${arrowClass}">${arrow}</td>
            <td>${user.score}</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- 8. NOTIFICATIONS ---
function processQueue() {
    if (isNotifying || notificationQueue.length === 0) return;

    isNotifying = true;
    const notif = notificationQueue.shift();
    showNotification(notif);
}

function showNotification(data) {
    const modal = document.getElementById("notification-modal");
    const notifName = document.getElementById("notif-team");
    const notifPoints = document.getElementById("notif-points");
    const bar = document.querySelector(".bar-fill");
    const audio = document.getElementById("notification-sound");

    notifName.innerText = data.name;
    notifPoints.innerText = data.points;

    bar.style.transition = 'none';
    bar.style.width = '0%';

    // Jouer le son
    audio.currentTime = 0;
    audio.play().catch(err => console.log('Erreur lecture audio:', err));

    modal.classList.remove("hidden");
    requestAnimationFrame(() => {
        modal.classList.add("visible");
        setTimeout(() => {
            bar.style.transition = 'width 5s linear';
            bar.style.width = '100%';
        }, 50);
    });

    setTimeout(() => {
        modal.classList.remove("visible");
        setTimeout(() => {
            modal.classList.add("hidden");
            isNotifying = false;
            setTimeout(processQueue, 500);
        }, 300);
    }, 5000);
}

// --- 8b. GESTION DES DONNÉES SELON LA PHASE ---
function updateData() {
    const now = new Date().getTime();
    
    if (now < START_DATE) {
        // AVANT le CTF : afficher la liste des utilisateurs
        console.log('Mode: LISTE UTILISATEURS (avant CTF)');
        fetchUsers();
    } else if (now >= START_DATE && now < END_DATE) {
        // PENDANT le CTF : afficher le scoreboard
        console.log('Mode: SCOREBOARD (pendant CTF)');
        fetchScoreboard();
    } else {
        // APRÈS le CTF : afficher le scoreboard final
        console.log('Mode: SCOREBOARD FINAL (après CTF)');
        fetchScoreboard();
    }
}

// --- INIT ---
document.addEventListener("DOMContentLoaded", () => {
    createSnow();
    updateTimer();
    updateSystemStatus();
    setInterval(updateTimer, 1000);
    setInterval(updateSystemStatus, 1000);
    
    // Activer le Wake Lock
    requestWakeLock();
    
    // Charger l'état persisté
    loadPersistedState();
    
    // Récupérer les données
    updateLastFlagDisplay();
    updateData();
    fetchStatistics();
    
    setInterval(updateData, POLL_INTERVAL);
    setInterval(fetchStatistics, POLL_INTERVAL);
    setInterval(updateLastFlagDisplay, 1000);
});