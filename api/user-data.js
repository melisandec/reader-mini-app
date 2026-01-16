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
        console.log(`API: Returning ${data.sessions?.length || 0} sessions for fid=${fid}`);
        res.status(200).json(data);
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
        if (typeof body === 'string') {
          body = JSON.parse(body);
        }
        body = body || {};
        
        const payload = {
          sessions: Array.isArray(body.sessions) ? body.sessions : [],
          stats: body.stats || null,
          updatedAt: Date.now(),
        };
        
        console.log(`API: Saving ${payload.sessions.length} sessions for fid=${fid}`);
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
