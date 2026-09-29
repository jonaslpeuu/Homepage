import { initHeroAtmosphere } from "./hero-atmosphere.js?v=20260929j";

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();

const appState = {
  apps: [],
};

loadApps();
setupModal();

initHeroAtmosphere({
  canvas: document.querySelector("#scene"),
  hero: document.querySelector(".hero"),
});

async function loadApps() {
  const featuredRoot = document.querySelector("#featured-apps");
  const allRoot = document.querySelector("#all-apps-list");
  if (!featuredRoot || !allRoot) return;

  try {
    const data = await fetchApps();
    appState.apps = data.apps || [];
    renderFeatured(data.featured?.length ? data.featured : appState.apps.slice(0, 3), featuredRoot);
    renderAllApps(appState.apps, allRoot);
    updateHeroStats(data.stats, appState.apps);
  } catch (error) {
    featuredRoot.innerHTML = `<p class="loading-copy">App Store apps could not be loaded right now.</p>`;
    allRoot.innerHTML = "";
    updateHeroStats(null, []);
    console.error(error);
  }
}

async function fetchApps() {
  try {
    const response = await fetch("/api/apps", {
      credentials: "omit",
      headers: { accept: "application/json" },
    });
    if (response.ok) return response.json();
  } catch {
    // Local/static previews without Netlify Functions fall back to Apple's public lookup API.
  }

  try {
    return await fetchAppleLookupApps();
  } catch {
    // If Apple's public lookup API is unavailable, use the checked-in snapshot as a last resort.
  }

  try {
    const response = await fetch("/data/apps.json", { headers: { accept: "application/json" } });
    if (response.ok) return response.json();
  } catch {
    // The checked-in snapshot is optional.
  }

  throw new Error("No App Store catalog source responded");
}

async function fetchAppleLookupApps() {
  const response = await fetch("https://itunes.apple.com/lookup?id=1869099620&entity=software&country=us&limit=200");
  if (!response.ok) throw new Error("Apple lookup failed");
  const payload = await response.json();
  const apps = payload.results
    .filter((item) => item.wrapperType === "software")
    .sort((a, b) => new Date(b.currentVersionReleaseDate || b.releaseDate) - new Date(a.currentVersionReleaseDate || a.releaseDate))
    .map((app) => ({
      id: app.trackId,
      name: app.trackCensoredName || app.trackName,
      subtitle: subtitleFromName(app.trackCensoredName || app.trackName),
      description: app.description || "",
      shortDescription: firstSentence(app.description || ""),
      category: app.primaryGenreName || "iOS App",
      genres: app.genres || [],
      icon: app.artworkUrl512 || app.artworkUrl100,
      screenshots: app.screenshotUrls || [],
      appStoreUrl: app.trackViewUrl,
      supportUrl: app.sellerUrl || "",
      price: app.formattedPrice || "Free",
      rating: app.averageUserRating || null,
      ratingCount: app.userRatingCount || 0,
      version: app.version || "",
      updatedAt: app.currentVersionReleaseDate || app.releaseDate || "",
      minimumOsVersion: app.minimumOsVersion || "",
    }));

  return {
    developer: {
      id: 1869099620,
      name: "Johanna Hoppe",
      url: "https://apps.apple.com/us/developer/johanna-hoppe/id1869099620",
    },
    updatedAt: new Date().toISOString(),
    stats: buildStats(apps),
    featured: apps.slice(0, 3),
    apps,
  };
}

function renderFeatured(apps, root) {
  root.innerHTML = apps.map((app) => appCard(app, true)).join("");
  preloadAppIcons(apps);
  preloadAppScreenshotsLater(apps);
}

function renderAllApps(apps, root) {
  root.innerHTML = apps.map((app) => appRow(app)).join("");
  preloadAppIcons(apps);
  preloadAppScreenshotsLater(apps);
}

function appCard(app) {
  return `
    <article class="app-card live-app-card">
      <button type="button" class="app-open" data-app-id="${app.id}" aria-label="Open ${escapeAttr(app.name)} details">
        <img class="app-icon-img" src="${escapeAttr(cachedImageUrl(app.icon))}" alt="${escapeAttr(app.name)} icon" loading="eager" decoding="async" fetchpriority="high" />
        <p class="app-kicker">${escapeHtml(app.category || "iOS App")}</p>
        <h3>${escapeHtml(app.name)}</h3>
        <p>${escapeHtml(app.shortDescription || app.subtitle || "Available on the App Store.")}</p>
        <span>View details</span>
      </button>
    </article>
  `;
}

function appRow(app) {
  return `
    <article class="app-row">
      <button type="button" class="app-row-main" data-app-id="${app.id}" aria-label="Open ${escapeAttr(app.name)} details">
        <img class="app-row-icon" src="${escapeAttr(cachedImageUrl(app.icon))}" alt="${escapeAttr(app.name)} icon" loading="eager" decoding="async" fetchpriority="high" />
        <span>
          <strong>${escapeHtml(app.name)}</strong>
          <small>${escapeHtml(app.subtitle || app.shortDescription || app.category || "iOS App")}</small>
        </span>
      </button>
      <a href="${escapeAttr(app.appStoreUrl)}" target="_blank" rel="noreferrer">App Store</a>
    </article>
  `;
}

function setupModal() {
  document.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-app-id]");
    if (openButton) {
      const app = appState.apps.find((item) => String(item.id) === String(openButton.dataset.appId));
      if (app) openModal(app);
      return;
    }

    if (event.target.closest("[data-close-modal]")) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
}

function openModal(app) {
  const modal = document.querySelector("#app-modal");
  const icon = document.querySelector("#modal-icon");
  const title = document.querySelector("#modal-title");
  const subtitle = document.querySelector("#modal-subtitle");
  const description = document.querySelector("#modal-description");
  const storeLink = document.querySelector("#modal-store-link");
  const screenshots = document.querySelector("#modal-screenshots");
  const content = document.querySelector(".modal-content");
  if (!modal || !icon || !title || !subtitle || !description || !storeLink || !screenshots || !content) return;

  icon.src = cachedImageUrl(app.icon);
  icon.alt = `${app.name} icon`;
  title.textContent = app.name;
  subtitle.textContent = app.subtitle || app.category || "iOS App";
  description.textContent = app.description || app.shortDescription || "Open the App Store listing for details.";
  storeLink.href = app.appStoreUrl;

  const shots = app.screenshots?.slice(0, 3) || [];
  screenshots.innerHTML = shots.length
    ? shots.map((src, index) => `<img src="${escapeAttr(cachedImageUrl(src))}" alt="${escapeAttr(app.name)} screenshot ${index + 1}" loading="eager" />`).join("")
    : `<div class="screenshot-fallback"><img src="${escapeAttr(cachedImageUrl(app.icon))}" alt="" /><span>Screenshots load from the App Store when available.</span></div>`;

  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  content.scrollTop = 0;
  document.querySelector(".modal-close")?.focus();
  preloadAppIcons([app]);
  preloadImages((app.screenshots || []).slice(0, 3).map(cachedImageUrl));
}

function closeModal() {
  const modal = document.querySelector("#app-modal");
  if (!modal || modal.getAttribute("aria-hidden") === "true") return;
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function updateHeroStatus(count) {
  const status = [...document.querySelectorAll(".hero-meta div")].find((item) => item.querySelector("span")?.textContent === "Status");
  const strong = status?.querySelector("strong");
  if (!strong) return;
  strong.textContent = count
    ? `${count} live App Store ${count === 1 ? "app" : "apps"}`
    : "No live App Store apps";
}

function cachedImageUrl(src) {
  if (!src) return "";
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return src;
  return `/api/app-image?src=${encodeURIComponent(src)}`;
}

function preloadAppIcons(apps) {
  preloadImages(apps.map((app) => app.icon).filter(Boolean).map(cachedImageUrl));
}

function preloadAppScreenshotsLater(apps) {
  const urls = apps
    .flatMap((app) => (app.screenshots || []).slice(0, 3))
    .filter(Boolean)
    .map(cachedImageUrl);

  const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 1200));
  schedule(() => preloadImages(urls), { timeout: 3000 });
}

function preloadImages(urls) {
  [...new Set(urls)].forEach((url) => {
    if (!url) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = url;
    document.head.appendChild(link);
  });

  urls.forEach((url) => {
    if (!url) return;
    const image = new Image();
    image.decoding = "async";
    image.src = url;
  });
}

function updateHeroStats(stats, apps) {
  const fallbackStats = stats || buildStats(apps);
  updateHeroLatest(fallbackStats.latestUpdate);
  updateHeroStatus(fallbackStats.liveAppCount || 0);
}

function updateHeroLatest(latestUpdate) {
  const latestTile = [...document.querySelectorAll(".hero-meta div")].find((item) => item.querySelector("span")?.textContent === "Latest update");
  const strong = latestTile?.querySelector("strong");
  if (!strong) return;
  strong.textContent = latestUpdate ? latestUpdate.compactName : "No release data";
  if (latestUpdate?.date) {
    strong.title = `${latestUpdate.appName} - ${formatReleaseDate(latestUpdate.date)}`;
  }
}

function buildStats(apps) {
  const latestUpdate = [...apps]
    .filter((app) => app.updatedAt || app.releaseDate)
    .sort((a, b) => new Date(b.updatedAt || b.releaseDate) - new Date(a.updatedAt || a.releaseDate))[0];

  return {
    liveAppCount: apps.length,
    latestUpdate: latestUpdate
      ? {
          appId: latestUpdate.id,
          appName: latestUpdate.name,
          compactName: compactAppName(latestUpdate.name),
          date: latestUpdate.updatedAt || latestUpdate.releaseDate,
        }
      : null,
  };
}

function compactAppName(name = "") {
  return String(name)
    .replace(/\s*[:–-]\s*.*/, "")
    .trim()
    .slice(0, 28) || "Latest app";
}

function formatReleaseDate(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function subtitleFromName(name = "") {
  return name.includes(":") ? name.split(":").slice(1).join(":").trim() : "";
}

function firstSentence(text = "") {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s/)
    .find(Boolean)
    ?.slice(0, 180) || "";
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}
