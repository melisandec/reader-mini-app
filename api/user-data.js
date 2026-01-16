import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  const fid = req.query?.fid;
  if (!fid) {
    res.status(400).json({ error: "Missing fid" });
    return;
  }

  const key = `reader:user:${fid}`;

  if (req.method === "GET") {
    try {
      const data = await kv.get(key);
      if (!data) {
        res.status(404).json({});
        return;
      }
      res.status(200).json(data);
      return;
    } catch (error) {
      res.status(500).json({ error: "Failed to read user data" });
      return;
    }
  }

  if (req.method === "POST") {
    try {
      const body = req.body || {};
      const payload = {
        sessions: Array.isArray(body.sessions) ? body.sessions : [],
        stats: body.stats || null,
        updatedAt: Date.now(),
      };
      await kv.set(key, payload);
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
