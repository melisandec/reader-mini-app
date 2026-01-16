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
 * Remove duplicate sessions from an array
 * Duplicates are identified by:
 * 1. Same ID (exact duplicates)
 * 2. Same date + bookName + pagesRead + minutesRead (logical duplicates)
 */
function deduplicateSessions(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return [];
  }

  const seen = new Map();
  const unique = [];

  for (const session of sessions) {
    // Create a unique key for this session
    const key = `${session.date}|${session.bookName}|${session.pagesRead}|${session.minutesRead}`;
    
    // Check if we've seen this exact ID or this logical duplicate
    if (!seen.has(session.id) && !seen.has(key)) {
      seen.set(session.id, true);
      seen.set(key, true);
      unique.push(session);
    }
  }

  return unique;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const { fid } = req.body;

    if (!fid) {
      res.status(400).json({ error: "Missing fid" });
      return;
    }

    const client = await getRedisClient();
    const key = `reader:user:${fid}`;
    const raw = await client.get(key);

    if (!raw) {
      res.status(404).json({ error: "No data found for this user" });
      return;
    }

    const data = JSON.parse(raw);
    const originalCount = data.sessions?.length || 0;

    // Deduplicate sessions
    const uniqueSessions = deduplicateSessions(data.sessions || []);
    const removedCount = originalCount - uniqueSessions.length;

    // Update data with deduplicated sessions
    const updatedData = {
      ...data,
      sessions: uniqueSessions,
    };

    // Save back to database
    await client.set(key, JSON.stringify(updatedData));

    res.status(200).json({
      success: true,
      originalCount,
      uniqueCount: uniqueSessions.length,
      removedCount,
      message: `Removed ${removedCount} duplicate session(s)`,
    });
  } catch (error) {
    console.error("Deduplication error:", error);
    res.status(500).json({ error: "Failed to deduplicate sessions", details: error.message });
  }
}
