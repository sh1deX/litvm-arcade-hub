/**
 * Main Hub Logic
 * Orchestrates the application state and view switching.
 */

import { stateManager } from './stateManager.js';
import { supabase, getUserProfile, createUserProfile, updateUserProfile, signInWithTwitter, signInWithGoogle, signOut, getSession } from './supabaseClient.js';
import { TASKS, checkTaskCompletion, getTaskProgress } from './tasksConfig.js';
import { BADGES } from './badgesConfig.js';

// --- Configuration ---
const GAMES = {
    'lit-2048': './games/lit-2048.js'
};

// --- Secret Guest Mode State ---
let mKeyCount = 0;
let lastMKeyTime = 0;

// --- DOM Elements ---
const els = {
    balance: document.getElementById('litcoin-balance'),
    dashboard: document.getElementById('dashboard'),
    gameStage: document.getElementById('game-stage'),
    leaderboardView: document.getElementById('leaderboard-view'),
    backBtn: document.getElementById('back-to-hub'),
    tasksList: document.getElementById('tasks-list'),
    leaderboardList: document.getElementById('leaderboard-list'),
    record2048: document.getElementById('record-lit-2048'),

    // UI Controls
    btnMissions: document.getElementById('btn-missions'),
    btnLeaderboard: document.getElementById('btn-leaderboard'),
    modalOverlay: document.getElementById('modal-overlay'),

    // Wallet Controls
    btnConnectWallet: document.getElementById('btn-connect-wallet'),
    walletInfo: document.getElementById('wallet-info'),
    // walletAddress: removed in new header for button-based connect

    // Header Elements
    authContainer: document.getElementById('auth-container'),
    userDashboardHeader: document.getElementById('user-dashboard-header'),
    headerStreak: document.getElementById('streak-count'),
    headerXpFill: document.getElementById('header-xp-fill'),
    headerXpText: document.getElementById('header-xp-text'),
    headerLevel: document.getElementById('header-level'),
    headerNickname: document.getElementById('header-nickname'),
    headerAvatar: document.getElementById('header-avatar'),
    userDropdown: document.getElementById('user-dropdown'),
    profileTrigger: document.getElementById('user-profile-trigger'),

    // Dropdown Inputs
    ddInputNickname: document.getElementById('dd-input-nickname'),
    ddBtnSaveName: document.getElementById('dd-btn-save-name'),

    // Dropdown Actions
    ddTwitter: document.getElementById('dd-link-twitter'),
    ddDisconnect: document.getElementById('dd-disconnect'),

    // Profile Controls
    btnProfile: document.getElementById('btn-profile'), // Now "Badges"
    profileView: document.getElementById('profile-view'),

    // Edit Profile Modal Elements (injected or reused)
    editProfileContent: document.getElementById('edit-profile-modal-content'),
    inputNickname: document.getElementById('profile-nickname'),
    btnSaveNickname: document.getElementById('btn-save-nickname'),

    // Header Logo for resetting view
    logo: document.querySelector('.logo')
};


// --- Initialization ---
async function init() {

    // Check for Supabase Session (e.g. returning from Twitter OAuth)
    try {
        const { session } = await getSession();
        if (session && session.user) {
            console.log("Supabase Session found:", session.user);
            const user = session.user;
            // Verify it is actually a Twitter/X session
            const isTwitter = user.app_metadata.provider === 'twitter' ||
                user.app_metadata.provider === 'x' ||
                (user.identities && user.identities.some(id => id.provider === 'twitter' || id.provider === 'x'));

            const isGoogle = user.app_metadata.provider === 'google' ||
                (user.identities && user.identities.some(id => id.provider === 'google'));

            const currentSocials = stateManager.getSocials() || {};

            if (isTwitter) {
                // Extract twitter handle or name
                const twitterHandle = user.user_metadata && (user.user_metadata.user_name || user.user_metadata.preferred_username || user.user_metadata.name || user.user_metadata.full_name);
                console.log("Twitter/X user metadata:", user.user_metadata);

                if (twitterHandle && currentSocials.twitter !== twitterHandle) {
                    currentSocials.twitter = twitterHandle;
                    stateManager.setSocials(currentSocials);
                    console.log("Synced Twitter state:", twitterHandle);
                } else if (!currentSocials.twitter) {
                    currentSocials.twitter = true;
                    stateManager.setSocials(currentSocials);
                }
            }

            if (isGoogle) {
                const googleEmail = user.email || user.user_metadata?.email;
                const googleName = user.user_metadata?.full_name || user.user_metadata?.name;
                console.log("Google user metadata:", user.user_metadata);

                if (googleEmail && currentSocials.google !== googleEmail) {
                    currentSocials.google = googleEmail;
                    if (googleName) currentSocials.googleName = googleName;
                    stateManager.setSocials(currentSocials);
                    console.log("Synced Google state:", googleEmail);
                } else if (!currentSocials.google) {
                    currentSocials.google = true;
                    stateManager.setSocials(currentSocials);
                }
            }

            // Sync social data to Supabase profiles table
            const dbUpdates = {};
            if (currentSocials.twitter && currentSocials.twitter !== true) {
                dbUpdates.twitter_handle = currentSocials.twitter;
            }
            if (currentSocials.google && currentSocials.google !== true) {
                dbUpdates.google_email = currentSocials.google;
            }
            if (Object.keys(dbUpdates).length > 0) {
                // Try updating by wallet_address from localStorage
                const savedWallet = stateManager.getWallet();
                if (savedWallet) {
                    updateUserProfile(savedWallet, dbUpdates).then(() => {
                        console.log("Synced socials to Supabase:", dbUpdates);
                    }).catch(err => {
                        console.error("Failed to sync socials to Supabase:", err);
                    });
                }
            }
        } else {
            // No active Supabase session — but don't clear Twitter state here.
            // The user may have linked Twitter previously and the session just expired.
            // Twitter state is only cleared on explicit disconnect.
            console.log("No active Supabase session.");
        }
    } catch (err) {
        console.error("Session check failed:", err);
    }

    renderBalance();
    renderTasks();
    renderRecords();
    stateManager.checkStreakExpiry(); // Auto-reset if >48h since last claim
    renderStreak();
    renderXpAndLevel();

    // Initialize specific dropdown logic (copy btn, etc.)
    initDropdownLogic();

    renderLeaderboard(); // Initial mock render

    await checkWalletConnection();

    // Always render avatar from localStorage on init (don't rely only on _notify subscribers)
    updateProfileUI();

    // TEMPORARY: User Request - Boost to Level 5 (Moved here to ensure post-sync)
    if (stateManager.getLevel() < 5) {
        console.log("🚀 Applying User Request: Boosting to Level 5...");
        stateManager.setLevel(5);
    }

    // Setup Secret Guest Shortcut (Triple M)
    setupGuestShortcut();

    // Bind global events
    document.querySelectorAll('.game-card').forEach(card => {
        if (!card.classList.contains('disabled')) {
            card.addEventListener('click', () => launchGame(card.dataset.gameId));
        }
    });

    // Navigation
    els.backBtn.addEventListener('click', showDashboard);
    els.logo.addEventListener('click', showDashboard);

    // Wallet
    els.btnConnectWallet.addEventListener('click', connectWallet);

    // Modal Control
    els.btnMissions.addEventListener('click', () => showModal('modal-missions'));

    // Games Tab Control
    const btnGames = document.getElementById('btn-games');
    if (btnGames) {
        btnGames.addEventListener('click', showDashboard);
    }

    // Leaderboard Tab Control
    els.btnLeaderboard.addEventListener('click', showLeaderboard);

    // Badges/Profile Tab Control
    els.btnProfile.addEventListener('click', showBadgesView);

    // Dropdown Logic
    els.profileTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        els.userDropdown.classList.toggle('active');
    });

    // Dropdown Actions
    els.ddDisconnect.addEventListener('click', disconnectWallet);
    // Removed old edit profile button listener
    // Twitter handler is now in initDropdownLogic() section (#5 in dropdown logic)
    // using real Supabase OAuth — old toggleSocial handler removed.

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (els.userDropdown && els.userDropdown.classList.contains('active')) {
            els.userDropdown.classList.remove('active');
        }
    });

    // Profile Actions (Save Nickname)
    if (els.btnSaveNickname) {
        els.btnSaveNickname.addEventListener('click', () => {
            const name = els.inputNickname.value.trim();
            if (name) {
                stateManager.setNickname(name);
                showAlertModal('Codename updated successfully!', 'IDENTITY CONFIRMED');
                updateProfileUI(); // Update header name
                closeModals();
            }
        });
    }

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });

    els.modalOverlay.addEventListener('click', (e) => {
        if (e.target === els.modalOverlay) closeModals();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModals();

        // Secret Guest Mode: Press 'm' 3 times to login
        if (e.key.toLowerCase() === 'm' && !e.target.matches('input, textarea')) {
            const now = Date.now();
            if (now - lastMKeyTime > 1000) {
                mKeyCount = 0; // Reset if too slow (>1s)
            }
            mKeyCount++;
            lastMKeyTime = now;

            if (mKeyCount === 3) {
                loginAsGuest();
                mKeyCount = 0;
            }
        }
    });


    // Streak Click — Claim daily streak
    const streakContainer = document.getElementById('daily-streak-container');
    if (streakContainer) {
        streakContainer.addEventListener('click', () => {
            const result = stateManager.claimStreak();
            if (result.success) {
                showAlertModal(`Streak Claimed! 🔥 Day ${result.streak}`, 'DAILY STREAK');
            } else {
                // Format remaining time
                const totalMin = Math.ceil(result.remainingMs / 60000);
                const hours = Math.floor(totalMin / 60);
                const mins = totalMin % 60;
                const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                showAlertModal(`Come back in ${timeStr}`, 'ALREADY CLAIMED');
            }
        });
    }

    // Subscribe to state changes
    stateManager.subscribe(() => {
        renderBalance();
        renderTasks();
        renderRecords();
        renderStreak();
        renderXpAndLevel();
        updateProfileUI();
        if (userAddress) renderWalletUI(); // Refresh header UI
    });
}

// --- Guest Mode Logic ---
function setupGuestShortcut() {
    document.addEventListener('keydown', (e) => {
        // Guard: Ignore script-generated (untrusted) events
        // This fixes the issue where "Connect Wallet" triggers simulated key presses
        if (!e.isTrusted) return;

        // Guard: Do not trigger if user is typing in an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Guard: Do not trigger if the Connect Wallet button is focused
        if (e.target.closest('#btn-connect-wallet')) return;

        // Only trigger if physical 'M' key is pressed
        if (e.code === 'KeyM') {
            // If already logged in (Wallet or Guest), do nothing
            if (userAddress) return;

            const now = Date.now();

            // Reset count if too much time passed (e.g., > 500ms between presses)
            if (now - lastMKeyTime > 500) {
                mKeyCount = 0;
            }

            mKeyCount++;
            lastMKeyTime = now;

            if (mKeyCount === 3) {
                console.log("🕵️ Secret Guest Mode Activated!");
                loginAsGuest();
                mKeyCount = 0; // Reset
            }
        }
    });
}

function loginAsGuest() {
    userAddress = "guest_0x00000000000000000000000000000000";

    // Switch to guest account (loads guest-specific data from localStorage)
    stateManager.switchAccount('guest');

    // Sync with Supabase for guest profile
    stateManager.syncWithSupabase(userAddress).then(() => {
        // Only set default nickname if guest has never set one
        if (stateManager.getNickname() === 'Guest') {
            stateManager.setNickname('Guest User');
        }
        updateProfileUI();
    });

    // Persist guest session so reload works
    localStorage.setItem('isGuestSession', 'true');

    renderWalletUI();
    showAlertModal("Guest Mode Activated! 🕹️ Access granted.", "SYSTEM OVERRIDE");
}

// --- Rendering Helpers ---
function renderXpAndLevel() {
    const xp = stateManager.getXp();
    const level = stateManager.getLevel();
    const maxXp = stateManager.getMaxXp();
    const percent = Math.min(100, Math.floor((xp / maxXp) * 100));

    if (els.headerXpFill) els.headerXpFill.style.width = `${percent}%`;
    if (els.headerXpText) els.headerXpText.textContent = `${xp} / ${maxXp} XP`;
    if (els.headerLevel) els.headerLevel.textContent = level;
    const ddLevel = document.getElementById('dd-level');
    if (ddLevel) ddLevel.textContent = level;
}

function updateProfileUI() {
    // Nickname in Header
    if (els.headerNickname) els.headerNickname.textContent = stateManager.getNickname();

    // Avatar Logic
    const headerAvatar = document.getElementById('header-avatar');
    if (headerAvatar) {
        const avatarData = stateManager.getAvatar();

        // Define gradients for default avatars (IDs 1-5)
        const gradients = [
            'linear-gradient(135deg, #00f3ff, #bc13fe)', // 1: Cyan -> Purple
            'linear-gradient(135deg, #fcd116, #ff00ea)', // 2: Yellow -> Pink
            'linear-gradient(135deg, #00e676, #00f3ff)', // 3: Green -> Cyan
            'linear-gradient(135deg, #ff1744, #fcd116)', // 4: Red -> Yellow
            'linear-gradient(135deg, #00b8d4, #6200ea)'  // 5: Blue -> Deep Purple
        ];

        // Determine background style
        let bgStyle = '';
        if (avatarData && avatarData.startsWith('data:image')) {
            // User uploaded image
            bgStyle = `url(${avatarData})`;
        } else {
            // Default ID (1-based index)
            const index = (parseInt(avatarData) || 1) - 1;
            bgStyle = gradients[index % gradients.length] || gradients[0];
        }

        // Apply to Header Avatar
        headerAvatar.style.background = bgStyle;
        headerAvatar.style.backgroundSize = '115%';
        headerAvatar.style.backgroundPosition = 'center';

        // Apply to Large Profile Avatar (in Dropdown)
        const profileAvatar = document.getElementById('profile-avatar-display');
        if (profileAvatar) {
            profileAvatar.style.background = bgStyle;
            profileAvatar.style.backgroundSize = '115%';
            profileAvatar.style.backgroundPosition = 'center';
            profileAvatar.innerHTML = ''; // Clear any potential img tags or text
        }
    }

    // Also update inputs if view is visible
    if (els.inputNickname) els.inputNickname.value = stateManager.getNickname();

    // Badges View Update
    const score = stateManager.getScore();
    const records = stateManager.state.gameRecords;
    const socials = stateManager.getSocials();
    const gamesPlayed = stateManager.getGamesPlayed();

    // Update Stats in Profile View
    if (document.getElementById('dropdown-wins')) {
        document.getElementById('dropdown-wins').textContent = gamesPlayed;
    }



    // Render badges from config
    renderBadges();
    renderMiniBadges();
    renderTransactions();
}

// --- Badge Achievement System ---
function getBadgeState() {
    const socials = stateManager.getSocials() || {};
    return {
        walletConnected: !!userAddress,
        gamesPlayed: stateManager.getGamesPlayed(),
        totalScore: stateManager.getScore(),
        socials: socials,
        streak: stateManager.state.streak || 0,
        level: stateManager.state.level || 1,
    };
}

function renderBadges() {
    const container = document.getElementById('badges-container');
    if (!container) return;

    const state = getBadgeState();
    let unlockedCount = 0;
    container.innerHTML = '';

    // Create a working array for sorting
    const badgeList = BADGES.map(badge => {
        const isUnlocked = badge.check(state);
        // Register unlock timestamp if newly detected (or missing)
        if (isUnlocked) {
            stateManager.registerBadgeUnlock(badge.id);
            unlockedCount++;
        }
        return {
            ...badge,
            isUnlocked,
            unlockTime: isUnlocked ? stateManager.getUnlockTime(badge.id) : Infinity,
            originalIndex: BADGES.indexOf(badge)
        };
    });

    // Custom Sort Function
    // 1. Unlocked comes before Locked
    // 2. If both unlocked, sort by unlockTime (Oldest to Newest)
    // 3. If both locked, sort by original index (Default Order)
    badgeList.sort((a, b) => {
        if (a.isUnlocked && !b.isUnlocked) return -1;
        if (!a.isUnlocked && b.isUnlocked) return 1;

        if (a.isUnlocked && b.isUnlocked) {
            return a.unlockTime - b.unlockTime;
        }

        return a.originalIndex - b.originalIndex;
    });

    badgeList.forEach(badge => {
        const isUnlocked = badge.isUnlocked;
        const item = document.createElement('div');
        item.className = `badge-item ${isUnlocked ? 'unlocked' : 'locked'}`;
        item.style.setProperty('--badge-color', badge.color);
        item.dataset.badgeId = badge.id;

        // Logic change: If locked and has icon, show icon (blueprint mode)
        // If unlocked and has image, show image (full mode)
        // If no icon, always show image (fallback)
        if (badge.image && (isUnlocked || !badge.icon)) {
            // Removed imageScale logic - images are now normalized 512x512
            item.innerHTML = `
                <div class="badge-icon-circle badge-icon-image">
                    <img src="${badge.image}" alt="${badge.name}">
                </div>
                <span class="badge-name">${badge.name}</span>
            `;
        } else {
            // Show icon (either because it's locked and has one, or badge has no image)
            item.innerHTML = `
                <div class="badge-icon-circle">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${badge.icon || BADGE_ICONS.level}</svg>
                </div>
                <span class="badge-name">${badge.name}</span>
            `;
        }

        item.addEventListener('click', () => showBadgeDetail(badge, isUnlocked));
        container.appendChild(item);
    });

    // Update progress counter
    const progressEl = document.getElementById('badges-progress');
    if (progressEl) progressEl.textContent = `${unlockedCount} / ${BADGES.length} UNLOCKED`;
}

function renderTransactions() {
    const container = document.getElementById('transactions-container');
    if (!container) return;

    // TODO: Replace with real crypto transaction rendering when integrated
    container.innerHTML = '<div class="transactions-empty">No transactions yet.</div>';
}

function formatTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function renderMiniBadges() {
    const container = document.getElementById('dropdown-badges-preview');
    if (!container) return;

    const state = getBadgeState();
    container.innerHTML = '';

    BADGES.forEach(badge => {
        const isUnlocked = badge.check(state);
        const div = document.createElement('div');
        div.className = `profile-badge-mini ${isUnlocked ? 'unlocked' : 'locked'}`;
        div.style.setProperty('--badge-color', badge.color);

        if (badge.image) {
            div.innerHTML = `<img src="${badge.image}" alt="${badge.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        } else {
            div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${badge.icon}</svg>`;
        }

        div.title = `${badge.name} (${isUnlocked ? 'Unlocked' : 'Locked'})`;
        container.appendChild(div);
    });
}

function showBadgeDetail(badge, isUnlocked) {
    const modal = document.getElementById('badge-detail-modal');
    const iconEl = document.getElementById('badge-detail-icon');
    const nameEl = document.getElementById('badge-detail-name');
    const descEl = document.getElementById('badge-detail-desc');
    const statusEl = document.getElementById('badge-detail-status');

    // Set color theme
    const card = modal.querySelector('.badge-detail-card');
    card.style.setProperty('--badge-color', badge.color);
    card.style.borderColor = isUnlocked ? badge.color : 'rgba(255,255,255,0.1)';

    // Icon
    // Icon
    iconEl.style.setProperty('--badge-color', badge.color);

    if (badge.image) {
        iconEl.classList.add('badge-icon-image');
        // Removed imageScale logic
        iconEl.innerHTML = `<img src="${badge.image}" alt="${badge.name}">`;
    } else {
        iconEl.classList.remove('badge-icon-image');
        iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${badge.icon}</svg>`;
    }

    if (!isUnlocked) {
        iconEl.style.filter = 'grayscale(1) brightness(0.5)';
        iconEl.style.borderColor = 'rgba(255,255,255,0.15)';
        iconEl.style.boxShadow = 'none';
    } else {
        iconEl.style.filter = 'none';
        iconEl.style.borderColor = badge.color;
        iconEl.style.boxShadow = `0 0 25px ${badge.color}`;
    }

    // Name & Description
    nameEl.textContent = badge.name;
    nameEl.style.color = isUnlocked ? badge.color : 'rgba(255,255,255,0.4)';
    descEl.textContent = badge.description;

    // Status
    statusEl.textContent = isUnlocked ? '✓ UNLOCKED' : '🔒 LOCKED';
    statusEl.className = `badge-detail-status ${isUnlocked ? 'unlocked' : 'locked'}`;

    modal.style.display = 'flex';
    modal.style.opacity = '1';
    modal.style.pointerEvents = 'auto';
}

// Badge modal close
function closeBadgeModal() {
    const m = document.getElementById('badge-detail-modal');
    m.style.display = 'none';
    m.style.opacity = '0';
    m.style.pointerEvents = 'none';
}
document.getElementById('badge-modal-close')?.addEventListener('click', closeBadgeModal);
document.getElementById('badge-detail-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        closeBadgeModal();
    }
});

// --- Wallet Logic ---
let userAddress = null;

async function checkWalletConnection() {
    // Check if user manually disconnected previously
    if (localStorage.getItem('walletManuallyDisconnected') === 'true') {
        renderWalletUI(); // Force disconnected UI
        return;
    }

    // Check for Guest Session first
    if (localStorage.getItem('isGuestSession') === 'true') {
        loginAsGuest();
        return;
    }

    if (window.ethereum) {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                userAddress = accounts[0];
                stateManager.switchAccount(userAddress);
                await stateManager.syncWithSupabase(userAddress);
                renderWalletUI();
                listenToWalletEvents();
            } else {
                renderWalletUI(); // Ensure disconnected state
            }
        } catch (err) {
            console.error("Error checking wallet connection:", err);
        }
    }
}

async function connectWallet() {
    if (!window.ethereum) {
        showAlertModal("Please install Metamask or another Web3 wallet!", "WALLET ERROR");
        return;
    }

    // If guest, clear guest first
    if (localStorage.getItem('isGuestSession')) {
        localStorage.removeItem('isGuestSession');
    }

    els.btnConnectWallet.textContent = 'Connecting...';

    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts.length > 0) {
            // User explicitly connected, clear the disconnect flag
            localStorage.removeItem('walletManuallyDisconnected');

            userAddress = accounts[0];
            stateManager.switchAccount(userAddress);
            await stateManager.syncWithSupabase(userAddress);
            renderWalletUI();
            listenToWalletEvents();
        }
    } catch (err) {
        console.error("Wallet connection failed:", err);
        els.btnConnectWallet.textContent = 'Connect Wallet';
        showAlertModal("Connection failed. Please try again.", "CONNECTION ERROR");
    }
}

function disconnectWallet() {
    showConfirmModal("Disconnect your wallet?", () => {
        userAddress = null;
        // Set flag to prevent auto-reconnect on reload
        localStorage.setItem('walletManuallyDisconnected', 'true');

        // Clear Guest Flag if present
        localStorage.removeItem('isGuestSession');

        // Disconnect — clears active account, data stays in localStorage under its prefix
        stateManager.disconnect();

        renderWalletUI();

        // If on private view, go home
        if (els.profileView.style.display === 'flex') {
            showDashboard();
        }
    });
}

function listenToWalletEvents() {
    window.ethereum.on('accountsChanged', async (accounts) => {
        if (accounts.length > 0) {
            userAddress = accounts[0];
            stateManager.switchAccount(userAddress);
            await stateManager.syncWithSupabase(userAddress);
        } else {
            userAddress = null;
            stateManager.disconnect();
        }
        renderWalletUI();
    });

    window.ethereum.on('chainChanged', () => window.location.reload());
}

function renderWalletUI() {
    if (userAddress) {
        els.btnConnectWallet.style.display = 'none';
        els.userDashboardHeader.style.display = 'flex';

        // Update Nickname
        els.headerNickname.textContent = stateManager.getNickname();

        // --- NEW: Update Dropdown Info ---
        const ddWallet = document.getElementById('dropdown-wallet-address');
        const ddWins = document.getElementById('dropdown-wins');
        const ddEarned = document.getElementById('dropdown-earned');

        if (ddWallet) ddWallet.textContent = truncateAddress(userAddress);
        if (ddWins) ddWins.textContent = stateManager.getGamesPlayed();
        if (ddEarned) ddEarned.textContent = `${stateManager.getScore()} Coins`;

        // Sync Input Field
        if (els.ddInputNickname) {
            els.ddInputNickname.value = stateManager.getNickname();
        }

        renderLeaderboard(); // Update leaderboard with new address
    } else {
        els.btnConnectWallet.style.display = 'block';
        els.btnConnectWallet.textContent = 'Connect Wallet';
        els.userDashboardHeader.style.display = 'none';

        renderLeaderboard(); // Update leaderboard to show Guest
    }
}

// --- UI View Switching ---
function showDashboard() {
    resetActiveGame();
    hideAllViews();
    els.dashboard.style.display = 'flex';
    updateActiveDock('btn-games');
}

function showLeaderboard() {
    resetActiveGame();
    hideAllViews();
    els.leaderboardView.style.display = 'block';
    renderLeaderboard();
    updateActiveDock('btn-leaderboard');
}

function showBadgesView() {
    resetActiveGame();
    hideAllViews();
    els.profileView.style.display = 'flex';
    updateProfileUI(); // Refreshes badges and stats
    updateActiveDock('btn-profile');
}

function updateActiveDock(activeBtnId) {
    // Remove active class from all dock items
    document.querySelectorAll('.dock-item').forEach(btn => {
        btn.classList.remove('active');
    });

    // Add active class to the specified button
    const activeBtn = document.getElementById(activeBtnId);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}

function hideAllViews() {
    els.dashboard.style.display = 'none';
    els.gameStage.style.display = 'none';
    els.leaderboardView.style.display = 'none';
    els.profileView.style.display = 'none';
    els.backBtn.style.display = 'none';
}

function resetActiveGame() {
    if (activeGameInstance && activeGameInstance.endGame) {
        activeGameInstance.endGame(true);
        activeGameInstance = null;
        els.gameStage.innerHTML = '';
    }
}

// --- Modals ---
function showModal(modalId) {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    document.getElementById(modalId).style.display = 'flex';
    els.modalOverlay.classList.add('active');
}

function showEditProfileModal() {
    // Reuse the alert/generic modal structure or create a custom one dynamically
    // Here we will use a trick: inject the edit-content into the generic modal structure
    // Or cleaner: Use a dedicated 'modal-edit' in HTML.
    // Since we didn't create a 'modal-edit' in HTML, let's inject content into 'modal-alert' temporary or a new dynamic one.

    // Better: We have 'modal-missions' which is a large modal. Let's make a similar one for profile?
    // User instruction: "Remove edit inputs ... dropdown menu ... options like ... Edit Profile"

    // Let's repurpose 'modal-alert' for now or build a quick dynamic modal.
    // Actually, we can reuse the `edit-profile-modal-content` we hid in the HTML.

    // Create a dynamic modal if it doesn't exist?
    let editModal = document.getElementById('modal-edit-profile');
    if (!editModal) {
        // Create it on the fly
        editModal = document.createElement('div');
        editModal.id = 'modal-edit-profile';
        editModal.className = 'modal glass-panel';
        editModal.style.maxWidth = '400px';
        editModal.innerHTML = `
            <div class="modal-header">
                <h2>EDIT PROFILE</h2>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-content" style="padding: 20px;">
                <!-- Injected Content -->
            </div>
        `;
        document.getElementById('modal-overlay').appendChild(editModal);

        // Re-bind close buttons
        editModal.querySelector('.close-modal').addEventListener('click', closeModals);
    }

    // Move content from hidden div to modal
    const contentContainer = editModal.querySelector('.modal-content');
    contentContainer.innerHTML = ''; // Clear previous
    // Clone the hidden content so we don't handle move logic complexities
    if (els.editProfileContent) {
        const clone = els.editProfileContent.cloneNode(true);
        clone.style.display = 'flex';
        clone.style.flexDirection = 'column';
        clone.style.gap = '15px';
        contentContainer.appendChild(clone);

        // Re-bind the SAVE button in the clone
        const btnSave = clone.querySelector('#btn-save-nickname');
        const input = clone.querySelector('#profile-nickname');

        input.value = stateManager.getNickname(); // Pre-fill

        btnSave.addEventListener('click', () => {
            const name = input.value.trim();
            if (name) {
                stateManager.setNickname(name);
                showAlertModal('Codename updated successfully!', 'IDENTITY CONFIRMED');
                updateProfileUI();
            }
        });
    }

    showModal('modal-edit-profile');
}

function closeModals() {
    els.modalOverlay.classList.remove('active');
}

function showConfirmModal(message, onConfirm) {
    const modal = document.getElementById('modal-confirm');
    document.getElementById('confirm-message').innerHTML = message;

    document.getElementById('btn-confirm-yes').onclick = () => {
        onConfirm();
        closeModals();
    };
    document.getElementById('btn-confirm-no').onclick = closeModals;

    showModal('modal-confirm');
}

function showAlertModal(message, title = 'SYSTEM MESSAGE', callback = null) {
    const modal = document.getElementById('modal-alert');
    document.getElementById('alert-message').innerHTML = message;
    document.getElementById('alert-title').textContent = title;

    document.getElementById('btn-alert-ok').onclick = () => {
        closeModals();
        if (callback) callback();
    };

    showModal('modal-alert');
}

// --- Rendering Standard ---
function renderBalance() {
    if (els.balance) els.balance.textContent = stateManager.getScore();
}

function renderRecords() {
    if (els.record2048) els.record2048.textContent = stateManager.getRecord('lit-2048');
}

// --- Mock Leaderboard Data ---
const MOCK_PLAYERS = [
    { name: "NeonViper", score: 95000 },
    { name: "CyberGho$t", score: 88400 },
    { name: "BitLord_99", score: 76200 },
    { name: "KryptoKitty", score: 65100 },
    { name: "Glitch_Zero", score: 54300 },
    { name: "SatoshiDream", score: 42000 },
    { name: "0xWhale", score: 31500 },
    { name: "PixelPunk", score: 28900 },
    { name: "NetRunner", score: 15600 }
];

function renderLeaderboard() {
    if (!els.leaderboardList) return;
    els.leaderboardList.innerHTML = '';

    // 1. Prepare Data
    let allPlayers = [...MOCK_PLAYERS];

    if (userAddress) {
        // --- CONNECTED STATE ---
        const userScore = stateManager.getScore();
        const userName = stateManager.getNickname() + " (YOU)";
        const userEntry = { name: userName, score: userScore, isUser: true };

        allPlayers.push(userEntry);
        allPlayers.sort((a, b) => b.score - a.score);
    } else {
        // --- DISCONNECTED STATE ---
        // Just sort mock data
        allPlayers.sort((a, b) => b.score - a.score);
    }

    // 2. Render Top Players
    const topPlayers = allPlayers.slice(0, 50);

    topPlayers.forEach((player, index) => {
        const rank = index + 1;
        const row = document.createElement('tr');
        if (player.isUser) row.classList.add('current-user-row');

        row.innerHTML = `
            <td class="rank-col">#${rank}</td>
            <td class="player-col">${player.name}</td>
            <td class="score-col">${player.score.toLocaleString()}</td>
        `;
        els.leaderboardList.appendChild(row);
    });

    // 3. Render "Connect Wallet" Prompt if disconnected
    if (!userAddress) {
        const row = document.createElement('tr');
        row.className = 'connect-wallet-row';
        row.innerHTML = `
            <td colspan="3" style="text-align: center; padding: 20px;">
                <button class="btn-neon-sm" style="width: 100%;">
                    Connect wallet to see your rank
                </button>
            </td>
        `;

        // Bind click to connect
        const btn = row.querySelector('button');
        btn.addEventListener('click', connectWallet);

        els.leaderboardList.appendChild(row);
    }
}

function renderStreak() {
    // Main Header Streak
    if (els.headerStreak) {
        els.headerStreak.textContent = stateManager.getStreak();
        // Also toggle inactive class on parent if needed
        const container = document.getElementById('daily-streak-container');
        if (container) {
            container.classList.toggle('streak-inactive', stateManager.getStreak() === 0);
        }
    }
}

function renderTasks() {
    els.tasksList.innerHTML = '';
    TASKS.forEach((task, idx) => {
        const isDone = stateManager.isTaskCompleted(task.id);
        const target = task.targetValue || 1;
        const current = isDone ? target : Math.min(getTaskProgress(task), target);
        const percent = Math.min(Math.floor((current / target) * 100), 100);
        const isClaimable = !isDone && current >= target;

        const el = document.createElement('div');
        el.className = `task-card${isDone ? ' done' : ''}${isClaimable ? ' ready' : ''}`;
        el.style.animationDelay = `${idx * 0.06}s`;

        // Build action
        let actionHTML = '';
        if (isDone) {
            actionHTML = '<span class="task-status-done">✓ Done</span>';
        } else if (isClaimable) {
            actionHTML = `<button class="btn-claim" data-task-id="${task.id}">CLAIM</button>`;
        } else if (task.type === 'play_game' && task.gameId) {
            actionHTML = `<button class="btn-task-go" onclick="launchGame('${task.gameId}')">PLAY</button>`;
        } else if (task.type === 'checkin') {
            actionHTML = `<button class="btn-task-go" onclick="document.getElementById('daily-streak-container').click(); closeModals();">GO</button>`;
        }

        el.innerHTML = `
            <div class="task-top">
                <div class="task-left">
                    <span class="task-emoji">${task.icon || '⚡'}</span>
                    <div class="task-info">
                        <span class="task-name">${task.title}</span>
                        <span class="task-sub">${task.description}</span>
                    </div>
                </div>
                
                <div class="task-rewards">
                    ${task.xpReward > 0 ? `<div class="task-reward-item xp"><span class="reward-val">+${task.xpReward}</span> XP</div>` : ''}
                    <div class="task-reward-item coin"><span class="reward-val">+${task.reward}</span> Coins</div>
                </div>

                <div class="task-right ${actionHTML ? 'has-btn' : 'no-btn'}">
                    ${actionHTML}
                    <span class="task-progress-text">${Math.floor(current)} / ${target}</span>
                </div>
            </div>
            <div class="task-bar-wrap">
                <div class="task-bar" style="width:${percent}%"></div>
            </div>
        `;

        // CLAIM handler
        const claimBtn = el.querySelector('.btn-claim');
        if (claimBtn) {
            claimBtn.addEventListener('click', () => {
                stateManager.completeTask(task.id, task.reward, task.xpReward || 0);
                showAlertModal(`+${task.reward} 🪙  &  +${task.xpReward || 0} XP`, 'REWARD CLAIMED', () => {
                    showModal('modal-missions');
                });
            });
        }

        els.tasksList.appendChild(el);
    });
}

// --- Game Launcher ---
let activeGameInstance = null;

async function launchGame(gameId) {
    if (!GAMES[gameId]) {
        console.error('Game not found:', gameId);
        return;
    }

    // Close any open modals
    closeModals();

    // UI Switch
    hideAllViews();
    els.gameStage.style.display = 'flex';
    els.backBtn.style.display = 'block';

    try {
        const module = await import(GAMES[gameId]);
        const GameClass = module.default;

        activeGameInstance = new GameClass();
        activeGameInstance.init(els.gameStage, (result) => handleGameEnd(gameId, result));
        activeGameInstance.start();

    } catch (err) {
        console.error('Failed to load game:', err);
        showDashboard();
    }
}

function handleGameEnd(gameId, result) {
    const isNewRecord = stateManager.updateRecord(gameId, result.score);
    // Give XP based on score/result? For now, tasks handle XP. 
    // Maybe small XP for playing?
    stateManager.addXp(10); // Participation XP
    stateManager.incrementGamesPlayed(); // Increment games count

    // If restarting, only record stats — don't navigate or show modals
    if (result.restart) {
        checkTaskCompletion(gameId, result);
        return;
    }

    const completed = checkTaskCompletion(gameId, result);
    if (completed.length > 0) {
        const rewardTotal = completed.reduce((a, b) => a + b.reward, 0);
        const xpTotal = completed.reduce((a, b) => a + (b.xpReward || 0), 0);

        showAlertModal(
            `Mission Complete! <br> Earned <span style="color:var(--color-primary);">${rewardTotal} Coins</span> & ${xpTotal} XP!`,
            'MISSION ACCOMPLISHED',
            () => showModal('modal-missions')
        );
    } else if (isNewRecord) {
        showAlertModal(
            `New High Score: <span style="color:var(--color-accent);">${result.score}</span>!`,
            'NEW RECORD'
        );
    }

    showDashboard();
}

// Make globally available for inline onclicks
window.launchGame = launchGame;
window.closeModals = closeModals;

// --- DEBUG: Global Click Listener (disabled for production) ---
// To re-enable, uncomment the listener below:
// window.addEventListener('click', (e) => {
//     console.log('Global Click:', e.target);
// }, true);

// Start
try {
    init();
} catch (error) {
    console.error("FATAL: Init failed:", error);
    document.body.innerHTML = `<div style="color:#e74c3c;padding:40px;font-family:monospace;text-align:center;"><h2>SYSTEM ERROR</h2><p>${error.message}</p></div>`;
}
// --- Helper: Truncate Address ---
function truncateAddress(address) {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

// --- Dropdown Interactions ---
function initDropdownLogic() {
    // 1. Copy Address
    const copyBtn = document.getElementById('btn-copy-address');
    if (copyBtn) {
        // Clone to strip old listeners
        const newCopyBtn = copyBtn.cloneNode(true);
        copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);

        newCopyBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop menu from closing
            const address = userAddress || "0x0000...0000";

            navigator.clipboard.writeText(address).then(() => {
                const originalHTML = newCopyBtn.innerHTML;

                // Visual Feedback: Checkmark
                newCopyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00f3ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                newCopyBtn.style.opacity = '1';

                // Show tooltip
                const feedback = document.getElementById('copy-feedback');
                if (feedback) {
                    feedback.classList.add('show');
                    setTimeout(() => feedback.classList.remove('show'), 2000);
                }

                // Revert icon after 2s
                setTimeout(() => {
                    newCopyBtn.innerHTML = originalHTML;
                    newCopyBtn.style.opacity = '';
                }, 2000);
            }).catch(err => console.error("Clipboard failed:", err));
        });

        // Update global reference
        if (els.btnCopyAddress) els.btnCopyAddress = newCopyBtn;
    }

    // 2. Inline Nickname Editing
    const input = document.getElementById('dd-input-nickname');
    const saveBtn = document.getElementById('dd-btn-save-name');

    if (input) {
        const newInput = input.cloneNode(true);
        input.parentNode.replaceChild(newInput, input);

        newInput.addEventListener('click', (e) => e.stopPropagation());

        newInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveNickname(newInput.value);
                newInput.blur();
            }
        });

        if (els.ddInputNickname) els.ddInputNickname = newInput;

        if (saveBtn) {
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

            newSaveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                saveNickname(newInput.value);
            });

            if (els.ddBtnSaveName) els.ddBtnSaveName = newSaveBtn;
        }
    }

    // 3. Avatar Upload Logic
    // NOTE: fileInput lives INSIDE avatarContainer in the DOM.
    // We must NOT clone the container separately from the input, or references break.
    const avatarContainer = document.getElementById('profile-avatar-container');
    const fileInput = document.getElementById('file-upload-avatar');

    if (avatarContainer && fileInput) {
        console.log("Initializing Avatar Upload Logic...");

        // Remove old listeners by cloning, but get the NEW file input from inside the clone
        const newContainer = avatarContainer.cloneNode(true);
        avatarContainer.parentNode.replaceChild(newContainer, avatarContainer);

        // Get the cloned file input that now lives inside newContainer
        const newFileInput = newContainer.querySelector('#file-upload-avatar') ||
            document.getElementById('file-upload-avatar');

        newContainer.addEventListener('click', (e) => {
            // Don't trigger if clicking the file input itself
            if (e.target === newFileInput) return;
            e.preventDefault();
            e.stopPropagation();
            console.log("Avatar container clicked. Triggering file input...");
            newFileInput.click();
        });

        newFileInput.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent bubbling up to dropdown close
        });

        newFileInput.addEventListener('change', (e) => {
            console.log("File input changed");
            const file = e.target.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                showAlertModal('Please upload an image file.', 'INVALID FILE');
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_SIZE = 200;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_SIZE) {
                            height *= MAX_SIZE / width;
                            width = MAX_SIZE;
                        }
                    } else {
                        if (height > MAX_SIZE) {
                            width *= MAX_SIZE / height;
                            height = MAX_SIZE;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    console.log("Avatar processed, saving...");
                    stateManager.setAvatar(dataUrl);
                    updateProfileUI();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);

            // Reset input so re-selecting the same file triggers change again
            e.target.value = '';
        });
    } else {
        console.warn("Avatar elements not found (yet?):", { container: avatarContainer, input: fileInput });
    }

    // 3b. Predefined Avatar Selection
    const avatarOptions = document.querySelectorAll('.avatar-option');
    avatarOptions.forEach(opt => {
        // Clone to remove old listeners if any (though unlikely here)
        const newOpt = opt.cloneNode(true);
        opt.parentNode.replaceChild(newOpt, opt);

        newOpt.addEventListener('click', (e) => {
            e.stopPropagation();
            const avatarId = newOpt.getAttribute('data-avatar');
            console.log("Avatar selected:", avatarId);
            stateManager.setAvatar(avatarId);
            updateProfileUI();
        });
    });

    // 4. Email Link Logic
    const emailBtn = document.getElementById('dd-link-email');
    if (emailBtn) {
        const newEmailBtn = emailBtn.cloneNode(true);
        emailBtn.parentNode.replaceChild(newEmailBtn, emailBtn);

        // Helper to update button visual state
        const updateEmailBtnState = () => {
            const currentSocials = stateManager.getSocials() || {};
            const span = newEmailBtn.querySelector('span');

            if (currentSocials.email) {
                newEmailBtn.style.borderColor = '#00e676'; // Green
                newEmailBtn.style.color = '#00e676';
                newEmailBtn.style.background = 'rgba(0, 230, 118, 0.1)';
                if (span) span.textContent = 'Linked';
            } else {
                newEmailBtn.style.borderColor = ''; // Reset
                newEmailBtn.style.color = '';
                newEmailBtn.style.background = ''; // Reset
                if (span) span.textContent = 'Email';
            }
        };

        // Initialize state
        updateEmailBtnState();

        newEmailBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const currentSocials = stateManager.getSocials() || {};

            if (currentSocials.email) {
                // Already linked - disconnect?
                showConfirmModal(`Disconnect email: ${currentSocials.email}?`, () => {
                    currentSocials.email = false;
                    stateManager.setSocials(currentSocials);
                    updateEmailBtnState();
                });
            } else {
                // Link new email — show inline input in dropdown
                // For now, use a simple prompt-style approach with a custom modal
                const emailInput = document.createElement('input');
                emailInput.type = 'email';
                emailInput.placeholder = 'Enter your email';
                emailInput.style.cssText = 'width:100%;padding:8px;background:rgba(255,255,255,0.05);border:1px solid var(--color-primary);color:#fff;border-radius:4px;font-family:inherit;margin-top:8px;';

                showConfirmModal('Link your email address', () => {
                    const email = emailInput.value.trim();
                    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                        currentSocials.email = email;
                        stateManager.setSocials(currentSocials);
                        updateEmailBtnState();
                        showAlertModal('Email linked successfully!', 'CONFIRMED');
                    } else {
                        showAlertModal('Invalid email format.', 'INPUT ERROR');
                    }
                });
                // Inject input into the confirm modal message area
                const msgEl = document.getElementById('confirm-message');
                if (msgEl) msgEl.appendChild(emailInput);
                setTimeout(() => emailInput.focus(), 100);
            }
        });
    }

    // 5. Google Link Logic (Supabase Auth)
    const googleBtn = document.getElementById('dd-link-google');
    if (googleBtn) {
        const newGoogleBtn = googleBtn.cloneNode(true);
        googleBtn.parentNode.replaceChild(newGoogleBtn, googleBtn);

        const updateGoogleBtnState = () => {
            const currentSocials = stateManager.getSocials() || {};
            const span = newGoogleBtn.querySelector('span');

            if (currentSocials.google) {
                newGoogleBtn.style.borderColor = '#ffa500';
                newGoogleBtn.style.color = '#ffa500';
                newGoogleBtn.style.background = 'rgba(255, 165, 0, 0.1)';
                if (span) {
                    const label = currentSocials.google === true ? 'Linked' : currentSocials.google;
                    span.textContent = label;
                }
            } else {
                newGoogleBtn.style.borderColor = '';
                newGoogleBtn.style.color = '';
                newGoogleBtn.style.background = '';
                if (span) span.textContent = 'Google';
            }
        };

        updateGoogleBtnState();

        newGoogleBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const currentSocials = stateManager.getSocials() || {};

            if (currentSocials.google) {
                // Disconnect
                const account = currentSocials.google === true ? '' : ` (${currentSocials.google})`;
                showConfirmModal(`Disconnect Google account${account}?`, async () => {
                    await signOut();
                    currentSocials.google = false;
                    delete currentSocials.googleName;
                    stateManager.setSocials(currentSocials);
                    updateGoogleBtnState();
                });
            } else {
                // Connect via Supabase
                try {
                    const { error } = await signInWithGoogle();
                    if (error) throw error;
                    // Redirect handles the rest
                } catch (err) {
                    console.error("Google Login Failed:", err);
                    showAlertModal('Failed to connect Google: ' + err.message, 'CONNECTION ERROR');
                }
            }
        });
    }

    // 6. Twitter Link Logic (Supabase Auth)
    const twitterBtn = document.getElementById('dd-link-twitter');
    if (twitterBtn) {
        const newTwitterBtn = twitterBtn.cloneNode(true);
        twitterBtn.parentNode.replaceChild(newTwitterBtn, twitterBtn);

        const updateTwitterBtnState = () => {
            const currentSocials = stateManager.getSocials() || {};
            const span = newTwitterBtn.querySelector('span');

            if (currentSocials.twitter) {
                newTwitterBtn.style.borderColor = '#1DA1F2'; // Twitter Blue
                newTwitterBtn.style.color = '#1DA1F2';
                newTwitterBtn.style.background = 'rgba(29, 161, 242, 0.1)';
                if (span) span.textContent = `@${currentSocials.twitter}`;
            } else {
                newTwitterBtn.style.borderColor = '';
                newTwitterBtn.style.color = '';
                newTwitterBtn.style.background = '';
                if (span) span.textContent = 'Twitter';
            }
        };

        updateTwitterBtnState();

        newTwitterBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const currentSocials = stateManager.getSocials() || {};

            if (currentSocials.twitter) {
                // Disconnect - use existing confirm modal
                const handle = currentSocials.twitter === true ? '' : ` @${currentSocials.twitter}`;
                showConfirmModal(`Disconnect Twitter account${handle}?`, async () => {
                    await signOut();
                    currentSocials.twitter = false;
                    stateManager.setSocials(currentSocials);
                    updateTwitterBtnState();
                });
            } else {
                // Connect via Supabase
                try {
                    const { error } = await signInWithTwitter();
                    if (error) throw error;
                    // Redirect handles the rest
                } catch (err) {
                    console.error("Twitter Login Failed:", err);
                    showAlertModal('Failed to connect Twitter: ' + err.message, 'CONNECTION ERROR');
                }
            }
        });
    }
}

function saveNickname(name) {
    const trimmed = name.trim();
    if (trimmed && trimmed !== stateManager.getNickname()) {
        stateManager.setNickname(trimmed);
        // Optional: Show subtle feedback instead of alert
        const btn = document.getElementById('dd-btn-save-name');
        if (btn) {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '✅';
            setTimeout(() => btn.innerHTML = originalHTML, 1500);
        }
        updateProfileUI(); // Updates header
    }
}
