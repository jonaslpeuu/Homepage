import * as THREE from "three";

const noise = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float FBM(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 6; ++i) {
    value += amplitude * snoise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}
`;

THREE.ShaderChunk.fog_pars_vertex = `
  varying vec3 vWorldPosition;
`;
THREE.ShaderChunk.fog_vertex = `
  vWorldPosition = worldPosition.xyz;
`;
THREE.ShaderChunk.fog_pars_fragment = `
  uniform float uFogTime;
  uniform float uFogDistortion;
  uniform float uFogSpeed;
  uniform vec3 uFogDirection;
  uniform vec3 uFogScale;
  uniform vec3 uFogPosition;
  uniform vec3 fogColor;
  varying vec3 vWorldPosition;
  uniform float fogDensity;
  float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
  }
  ${noise}
`;
THREE.ShaderChunk.fog_fragment = `
  #ifdef USE_FOG
    vec3 size = uFogScale;
    float fogFactor = 1.0 - sdBox(vWorldPosition + uFogPosition, size);
    fogFactor = pow(max(fogFactor, 0.0), 0.5);
    float fogDepth = distance(vWorldPosition, cameraPosition);
    float expFactor = 1.0 - exp(-fogDensity * fogDensity * fogDepth * fogDepth);
    vec3 noiseSampleCoord = vWorldPosition * 0.025;
    float n = FBM(noiseSampleCoord + FBM(noiseSampleCoord + (uFogDirection * uFogTime * 0.025 * uFogSpeed))) * 0.5 + 0.5;
    n = 1.0 - (n * uFogDistortion);
    fogFactor *= expFactor * n;
    fogFactor = clamp(fogFactor * fogDensity * 5.0, 0.0, 1.0);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  #endif
`;

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();

const appState = {
  apps: [],
};

loadApps();
setupModal();

const canvas = document.querySelector("#scene");
const hero = document.querySelector(".hero");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const fogShaders = [];
const fogSettings = {
  density: 0.28,
  speed: 1.35,
  distortion: 1.05,
  direction: new THREE.Vector3(1, 0, 0),
  scale: new THREE.Vector3(90, 2.45, 90),
  position: new THREE.Vector3(0, 0, 0),
};

function useHeightFog(material) {
  material.fog = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFogTime = { value: 0 };
    shader.uniforms.uFogSpeed = { value: fogSettings.speed };
    shader.uniforms.uFogDistortion = { value: fogSettings.distortion };
    shader.uniforms.uFogDirection = { value: fogSettings.direction };
    shader.uniforms.uFogScale = { value: fogSettings.scale };
    shader.uniforms.uFogPosition = { value: fogSettings.position };
    fogShaders.push(shader);
  };
  material.needsUpdate = true;
  return material;
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
renderer.setClearColor(0xf6f8f6, 1);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xffffff, fogSettings.density);
scene.background = new THREE.Color(0xf6f8f6);

const camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 120);
camera.position.set(-32, 24, 32);
camera.zoom = 1.08;
camera.updateProjectionMatrix();

const group = new THREE.Group();
group.position.set(0, -0.2, 0);
scene.add(group);

const palette = [0x2c679c, 0x5b93bd, 0x8fb6cc, 0xd8e7ec, 0x174b7b];
const panelGeometry = new THREE.BoxGeometry(0.9, 4.6, 0.1);
const ringGeometry = new THREE.TorusGeometry(8.8, 0.014, 8, 190);
const dotGeometry = new THREE.SphereGeometry(0.028, 10, 10);

for (let i = 0; i < 18; i += 1) {
  const angle = (i / 18) * Math.PI * 2;
  const radius = 7.8 + Math.sin(i * 1.7) * 1.6;
  const material = useHeightFog(new THREE.MeshStandardMaterial({
    color: palette[i % palette.length],
    emissive: palette[i % palette.length],
    emissiveIntensity: 0.02,
    roughness: 0.42,
    metalness: 0.08,
    transparent: true,
    opacity: 0.42,
  }));
  const panel = new THREE.Mesh(panelGeometry, material);
  panel.castShadow = true;
  panel.receiveShadow = true;
  panel.position.set(Math.cos(angle) * radius, 2.4 + Math.sin(i * 0.9) * 1.4, Math.sin(angle) * radius);
  panel.rotation.set(0.08 * Math.sin(i), -angle + Math.PI / 2, 0.06 * Math.cos(i));
  panel.userData = { angle, radius, lift: panel.position.y, speed: 0.08 + i * 0.001 };
  group.add(panel);
}

const towerGeometry = new THREE.BoxGeometry(1, 1, 1);
for (let i = 0; i < 430; i += 1) {
  const height = 0.7 + Math.random() * 10.5;
  const blue = new THREE.Color("#6fa1c4").lerp(new THREE.Color("#0f4b82"), Math.random() * 0.72);
  const material = useHeightFog(new THREE.MeshStandardMaterial({
    color: blue.multiplyScalar(0.78 + Math.random() * 0.35),
    roughness: 0.34,
    metalness: 0.02,
  }));
  const tower = new THREE.Mesh(towerGeometry, material);
  tower.castShadow = true;
  tower.receiveShadow = true;
  const skinny = Math.random() > 0.72;
  tower.scale.set(
    skinny ? 0.08 + Math.random() * 0.12 : 0.16 + Math.random() * 0.48,
    height,
    skinny ? 0.08 + Math.random() * 0.12 : 0.16 + Math.random() * 0.48,
  );
  tower.position.set((Math.random() - 0.5) * 46, height / 2 - 1.85, (Math.random() - 0.5) * 46);
  tower.rotation.y = Math.random() * Math.PI;
  group.add(tower);
}

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(88, 88, 28, 28),
  useHeightFog(new THREE.MeshStandardMaterial({ color: 0xdde8ea, roughness: 0.9, metalness: 0 })),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.86;
floor.receiveShadow = true;
scene.add(floor);

for (let i = 0; i < 3; i += 1) {
  const ring = new THREE.Mesh(
    ringGeometry,
    new THREE.MeshBasicMaterial({
      color: i === 0 ? 0x6fa1c4 : 0xbfd2d9,
      transparent: true,
      opacity: i === 0 ? 0.11 : 0.055,
    }),
  );
  ring.rotation.x = Math.PI / 2 + i * 0.18;
  ring.position.y = -1.25 + i * 1.25;
  group.add(ring);
}

for (let i = 0; i < 140; i += 1) {
  const dot = new THREE.Mesh(
    dotGeometry,
    new THREE.MeshBasicMaterial({
      color: palette[i % palette.length],
      transparent: true,
      opacity: 0.05 + Math.random() * 0.12,
    }),
  );
  dot.position.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 12);
  dot.userData = { baseY: dot.position.y, drift: 0.3 + Math.random() * 0.9 };
  scene.add(dot);
}

scene.add(new THREE.HemisphereLight(0xffffff, 0x7f9aad, 5.3));

const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(-18, 28, 16);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const warmLight = new THREE.PointLight(0x8fc4e8, 1.2, 22);
warmLight.position.set(8, 3, 8);
scene.add(warmLight);

let scrollProgress = 0;
let targetScroll = 0;

function updateScroll() {
  const heroHeight = hero?.offsetHeight || window.innerHeight;
  targetScroll = Math.min(window.scrollY / heroHeight, 1);
  if (canvas) {
    canvas.style.opacity = `${Math.max(0, 1 - targetScroll * 1.35)}`;
  }
}

function resize() {
  const rect = hero?.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect?.width || window.innerWidth));
  const height = Math.max(1, Math.round(rect?.height || window.innerHeight));
  const aspect = width / height;
  camera.left = -13.8 * aspect;
  camera.right = 13.8 * aspect;
  camera.top = 13.8;
  camera.bottom = -13.8;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

window.addEventListener("resize", resize, { passive: true });
window.addEventListener("scroll", updateScroll, { passive: true });
resize();
updateScroll();

const clock = new THREE.Clock();

function animate() {
  const elapsed = clock.getElapsedTime();
  scrollProgress += (targetScroll - scrollProgress) * 0.08;

  const motionScale = reducedMotion.matches ? 0 : 1;
  fogShaders.forEach((shader) => {
    shader.uniforms.uFogTime.value = elapsed;
    shader.uniforms.fogDensity.value = fogSettings.density;
  });

  group.rotation.y = elapsed * 0.022 * motionScale + scrollProgress * Math.PI * 0.45;
  group.rotation.x = -0.04 + scrollProgress * 0.12;
  group.position.y = -0.2 - scrollProgress * 1.4;

  group.children.forEach((child) => {
    if (!child.userData.radius) return;
    child.position.y =
      child.userData.lift + Math.sin(elapsed * child.userData.speed * 5 + child.userData.angle) * 0.22 * motionScale;
  });

  scene.children.forEach((child) => {
    if (!child.userData.drift) return;
    child.position.y = child.userData.baseY + Math.sin(elapsed * child.userData.drift) * 0.28 * motionScale;
  });

  camera.position.x = -32 + scrollProgress * 2;
  camera.position.z = 32 - scrollProgress * 2;
  camera.position.y = 24 - scrollProgress * 1.2;
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

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
  preloadAppImages(apps);
}

function renderAllApps(apps, root) {
  root.innerHTML = apps.map((app) => appRow(app)).join("");
  preloadAppImages(apps);
}

function appCard(app) {
  return `
    <article class="app-card live-app-card">
      <button type="button" class="app-open" data-app-id="${app.id}" aria-label="Open ${escapeAttr(app.name)} details">
        <img class="app-icon-img" src="${escapeAttr(cachedImageUrl(app.icon))}" alt="${escapeAttr(app.name)} icon" loading="lazy" />
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
        <img class="app-row-icon" src="${escapeAttr(cachedImageUrl(app.icon))}" alt="${escapeAttr(app.name)} icon" loading="eager" decoding="async" />
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
  if (!modal || !icon || !title || !subtitle || !description || !storeLink || !screenshots) return;

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
  document.querySelector(".modal-close")?.focus();
  preloadAppImages([app]);
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

function preloadAppImages(apps) {
  const urls = [
    ...new Set(
      apps
        .flatMap((app) => [app.icon, ...(app.screenshots || []).slice(0, 3)])
        .filter(Boolean)
        .map(cachedImageUrl),
    ),
  ];
  urls.forEach((url) => {
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
