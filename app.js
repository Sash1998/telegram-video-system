const tg = window.Telegram?.WebApp;
const C = window.APP_CONFIG || {};

tg?.ready();
tg?.expand();
tg?.setHeaderColor?.("#0f1115");

const state = { current: null };

function humanSize(n) {
  if (!n && n !== 0) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

function humanDuration(sec) {
  if (!sec && sec !== 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function botLink(startParam) {
  const bot = (C.BOT_USERNAME || "").replace(/^@/, "");
  return `https://t.me/${bot}?start=${encodeURIComponent(startParam)}`;
}

async function api(path) {
  const r = await fetch(C.API_BASE.replace(/\/$/, "") + path, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const $ = (s) => document.querySelector(s);

function renderVideo(v) {
  state.current = v;

  const thumb = $("#detailThumb");
  thumb.src = v.thumbnail_url || "";
  thumb.style.display = v.thumbnail_url ? "block" : "none";

  $("#detailTitle").textContent = v.title || "Untitled";
  $("#detailDesc").textContent = v.description || "";
  $("#detailDuration").textContent = humanDuration(v.duration);
  $("#detailSize").textContent = humanSize(v.file_size);
  $("#detailViews").textContent = v.views ?? 0;
  $("#detailDownloads").textContent = v.downloads ?? 0;

  const watchBtn = $("#watchBtn");
  watchBtn.disabled = false;
  watchBtn.textContent = "▶️ WATCH / STREAM";
  watchBtn.onclick = () => watchWithAd(v.id);
}

function deliverVideo(videoId) {
  const url = botLink(`video_${videoId}`);
  console.log("deliverVideo ->", url);
  try {
    if (tg && typeof tg.openTelegramLink === "function") {
      tg.openTelegramLink(url);
    } else if (tg && typeof tg.openLink === "function") {
      tg.openLink(url);
    } else {
      window.location.href = url;
      return;
    }
  } catch (e) {
    console.warn("openTelegramLink failed:", e);
    window.location.href = url;
    return;
  }
  setTimeout(() => {
    try { tg?.close?.(); } catch (e) {}
  }, 150);
}

function notifyUser(msg) {
  try {
    if (tg && typeof tg.showAlert === "function") tg.showAlert(msg);
    else alert(msg);
  } catch (e) { alert(msg); }
}

function watchWithAd(videoId) {
  tg?.HapticFeedback?.impactOccurred?.("medium");

  if (typeof window.show_11887264 !== "function") {
    console.warn("Monetag SDK not loaded — delivering without ad");
    deliverVideo(videoId);
    return;
  }

  window
    .show_11887264()
    .then(() => deliverVideo(videoId))
    .catch((e) => {
      console.warn("Ad not completed:", e);
      notifyUser("Please watch the full ad to continue.");
    });
}

async function loadVideoById(id) {
  try {
    const v = await api(`/api/video?id=${id}`);
    if (!v || !v.id) throw new Error("Video not found");
    renderVideo(v);
  } catch (e) {
    console.error("loadVideoById failed:", e);
    notifyUser("Video not found.");
  }
}

async function loadLatestVideo() {
  try {
    const data = await api(`/api/videos?limit=1&offset=0`);
    const items = data.items || [];
    if (items.length === 0) {
      notifyUser("No videos available yet.");
      return;
    }
    renderVideo(items[0]);
  } catch (e) {
    console.error("loadLatestVideo failed:", e);
    notifyUser("Failed to load video.");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (tg?.initDataUnsafe?.user) {
    const u = tg.initDataUnsafe.user;
    $("#userInfo").textContent = u.username ? "@" + u.username : (u.first_name || "");
  }

  const startParam = tg?.initDataUnsafe?.start_param || "";
  console.log("start_param:", startParam);

  if (startParam.startsWith("video_")) {
    const vid = parseInt(startParam.slice("video_".length), 10);
    if (!isNaN(vid)) {
      await loadVideoById(vid);
      return;
    }
  }

  await loadLatestVideo();
});
