const tg = window.Telegram?.WebApp;
const C = window.APP_CONFIG || {};

tg?.ready();
tg?.expand();
tg?.setHeaderColor?.("#0f1115");

const state = {
  offset: 0,
  pageSize: C.PAGE_SIZE || 24,
  total: 0,
  videos: [],
  current: null,
};

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

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
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
const listEl = $("#videoList");
const emptyEl = $("#emptyState");
const loadMoreEl = $("#loadMore");

// ---------- grid (fallback) ----------
function cardFor(v) {
  const el = document.createElement("div");
  el.className = "card";
  const thumb = v.thumbnail_url
    ? `<img class="thumb" loading="lazy" src="${v.thumbnail_url}" alt="">`
    : `<div class="thumb"></div>`;
  el.innerHTML = `
    ${thumb}
    <h3>${escapeHtml(v.title)}</h3>
    <div class="sub">${humanDuration(v.duration)} • ${humanSize(v.file_size)}</div>
    <button class="btn primary">Open</button>
  `;
  el.querySelector("button").addEventListener("click", () => openDetail(v));
  return el;
}

function renderHome() {
  listEl.innerHTML = "";
  if (state.videos.length === 0) {
    emptyEl.hidden = false;
    loadMoreEl.hidden = true;
    return;
  }
  emptyEl.hidden = true;
  state.videos.forEach((v) => listEl.appendChild(cardFor(v)));
  loadMoreEl.hidden = state.videos.length >= state.total;
}

// ---------- detail view ----------
function openDetail(v) {
  state.current = v;
  $("#view-home").hidden = true;
  $("#view-detail").hidden = false;

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
  if (watchBtn) {
    watchBtn.textContent = "▶️ WATCH / STREAM";
    watchBtn.onclick = () => watchWithAd(v.id);
  }

  tg?.HapticFeedback?.impactOccurred?.("light");
}

function back() {
  $("#view-detail").hidden = true;
  $("#view-home").hidden = false;
}

// ---------- delivery ----------
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
    if (tg && typeof tg.showAlert === "function") {
      tg.showAlert(msg);
    } else {
      alert(msg);
    }
  } catch (e) {
    alert(msg);
  }
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
    .then(() => {
      console.log("Ad completed — delivering video");
      deliverVideo(videoId);
    })
    .catch((e) => {
      console.warn("Ad not completed:", e);
      notifyUser("Please watch the full ad to continue.");
    });
}

// ---------- loading ----------
async function loadSingleVideo(videoId) {
  try {
    const v = await api(`/api/video?id=${videoId}`);
    if (!v || !v.id) throw new Error("Video not found");
    openDetail(v);
  } catch (e) {
    console.error("loadSingleVideo failed:", e);
    tg?.showAlert ? tg.showAlert("Video not found.") : alert("Video not found.");
    // Fall back to grid
    await loadPage();
  }
}

async function loadPage() {
  try {
    const data = await api(`/api/videos?limit=${state.pageSize}&offset=${state.offset}`);
    state.total = data.total ?? data.items?.length ?? 0;
    state.videos = state.videos.concat(data.items || []);
    state.offset += (data.items || []).length;
    renderHome();
  } catch (e) {
    console.error(e);
    tg?.showAlert ? tg.showAlert("Failed to load videos.") : alert("Failed to load videos.");
  }
}

// ---------- bootstrap ----------
document.addEventListener("DOMContentLoaded", async () => {
  if (tg?.initDataUnsafe?.user) {
    const u = tg.initDataUnsafe.user;
    $("#userInfo").textContent = u.username ? "@" + u.username : (u.first_name || "");
  }
  $("#backBtn").addEventListener("click", back);
  loadMoreEl.addEventListener("click", loadPage);

  // Read start_param from Telegram (e.g. "video_10")
  const startParam = tg?.initDataUnsafe?.start_param || "";
  console.log("start_param:", startParam);

  if (startParam.startsWith("video_")) {
    const vid = parseInt(startParam.slice("video_".length), 10);
    if (!isNaN(vid)) {
      // Show ONLY this video's detail view
      await loadSingleVideo(vid);
      return;
    }
  }

  // No start_param → show the full grid
  await loadPage();
});
