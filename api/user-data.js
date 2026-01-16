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
  const fid = req.query?.fid;
  if (!fid) {
    res.status(400).json({ error: "Missing fid" });
    return;
  }

  const key = `reader:user:${fid}`;

  if (req.method === "GET") {
    try {
      const client = await getRedisClient();
      const raw = await client.get(key);
      if (!raw) {
        res.status(404).json({});
        return;
      }
      res.status(200).json(JSON.parse(raw));
      return;
    } catch (error) {
      res.status(500).json({ error: "Failed to read user data" });
      return;
    }
  }

  if (req.method === "POST") {
    try {
      const client = await getRedisClient();
      const body = req.body || {};
      const payload = {
        sessions: Array.isArray(body.sessions) ? body.sessions : [],
        stats: body.stats || null,
        updatedAt: Date.now(),
      };
      await client.set(key, JSON.stringify(payload));
      res.status(200).json({ ok: true });
      return;
    } catch (error) {
      res.status(500).json({ error: "Failed to save user data" });
      return;
    }
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Method Not Allowed" });
}
