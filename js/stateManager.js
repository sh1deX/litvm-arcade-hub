import { getUserProfile, createUserProfile, updateUserProfile } from './supabaseClient.js';

let currentWallet = null; // Track connected wallet for sync

/**
 * Global State Manager
 * Handles data persistence using localStorage and Supabase.
 * 
 * Keys in localStorage:
 * - litvm_score: Total LitCoins
 * - litvm_records: Object { gameId: highScore }
 * - litvm_tasks: Array of completed task IDs
 */

const STORAGE_KEYS = {
    SCORE: 'litvm_score',
    RECORDS: 'litvm_records',
    TASKS: 'litvm_tasks',
    TRANSACTIONS: 'litvm_transactions'
};

class StateManager {
    constructor() {
        this.state = {
            totalScore: parseInt(localStorage.getItem(STORAGE_KEYS.SCORE) || '0'),
            gameRecords: JSON.parse(localStorage.getItem(STORAGE_KEYS.RECORDS) || '{}'),
            completedTasks: JSON.parse(localStorage.getItem(STORAGE_KEYS.TASKS) || '[]'),
            // Profile Data
            nickname: localStorage.getItem('litvm_nickname') || 'Guest',
            avatar: localStorage.getItem('litvm_avatar') || '1',
            socials: JSON.parse(localStorage.getItem('litvm_socials') || '{"twitter":false, "email":false}'),
            // Streak Data
            streak: parseInt(localStorage.getItem('litvm_streak') || '0'),
            lastLogin: localStorage.getItem('litvm_last_login') || null,
            // Gamification
            xp: parseInt(localStorage.getItem('litvm_xp') || '0'),
            level: parseInt(localStorage.getItem('litvm_level') || '1'),
            gamesPlayed: parseInt(localStorage.getItem('litvm_games_played') || '0'),
            // Transactions
            transactions: JSON.parse(localStorage.getItem(STORAGE_KEYS.TRANSACTIONS) || '[]'),
            // Badge Timestamps for Sorting
            unlockedBadges: JSON.parse(localStorage.getItem('litvm_unlocked_badges') || '{}')
        };

        // Listeners for state changes (simple simplified observer pattern)
        this.listeners = [];
    }

    setSocials(socialsData) {
        this.state.socials = socialsData;
        this._save('litvm_socials', JSON.stringify(socialsData));
        this._notify();
    }

    // --- Badge Logic ---
    registerBadgeUnlock(badgeId) {
        if (!this.state.unlockedBadges[badgeId]) {
            this.state.unlockedBadges[badgeId] = Date.now();
            this._save('litvm_unlocked_badges', JSON.stringify(this.state.unlockedBadges));
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
        this._save('litvm_games_played', this.state.gamesPlayed);
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
    getMaxXp() { return this.state.level * 100; } // Linear growth formulation: Level * 100

    // --- Setters / Actions ---
    addScore(amount, label) {
        if (amount <= 0) return;
        this.state.totalScore += amount;
        this._save(STORAGE_KEYS.SCORE, this.state.totalScore);
        this.addTransaction('earn', label || 'Coins Earned', amount);
        this._notify();
    }

    updateRecord(gameId, score) {
        const currentRecord = this.getRecord(gameId);
        if (score > currentRecord) {
            this.state.gameRecords[gameId] = score;
            this._save(STORAGE_KEYS.RECORDS, JSON.stringify(this.state.gameRecords));
            this._notify();
            return true; // New record!
        }
        return false;
    }

    // Updated to include XP Reward
    completeTask(taskId, reward, xpReward = 0) {
        if (this.isTaskCompleted(taskId)) return false;

        this.state.completedTasks.push(taskId);
        this._save(STORAGE_KEYS.TASKS, JSON.stringify(this.state.completedTasks));

        let stateChanged = false;
        if (reward > 0) { this.addScore(reward); stateChanged = true; }
        if (xpReward > 0) { this.addXp(xpReward); stateChanged = true; }

        // If neither addScore nor addXp triggered, notify manually
        if (!stateChanged) {
            this._notify();
        }

        return true;
    }

    // --- Profile Actions ---
    setNickname(name) {
        this.state.nickname = name;
        this._save('litvm_nickname', name);
        this._notify();
    }

    getNickname() {
        return this.state.nickname;
    }

    setAvatar(avatarData) {
        this.state.avatar = avatarData;
        this._save('litvm_avatar', avatarData);
        this._notify();
    }

    getAvatar() {
        return this.state.avatar;
    }

    toggleSocial(platform) {
        if (this.state.socials[platform] !== undefined) {
            this.state.socials[platform] = !this.state.socials[platform];
            this._save('litvm_socials', JSON.stringify(this.state.socials));
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
            type,   // 'earn', 'spend', 'reward', 'streak'
            label,
            amount,
            time: Date.now()
        };
        this.state.transactions.unshift(tx);
        // Keep max 50
        if (this.state.transactions.length > 50) this.state.transactions.length = 50;
        this._save(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(this.state.transactions));
    }

    getTransactions() {
        return this.state.transactions;
    }

    // --- Gamification Actions ---
    addXp(amount) {
        if (amount <= 0) return;
        this.state.xp += amount;

        // Level Up Logic
        let maxXp = this.getMaxXp();
        // Use while loop in case multiple levels are gained at once
        while (this.state.xp >= maxXp) {
            this.state.xp -= maxXp;
            this.state.level++;
            maxXp = this.getMaxXp();
            // Potential: trigger level up event logic here if needed, but UI usually handles via state update
        }

        this._save('litvm_xp', this.state.xp);
        this._save('litvm_level', this.state.level);
        this._notify();
    }

    setLevel(level) {
        if (level < 1) return;
        this.state.level = level;
        this.state.xp = 0; // Reset XP for the new level
        this._save('litvm_level', this.state.level);
        this._save('litvm_xp', this.state.xp);
        this._notify();
    }

    // --- Streak Logic (24h claim window) ---
    getLastStreakClaim() {
        return this.state.lastLogin ? parseInt(this.state.lastLogin) : 0;
    }

    /**
     * Attempt to claim the daily streak.
     * @returns {{ success: boolean, streak?: number, remainingMs?: number }}
     */
    claimStreak() {
        const now = Date.now();
        const lastClaim = this.getLastStreakClaim();
        const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;
        const FORTY_EIGHT_H = 48 * 60 * 60 * 1000;

        if (lastClaim === 0) {
            // First ever claim
            this.state.streak = 1;
            this.state.lastLogin = String(now);
            this._save('litvm_streak', this.state.streak);
            this._save('litvm_last_login', this.state.lastLogin);
            this._notify();
            return { success: true, streak: this.state.streak };
        }

        const elapsed = now - lastClaim;

        if (elapsed < TWENTY_FOUR_H) {
            // Too early — show remaining time
            return { success: false, remainingMs: TWENTY_FOUR_H - elapsed };
        }

        if (elapsed >= FORTY_EIGHT_H) {
            // Missed the window — streak resets
            this.state.streak = 1;
        } else {
            // Within 24h–48h window — consecutive claim
            this.state.streak += 1;
        }

        this.state.lastLogin = String(now);
        this._save('litvm_streak', this.state.streak);
        this._save('litvm_last_login', this.state.lastLogin);
        this._notify();
        return { success: true, streak: this.state.streak };
    }

    /**
     * Check if the streak has expired (>48h since last claim) and reset if so.
     * Called on app init to keep the UI accurate.
     */
    checkStreakExpiry() {
        const lastClaim = this.getLastStreakClaim();
        if (lastClaim === 0) return;

        const elapsed = Date.now() - lastClaim;
        const FORTY_EIGHT_H = 48 * 60 * 60 * 1000;

        if (elapsed >= FORTY_EIGHT_H && this.state.streak > 0) {
            this.state.streak = 0;
            this._save('litvm_streak', 0);
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

        // Fetch profile
        let profile = await getUserProfile(currentWallet);

        if (!profile) {
            // First time user? Create profile
            // Use current local state as initial values if appropriate, or default
            profile = await createUserProfile(currentWallet, this.state.nickname);
        }

        if (profile) {
            // Merge Supabase data into local state
            // Prioritize Supabase data as "cloud save"
            this.state.nickname = profile.nickname || this.state.nickname;
            this.state.totalScore = profile.balance !== undefined ? profile.balance : this.state.totalScore;
            this.state.xp = profile.xp !== undefined ? profile.xp : this.state.xp;
            this.state.level = profile.level !== undefined ? profile.level : this.state.level;
            this.state.streak = profile.streak !== undefined ? profile.streak : this.state.streak;

            // Sync socials to Supabase (twitter_handle, google_email)
            const socials = this.state.socials;
            const socialUpdates = {};
            if (socials.twitter && socials.twitter !== true) socialUpdates.twitter_handle = socials.twitter;
            if (socials.google && socials.google !== true) socialUpdates.google_email = socials.google;
            if (Object.keys(socialUpdates).length > 0) {
                updateUserProfile(currentWallet, socialUpdates).then(() => {
                    console.log("Synced socials to Supabase:", socialUpdates);
                }).catch(err => console.error("Failed to sync socials:", err));
            }

            // Persist merged state to local storage
            this._saveAll();
            this._notify();
        }
    }

    // --- Disconnect / Reset ---
    disconnect() {
        currentWallet = null;
        // Optionally reset local state to defaults or keep as cached?
        // For security/privacy, better to reset to Guest defaults
        this.state.nickname = 'Guest';
        this.state.avatar = '1';
        this.state.totalScore = 0;
        this.state.gameRecords = {};
        this.state.completedTasks = [];
        this.state.socials = { twitter: false, google: false };
        this.state.streak = 0;
        this.state.lastLogin = null;
        this.state.xp = 0;
        this.state.level = 1;
        this.state.unlockedBadges = {};

        this._saveAll(); // Overwrite local storage with defaults
        this._notify();
    }

    _saveAll() {
        this._save(STORAGE_KEYS.SCORE, this.state.totalScore);
        this._save('litvm_nickname', this.state.nickname);
        this._save('litvm_avatar', this.state.avatar);
        this._save('litvm_xp', this.state.xp);
        this._save('litvm_level', this.state.level);
        this._save('litvm_streak', this.state.streak);
        this._save('litvm_last_login', this.state.lastLogin);
        this._save('litvm_unlocked_badges', JSON.stringify(this.state.unlockedBadges));
    }

    _save(key, value) {
        localStorage.setItem(key, value);

        // If wallet connected, sync specific fields to Supabase
        if (currentWallet) {
            const updates = {};
            if (key === STORAGE_KEYS.SCORE) updates.balance = this.state.totalScore;
            if (key === 'litvm_nickname') updates.nickname = this.state.nickname;
            if (key === 'litvm_xp') updates.xp = this.state.xp;
            if (key === 'litvm_level') updates.level = this.state.level;
            if (key === 'litvm_streak') updates.streak = this.state.streak;
            if (key === 'litvm_last_login') updates.last_login = this.state.lastLogin;
            if (key === 'litvm_socials') {
                const socials = this.state.socials;
                if (socials.twitter && socials.twitter !== true) updates.twitter_handle = socials.twitter;
                if (socials.google && socials.google !== true) updates.google_email = socials.google;
            }

            if (Object.keys(updates).length > 0) {
                // Debounce could be good here, but for now direct update
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
