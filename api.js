// miniapp/api.js — runs on FPS.ms (Node 20+)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import Database from "better-sqlite3";

const PORT = process.env.PORT || 8080;
const DB_PATH = process.env.DB_PATH || "/data/videos.db";
const PUBLIC_DIR = process.env.PUBLIC_DIR || "./public"; // not used for video, only static
const BOT_TOKEN = process.env.BOT_TOKEN; // to fetch file paths for thumbnails (optional)

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

// Simple in-memory cache: file_unique_id -> thumbnail URL
const thumbCache = new Map();

function json(res, code, body){
  res.writeHead(code, {
    "content-type":"application/json; charset=utf-8",
    "access-control-allow-origin":"*",
    "cache-control":"no-store"
  });
  res.end(JSON.stringify(body));
}

async function resolveThumbUrl(fileId){
  if(!fileId) return null;
  if(thumbCache.has(fileId)) return thumbCache.get(fileId);
  if(!BOT_TOKEN) return null;
  const api = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`;
  const r = await fetch(api);
  if(!r.ok) return null;
  const j = await r.json();
  if(!j.ok) return null;
  const p = j.result.file_path;
  const u = `https://api.telegram.org/file/bot${BOT_TOKEN}/${p}`;
  thumbCache.set(fileId, u);
  return u;
}

const server = http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);

  if(u.pathname === "/healthz"){
    return json(res, 200, { ok:true, ts:Date.now() });
  }

  if(u.pathname === "/api/videos" && req.method === "GET"){
    const limit = Math.min(parseInt(u.query.limit || "24", 10) || 24, 100);
    const offset = Math.max(parseInt(u.query.offset || "0", 10) || 0, 0);

    const totalRow = db.prepare("SELECT COUNT(*) AS c FROM videos WHERE is_active=1").get();
    const rows = db.prepare(`
      SELECT id, title, description, duration, width, height, file_size,
             thumbnail_file_id, views, downloads, created_at
      FROM videos WHERE is_active=1
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset);

    const items = [];
    for(const r of rows){
      items.push({
        id: r.id,
        title: r.title,
        description: r.description,
        duration: r.duration,
        width: r.width,
        height: r.height,
        file_size: r.file_size,
        views: r.views,
        downloads: r.downloads,
        created_at: r.created_at,
        thumbnail_url: await resolveThumbUrl(r.thumbnail_file_id) // may be null
      });
    }
    return json(res, 200, { total: totalRow.c, limit, offset, items });
  }

  if(u.pathname === "/api/video" && req.method === "GET"){
    const id = parseInt(u.query.id || "0", 10);
    if(!id) return json(res, 400, { error:"bad id" });
    const r = db.prepare(`SELECT * FROM videos WHERE id=? AND is_active=1`).get(id);
    if(!r) return json(res, 404, { error:"not found" });
    // Note: we deliberately DO NOT return file_id to the client.
    return json(res, 200, {
      id: r.id, title: r.title, description: r.description,
      duration: r.duration, width: r.width, height: r.height,
      file_size: r.file_size, views: r.views, downloads: r.downloads,
      thumbnail_url: await resolveThumbUrl(r.thumbnail_file_id)
    });
  }

  json(res, 404, { error:"not found" });
});

server.listen(PORT, () => console.log(`API listening on :${PORT}`));