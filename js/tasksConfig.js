/**
 * Tasks Configuration
 * Defines available missions/quests for the user.
 */

import { stateManager } from './stateManager.js';

// SVG Icon Library for Tasks
const TASK_ICONS = {
    // Flame icon — Fire orange glow
    flame: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff5722" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 4px rgba(255,87,34,0.6))"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
    // Gamepad icon — Purple glow
    gamepad: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#bc13fe" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 4px rgba(188,19,254,0.6))"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>`,
    // Coins icon — Yellow glow
    coins: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fcd116" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 4px rgba(252,209,22,0.6))"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>`,
};

export const TASKS = [
    {
        id: 'task_daily_checkin',
        title: 'System Check-In',
        description: 'Claim your daily streak to power up.',
        type: 'checkin',
        icon: TASK_ICONS.flame,
        accentColor: 'var(--color-primary)',   // Cyan
        targetValue: 1,
        reward: 50,
        xpReward: 25
    },
    {
        id: 'task_play_2048',
        title: 'Grid Runner',
        description: 'Play 1 round of 2048.',
        type: 'play_game',
        icon: TASK_ICONS.gamepad,
        gameId: 'lit-2048',
        accentColor: 'var(--color-secondary)', // Purple
        targetValue: 1,
        reward: 75,
        xpReward: 40
    },
    {
        id: 'task_earn_100',
        title: 'Credit Hoarder',
        description: 'Accumulate 100 Coins.',
        type: 'earn_coins',
        icon: TASK_ICONS.coins,
        accentColor: 'var(--color-accent)',     // Yellow
        targetValue: 100,
        reward: 150,
        xpReward: 75
    }
];

/**
 * Gets real-time progress for a task based on its type.
 * @param {object} task - Task definition from TASKS array
 * @returns {number} Current progress value
 */
export function getTaskProgress(task) {
    switch (task.type) {
        case 'checkin': {
            const lastClaim = stateManager.getLastStreakClaim();
            if (lastClaim === 0) return 0;
            const elapsed = Date.now() - lastClaim;
            // Claimed within the last 24h = done
            return elapsed < 24 * 60 * 60 * 1000 ? 1 : 0;
        }
        case 'play_game':
            return stateManager.getGamesPlayed();
        case 'earn_coins':
            return Math.min(stateManager.getScore(), task.targetValue);
        default:
            return 0;
    }
}

/**
 * Checks if tasks are completed based on game results.
 * Called after each game ends.
 * @param {string} gameId - The ID of the game played.
 * @param {object} resultData - Data returned from the game.
 * @returns {Array} - Array of completed tasks in this session.
 */
export function checkTaskCompletion(gameId, resultData) {
    const completedInSession = [];

    TASKS.forEach(task => {
        if (stateManager.isTaskCompleted(task.id)) return;

        const progress = getTaskProgress(task);
        const isReady = progress >= task.targetValue;

        // Auto-complete tasks that don't need manual claiming
        // (only tasks tied to a game round auto-fire here)
        if (task.type === 'play_game' && task.gameId === gameId && isReady) {
            // Don't auto-complete — let user hit CLAIM
        }
    });

    return completedInSession;
}
