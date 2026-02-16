/**
 * Badge Achievement Configuration
 * Each badge has an id, name, description, SVG icon, color theme, and unlock condition checker.
 */

// SVG icon paths (viewBox 0 0 24 24)
const BADGE_ICONS = {
    wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" fill="none" stroke="currentColor" stroke-width="2"/>',
    gamer: '<path d="M6 11h4M8 9v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="15" cy="10" r="1" fill="currentColor"/><circle cx="18" cy="13" r="1" fill="currentColor"/><path d="M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    veteran: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    twitter: '<path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    verified: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    coins: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6v12M9 9c0-1 1.5-2 3-2s3 1 3 2-1.5 2-3 2-3 1-3 2 1.5 2 3 2 3-1 3-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    streak: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    level: '<path d="M12 2L2 7l10 5 10-5-10-5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
};

export const BADGES = [
    {
        id: 'google',
        name: 'VERIFIED',
        description: 'Connect your Google account',
        icon: BADGE_ICONS.verified,
        image: 'assets/badges/badge-google.png',
        color: '#ffa500',
        check: (state) => !!state.socials?.google,
    },
    {
        id: 'twitter',
        name: 'SOCIAL',
        description: 'Connect your Twitter/X account',
        icon: BADGE_ICONS.twitter,
        image: 'assets/badges/badge-x.png',
        color: '#1DA1F2',
        check: (state) => !!state.socials?.twitter,
    },
    {
        id: 'gamer',
        name: 'GAMER',
        description: 'Play 5 games in any mode',
        icon: BADGE_ICONS.gamer,
        image: 'assets/badges/badge-gamer.png',
        color: '#bc13fe',
        check: (state) => state.gamesPlayed >= 5,
    },
    {
        id: 'leveled',
        name: 'EVOLVED',
        description: 'Reach Level 5',
        image: 'assets/badges/badge-evolved.png',
        icon: BADGE_ICONS.level, // Fallback for locked state
        color: '#e040fb',
        check: (state) => state.level >= 5,
    },
];
