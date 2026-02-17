import { getUserProfile, createUserProfile, updateUserProfile } from './supabaseClient.js';

let currentWallet = null; // Track connected wallet for sync
let activePrefix = '';    // localStorage key prefix for current account

// Base keys (will be prefixed with account identifier)
const BASE_KEYS = {
    SCORE: 'score',
    RECORDS: 'records',
    TASKS: 'tasks',
    TRANSACTIONS: 'transactions',
    NICKNAME: 'nickname',
    AVATAR: 'avatar',
    SOCIALS: 'socials',
    STREAK: 'streak',
    LAST_LOGIN: 'last_login',
    XP: 'xp',
    LEVEL: 'level',
    GAMES_PLAYED: 'games_played',
    UNLOCKED_BADGES: 'unlocked_badges'
};

/**
 * Build a prefixed key for localStorage.
 * Example: _key('score') => 'litvm_0x1234_score' or 'litvm_guest_score'
 */
function _key(baseKey) {
    return `litvm_${activePrefix}${baseKey}`;
}

class StateManager {
    constructor() {
        // State starts empty — populated by switchAccount()
        this.state = this._defaults();
        this.listeners = [];
    }

    _defaults() {
        return {
            totalScore: 0,
            gameRecords: {},
            completedTasks: [],
            nickname: 'Guest',
            avatar: '1',
            socials: { twitter: false, google: false },
            streak: 0,
            lastLogin: null,
            xp: 0,
            level: 1,
            gamesPlayed: 0,
            transactions: [],
            unlockedBadges: {}
        };
    }

    /**
     * Switch to a specific account.
     * Sets the localStorage prefix and loads that account's data.
     * @param {string} identifier - wallet address (e.g., '0x1234...') or 'guest'
     */
    switchAccount(identifier) {
        // Normalize: lowercase address, short prefix
        const id = identifier.toLowerCase();
        activePrefix = id + '_';

        // Save which account is active for page reload
        localStorage.setItem('litvm_active_account', identifier);

        // Load state from localStorage for this account
        this._loadFromStorage();
        this._notify();
    }

    /**
     * Load state from localStorage using the current prefix.
     */
    _loadFromStorage() {
        this.state = {
            totalScore: parseInt(localStorage.getItem(_key(BASE_KEYS.SCORE)) || '0'),
            gameRecords: JSON.parse(localStorage.getItem(_key(BASE_KEYS.RECORDS)) || '{}'),
            completedTasks: JSON.parse(localStorage.getItem(_key(BASE_KEYS.TASKS)) || '[]'),
            nickname: localStorage.getItem(_key(BASE_KEYS.NICKNAME)) || 'Guest',
            avatar: localStorage.getItem(_key(BASE_KEYS.AVATAR)) || '1',
            socials: JSON.parse(localStorage.getItem(_key(BASE_KEYS.SOCIALS)) || '{"twitter":false, "google":false}'),
            streak: parseInt(localStorage.getItem(_key(BASE_KEYS.STREAK)) || '0'),
            lastLogin: localStorage.getItem(_key(BASE_KEYS.LAST_LOGIN)) || null,
            xp: parseInt(localStorage.getItem(_key(BASE_KEYS.XP)) || '0'),
            level: parseInt(localStorage.getItem(_key(BASE_KEYS.LEVEL)) || '1'),
            gamesPlayed: parseInt(localStorage.getItem(_key(BASE_KEYS.GAMES_PLAYED)) || '0'),
            transactions: JSON.parse(localStorage.getItem(_key(BASE_KEYS.TRANSACTIONS)) || '[]'),
            unlockedBadges: JSON.parse(localStorage.getItem(_key(BASE_KEYS.UNLOCKED_BADGES)) || '{}')
        };
    }

    /**
     * Get the currently active account identifier (or null).
     */
    getActiveAccount() {
        return localStorage.getItem('litvm_active_account') || null;
    }

    setSocials(socialsData) {
        this.state.socials = socialsData;
        this._save(BASE_KEYS.SOCIALS, JSON.stringify(socialsData));
        this._notify();
    }

    // --- Badge Logic ---
    registerBadgeUnlock(badgeId) {
        if (!this.state.unlockedBadges[badgeId]) {
            this.state.unlockedBadges[badgeId] = Date.now();
            this._save(BASE_KEYS.UNLOCKED_BADGES, JSON.stringify(this.state.unlockedBadges));
            this._notify();
        }
    }

    getUnlockTime(badgeId) {
        return this.state.unlockedBadges[badgeId] || 0;
    }

    // --- Actions ---
    getScore() {
        return this.state.totalScore;
    }

    getGamesPlayed() {
        return this.state.gamesPlayed;
    }

    incrementGamesPlayed() {
        this.state.gamesPlayed++;
        this._save(BASE_KEYS.GAMES_PLAYED, this.state.gamesPlayed);
        this._notify();
    }

    getRecord(gameId) {
        return this.state.gameRecords[gameId] || 0;
    }

    isTaskCompleted(taskId) {
        return this.state.completedTasks.includes(taskId);
    }

    getStreak() {
        return this.state.streak;
    }

    // --- Gamification Getters ---
    getXp() { return this.state.xp; }
    getLevel() { return this.state.level; }
    getMaxXp() { return this.state.level * 100; }

    // --- Setters / Actions ---
    addScore(amount, label) {
        if (amount <= 0) return;
        this.state.totalScore += amount;
        this._save(BASE_KEYS.SCORE, this.state.totalScore);
        this.addTransaction('earn', label || 'Coins Earned', amount);
        this._notify();
    }

    updateRecord(gameId, score) {
        const currentRecord = this.getRecord(gameId);
        if (score > currentRecord) {
            this.state.gameRecords[gameId] = score;
            this._save(BASE_KEYS.RECORDS, JSON.stringify(this.state.gameRecords));
            this._notify();
            return true;
        }
        return false;
    }

    completeTask(taskId, reward, xpReward = 0) {
        if (this.isTaskCompleted(taskId)) return false;

        this.state.completedTasks.push(taskId);
        this._save(BASE_KEYS.TASKS, JSON.stringify(this.state.completedTasks));

        let stateChanged = false;
        if (reward > 0) { this.addScore(reward); stateChanged = true; }
        if (xpReward > 0) { this.addXp(xpReward); stateChanged = true; }

        if (!stateChanged) {
            this._notify();
        }

        return true;
    }

    // --- Profile Actions ---
    setNickname(name) {
        this.state.nickname = name;
        this._save(BASE_KEYS.NICKNAME, name);
        this._notify();
    }

    getNickname() {
        return this.state.nickname;
    }

    setAvatar(avatarData) {
        this.state.avatar = avatarData;
        this._save(BASE_KEYS.AVATAR, avatarData);
        this._notify();
    }

    getAvatar() {
        return this.state.avatar;
    }

    toggleSocial(platform) {
        if (this.state.socials[platform] !== undefined) {
            this.state.socials[platform] = !this.state.socials[platform];
            this._save(BASE_KEYS.SOCIALS, JSON.stringify(this.state.socials));
            this._notify();
            return this.state.socials[platform];
        }
        return false;
    }

    getSocials() {
        return this.state.socials;
    }

    getWallet() {
        return currentWallet;
    }

    // --- Transaction Log ---
    addTransaction(type, label, amount) {
        const tx = {
            type,
            label,
            amount,
            time: Date.now()
        };
        this.state.transactions.unshift(tx);
        if (this.state.transactions.length > 50) this.state.transactions.length = 50;
        this._save(BASE_KEYS.TRANSACTIONS, JSON.stringify(this.state.transactions));
    }

    getTransactions() {
        return this.state.transactions;
    }

    // --- Gamification Actions ---
    addXp(amount) {
        if (amount <= 0) return;
        this.state.xp += amount;

        let maxXp = this.getMaxXp();
        while (this.state.xp >= maxXp) {
            this.state.xp -= maxXp;
            this.state.level++;
            maxXp = this.getMaxXp();
        }

        this._save(BASE_KEYS.XP, this.state.xp);
        this._save(BASE_KEYS.LEVEL, this.state.level);
        this._notify();
    }

    setLevel(level) {
        if (level < 1) return;
        this.state.level = level;
        this.state.xp = 0;
        this._save(BASE_KEYS.LEVEL, this.state.level);
        this._save(BASE_KEYS.XP, this.state.xp);
        this._notify();
    }

    // --- Streak Logic (24h claim window) ---
    getLastStreakClaim() {
        return this.state.lastLogin ? parseInt(this.state.lastLogin) : 0;
    }

    claimStreak() {
        const now = Date.now();
        const lastClaim = this.getLastStreakClaim();
        const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;
        const FORTY_EIGHT_H = 48 * 60 * 60 * 1000;

        if (lastClaim === 0) {
            this.state.streak = 1;
            this.state.lastLogin = String(now);
            this._save(BASE_KEYS.STREAK, this.state.streak);
            this._save(BASE_KEYS.LAST_LOGIN, this.state.lastLogin);
            this._notify();
            return { success: true, streak: this.state.streak };
        }

        const elapsed = now - lastClaim;

        if (elapsed < TWENTY_FOUR_H) {
            return { success: false, remainingMs: TWENTY_FOUR_H - elapsed };
        }

        if (elapsed >= FORTY_EIGHT_H) {
            this.state.streak = 1;
        } else {
            this.state.streak += 1;
        }

        this.state.lastLogin = String(now);
        this._save(BASE_KEYS.STREAK, this.state.streak);
        this._save(BASE_KEYS.LAST_LOGIN, this.state.lastLogin);
        this._notify();
        return { success: true, streak: this.state.streak };
    }

    checkStreakExpiry() {
        const lastClaim = this.getLastStreakClaim();
        if (lastClaim === 0) return;

        const elapsed = Date.now() - lastClaim;
        const FORTY_EIGHT_H = 48 * 60 * 60 * 1000;

        if (elapsed >= FORTY_EIGHT_H && this.state.streak > 0) {
            this.state.streak = 0;
            this._save(BASE_KEYS.STREAK, 0);
            this._notify();
        }
    }

    // --- Supabase Sync ---
    async syncWithSupabase(walletAddress) {
        if (!walletAddress) {
            currentWallet = null;
            return;
        }
        currentWallet = walletAddress;

        let profile = await getUserProfile(currentWallet);

        if (!profile) {
            profile = await createUserProfile(currentWallet, this.state.nickname);
        }

        if (profile) {
            // Merge Supabase data into local state (cloud = priority)
            this.state.nickname = profile.nickname || this.state.nickname;
            this.state.totalScore = profile.balance !== undefined ? profile.balance : this.state.totalScore;
            this.state.xp = profile.xp !== undefined ? profile.xp : this.state.xp;
            this.state.level = profile.level !== undefined ? profile.level : this.state.level;
            this.state.streak = profile.streak !== undefined ? profile.streak : this.state.streak;

            // Sync socials to Supabase
            const socials = this.state.socials;
            const socialUpdates = {};
            if (socials.twitter && socials.twitter !== true) socialUpdates.twitter_handle = socials.twitter;
            if (socials.google && socials.google !== true) socialUpdates.google_email = socials.google;
            if (Object.keys(socialUpdates).length > 0) {
                updateUserProfile(currentWallet, socialUpdates).then(() => {
                    console.log("Synced socials to Supabase:", socialUpdates);
                }).catch(err => console.error("Failed to sync socials:", err));
            }

            // Persist merged state to localStorage (under current prefix)
            this._saveAll();
            this._notify();
        }
    }

    // --- Disconnect ---
    disconnect() {
        // If disconnecting a guest session, wipe all their data
        if (activePrefix.startsWith('guest')) {
            const guestPrefix = `litvm_${activePrefix}`;
            // Iterate backwards to avoid index issues while deleting
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && key.startsWith(guestPrefix)) {
                    localStorage.removeItem(key);
                }
            }
            // Also clear the session flag here to be safe
            localStorage.removeItem('isGuestSession');
        }

        currentWallet = null;
        activePrefix = '';
        localStorage.removeItem('litvm_active_account');
        // Reset in-memory state to defaults (no localStorage writes — data stays under its prefix)
        this.state = this._defaults();
        this._notify();
    }

    _saveAll() {
        this._save(BASE_KEYS.SCORE, this.state.totalScore);
        this._save(BASE_KEYS.NICKNAME, this.state.nickname);
        this._save(BASE_KEYS.AVATAR, this.state.avatar);
        this._save(BASE_KEYS.XP, this.state.xp);
        this._save(BASE_KEYS.LEVEL, this.state.level);
        this._save(BASE_KEYS.STREAK, this.state.streak);
        this._save(BASE_KEYS.LAST_LOGIN, this.state.lastLogin);
        this._save(BASE_KEYS.UNLOCKED_BADGES, JSON.stringify(this.state.unlockedBadges));
    }

    _save(baseKey, value) {
        const fullKey = _key(baseKey);
        localStorage.setItem(fullKey, value);

        // If wallet connected, sync specific fields to Supabase
        if (currentWallet) {
            const updates = {};
            if (baseKey === BASE_KEYS.SCORE) updates.balance = this.state.totalScore;
            if (baseKey === BASE_KEYS.NICKNAME) updates.nickname = this.state.nickname;
            if (baseKey === BASE_KEYS.XP) updates.xp = this.state.xp;
            if (baseKey === BASE_KEYS.LEVEL) updates.level = this.state.level;
            if (baseKey === BASE_KEYS.STREAK) updates.streak = this.state.streak;
            if (baseKey === BASE_KEYS.LAST_LOGIN) updates.last_login = this.state.lastLogin;
            if (baseKey === BASE_KEYS.SOCIALS) {
                const socials = this.state.socials;
                if (socials.twitter && socials.twitter !== true) updates.twitter_handle = socials.twitter;
                if (socials.google && socials.google !== true) updates.google_email = socials.google;
            }

            if (Object.keys(updates).length > 0) {
                updateUserProfile(currentWallet, updates);
            }
        }
    }

    // --- Observer ---
    subscribe(callback) {
        this.listeners.push(callback);
    }

    _notify() {
        this.listeners.forEach(cb => cb(this.state));
    }
}

// Export singleton instance
export const stateManager = new StateManager();
