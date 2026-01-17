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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const { username, fid } = req.body;

    if (!username && !fid) {
      res.status(400).json({ error: "Missing username or fid" });
      return;
    }

    const client = await getRedisClient();

    // Get all keys matching the pattern reader:user:*
    const keys = await client.keys("reader:user:*");

    if (!keys || keys.length === 0) {
      res.status(404).json({ error: "No users found" });
      return;
    }

    let foundKey = null;
    let foundFid = null;

    // Search for user by username or fid
    for (const key of keys) {
      try {
        const raw = await client.get(key);
        if (raw) {
          const data = JSON.parse(raw);
          const keyFid = key.replace("reader:user:", "");

          // Check if this matches the fid we're looking for
          if (fid && keyFid === String(fid)) {
            foundKey = key;
            foundFid = keyFid;
            break;
          }

          // Check if this matches the username we're looking for
          if (username) {
            const dataUsername =
              data?.username ||
              data?.displayName ||
              data?.stats?.username ||
              data?.stats?.displayName;

            // Normalize username (remove @ if present, case insensitive)
            const normalizedSearch = username.replace(/^@/, "").toLowerCase();
            const normalizedData = (dataUsername || "")
              .replace(/^@/, "")
              .toLowerCase();

            if (normalizedData === normalizedSearch) {
              foundKey = key;
              foundFid = keyFid;
              break;
            }
          }
        }
      } catch (error) {
        console.error(`Error reading key ${key}:`, error);
        continue;
      }
    }

    if (!foundKey) {
      res.status(404).json({
        error: "User not found",
        searched: username || fid,
      });
      return;
    }

    // Delete the user data
    await client.del(foundKey);

    res.status(200).json({
      success: true,
      message: "User data deleted",
      fid: foundFid,
      username: username || "unknown",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      error: "Failed to delete user data",
      details: error.message,
    });
  }
}
