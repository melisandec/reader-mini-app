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
  try {
    // Extract fid from query string
    const fid = req.query?.fid;

    if (!fid) {
      console.log("API: Missing fid");
      res.status(400).json({ error: "Missing fid" });
      return;
    }

    console.log(`API: ${req.method} request for fid=${fid}`);
    const key = `reader:user:${fid}`;

    if (req.method === "GET") {
      try {
        const client = await getRedisClient();
        const raw = await client.get(key);
        if (!raw) {
          console.log(`API: No data found for fid=${fid}`);
          res.status(404).json({});
          return;
        }
        const data = JSON.parse(raw);
        console.log(
          `API: Returning ${data.sessions?.length || 0} sessions for fid=${fid}, current username: ${data?.username || 'none'}`
        );
        
        // Get username from data
        let username = data.username || data.displayName || data.stats?.username || data.stats?.displayName;
        
        // If username is fid: or Reader, fetch from Farcaster API and update database
        if (!username || username.startsWith('fid:') || username === 'Reader') {
          try {
            console.log(`API: Fetching real username from Farcaster API for fid=${fid}`);
            const farcasterResponse = await fetch(
              `https://api.farcaster.xyz/v2/user-by-fid?fid=${fid}`
            );
            if (farcasterResponse.ok) {
              const farcasterData = await farcasterResponse.json();
              if (farcasterData?.result?.user?.username) {
                username = farcasterData.result.user.username;
                console.log(`API: Got username from Farcaster API: ${username}`);
                
                // Update database with real username (async, don't wait)
                const updatedData = {
                  ...data,
                  username: username,
                  displayName: farcasterData.result.user.displayName || username,
                };
                client.set(key, JSON.stringify(updatedData)).catch(err => {
                  console.error(`API: Failed to update username in database:`, err);
                });
              } else if (farcasterData?.result?.user?.displayName) {
                username = farcasterData.result.user.displayName;
                console.log(`API: Got displayName from Farcaster API: ${username}`);
                
                // Update database
                const updatedData = {
                  ...data,
                  username: username,
                  displayName: username,
                };
                client.set(key, JSON.stringify(updatedData)).catch(err => {
                  console.error(`API: Failed to update username in database:`, err);
                });
              }
            } else {
              console.error(`API: Farcaster API returned status ${farcasterResponse.status}`);
            }
          } catch (apiError) {
            console.error(`API: Failed to fetch username from Farcaster API:`, apiError.message);
          }
        }
        
        // Return data with real username at top level
        const response = {
          ...data,
          username: (username && !username.startsWith('fid:') && username !== 'Reader') ? username : null,
          displayName: (data.displayName && data.displayName !== 'Reader') ? data.displayName : (username && !username.startsWith('fid:') && username !== 'Reader') ? username : null,
        };
        
        console.log(`API: Returning with username: ${response.username || 'null'}`);
        res.status(200).json(response);
        return;
      } catch (error) {
        console.error("GET error:", error);
        res.status(500).json({ error: "Failed to read user data" });
        return;
      }
    }

    if (req.method === "POST") {
      try {
        const client = await getRedisClient();
        // Parse body - Vercel should parse JSON automatically, but handle both cases
        let body = req.body;
        if (typeof body === "string") {
          body = JSON.parse(body);
        }
        body = body || {};

        const payload = {
          sessions: Array.isArray(body.sessions) ? body.sessions : [],
          stats: body.stats || null,
          // Get username from top level first, then fallback to stats
          username:
            body.username ||
            body.stats?.username ||
            body.stats?.displayName ||
            null,
          displayName:
            body.displayName ||
            body.stats?.displayName ||
            body.stats?.username ||
            null,
          updatedAt: Date.now(),
        };

        console.log(
          `API: Saving ${payload.sessions.length} sessions for fid=${fid}`
        );
        await client.set(key, JSON.stringify(payload));
        res.status(200).json({ ok: true });
        return;
      } catch (error) {
        console.error("POST error:", error);
        res.status(500).json({ error: "Failed to save user data" });
        return;
      }
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method Not Allowed" });
  } catch (error) {
    console.error("Handler error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
