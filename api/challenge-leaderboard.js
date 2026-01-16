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

// Helper to get user's reading data for a date range
async function getUserReadingData(fid, startDate, endDate, goalType) {
  try {
    const key = `reader:user:${fid}`;
    const client = await getRedisClient();
    const raw = await client.get(key);
    if (!raw) return 0;

    const data = JSON.parse(raw);
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];

    // Filter sessions within date range
    const filteredSessions = sessions.filter((session) => {
      const sessionDate = session.date;
      return sessionDate >= startDate && sessionDate <= endDate;
    });

    if (goalType === "pages") {
      return filteredSessions.reduce((sum, s) => sum + (s.pagesRead || 0), 0);
    } else if (goalType === "minutes") {
      return filteredSessions.reduce((sum, s) => sum + (s.minutesRead || 0), 0);
    } else if (goalType === "sessions") {
      return filteredSessions.length;
    } else if (goalType === "streak") {
      // Calculate streak
      if (filteredSessions.length === 0) return 0;
      const uniqueDates = [...new Set(filteredSessions.map((s) => s.date))].sort(
        (a, b) => new Date(a) - new Date(b)
      );
      let streak = 1;
      let maxStreak = 1;
      for (let i = 1; i < uniqueDates.length; i++) {
        const currentDate = new Date(uniqueDates[i]);
        const previousDate = new Date(uniqueDates[i - 1]);
        const daysDiff = Math.floor(
          (currentDate - previousDate) / (1000 * 60 * 60 * 24)
        );
        if (daysDiff === 1) {
          streak++;
          maxStreak = Math.max(maxStreak, streak);
        } else {
          streak = 1;
        }
      }
      return maxStreak;
    }

    return 0;
  } catch (error) {
    console.error(`Error getting reading data for ${fid}:`, error);
    return 0;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const { challengeId } = req.query;

    if (!challengeId) {
      res.status(400).json({ error: "Missing challengeId" });
      return;
    }

    const client = await getRedisClient();

    // Get challenge details
    const challengeKey = `challenge:${challengeId}`;
    const challengeRaw = await client.get(challengeKey);
    if (!challengeRaw) {
      res.status(404).json({ error: "Challenge not found" });
      return;
    }

    const challenge = JSON.parse(challengeRaw);
    const participants = challenge.participants || [];

    // Calculate progress for each participant
    const leaderboard = [];

    for (const participantId of participants) {
      try {
        // Try to get username from user data
        const userKey = `reader:user:${participantId}`;
        const userRaw = await client.get(userKey);
        let username = `fid:${participantId}`;

        if (userRaw) {
          const userData = JSON.parse(userRaw);
          username =
            userData.username ||
            userData.displayName ||
            userData.stats?.username ||
            userData.stats?.displayName ||
            `fid:${participantId}`;
        }

        // If username still starts with fid, try Farcaster API
        if (username.startsWith("fid:")) {
          try {
            const farcasterResponse = await fetch(
              `https://api.farcaster.xyz/v2/user-by-fid?fid=${participantId}`
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
            // Continue with fid fallback
          }
        }

        const currentValue = await getUserReadingData(
          participantId,
          challenge.startDate,
          challenge.endDate,
          challenge.goalType
        );

        leaderboard.push({
          userId: participantId,
          username,
          currentValue,
          goalValue: challenge.goalValue,
          progress: Math.min((currentValue / challenge.goalValue) * 100, 100),
          completed: currentValue >= challenge.goalValue,
        });
      } catch (error) {
        console.error(`Error processing participant ${participantId}:`, error);
      }
    }

    // Sort by progress (descending)
    leaderboard.sort((a, b) => {
      if (a.completed && !b.completed) return -1;
      if (!a.completed && b.completed) return 1;
      return b.currentValue - a.currentValue;
    });

    // Add ranks
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    res.status(200).json({ leaderboard, challenge });
  } catch (error) {
    console.error("Challenge leaderboard error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
