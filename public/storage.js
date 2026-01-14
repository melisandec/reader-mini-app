/**
 * LocalStorage utility functions for READER app
 */

import { createUserStats, BADGES } from './models.js';

const STORAGE_KEYS = {
  SESSIONS: 'reader_sessions',
  STATS: 'reader_stats'
};

const COIN_REWARDS = {
  SESSION: 10,
  THREE_DAY_STREAK: 20,
  SEVEN_DAY_STREAK: 50
};

/**
 * Save a reading session to localStorage
 * @param {import('./models.js').ReadingSession} session
 * @returns {{success: boolean, coinsEarned: number, newBadges: string[]}}
 */
export function saveSession(session) {
  try {
    const sessions = loadSessions();
    const wasFirstSession = sessions.length === 0;
    
    sessions.push(session);
    
    // Sort by date (newest first)
    sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
    
    // Recalculate stats after saving
    const stats = recalculateStats();
    
    // Award coins and check badges
    const rewards = awardCoinsAndBadges(session, stats, wasFirstSession);
    
    return {
      success: true,
      coinsEarned: rewards.coinsEarned,
      newBadges: rewards.newBadges
    };
  } catch (error) {
    console.error('Error saving session:', error);
    return {
      success: false,
      coinsEarned: 0,
      newBadges: []
    };
  }
}

/**
 * Load all reading sessions from localStorage
 * @returns {import('./models.js').ReadingSession[]}
 */
export function loadSessions() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    if (!data) {
      return [];
    }
    
    const sessions = JSON.parse(data);
    // Validate that we have an array
    return Array.isArray(sessions) ? sessions : [];
  } catch (error) {
    console.error('Error loading sessions:', error);
    return [];
  }
}

/**
 * Get sessions for a specific date
 * @param {string} date - ISO date string (YYYY-MM-DD)
 * @returns {import('./models.js').ReadingSession[]}
 */
export function getSessionsByDate(date) {
  const sessions = loadSessions();
  return sessions.filter(session => session.date === date);
}

/**
 * Get sessions for a specific book
 * @param {string} bookName
 * @returns {import('./models.js').ReadingSession[]}
 */
export function getSessionsByBook(bookName) {
  const sessions = loadSessions();
  return sessions.filter(session => 
    session.bookName.toLowerCase() === bookName.toLowerCase()
  );
}

/**
 * Delete a session by ID
 * @param {string} sessionId
 * @returns {boolean}
 */
export function deleteSession(sessionId) {
  try {
    const sessions = loadSessions();
    const filtered = sessions.filter(s => s.id !== sessionId);
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(filtered));
    
    // Recalculate stats after deletion
    recalculateStats();
    
    return true;
  } catch (error) {
    console.error('Error deleting session:', error);
    return false;
  }
}

/**
 * Clear all sessions
 */
export function clearAllSessions() {
  try {
    localStorage.removeItem(STORAGE_KEYS.SESSIONS);
    localStorage.removeItem(STORAGE_KEYS.STATS);
    return true;
  } catch (error) {
    console.error('Error clearing sessions:', error);
    return false;
  }
}

/**
 * Recalculate user stats based on all sessions
 * @returns {import('./models.js').UserStats}
 */
export function recalculateStats() {
  try {
    const sessions = loadSessions();
    const existingStats = loadStats();
    
    // Preserve coins, badges, and daily goal from existing stats
    const stats = createUserStats();
    stats.coins = existingStats.coins || 0;
    stats.badges = existingStats.badges || [];
    stats.dailyGoal = existingStats.dailyGoal || 30;
    
    if (sessions.length === 0) {
      saveStats(stats);
      return stats;
    }
    
    // Calculate totals
    stats.totalPages = sessions.reduce((sum, session) => sum + session.pagesRead, 0);
    stats.totalMinutes = sessions.reduce((sum, session) => sum + session.minutesRead, 0);
    
    // Calculate average speed
    if (stats.totalMinutes > 0) {
      stats.averageSpeed = parseFloat((stats.totalPages / stats.totalMinutes).toFixed(2));
    }
    
    // Calculate streaks
    const streakData = calculateStreaks(sessions);
    stats.currentStreak = streakData.currentStreak;
    stats.longestStreak = streakData.longestStreak;
    
    // Save updated stats
    saveStats(stats);
    
    return stats;
  } catch (error) {
    console.error('Error recalculating stats:', error);
    return createUserStats();
  }
}

/**
 * Calculate reading streaks from sessions
 * @param {import('./models.js').ReadingSession[]} sessions
 * @returns {{currentStreak: number, longestStreak: number}}
 */
function calculateStreaks(sessions) {
  if (sessions.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }
  
  // Get unique dates and sort them (newest first)
  const uniqueDates = [...new Set(sessions.map(s => s.date))].sort((a, b) => 
    new Date(b) - new Date(a)
  );
  
  // Calculate current streak
  // Streak continues if there's reading on consecutive days
  // Starting from today or yesterday (if today has no reading)
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  let currentStreak = 0;
  let checkDate = today;
  
  // If today has no reading, start from yesterday
  if (!uniqueDates.includes(today)) {
    checkDate = yesterday;
  }
  
  // Count consecutive days backwards from checkDate
  for (let i = 0; i < uniqueDates.length; i++) {
    const expectedDate = new Date(checkDate);
    expectedDate.setDate(expectedDate.getDate() - i);
    const expectedDateStr = expectedDate.toISOString().split('T')[0];
    
    if (uniqueDates.includes(expectedDateStr)) {
      currentStreak++;
    } else {
      // Break streak if a day is missing
      break;
    }
  }
  
  // Calculate longest streak
  // Go through all dates and find the longest consecutive sequence
  let longestStreak = 0;
  let tempStreak = 1;
  
  // Sort dates chronologically (oldest first) for longest streak calculation
  const sortedDates = [...uniqueDates].sort((a, b) => new Date(a) - new Date(b));
  
  for (let i = 1; i < sortedDates.length; i++) {
    const currentDate = new Date(sortedDates[i]);
    const previousDate = new Date(sortedDates[i - 1]);
    const daysDiff = Math.floor((currentDate - previousDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 1) {
      // Consecutive day
      tempStreak++;
    } else {
      // Break in streak
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, tempStreak);
  
  return { currentStreak, longestStreak };
}

/**
 * Load user stats from localStorage
 * @returns {import('./models.js').UserStats}
 */
export function loadStats() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.STATS);
    if (!data) {
      // If no stats exist, recalculate them
      return recalculateStats();
    }
    
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading stats:', error);
    return recalculateStats();
  }
}

/**
 * Save user stats to localStorage
 * @param {import('./models.js').UserStats} stats
 */
export function saveStats(stats) {
  try {
    localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));
    return true;
  } catch (error) {
    console.error('Error saving stats:', error);
    return false;
  }
}

/**
 * Compare today's reading speed with user's average speed
 * @returns {{message: string, todaySpeed: number, averageSpeed: number, ratio: number, isFaster: boolean}}
 */
export function compareTodaySpeed() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const todaySessions = getSessionsByDate(today);
    const stats = loadStats();
    
    // If no sessions today, return null
    if (todaySessions.length === 0) {
      return {
        message: null,
        todaySpeed: 0,
        averageSpeed: stats.averageSpeed,
        ratio: 0,
        isFaster: false
      };
    }
    
    // Calculate today's total pages and minutes
    const todayPages = todaySessions.reduce((sum, session) => sum + session.pagesRead, 0);
    const todayMinutes = todaySessions.reduce((sum, session) => sum + session.minutesRead, 0);
    
    // Calculate today's average speed
    const todaySpeed = todayMinutes > 0 ? parseFloat((todayPages / todayMinutes).toFixed(2)) : 0;
    
    // If no average speed yet (no historical data), return null
    if (stats.averageSpeed === 0 || stats.averageSpeed === null) {
      return {
        message: null,
        todaySpeed,
        averageSpeed: 0,
        ratio: 0,
        isFaster: false
      };
    }
    
    // Calculate ratio
    const ratio = parseFloat((todaySpeed / stats.averageSpeed).toFixed(2));
    const isFaster = todaySpeed > stats.averageSpeed;
    
    // Generate message
    let message;
    if (isFaster && ratio >= 1.1) {
      // Significantly faster (at least 10% faster)
      message = `You are ${ratio.toFixed(1)}x faster than your usual speed today.`;
    } else if (isFaster && ratio < 1.1) {
      // Slightly faster (less than 10% difference)
      message = `You're reading slightly faster than your usual speed today.`;
    } else if (!isFaster && ratio >= 0.9) {
      // Slightly slower (within 10% of average)
      message = `You're slightly slower today, consistency matters.`;
    } else {
      // Significantly slower (more than 10% slower)
      message = `You're slower today, consistency matters.`;
    }
    
    return {
      message,
      todaySpeed,
      averageSpeed: stats.averageSpeed,
      ratio,
      isFaster
    };
  } catch (error) {
    console.error('Error comparing today speed:', error);
    return {
      message: null,
      todaySpeed: 0,
      averageSpeed: 0,
      ratio: 0,
      isFaster: false
    };
  }
}

/**
 * Award coins and check for badges when a session is saved
 * @param {import('./models.js').ReadingSession} session
 * @param {import('./models.js').UserStats} stats
 * @param {boolean} wasFirstSession
 * @returns {{coinsEarned: number, newBadges: string[]}}
 */
function awardCoinsAndBadges(session, stats, wasFirstSession) {
  let coinsEarned = 0;
  const newBadges = [];
  const currentStats = loadStats();
  
  // Award coins for logging a session
  coinsEarned += COIN_REWARDS.SESSION;
  
  // Award coins for streak milestones
  if (stats.currentStreak === 3) {
    coinsEarned += COIN_REWARDS.THREE_DAY_STREAK;
  }
  if (stats.currentStreak === 7) {
    coinsEarned += COIN_REWARDS.SEVEN_DAY_STREAK;
  }
  
  // Update coins
  currentStats.coins = (currentStats.coins || 0) + coinsEarned;
  
  // Check for badges
  const badges = currentStats.badges || [];
  
  // First Session badge
  if (wasFirstSession && !badges.includes(BADGES.FIRST_SESSION.id)) {
    badges.push(BADGES.FIRST_SESSION.id);
    newBadges.push(BADGES.FIRST_SESSION.id);
  }
  
  // 3-Day Streak badge
  if (stats.currentStreak >= 3 && !badges.includes(BADGES.THREE_DAY_STREAK.id)) {
    badges.push(BADGES.THREE_DAY_STREAK.id);
    newBadges.push(BADGES.THREE_DAY_STREAK.id);
  }
  
  // Speed Demon badge (20% faster than average)
  // Calculate average speed excluding current session for accurate comparison
  const allSessions = loadSessions();
  const sessionsExcludingCurrent = allSessions.filter(s => s.id !== session.id);
  if (sessionsExcludingCurrent.length > 0) {
    const totalPagesExcluding = sessionsExcludingCurrent.reduce((sum, s) => sum + s.pagesRead, 0);
    const totalMinutesExcluding = sessionsExcludingCurrent.reduce((sum, s) => sum + s.minutesRead, 0);
    const avgSpeedExcluding = totalMinutesExcluding > 0 ? totalPagesExcluding / totalMinutesExcluding : 0;
    
    if (avgSpeedExcluding > 0 && session.calculatedSpeed > 0) {
      const speedRatio = session.calculatedSpeed / avgSpeedExcluding;
      if (speedRatio >= 1.2 && !badges.includes(BADGES.SPEED_DEMON.id)) {
        badges.push(BADGES.SPEED_DEMON.id);
        newBadges.push(BADGES.SPEED_DEMON.id);
      }
    }
  }
  
  // Marathon Reader badge (60+ minutes)
  if (session.minutesRead >= 60 && !badges.includes(BADGES.MARATHON_READER.id)) {
    badges.push(BADGES.MARATHON_READER.id);
    newBadges.push(BADGES.MARATHON_READER.id);
  }
  
  // Update stats with new coins and badges
  currentStats.coins = currentStats.coins;
  currentStats.badges = badges;
  saveStats(currentStats);
  
  return { coinsEarned, newBadges };
}

/**
 * Get all earned badges with their details
 * @returns {Array<{id: string, name: string, description: string, icon: string}>}
 */
export function getEarnedBadges() {
  const stats = loadStats();
  const earnedBadgeIds = stats.badges || [];
  
  return Object.values(BADGES).filter(badge => 
    earnedBadgeIds.includes(badge.id)
  );
}

/**
 * Get today's reading minutes
 * @returns {number}
 */
export function getTodayMinutes() {
  const today = new Date().toISOString().split('T')[0];
  const todaySessions = getSessionsByDate(today);
  return todaySessions.reduce((sum, session) => sum + session.minutesRead, 0);
}

/**
 * Update daily goal
 * @param {number} minutes
 */
export function updateDailyGoal(minutes) {
  const stats = loadStats();
  stats.dailyGoal = minutes;
  saveStats(stats);
}

/**
 * Get daily goal
 * @returns {number}
 */
export function getDailyGoal() {
  const stats = loadStats();
  return stats.dailyGoal || 30;
}
