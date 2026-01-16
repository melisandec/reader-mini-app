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
async function getUserReadingData(fid, startDate, endDate) {
  try {
    const key = `reader:user:${fid}`;
    const client = await getRedisClient();
    const raw = await client.get(key);
    if (!raw) return { pages: 0, minutes: 0, sessions: 0 };

    const data = JSON.parse(raw);
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];

    // Filter sessions within date range
    const filteredSessions = sessions.filter((session) => {
      const sessionDate = session.date;
      return sessionDate >= startDate && sessionDate <= endDate;
    });

    const pages = filteredSessions.reduce(
      (sum, s) => sum + (s.pagesRead || 0),
      0
    );
    const minutes = filteredSessions.reduce(
      (sum, s) => sum + (s.minutesRead || 0),
      0
    );

    return { pages, minutes, sessions: filteredSessions.length };
  } catch (error) {
    console.error(`Error getting reading data for ${fid}:`, error);
    return { pages: 0, minutes: 0, sessions: 0 };
  }
}

// Calculate streak for date range
function calculateStreakInRange(sessions, startDate, endDate) {
  if (!sessions || sessions.length === 0) return 0;

  const filteredSessions = sessions.filter((session) => {
    const sessionDate = session.date;
    return sessionDate >= startDate && sessionDate <= endDate;
  });

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

export default async function handler(req, res) {
  try {
    const client = await getRedisClient();

    if (req.method === "GET") {
      const { challengeId, userId } = req.query;

      // Get specific challenge
      if (challengeId) {
        const key = `challenge:${challengeId}`;
        const raw = await client.get(key);
        if (!raw) {
          res.status(404).json({ error: "Challenge not found" });
          return;
        }

        const challenge = JSON.parse(raw);

        // If userId provided, include their progress
        if (userId) {
          const progressKey = `challenge:${challengeId}:progress:${userId}`;
          const progressRaw = await client.get(progressKey);
          let progress = null;

          if (progressRaw) {
            progress = JSON.parse(progressRaw);
          } else {
            // Calculate progress from user's reading data
            const readingData = await getUserReadingData(
              userId,
              challenge.startDate,
              challenge.endDate
            );

            let currentValue = 0;
            if (challenge.goalType === "pages") {
              currentValue = readingData.pages;
            } else if (challenge.goalType === "minutes") {
              currentValue = readingData.minutes;
            } else if (challenge.goalType === "sessions") {
              currentValue = readingData.sessions;
            } else if (challenge.goalType === "streak") {
              // Get all sessions to calculate streak
              const userKey = `reader:user:${userId}`;
              const userRaw = await client.get(userKey);
              if (userRaw) {
                const userData = JSON.parse(userRaw);
                const sessions = Array.isArray(userData.sessions)
                  ? userData.sessions
                  : [];
                currentValue = calculateStreakInRange(
                  sessions,
                  challenge.startDate,
                  challenge.endDate
                );
              }
            }

            progress = {
              challengeId,
              userId,
              currentValue,
              goalValue: challenge.goalValue,
              completed: currentValue >= challenge.goalValue,
              completedAt:
                currentValue >= challenge.goalValue
                  ? new Date().toISOString()
                  : null,
              rank: 0,
            };
          }

          res.status(200).json({ challenge, progress });
          return;
        }

        res.status(200).json({ challenge });
        return;
      }

      // Get all challenges (public + user's challenges)
      const allChallengeKeys = await client.keys("challenge:*");
      const challenges = [];

      for (const key of allChallengeKeys) {
        if (key.includes(":progress:")) continue; // Skip progress keys

        try {
          const raw = await client.get(key);
          if (raw) {
            const challenge = JSON.parse(raw);
            // Only include public challenges or challenges user is part of
            if (challenge.isPublic || (userId && challenge.participants?.includes(userId))) {
              challenges.push(challenge);
            }
          }
        } catch (error) {
          console.error(`Error processing challenge ${key}:`, error);
        }
      }

      // Sort by creation date (newest first)
      challenges.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      res.status(200).json({ challenges });
      return;
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

      const {
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
        participants = [],
      } = body;

      // Validation
      if (!type || !title || !goalType || !goalValue || !startDate || !endDate || !createdBy) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }

      const challenge = {
        id: `challenge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        title,
        description: description || "",
        goalType,
        goalValue: parseInt(goalValue, 10),
        startDate,
        endDate,
        createdBy,
        participants: [...new Set([...participants, createdBy])],
        isPublic: Boolean(isPublic),
        rewardCoins: parseInt(rewardCoins, 10) || 100,
        createdAt: new Date().toISOString(),
      };

      const key = `challenge:${challenge.id}`;
      await client.set(key, JSON.stringify(challenge));

      res.status(201).json({ challenge });
      return;
    }

    if (req.method === "PUT") {
      // Join a challenge
      const { challengeId, userId } = req.body;

      if (!challengeId || !userId) {
        res.status(400).json({ error: "Missing challengeId or userId" });
        return;
      }

      const key = `challenge:${challengeId}`;
      const raw = await client.get(key);
      if (!raw) {
        res.status(404).json({ error: "Challenge not found" });
        return;
      }

      const challenge = JSON.parse(raw);
      if (!challenge.participants.includes(userId)) {
        challenge.participants.push(userId);
        await client.set(key, JSON.stringify(challenge));
      }

      res.status(200).json({ challenge });
      return;
    }

    res.setHeader("Allow", "GET, POST, PUT");
    res.status(405).json({ error: "Method Not Allowed" });
  } catch (error) {
    console.error("Challenges API error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
