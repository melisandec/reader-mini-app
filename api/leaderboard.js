import { createClient } from "redis";

let redisClient = null;

async function getRedisClient() {
  if (redisClient) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("Missing REDIS_URL");
  }
  redisClient = createClient({ url });
  redisClient.on("error", (error) => {
    console.error("Redis Client Error:", error);
  });
  await redisClient.connect();
  return redisClient;
}

/**
 * Calculate streaks from sessions
 */
function calculateStreaks(sessions) {
  if (!sessions || sessions.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  // Get unique dates and sort them (newest first)
  const uniqueDates = [...new Set(sessions.map((s) => s.date))].sort(
    (a, b) => new Date(b) - new Date(a)
  );

  // Calculate current streak
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  let currentStreak = 0;
  let checkDate = today;

  // Check if today or yesterday has reading
  if (uniqueDates.includes(today)) {
    checkDate = today;
  } else if (uniqueDates.includes(yesterday)) {
    checkDate = yesterday;
  } else {
    return { currentStreak: 0, longestStreak: 0 };
  }

  // Count consecutive days from checkDate
  for (let i = 0; i < uniqueDates.length; i++) {
    const date = uniqueDates[i];
    const expectedDate = new Date(
      new Date(checkDate).getTime() - i * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .split("T")[0];

    if (date === expectedDate) {
      currentStreak++;
    } else {
      break;
    }
  }

  // Calculate longest streak
  let longestStreak = 1;
  let tempStreak = 1;

  for (let i = 1; i < uniqueDates.length; i++) {
    const currentDate = new Date(uniqueDates[i]);
    const previousDate = new Date(uniqueDates[i - 1]);
    const daysDiff = Math.floor(
      (currentDate - previousDate) / (1000 * 60 * 60 * 24)
    );

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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const client = await getRedisClient();

    // Get all keys matching the pattern reader:user:*
    const keys = await client.keys("reader:user:*");

    if (!keys || keys.length === 0) {
      res.status(200).json({ topStreaks: [], topPages: [] });
      return;
    }

    // Fetch all user data
    const allUsers = [];
    for (const key of keys) {
      try {
        const raw = await client.get(key);
        if (raw) {
          const data = JSON.parse(raw);
          const fid = key.replace("reader:user:", "");

          // Calculate stats from sessions
          const sessions = Array.isArray(data.sessions) ? data.sessions : [];
          const stats = data.stats || {};

          // Calculate total pages
          const totalPages = sessions.reduce(
            (sum, session) => sum + (session.pagesRead || 0),
            0
          );

          // Calculate streaks
          const { currentStreak, longestStreak } = calculateStreaks(sessions);

          // Use longest streak for leaderboard (or current if longer)
          const streak = Math.max(currentStreak, longestStreak);

          // Get username from data (top level), stats, or try to fetch from Farcaster API
          let username =
            data?.username ||
            data?.displayName ||
            stats?.username ||
            stats?.displayName;

          // If no username found, try to fetch from Farcaster API
          if (!username || username.startsWith('fid:')) {
            try {
              const farcasterResponse = await fetch(
                `https://api.farcaster.xyz/v2/user-by-fid?fid=${fid}`
              );
              if (farcasterResponse.ok) {
                const farcasterData = await farcasterResponse.json();
                if (farcasterData?.result?.user?.username) {
                  username = `@${farcasterData.result.user.username}`;
                } else if (farcasterData?.result?.user?.displayName) {
                  username = farcasterData.result.user.displayName;
                }
              }
            } catch (error) {
              console.log(`Could not fetch username for fid ${fid}:`, error.message);
            }
          }

          // Final fallback to fid
          if (!username || username.startsWith('fid:')) {
            username = `fid:${fid}`;
          }

          if (totalPages > 0 || streak > 0) {
            allUsers.push({
              fid,
              username,
              totalPages,
              streak,
            });
          }
        }
      } catch (error) {
        console.error(`Error processing user ${key}:`, error);
        // Continue with other users
      }
    }

    // Sort and get top 10 for streaks
    const topStreaks = allUsers
      .filter((user) => user.streak > 0)
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 10)
      .map((user, index) => ({
        rank: index + 1,
        username: user.username,
        streak: user.streak,
      }));

    // Sort and get top 10 for pages
    const topPages = allUsers
      .filter((user) => user.totalPages > 0)
      .sort((a, b) => b.totalPages - a.totalPages)
      .slice(0, 10)
      .map((user, index) => ({
        rank: index + 1,
        username: user.username,
        pages: user.totalPages,
      }));

    res.status(200).json({ topStreaks, topPages });
  } catch (error) {
    console.error("Leaderboard error:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
}
