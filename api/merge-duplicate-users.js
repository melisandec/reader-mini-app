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
 */
function deduplicateSessions(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return [];
  }

  const seen = new Map();
  const unique = [];

  for (const session of sessions) {
    const key = `${session.date}|${session.bookName}|${session.pagesRead}|${session.minutesRead}`;
    
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
    const client = await getRedisClient();

    // Get all keys matching the pattern reader:user:*
    const keys = await client.keys("reader:user:*");

    if (!keys || keys.length === 0) {
      res.status(200).json({ message: "No users found", merged: 0 });
      return;
    }

    // Group keys by FID (handle different key formats)
    const usersByFid = new Map();

    for (const key of keys) {
      const fid = key.replace("reader:user:", "");
      
      if (!usersByFid.has(fid)) {
        usersByFid.set(fid, []);
      }
      usersByFid.get(fid).push(key);
    }

    let mergedCount = 0;
    const results = [];

    // For each FID with multiple keys, merge them
    for (const [fid, keyList] of usersByFid.entries()) {
      if (keyList.length > 1) {
        console.log(`Found ${keyList.length} entries for FID ${fid}, merging...`);
        
        // Load all data for this FID
        const allSessions = [];
        let mergedStats = null;
        let mergedUsername = null;
        let mergedDisplayName = null;
        let latestUpdatedAt = 0;

        for (const key of keyList) {
          try {
            const raw = await client.get(key);
            if (raw) {
              const data = JSON.parse(raw);
              
              // Merge sessions
              if (Array.isArray(data.sessions)) {
                allSessions.push(...data.sessions);
              }
              
              // Keep the most recent stats
              if (data.stats && (!mergedStats || (data.updatedAt || 0) > latestUpdatedAt)) {
                mergedStats = data.stats;
              }
              
              // Keep the most recent username
              if (data.username && (!mergedUsername || (data.updatedAt || 0) > latestUpdatedAt)) {
                mergedUsername = data.username;
                mergedDisplayName = data.displayName;
              }
              
              // Track latest update time
              if (data.updatedAt && data.updatedAt > latestUpdatedAt) {
                latestUpdatedAt = data.updatedAt;
              }
            }
          } catch (error) {
            console.error(`Error reading key ${key}:`, error);
          }
        }

        // Deduplicate sessions
        const uniqueSessions = deduplicateSessions(allSessions);

        // Create merged data
        const mergedData = {
          sessions: uniqueSessions,
          stats: mergedStats,
          username: mergedUsername,
          displayName: mergedDisplayName,
          updatedAt: Date.now(),
        };

        // Save to the first key (primary key)
        const primaryKey = keyList[0];
        await client.set(primaryKey, JSON.stringify(mergedData));

        // Delete all other duplicate keys
        for (let i = 1; i < keyList.length; i++) {
          await client.del(keyList[i]);
        }

        mergedCount++;
        results.push({
          fid,
          keysMerged: keyList.length,
          sessionsBefore: allSessions.length,
          sessionsAfter: uniqueSessions.length,
          sessionsRemoved: allSessions.length - uniqueSessions.length,
        });
      }
    }

    res.status(200).json({
      success: true,
      merged: mergedCount,
      results,
      message: `Merged ${mergedCount} duplicate user(s)`,
    });
  } catch (error) {
    console.error("Merge duplicate users error:", error);
    res.status(500).json({ error: "Failed to merge duplicate users", details: error.message });
  }
}
