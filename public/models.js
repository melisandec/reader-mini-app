/**
 * Core data models for READER app
 */

/**
 * @typedef {Object} ReadingSession
 * @property {string} id - Unique session identifier
 * @property {string} bookName - Name of the book being read
 * @property {number} pagesRead - Number of pages read in this session
 * @property {number} minutesRead - Number of minutes spent reading
 * @property {string} date - ISO date string (YYYY-MM-DD)
 * @property {number} calculatedSpeed - Pages per minute (calculated)
 */

/**
 * @typedef {Object} UserStats
 * @property {number} averageSpeed - Average pages per minute across all sessions
 * @property {number} totalPages - Total pages read across all sessions
 * @property {number} totalMinutes - Total minutes spent reading
 * @property {number} currentStreak - Current consecutive days with reading
 * @property {number} longestStreak - Longest consecutive days with reading
 * @property {number} coins - Total coins earned
 * @property {string[]} badges - Array of earned badge IDs
 * @property {number} dailyGoal - Daily reading goal in minutes
 */

/**
 * Creates a new ReadingSession object
 * @param {string} bookName
 * @param {number} pagesRead
 * @param {number} minutesRead
 * @param {string} [date] - Optional date string, defaults to today
 * @returns {ReadingSession}
 */
export function createReadingSession(bookName, pagesRead, minutesRead, date = null) {
  const sessionDate = date || new Date().toISOString().split('T')[0];
  const calculatedSpeed = minutesRead > 0 ? pagesRead / minutesRead : 0;
  
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    bookName: bookName.trim(),
    pagesRead,
    minutesRead,
    date: sessionDate,
    calculatedSpeed: parseFloat(calculatedSpeed.toFixed(2))
  };
}

/**
 * Creates a new UserStats object with default values
 * @returns {UserStats}
 */
export function createUserStats() {
  return {
    averageSpeed: 0,
    totalPages: 0,
    totalMinutes: 0,
    currentStreak: 0,
    longestStreak: 0,
    coins: 0,
    badges: [],
    dailyGoal: 30 // Default 30 minutes per day
  };
}

/**
 * Badge definitions
 */
export const BADGES = {
  FIRST_SESSION: {
    id: 'first_session',
    name: 'First Step',
    description: 'You started. That\'s the hardest part.',
    icon: '🎯'
  },
  THREE_DAY_STREAK: {
    id: 'three_day_streak',
    name: 'Building Momentum',
    description: 'Three days of showing up. You\'re building something real.',
    icon: '🔥'
  },
  SPEED_DEMON: {
    id: 'speed_demon',
    name: 'In the Flow',
    description: 'You found your rhythm. Reading feels natural now.',
    icon: '⚡'
  },
  MARATHON_READER: {
    id: 'marathon_reader',
    name: 'Deep Dive',
    description: 'An hour of reading. You gave yourself the gift of time.',
    icon: '🏃'
  }
};

/**
 * @typedef {Object} ReadingChallenge
 * @property {string} id - Unique challenge identifier
 * @property {string} type - 'weekly' | 'monthly' | 'friend' | 'community'
 * @property {string} title - Challenge title
 * @property {string} description - Challenge description
 * @property {string} goalType - 'pages' | 'minutes' | 'sessions' | 'streak'
 * @property {number} goalValue - Target value to achieve
 * @property {string} startDate - ISO date string (YYYY-MM-DD)
 * @property {string} endDate - ISO date string (YYYY-MM-DD)
 * @property {string} createdBy - FID or username of creator
 * @property {string[]} participants - Array of participant FIDs/usernames
 * @property {boolean} isPublic - Whether challenge is public/community-wide
 * @property {number} rewardCoins - Coins awarded for completion
 * @property {string} createdAt - ISO timestamp
 */

/**
 * @typedef {Object} ChallengeProgress
 * @property {string} challengeId - Challenge identifier
 * @property {string} userId - User FID or username
 * @property {number} currentValue - Current progress value
 * @property {number} goalValue - Target value
 * @property {boolean} completed - Whether challenge is completed
 * @property {string} completedAt - ISO timestamp when completed (if applicable)
 * @property {number} rank - User's rank in challenge leaderboard
 */

/**
 * Creates a new ReadingChallenge object
 * @param {Object} options
 * @returns {ReadingChallenge}
 */
export function createReadingChallenge({
  type,
  title,
  description,
  goalType,
  goalValue,
  startDate,
  endDate,
  createdBy,
  isPublic = false,
  rewardCoins = 100,
  participants = []
}) {
  return {
    id: `challenge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    title,
    description,
    goalType,
    goalValue,
    startDate,
    endDate,
    createdBy,
    participants: [...participants, createdBy],
    isPublic,
    rewardCoins,
    createdAt: new Date().toISOString()
  };
}

/**
 * Creates a new ChallengeProgress object
 * @param {string} challengeId
 * @param {string} userId
 * @param {number} goalValue
 * @returns {ChallengeProgress}
 */
export function createChallengeProgress(challengeId, userId, goalValue) {
  return {
    challengeId,
    userId,
    currentValue: 0,
    goalValue,
    completed: false,
    completedAt: null,
    rank: 0
  };
}
