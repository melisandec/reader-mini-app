import { sdk } from '@farcaster/miniapp-sdk';
import { loadStats, recalculateStats, getEarnedBadges, loadSessions, getTodayMinutes, updateDailyGoal, getDailyGoal, saveSession, deleteSession, getSessionsByDate } from './storage.js';
import { BADGES, createReadingSession } from './models.js';

// Global user state
let currentUser = null;

// Focus Mode timer state
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;
let timerStartTime = null;

// Initialize the Farcaster Mini App SDK
async function init() {
  try {
    // Initialize dark mode
    initDarkMode();
    
    // Signal that the app is ready to display
    // This hides the splash screen
    await sdk.actions.ready();
    
    // Get user information from Farcaster
    await identifyUser();
    
    // Set time-based greeting
    updateTimeBasedGreeting();
    
    // Initialize previous stats tracking
    const stats = recalculateStats();
    savePreviousStats(stats);
    
    // Load and display stats
    displayStats();
    
    console.log('READER app initialized');
  } catch (error) {
    console.error('Error initializing app:', error);
  }
}

/**
 * Get encouraging success message
 */
function getSuccessMessage(coinsEarned, newBadges) {
  const messages = [
    `You did it! ${coinsEarned} coins earned. Every session matters. 🎉`,
    `Well done! ${coinsEarned} coins added to your rewards. Keep going! ✨`,
    `Amazing! ${coinsEarned} coins earned. You're building something beautiful. 🌟`,
    `You showed up. ${coinsEarned} coins earned. That's what matters. 💙`
  ];
  
  let message = messages[Math.floor(Math.random() * messages.length)];
  
  if (newBadges && newBadges.length > 0) {
    message += `\n\nYou earned a new badge${newBadges.length > 1 ? 's' : ''}! 🏆`;
  }
  
  return message;
}

/**
 * Check if goal is completed and celebrate
 */
function checkGoalCompletion(stats) {
  const todayMinutes = getTodayMinutes();
  const goal = getDailyGoal();
  
  if (todayMinutes >= goal && goal > 0) {
    // Check if we've already celebrated today
    const lastCelebration = localStorage.getItem('last_goal_celebration');
    const today = new Date().toISOString().split('T')[0];
    
    if (lastCelebration !== today) {
      setTimeout(() => {
        showNotification('You did it! You reached your goal today. Take a moment to appreciate that. 🎉', 5000);
        localStorage.setItem('last_goal_celebration', today);
      }, 2000);
    }
  }
}

/**
 * Check for milestones and prompt to share
 */
function checkMilestonesAndPromptShare(result, stats, previousStats, session = null) {
  const milestones = [];
  
  // Check for new badges
  if (result.newBadges && result.newBadges.length > 0) {
    const badgeNames = result.newBadges.map(badgeId => {
      const badge = Object.values(BADGES).find(b => b.id === badgeId);
      return badge ? badge.name : badgeId;
    });
    
    milestones.push({
      type: 'badge',
      message: `📚 Just unlocked a new badge on READER: ${badgeNames.join(', ')}!\nBuilding a daily reading habit on Farcaster.`
    });
  }
  
  // Check for streak milestones
  const streakMilestones = [3, 7, 14, 30, 50, 100];
  if (previousStats && stats.currentStreak !== previousStats.currentStreak) {
    const newStreak = stats.currentStreak;
    if (streakMilestones.includes(newStreak)) {
      milestones.push({
        type: 'streak',
        message: `📚 Just hit a ${newStreak}-day reading streak on READER!\nBuilding a daily reading habit on Farcaster.`
      });
    }
  }
  
  // Check for new personal speed record
  if (session && session.calculatedSpeed > 0) {
    const previousMaxSpeed = localStorage.getItem('reader_max_speed');
    const currentSpeed = session.calculatedSpeed;
    
    if (!previousMaxSpeed || currentSpeed > parseFloat(previousMaxSpeed)) {
      // Only prompt if it's a significant improvement (at least 10% faster)
      if (!previousMaxSpeed || currentSpeed >= parseFloat(previousMaxSpeed) * 1.1) {
        localStorage.setItem('reader_max_speed', currentSpeed.toString());
        milestones.push({
          type: 'speed',
          message: `📚 Just set a new personal reading speed record on READER: ${currentSpeed.toFixed(2)} pages/min!\nBuilding a daily reading habit on Farcaster.`
        });
      }
    }
  }
  
  // Show share prompt for the first milestone
  if (milestones.length > 0) {
    setTimeout(() => {
      promptShareMilestone(milestones[0]);
    }, 2500);
  }
  
  // Save current stats for next comparison
  savePreviousStats(stats);
}

/**
 * Save previous stats for milestone comparison
 */
function savePreviousStats(stats) {
  try {
    localStorage.setItem('reader_previous_stats', JSON.stringify({
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
      averageSpeed: stats.averageSpeed,
      totalPages: stats.totalPages,
      badges: stats.badges || []
    }));
  } catch (error) {
    console.error('Error saving previous stats:', error);
  }
}

/**
 * Load previous stats for milestone comparison
 */
function loadPreviousStats() {
  try {
    const data = localStorage.getItem('reader_previous_stats');
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error loading previous stats:', error);
    return null;
  }
}

/**
 * Prompt user to share milestone
 */
async function promptShareMilestone(milestone) {
  // Create a modal/prompt for sharing
  const sharePrompt = document.createElement('div');
  sharePrompt.className = 'share-prompt';
  sharePrompt.innerHTML = `
    <div class="share-prompt-content">
      <div class="share-prompt-icon">🎉</div>
      <div class="share-prompt-title">Celebrate Your Achievement!</div>
      <div class="share-prompt-message">${milestone.message.split('\n')[0]}</div>
      <div class="share-prompt-actions">
        <button class="share-prompt-share" id="sharePromptShare">Share on Farcaster</button>
        <button class="share-prompt-dismiss" id="sharePromptDismiss">Maybe Later</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(sharePrompt);
  
  // Animate in
  setTimeout(() => {
    sharePrompt.classList.add('show');
  }, 10);
  
  // Setup handlers
  const shareBtn = document.getElementById('sharePromptShare');
  const dismissBtn = document.getElementById('sharePromptDismiss');
  
  shareBtn.addEventListener('click', async () => {
    try {
      await shareAchievementMessage(milestone.message);
      sharePrompt.remove();
    } catch (error) {
      console.error('Error sharing:', error);
      showNotification('Sharing isn\'t available right now, but your achievement is still real and meaningful. 💙');
    }
  });
  
  dismissBtn.addEventListener('click', () => {
    sharePrompt.classList.remove('show');
    setTimeout(() => sharePrompt.remove(), 300);
  });
  
  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    if (sharePrompt.parentNode) {
      sharePrompt.classList.remove('show');
      setTimeout(() => sharePrompt.remove(), 300);
    }
  }, 10000);
}

/**
 * Share achievement message on Farcaster
 */
async function shareAchievementMessage(message) {
  try {
    await sdk.actions.composeCast({
      text: message
    });
    showNotification('Shared! Your achievement is now on Farcaster. 🎉');
  } catch (error) {
    console.error('Error sharing achievement:', error);
    throw error;
  }
}

/**
 * Get time-based greeting and messaging
 */
function getTimeBasedMessage() {
  const hour = new Date().getHours();
  const sessions = loadSessions();
  const today = new Date().toISOString().split('T')[0];
  const todaySessions = getSessionsByDate(today);
  const hasReadToday = todaySessions.length > 0;
  
  if (hour >= 5 && hour < 12) {
    // Morning (5 AM - 12 PM)
    return {
      greeting: "Ready to read today? 📚",
      subtitle: hasReadToday 
        ? "You're already off to a great start" 
        : "Every page you turn is progress",
      eveningMessage: null
    };
  } else if (hour >= 12 && hour < 17) {
    // Afternoon (12 PM - 5 PM)
    return {
      greeting: "How's your reading going? 📖",
      subtitle: hasReadToday 
        ? "Keep the momentum going" 
        : "Even a few minutes makes a difference",
      eveningMessage: null
    };
  } else if (hour >= 17 && hour < 22) {
    // Evening (5 PM - 10 PM)
    return {
      greeting: "Evening reading time? 📚",
      subtitle: hasReadToday 
        ? "That's enough. You did it." 
        : "A quiet moment with a book is a gift",
      eveningMessage: hasReadToday ? "You showed up. That's enough." : null
    };
  } else {
    // Late night / Early morning (10 PM - 5 AM)
    return {
      greeting: "Late night reading? 📚",
      subtitle: hasReadToday 
        ? "Rest well, you've earned it" 
        : "A few pages before bed is perfect",
      eveningMessage: hasReadToday ? "You showed up. That's enough." : null
    };
  }
}

/**
 * Update time-based greeting
 */
function updateTimeBasedGreeting() {
  const message = getTimeBasedMessage();
  const greetingEl = document.getElementById('mainGreeting');
  const subtitleEl = document.getElementById('welcomeMessage');
  
  if (greetingEl) {
    greetingEl.textContent = message.greeting;
  }
  
  if (subtitleEl) {
    subtitleEl.textContent = message.subtitle;
  }
  
  // Show evening message if applicable
  if (message.eveningMessage) {
    setTimeout(() => {
      showNotification(message.eveningMessage, 5000);
    }, 1000);
  }
}

/**
 * Initialize dark mode
 */
function initDarkMode() {
  // Check for saved theme preference or default to light mode
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  // Setup theme toggle
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleDarkMode);
    updateThemeIcon(savedTheme);
  }
}

/**
 * Toggle dark mode
 */
function toggleDarkMode() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
  
  // Update charts if they exist
  if (window.speedChartInstance || window.pagesChartInstance) {
    setTimeout(() => {
      displayCharts();
    }, 100);
  }
}

/**
 * Update theme icon
 */
function updateThemeIcon(theme) {
  const themeIcon = document.querySelector('.theme-icon');
  if (themeIcon) {
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

/**
 * Identify user via Farcaster
 */
async function identifyUser() {
  try {
    // Check if user is already signed in
    // SDK context might be a property or promise
    let context;
    if (typeof sdk.context === 'function') {
      context = await sdk.context();
    } else if (sdk.context instanceof Promise) {
      context = await sdk.context;
    } else {
      context = sdk.context;
    }
    
    if (context && context.user) {
      currentUser = {
        fid: context.user.fid,
        username: context.user.username || `fid:${context.user.fid}`,
        displayName: context.user.displayName || context.user.username || 'Reader'
      };
      console.log('User identified:', currentUser);
      updateUserDisplay();
    } else {
      // Try to sign in
      try {
        await sdk.actions.signin();
        // After signin, get context again
        let newContext;
        if (typeof sdk.context === 'function') {
          newContext = await sdk.context();
        } else if (sdk.context instanceof Promise) {
          newContext = await sdk.context;
        } else {
          newContext = sdk.context;
        }
        
        if (newContext && newContext.user) {
          currentUser = {
            fid: newContext.user.fid,
            username: newContext.user.username || `fid:${newContext.user.fid}`,
            displayName: newContext.user.displayName || newContext.user.username || 'Reader'
          };
          updateUserDisplay();
        }
      } catch (signinError) {
        console.log('User signin cancelled or not available:', signinError);
      }
    }
  } catch (error) {
    console.error('Error identifying user:', error);
  }
}

/**
 * Update user display in UI
 */
function updateUserDisplay() {
  if (currentUser) {
    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay) {
      userDisplay.textContent = `👤 ${currentUser.displayName}`;
      userDisplay.style.display = 'block';
    }
  }
}

/**
 * Display user stats on the dashboard
 */
function displayStats() {
  try {
    // Recalculate stats to ensure they're up to date
    const stats = recalculateStats();
    
    // Display streak information
    const currentStreakEl = document.getElementById('currentStreak');
    const longestStreakEl = document.getElementById('longestStreak');
    
    if (currentStreakEl) {
      currentStreakEl.textContent = stats.currentStreak || 0;
    }
    
    if (longestStreakEl) {
      longestStreakEl.textContent = stats.longestStreak || 0;
    }
    
    // Display coins
    const coinsEl = document.getElementById('coinsCount');
    if (coinsEl) {
      coinsEl.textContent = stats.coins || 0;
    }
    
    // Display badges
    displayBadges();
    
    // Display global comparison
    displayGlobalComparison(stats);
    
    // Setup share button
    setupShareButton(stats);
    
    // Update time-based greeting (check if user read today)
    updateTimeBasedGreeting();
    
    // Display daily goal
    displayDailyGoal();
    
    // Setup manual session entry
    setupManualSessionEntry();
    
    // Setup Focus Mode timer
    setupFocusTimer();
    
    // Restore timer state if it exists
    restoreTimerState();
    
    // Display AI insights
    displayAIInsights(stats);
    
    // Display heatmap
    displayHeatmap();
    
    // Display leaderboard
    displayLeaderboard();
    
    // Display reading history
    displayReadingHistory();
    
    // Display charts
    displayCharts();
    
    // Check and celebrate goal completion
    checkGoalCompletion(stats);
  } catch (error) {
    console.error('Error displaying stats:', error);
  }
}

/**
 * Display earned badges on the dashboard
 */
function displayBadges() {
  try {
    const badgesContainer = document.getElementById('badgesContainer');
    if (!badgesContainer) return;
    
    const earnedBadges = getEarnedBadges();
    const allBadges = Object.values(BADGES);
    
    badgesContainer.innerHTML = '';
    
    allBadges.forEach(badge => {
      const isEarned = earnedBadges.some(eb => eb.id === badge.id);
      const badgeEl = document.createElement('div');
      badgeEl.className = `badge-item ${isEarned ? 'earned' : 'locked'}`;
      
      badgeEl.innerHTML = `
        <div class="badge-icon">${badge.icon}</div>
        <div class="badge-name">${badge.name}</div>
        <div class="badge-description">${badge.description}</div>
        ${isEarned ? '<div class="badge-check">✓</div>' : ''}
      `;
      
      badgesContainer.appendChild(badgeEl);
    });
  } catch (error) {
    console.error('Error displaying badges:', error);
  }
}

/**
 * Display reading history list
 */
function displayReadingHistory() {
  try {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    
    const sessions = loadSessions();
    
    if (sessions.length === 0) {
      historyList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📚</div>
          <div class="empty-state-title">No reading sessions yet</div>
          <div class="empty-state-text">Start tracking your reading journey!</div>
          <button class="empty-state-cta" onclick="document.getElementById('manualBookName')?.focus() || document.querySelector('.manual-entry-section')?.scrollIntoView({behavior: 'smooth'})">
            Log Your First Session
          </button>
        </div>
      `;
      return;
    }
    
    historyList.innerHTML = '';
    
    sessions.forEach(session => {
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      historyItem.setAttribute('data-session-id', session.id);
      
      const date = new Date(session.date);
      const formattedDate = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
      
      historyItem.innerHTML = `
        <div class="history-item-main">
          <div class="history-book">${session.bookName}</div>
          <div class="history-date">${formattedDate}</div>
        </div>
        <div class="history-item-details">
          <div class="history-stat">
            <span class="history-stat-label">Pages:</span>
            <span class="history-stat-value">${session.pagesRead}</span>
          </div>
          <div class="history-stat">
            <span class="history-stat-label">Time:</span>
            <span class="history-stat-value">${session.minutesRead} min</span>
          </div>
          <div class="history-stat">
            <span class="history-stat-label">Speed:</span>
            <span class="history-stat-value">${session.calculatedSpeed.toFixed(2)} p/min</span>
          </div>
        </div>
        <div class="history-item-actions">
          <button class="history-edit-btn" data-session-id="${session.id}" title="Edit session">
            ✏️
          </button>
          <button class="history-delete-btn" data-session-id="${session.id}" title="Delete session">
            🗑️
          </button>
        </div>
      `;
      
      historyList.appendChild(historyItem);
    });
    
    // Setup edit/delete handlers
    setupHistoryActions();
  } catch (error) {
    console.error('Error displaying reading history:', error);
  }
}

/**
 * Setup edit/delete actions for history items
 */
function setupHistoryActions() {
  // Delete buttons
  document.querySelectorAll('.history-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sessionId = e.target.getAttribute('data-session-id');
      if (confirm('Are you sure you want to delete this session?')) {
        if (deleteSession(sessionId)) {
          displayStats(); // Refresh all stats
          showNotification('Session removed. Your reading journey continues. 💙');
        } else {
          showNotification('Something went wrong. Don\'t worry—your session is still safe.');
        }
      }
    });
  });
  
  // Edit buttons
  document.querySelectorAll('.history-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sessionId = e.target.getAttribute('data-session-id');
      editSession(sessionId);
    });
  });
}

/**
 * Edit a reading session
 */
function editSession(sessionId) {
  const sessions = loadSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return;
  
  // Pre-fill manual entry form
  document.getElementById('manualBookName').value = session.bookName;
  document.getElementById('manualPages').value = session.pagesRead;
  document.getElementById('manualMinutes').value = session.minutesRead;
  document.getElementById('manualDate').value = session.date;
  
  // Scroll to form
  document.querySelector('.manual-entry-section').scrollIntoView({ behavior: 'smooth' });
  document.getElementById('manualBookName').focus();
  
  // Show message
  showNotification('Make any changes you need. We all make mistakes—that\'s how we learn. ✏️');
  
  // Store session ID for replacement (handled in form submit handler)
  const form = document.getElementById('manualSessionForm');
  form.setAttribute('data-editing-id', sessionId);
  
  // Update submit button text
  const submitBtn = form.querySelector('.form-submit-btn');
  if (submitBtn) {
    submitBtn.textContent = 'Update Session';
  }
}

/**
 * Display charts for reading analytics
 */
function displayCharts() {
  try {
    const sessions = loadSessions();
    
    if (sessions.length === 0) {
      return;
    }
    
    // Sort sessions by date (oldest first) for charts
    const sortedSessions = [...sessions].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
    
    // Prepare data for speed chart
    const speedData = sortedSessions.map(s => ({
      date: s.date,
      speed: s.calculatedSpeed
    }));
    
    // Prepare data for pages chart (aggregate by date)
    const pagesByDate = {};
    sortedSessions.forEach(s => {
      if (!pagesByDate[s.date]) {
        pagesByDate[s.date] = 0;
      }
      pagesByDate[s.date] += s.pagesRead;
    });
    
    const pagesData = Object.entries(pagesByDate)
      .map(([date, pages]) => ({ date, pages }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Render speed chart
    renderSpeedChart(speedData);
    
    // Render pages chart
    renderPagesChart(pagesData);
  } catch (error) {
    console.error('Error displaying charts:', error);
  }
}

/**
 * Get theme-aware colors
 */
function getThemeColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    text: isDark ? '#e4e4e7' : '#333',
    grid: isDark ? '#3f3f46' : '#e9ecef',
    accent: isDark ? 'rgb(129, 140, 248)' : 'rgb(102, 126, 234)',
    accentAlpha: isDark ? 'rgba(129, 140, 248, 0.1)' : 'rgba(102, 126, 234, 0.1)',
    pointBorder: isDark ? '#1e1e2e' : '#fff'
  };
}

/**
 * Render reading speed over time chart
 */
function renderSpeedChart(data) {
  const ctx = document.getElementById('speedChart');
  if (!ctx) return;
  
  // Destroy existing chart if it exists
  if (window.speedChartInstance) {
    window.speedChartInstance.destroy();
  }
  
  const labels = data.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  
  const colors = getThemeColors();
  
  window.speedChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Pages per Minute',
        data: data.map(d => d.speed),
        borderColor: colors.accent,
        backgroundColor: colors.accentAlpha,
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: colors.accent,
        pointBorderColor: colors.pointBorder,
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: colors.text
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Pages per Minute',
            color: colors.text
          },
          ticks: {
            color: colors.text
          },
          grid: {
            color: colors.grid
          }
        },
        x: {
          title: {
            display: true,
            text: 'Date',
            color: colors.text
          },
          ticks: {
            color: colors.text
          },
          grid: {
            color: colors.grid
          }
        }
      }
    }
  });
}

/**
 * Render pages read per day chart
 */
function renderPagesChart(data) {
  const ctx = document.getElementById('pagesChart');
  if (!ctx) return;
  
  // Destroy existing chart if it exists
  if (window.pagesChartInstance) {
    window.pagesChartInstance.destroy();
  }
  
  const labels = data.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  
  const colors = getThemeColors();
  const pagesColor = 'rgb(238, 90, 111)';
  const pagesColorAlpha = 'rgba(238, 90, 111, 0.1)';
  
  window.pagesChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Pages Read',
        data: data.map(d => d.pages),
        borderColor: pagesColor,
        backgroundColor: pagesColorAlpha,
        tension: 0.4,
        fill: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: pagesColor,
        pointBorderColor: colors.pointBorder,
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: colors.text
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Pages',
            color: colors.text
          },
          ticks: {
            color: colors.text
          },
          grid: {
            color: colors.grid
          }
        },
        x: {
          title: {
            display: true,
            text: 'Date',
            color: colors.text
          },
          ticks: {
            color: colors.text
          },
          grid: {
            color: colors.grid
          }
        }
      }
    }
  });
}

/**
 * Display global comparison with benchmarks
 */
function displayGlobalComparison(stats) {
  try {
    const comparisonMessage = document.getElementById('comparisonMessage');
    if (!comparisonMessage) return;
    
    const GLOBAL_AVERAGE_SPEED = 1.0; // 1 page per minute
    
    if (stats.averageSpeed === 0 || !stats.averageSpeed) {
      comparisonMessage.textContent = 'Your reading journey is uniquely yours. Start whenever you\'re ready.';
      return;
    }
    
    // Calculate percentile based on a normal distribution assumption
    // Using a simplified model where we estimate percentile
    const speedRatio = stats.averageSpeed / GLOBAL_AVERAGE_SPEED;
    
    // Simplified percentile calculation
    // If user is at global average (1.0), they're faster than ~50%
    // If 2x faster, they're faster than ~95%
    // If 0.5x, they're faster than ~5%
    let percentile;
    if (speedRatio >= 2.0) {
      percentile = 95;
    } else if (speedRatio >= 1.5) {
      percentile = 85;
    } else if (speedRatio >= 1.2) {
      percentile = 75;
    } else if (speedRatio >= 1.0) {
      percentile = 65;
    } else if (speedRatio >= 0.8) {
      percentile = 45;
    } else if (speedRatio >= 0.6) {
      percentile = 30;
    } else {
      percentile = 15;
    }
    
    // Round to nearest 5 for cleaner display
    percentile = Math.round(percentile / 5) * 5;
    
    comparisonMessage.textContent = `You are faster than ${percentile}% of readers`;
  } catch (error) {
    console.error('Error displaying global comparison:', error);
  }
}

/**
 * Generate fake leaderboard data
 */
function generateFakeLeaderboard() {
  // Generate fake usernames
  const usernames = [
    'BookWorm42', 'PageTurner', 'LiteraryLover', 'ReadMaster', 'BookishBee',
    'NovelNerd', 'ChapterChaser', 'StorySeeker', 'Bibliophile', 'ReadRocket',
    'BookBuff', 'PagePilot', 'ReadRanger', 'StoryStar', 'BookBoss'
  ];
  
  // Generate top streaks (fake data)
  const topStreaks = Array.from({ length: 10 }, (_, i) => {
    const randomUsername = usernames[Math.floor(Math.random() * usernames.length)];
    return {
      rank: i + 1,
      username: randomUsername,
      streak: Math.floor(Math.random() * 50) + 20 + (10 - i) * 5, // Decreasing streaks
      isCurrentUser: false
    };
  }).sort((a, b) => b.streak - a.streak)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  
  // Generate top pages (fake data)
  const topPages = Array.from({ length: 10 }, (_, i) => {
    const randomUsername = usernames[Math.floor(Math.random() * usernames.length)];
    return {
      rank: i + 1,
      username: randomUsername,
      pages: Math.floor(Math.random() * 2000) + 1000 + (10 - i) * 200, // Decreasing pages
      isCurrentUser: false
    };
  }).sort((a, b) => b.pages - a.pages)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  
  return { topStreaks, topPages };
}

/**
 * Display leaderboard
 */
function displayLeaderboard() {
  try {
    const { topStreaks, topPages } = generateFakeLeaderboard();
    
    // Display streaks leaderboard
    displayStreaksLeaderboard(topStreaks);
    
    // Display pages leaderboard
    displayPagesLeaderboard(topPages);
    
    // Setup tab switching
    setupLeaderboardTabs();
  } catch (error) {
    console.error('Error displaying leaderboard:', error);
  }
}

/**
 * Display streaks leaderboard
 */
function displayStreaksLeaderboard(data) {
  const container = document.getElementById('streaksLeaderboard');
  if (!container) return;
  
  container.innerHTML = '';
  
  data.forEach(item => {
    const leaderboardItem = document.createElement('div');
    leaderboardItem.className = `leaderboard-item ${item.isCurrentUser ? 'current-user' : ''}`;
    
    // Medal emoji for top 3
    let rankDisplay = `#${item.rank}`;
    if (item.rank === 1) rankDisplay = '🥇';
    else if (item.rank === 2) rankDisplay = '🥈';
    else if (item.rank === 3) rankDisplay = '🥉';
    
    leaderboardItem.innerHTML = `
      <div class="leaderboard-rank">${rankDisplay}</div>
      <div class="leaderboard-username">${item.username}</div>
      <div class="leaderboard-value">${item.streak} days 🔥</div>
    `;
    
    container.appendChild(leaderboardItem);
  });
}

/**
 * Display pages leaderboard
 */
function displayPagesLeaderboard(data) {
  const container = document.getElementById('pagesLeaderboard');
  if (!container) return;
  
  container.innerHTML = '';
  
  data.forEach(item => {
    const leaderboardItem = document.createElement('div');
    leaderboardItem.className = `leaderboard-item ${item.isCurrentUser ? 'current-user' : ''}`;
    
    // Medal emoji for top 3
    let rankDisplay = `#${item.rank}`;
    if (item.rank === 1) rankDisplay = '🥇';
    else if (item.rank === 2) rankDisplay = '🥈';
    else if (item.rank === 3) rankDisplay = '🥉';
    
    leaderboardItem.innerHTML = `
      <div class="leaderboard-rank">${rankDisplay}</div>
      <div class="leaderboard-username">${item.username}</div>
      <div class="leaderboard-value">${item.pages.toLocaleString()} pages</div>
    `;
    
    container.appendChild(leaderboardItem);
  });
}

/**
 * Setup leaderboard tab switching
 */
function setupLeaderboardTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      
      // Remove active class from all buttons and contents
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to clicked button and corresponding content
      button.classList.add('active');
      const targetContent = document.getElementById(`${targetTab}Tab`);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}

/**
 * Setup share achievement button
 */
function setupShareButton(stats) {
  const shareButton = document.getElementById('shareButton');
  if (!shareButton) return;
  
  shareButton.addEventListener('click', async () => {
    await shareAchievement(stats);
  });
}

/**
 * Share achievement on Farcaster
 */
async function shareAchievement(stats) {
  try {
    // Determine what achievement to share
    let shareMessage = '';
    
    // Check for recent achievements (streaks, milestones, etc.)
    if (stats.currentStreak >= 7) {
      shareMessage = `📚 I've read for ${stats.currentStreak} days straight on READER! 🔥 Every day I show up, I'm building something beautiful.`;
    } else if (stats.currentStreak >= 3) {
      shareMessage = `📚 ${stats.currentStreak} days of reading on READER! 🌱 Small steps, big changes.`;
    } else if (stats.totalPages >= 1000) {
      shareMessage = `📚 I've read ${stats.totalPages.toLocaleString()} pages on READER! 📖`;
    } else if (stats.totalPages >= 500) {
      shareMessage = `📚 I've read ${stats.totalPages.toLocaleString()} pages on READER!`;
    } else if (stats.coins >= 100) {
      shareMessage = `📚 I've earned ${stats.coins} Reader Coins! 🪙`;
    } else if (stats.currentStreak > 0) {
      shareMessage = `📚 I'm on a ${stats.currentStreak}-day reading streak on READER!`;
    } else {
      // Default share message
      shareMessage = `📚 I'm building my reading habit on READER! ${stats.totalPages > 0 ? `Every page counts—${stats.totalPages} and counting.` : 'Every page counts.'}`;
    }
    
    // Use Farcaster SDK to compose cast
    await sdk.actions.composeCast({
      text: shareMessage
    });
    
    console.log('Shared achievement:', shareMessage);
  } catch (error) {
    console.error('Error sharing achievement:', error);
    // Fallback: show message or copy to clipboard
    showNotification('Sharing isn\'t available right now, but your achievement is still real and meaningful. 💙');
  }
}

/**
 * Display daily goal progress
 */
function displayDailyGoal() {
  try {
    const todayMinutes = getTodayMinutes();
    const goal = getDailyGoal();
    const progress = Math.min((todayMinutes / goal) * 100, 100);
    
    const goalProgressFill = document.getElementById('goalProgressFill');
    const goalText = document.getElementById('goalText');
    
    if (goalProgressFill) {
      goalProgressFill.style.width = `${progress}%`;
    }
    
    if (goalText) {
      const progress = Math.round(todayMinutes);
      const percentage = Math.round((progress / goal) * 100);
      
      if (progress >= goal) {
        goalText.textContent = `Complete! 🎉`;
      } else if (percentage >= 75) {
        goalText.textContent = `${progress} / ${goal} min - Almost there!`;
      } else {
        goalText.textContent = `${progress} / ${goal} min`;
      }
    }
    
    // Setup goal editor
    setupGoalEditor();
  } catch (error) {
    console.error('Error displaying daily goal:', error);
  }
}

/**
 * Setup daily goal editor
 */
function setupGoalEditor() {
  const editBtn = document.getElementById('goalEditBtn');
  const editor = document.getElementById('goalEditor');
  const saveBtn = document.getElementById('goalSaveBtn');
  const cancelBtn = document.getElementById('goalCancelBtn');
  const input = document.getElementById('goalInput');
  
  if (!editBtn || !editor) return;
  
  editBtn.addEventListener('click', () => {
    editor.style.display = 'block';
    input.value = getDailyGoal();
    input.focus();
  });
  
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const minutes = parseInt(input.value, 10);
      if (isNaN(minutes) || minutes < 5 || minutes > 300) {
        showNotification('Your goal should be between 5 and 300 minutes. Start small—you can always adjust later. 💙', 4000);
        input.focus();
        return;
      }
      updateDailyGoal(minutes);
      displayDailyGoal();
      editor.style.display = 'none';
      showNotification(`Your intention is set: ${minutes} minutes of reading today. You've got this. 🎯`);
    });
  }
  
  // Validate on input
  if (input) {
    input.addEventListener('blur', () => {
      const minutes = parseInt(input.value, 10);
      if (input.value && (isNaN(minutes) || minutes < 5 || minutes > 300)) {
        input.style.borderColor = 'var(--accent)';
        input.style.borderWidth = '2px';
      } else {
        input.style.borderColor = '';
        input.style.borderWidth = '';
      }
    });
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      editor.style.display = 'none';
    });
  }
}

/**
 * Setup manual session entry form
 */
function setupManualSessionEntry() {
  const form = document.getElementById('manualSessionForm');
  if (!form) return;
  
  // Set default date to today
  const dateInput = document.getElementById('manualDate');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
    dateInput.max = new Date().toISOString().split('T')[0]; // Can't select future dates
  }
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const editingId = form.getAttribute('data-editing-id');
    
    const bookName = document.getElementById('manualBookName').value.trim();
    const pages = parseInt(document.getElementById('manualPages').value, 10);
    const minutes = parseInt(document.getElementById('manualMinutes').value, 10);
    const date = document.getElementById('manualDate').value;
    
    // Validation with encouraging messages
    if (!bookName) {
      showNotification('What story are you reading? Every book deserves a name. 📖', 4000);
      document.getElementById('manualBookName').focus();
      return;
    }
    
    if (isNaN(pages) || pages < 0) {
      showNotification('Pages read can be any number—even zero counts if you tried. 💪', 4000);
      document.getElementById('manualPages').focus();
      return;
    }
    
    if (isNaN(minutes) || minutes < 1) {
      showNotification('Even one minute of reading is progress. Start small. 🌱', 4000);
      document.getElementById('manualMinutes').focus();
      return;
    }
    
    try {
      // If editing, delete old session first
      if (editingId) {
        deleteSession(editingId);
        form.removeAttribute('data-editing-id');
      }
      
      const session = createReadingSession(bookName, pages, minutes, date);
      
      // Load previous stats before saving (for milestone detection)
      const previousStats = loadPreviousStats();
      
      const result = saveSession(session);
      
      if (result.success) {
        // Reset form
        form.reset();
        if (dateInput) {
          dateInput.value = new Date().toISOString().split('T')[0];
        }
        
        // Reset submit button text
        const submitBtn = form.querySelector('.form-submit-btn');
        if (submitBtn) {
          submitBtn.textContent = 'Save Session';
        }
        
        // Refresh stats
        displayStats();
        displayDailyGoal();
        
        // Get updated stats for milestone checking
        const updatedStats = recalculateStats();
        
        // Show success message
        let message = editingId 
          ? 'Your reading log is updated. Every detail matters. ✨' 
          : getSuccessMessage(result.coinsEarned, result.newBadges);
        showNotification(message);
        
        // Check for milestones and prompt to share (only for new sessions, not edits)
        if (!editingId) {
          checkMilestonesAndPromptShare(result, updatedStats, previousStats, session);
        }
      } else {
        showNotification('Something went wrong, but don\'t worry—try again when you\'re ready. 💙');
      }
    } catch (error) {
      console.error('Error saving manual session:', error);
      showNotification('There was a small hiccup. Your reading still matters—try saving again. 💙');
    }
  });
}

/**
 * Setup Focus Mode timer
 */
function setupFocusTimer() {
  const startBtn = document.getElementById('timerStartBtn');
  const pauseBtn = document.getElementById('timerPauseBtn');
  const stopBtn = document.getElementById('timerStopBtn');
  const saveBtn = document.getElementById('timerSaveBtn');
  
  if (startBtn) {
    startBtn.addEventListener('click', startTimer);
  }
  
  if (pauseBtn) {
    pauseBtn.addEventListener('click', pauseTimer);
  }
  
  if (stopBtn) {
    stopBtn.addEventListener('click', stopTimer);
  }
  
  if (saveBtn) {
    saveBtn.addEventListener('click', saveTimerSession);
  }
  
  updateTimerDisplay();
}

/**
 * Save timer state to localStorage
 */
function saveTimerState() {
  try {
    const timerState = {
      seconds: timerSeconds,
      running: timerRunning,
      startTime: timerStartTime,
      timestamp: Date.now()
    };
    localStorage.setItem('reader_timer_state', JSON.stringify(timerState));
  } catch (error) {
    console.error('Error saving timer state:', error);
  }
}

/**
 * Restore timer state from localStorage
 */
function restoreTimerState() {
  try {
    const savedState = localStorage.getItem('reader_timer_state');
    if (!savedState) return;
    
    const state = JSON.parse(savedState);
    const timeSinceSave = Math.floor((Date.now() - state.timestamp) / 1000);
    
    // Only restore if saved within last 24 hours
    if (timeSinceSave > 24 * 60 * 60) {
      localStorage.removeItem('reader_timer_state');
      return;
    }
    
    if (state.running && state.startTime) {
      // Calculate elapsed time
      timerSeconds = state.seconds + timeSinceSave;
      timerStartTime = state.startTime;
      timerRunning = false; // Start paused, user can resume
      
      updateTimerDisplay();
      
      // Show resume option
      const startBtn = document.getElementById('timerStartBtn');
      if (startBtn) {
        startBtn.textContent = 'Resume';
        startBtn.style.display = 'inline-block';
      }
    } else if (state.seconds > 0) {
      // Restore paused timer
      timerSeconds = state.seconds;
      updateTimerDisplay();
    }
  } catch (error) {
    console.error('Error restoring timer state:', error);
    localStorage.removeItem('reader_timer_state');
  }
}

/**
 * Start the timer
 */
function startTimer() {
  if (timerRunning) return;
  
  timerRunning = true;
  if (!timerStartTime) {
    timerStartTime = Date.now() - (timerSeconds * 1000);
  } else {
    // Resume from where we left off
    timerStartTime = Date.now() - (timerSeconds * 1000);
  }
  
  timerInterval = setInterval(() => {
    timerSeconds = Math.floor((Date.now() - timerStartTime) / 1000);
    updateTimerDisplay();
    saveTimerState(); // Save state every second
  }, 1000);
  
  const startBtn = document.getElementById('timerStartBtn');
  if (startBtn) {
    startBtn.textContent = 'Start';
    startBtn.style.display = 'none';
  }
  document.getElementById('timerPauseBtn').style.display = 'inline-block';
  document.getElementById('timerStopBtn').style.display = 'inline-block';
  
  saveTimerState();
}

/**
 * Pause the timer
 */
function pauseTimer() {
  if (!timerRunning) return;
  
  timerRunning = false;
  clearInterval(timerInterval);
  
  const startBtn = document.getElementById('timerStartBtn');
  if (startBtn) {
    startBtn.textContent = 'Resume';
    startBtn.style.display = 'inline-block';
  }
  document.getElementById('timerPauseBtn').style.display = 'none';
  
  saveTimerState();
}

/**
 * Stop the timer
 */
function stopTimer() {
  // Confirm before stopping if timer has been running
  if (timerSeconds > 0) {
    const minutes = Math.ceil(timerSeconds / 60);
    const confirmed = confirm(`You've read for ${minutes} minute${minutes !== 1 ? 's' : ''}. Ready to save this moment?`);
    if (!confirmed) {
      return;
    }
  }
  
  timerRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  timerStartTime = null;
  
  const startBtn = document.getElementById('timerStartBtn');
  if (startBtn) {
    startBtn.textContent = 'Start';
    startBtn.style.display = 'inline-block';
  }
  document.getElementById('timerPauseBtn').style.display = 'none';
  document.getElementById('timerStopBtn').style.display = 'none';
  
  // Show session info form
  const sessionInfo = document.getElementById('timerSessionInfo');
  if (sessionInfo) {
    sessionInfo.style.display = 'block';
  }
  
  // Clear saved timer state
  localStorage.removeItem('reader_timer_state');
}

/**
 * Update timer display
 */
function updateTimerDisplay() {
  const display = document.getElementById('timerDisplay');
  if (!display) return;
  
  const minutes = Math.floor(timerSeconds / 60);
  const seconds = timerSeconds % 60;
  display.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Save timer session
 */
async function saveTimerSession() {
  try {
    const bookName = document.getElementById('timerBookName').value.trim() || 'Untitled';
    const pagesInput = document.getElementById('timerPages').value;
    const pages = Math.max(0, parseInt(pagesInput, 10) || 0);
    const minutes = Math.ceil(timerSeconds / 60);
    
    // Validation with encouraging messages
    if (minutes === 0 || timerSeconds < 60) {
      showNotification('Even one minute of reading counts. Try again when you\'re ready. 💙', 4000);
      return;
    }
    
    if (pages < 0) {
      showNotification('Pages can\'t be negative, but any positive number—even zero—is valid. 📖', 4000);
      return;
    }
    
    const session = createReadingSession(bookName, pages, minutes);
    const result = saveSession(session);
    
    if (result.success) {
      // Reset timer
      timerSeconds = 0;
      timerStartTime = null;
      updateTimerDisplay();
      document.getElementById('timerSessionInfo').style.display = 'none';
      document.getElementById('timerBookName').value = '';
      document.getElementById('timerPages').value = '';
      
      // Clear saved timer state
      localStorage.removeItem('reader_timer_state');
      
      // Load previous stats before refreshing
      const previousStats = loadPreviousStats();
      
      // Refresh stats (including goal progress)
      displayStats();
      displayDailyGoal(); // Update goal progress immediately
      
      // Get updated stats for milestone checking
      const updatedStats = recalculateStats();
      
      // Show success message
      const message = getSuccessMessage(result.coinsEarned, result.newBadges);
      showNotification(message);
      
      // Check for milestones and prompt to share
      checkMilestonesAndPromptShare(result, updatedStats, previousStats, session);
    }
  } catch (error) {
    console.error('Error saving timer session:', error);
    showNotification('Something went wrong, but your reading time still counts. Try again when you\'re ready. 💙');
  }
}

/**
 * Display AI insights
 */
function displayAIInsights(stats) {
  try {
    const container = document.getElementById('insightsContainer');
    if (!container) return;
    
    const sessions = loadSessions();
    
    if (sessions.length < 3) {
      container.innerHTML = '<div class="insight-card">Keep reading! We need at least 3 sessions to generate insights.</div>';
      return;
    }
    
    const insights = generateInsights(sessions, stats);
    container.innerHTML = '';
    
    insights.forEach((insight, index) => {
      const insightCard = document.createElement('div');
      insightCard.className = 'insight-card';
      insightCard.style.animationDelay = `${index * 0.1}s`;
      insightCard.innerHTML = `
        <div class="insight-icon">${insight.icon}</div>
        <div class="insight-content">
          <div class="insight-title">${insight.title}</div>
          <div class="insight-text">${insight.text}</div>
        </div>
      `;
      container.appendChild(insightCard);
    });
  } catch (error) {
    console.error('Error displaying AI insights:', error);
  }
}

/**
 * Generate AI insights from reading data
 */
function generateInsights(sessions, stats) {
  const insights = [];
  
  // Group sessions by length ranges
  const lengthGroups = {
    short: sessions.filter(s => s.minutesRead < 20),
    medium: sessions.filter(s => s.minutesRead >= 20 && s.minutesRead <= 40),
    long: sessions.filter(s => s.minutesRead > 40)
  };
  
  // Calculate average speed for each group
  const groupSpeeds = {};
  Object.keys(lengthGroups).forEach(group => {
    const groupSessions = lengthGroups[group];
    if (groupSessions.length > 0) {
      const totalPages = groupSessions.reduce((sum, s) => sum + s.pagesRead, 0);
      const totalMinutes = groupSessions.reduce((sum, s) => sum + s.minutesRead, 0);
      groupSpeeds[group] = totalMinutes > 0 ? totalPages / totalMinutes : 0;
    }
  });
  
  // Find optimal session length
  const validSpeeds = Object.entries(groupSpeeds).filter(([_, speed]) => speed > 0);
  if (validSpeeds.length > 0) {
    const bestGroup = validSpeeds.sort(([_, a], [__, b]) => b - a)[0];
    
    if (bestGroup && bestGroup[0] === 'medium') {
      insights.push({
        icon: '⚡',
        title: 'Your Sweet Spot',
        text: 'You read most comfortably when sessions last 20–40 minutes. This is your natural rhythm—honor it.'
      });
    } else if (bestGroup && bestGroup[0] === 'short') {
      insights.push({
        icon: '⚡',
        title: 'Short & Focused',
        text: 'Your shorter sessions show incredible focus. Sometimes less is more, and you\'ve found that balance.'
      });
    } else if (bestGroup && bestGroup[0] === 'long') {
      insights.push({
        icon: '⚡',
        title: 'Deep Reader',
        text: 'You have remarkable reading stamina. Those longer sessions show how deeply you can immerse yourself.'
      });
    }
  }
  
  // Analyze reading consistency
  const uniqueDates = new Set(sessions.map(s => s.date)).size;
  const totalDays = Math.ceil((Date.now() - new Date(sessions[sessions.length - 1].date)) / (1000 * 60 * 60 * 24));
  const consistency = uniqueDates / Math.max(totalDays, 1);
  
  if (consistency > 0.7) {
    insights.push({
      icon: '📅',
      title: 'You Show Up',
      text: `You've read on ${uniqueDates} different days. That's not just consistency—that's commitment to yourself.`
    });
  } else if (consistency < 0.3 && sessions.length > 5) {
    insights.push({
      icon: '💡',
      title: 'Small Steps, Big Changes',
      text: 'Reading a little bit every day builds something beautiful over time. You don\'t have to read for hours—just show up.'
    });
  }
  
  // Analyze speed trends
  if (sessions.length >= 5) {
    const recentSessions = sessions.slice(0, 5);
    const olderSessions = sessions.slice(5, 10);
    
    if (olderSessions.length > 0) {
      const recentAvg = recentSessions.reduce((sum, s) => sum + s.calculatedSpeed, 0) / recentSessions.length;
      const olderAvg = olderSessions.reduce((sum, s) => sum + s.calculatedSpeed, 0) / olderSessions.length;
      
      if (recentAvg > olderAvg * 1.1) {
        insights.push({
          icon: '📈',
          title: 'You\'re Growing',
          text: 'Your reading has become more natural and fluid. This is what practice looks like—gentle, steady improvement.'
        });
      }
    }
  }
  
  // Streak insight
  if (stats.currentStreak >= 7) {
    insights.push({
      icon: '🔥',
      title: `${stats.currentStreak} Days Strong`,
      text: `You've shown up ${stats.currentStreak} days in a row. That's not just a streak—that's a commitment you're keeping to yourself.`
    });
  } else if (stats.currentStreak >= 3) {
    insights.push({
      icon: '🌱',
      title: 'Building Something Beautiful',
      text: `Your ${stats.currentStreak}-day streak is the beginning of something meaningful. Keep going, one day at a time.`
    });
  }
  
  // Default insight if none generated
  if (insights.length === 0) {
    insights.push({
      icon: '📚',
      title: 'Every Page Matters',
      text: 'There\'s no such thing as "too little" reading. Every page you turn is a step forward on your journey.'
    });
  }
  
  return insights.slice(0, 3); // Limit to 3 insights
}

/**
 * Show notification
 */
function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
