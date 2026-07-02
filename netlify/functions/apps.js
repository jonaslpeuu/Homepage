const DEVELOPER_ID = "1869099620";
const COUNTRY = "us";
const LOOKUP_URL = `https://itunes.apple.com/lookup?id=${DEVELOPER_ID}&entity=software&country=${COUNTRY}&limit=200`;
const FEATURED_IDS = (process.env.FEATURED_APP_IDS || "")
  .split(",")
  .map((id) => Number(id.trim()))
  .filter(Boolean);

let cache = null;
let cacheTime = 0;
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

exports.handler = async () => {
  try {
    if (cache && Date.now() - cacheTime < CACHE_TTL_MS) {
      return json(cache, 200, "public, max-age=600, s-maxage=21600");
    }

    const lookup = await fetchJson(LOOKUP_URL);
    const rawApps = lookup.results
      .filter((item) => item.wrapperType === "software")
      .sort((a, b) => new Date(b.currentVersionReleaseDate || b.releaseDate) - new Date(a.currentVersionReleaseDate || a.releaseDate));

    const apps = await mapLimit(rawApps, 4, async (app) => {
      const page = await fetchAppStorePage(app.trackViewUrl).catch(() => "");
      const subtitle = extractSubtitle(page) || extractSubtitleFromName(app.trackCensoredName || app.trackName);
      const pageScreenshots = extractScreenshots(page);
      const screenshots = unique([...(app.screenshotUrls || []), ...pageScreenshots]).slice(0, 5);

      return {
        id: app.trackId,
        name: app.trackCensoredName || app.trackName,
        subtitle,
        description: app.description || "",
        shortDescription: firstSentence(app.description || subtitle),
        category: app.primaryGenreName,
        genres: app.genres || [],
        icon: app.artworkUrl512 || app.artworkUrl100,
        screenshots,
        appStoreUrl: app.trackViewUrl,
        supportUrl: app.sellerUrl || "",
        price: app.formattedPrice || "Free",
        rating: app.averageUserRating || app.averageUserRatingForCurrentVersion || null,
        ratingCount: app.userRatingCount || app.userRatingCountForCurrentVersion || 0,
        version: app.version || "",
        releaseDate: app.releaseDate || "",
        updatedAt: app.currentVersionReleaseDate || app.releaseDate || "",
        minimumOsVersion: app.minimumOsVersion || "",
      };
    });

    const featured = selectFeatured(apps);
    const payload = {
      developer: {
        id: Number(DEVELOPER_ID),
        name: "Johanna Hoppe",
        url: `https://apps.apple.com/${COUNTRY}/developer/johanna-hoppe/id${DEVELOPER_ID}`,
      },
      updatedAt: new Date().toISOString(),
      featured,
      apps,
    };

    cache = payload;
    cacheTime = Date.now();
    return json(payload, 200, "public, max-age=600, s-maxage=21600");
  } catch (error) {
    return json({ error: "Could not load App Store apps.", detail: error.message }, 502, "no-store");
  }
};

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "hoppedev.app app catalog",
      accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`Apple lookup failed: ${response.status}`);
  return response.json();
}

async function fetchAppStorePage(url) {
  const response = await fetch(url.replace("?uo=4", ""), {
    headers: {
      "user-agent": "Mozilla/5.0 hoppedev.app app catalog",
      accept: "text/html",
    },
  });
  if (!response.ok) throw new Error(`App Store page failed: ${response.status}`);
  return response.text();
}

function extractSubtitle(html) {
  const match = html.match(/<p class="subtitle[^"]*"[^>]*>(.*?)<\/p>/);
  return match ? decodeHtml(stripTags(match[1])).trim() : "";
}

function extractScreenshots(html) {
  const urls = html.match(/https:\/\/is\d-ssl\.mzstatic\.com\/image\/thumb\/PurpleSource[^"' <]+\/(?:230x498|300x650|314x680|460x996|600x1300)bb(?:-60)?\.(?:jpg|webp)/g) || [];
  const originals = unique(
    urls
      .map((url) => url.match(/^(https:\/\/is\d-ssl\.mzstatic\.com\/image\/thumb\/PurpleSource.+?\.png)\//)?.[1])
      .filter(Boolean),
  );
  return originals.map((url) => `${url}/300x650bb-60.jpg`);
}

function extractSubtitleFromName(name = "") {
  const parts = name.split(":");
  return parts.length > 1 ? parts.slice(1).join(":").trim() : "";
}

function firstSentence(text = "") {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s/)
    .find(Boolean)
    ?.slice(0, 180) || "";
}

function selectFeatured(apps) {
  if (FEATURED_IDS.length) {
    const prioritized = FEATURED_IDS.map((id) => apps.find((app) => app.id === id)).filter(Boolean);
    return uniqueById([...prioritized, ...apps]).slice(0, 3);
  }
  return apps.slice(0, 3);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function mapLimit(items, limit, iterator) {
  const results = [];
  const executing = [];
  for (const item of items) {
    const promise = Promise.resolve().then(() => iterator(item));
    results.push(promise);
    executing.push(promise);
    promise.finally(() => executing.splice(executing.indexOf(promise), 1));
    if (executing.length >= limit) await Promise.race(executing);
  }
  return Promise.all(results);
}

function stripTags(value) {
  return value.replace(/<[^>]*>/g, "");
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function json(body, statusCode, cacheControl) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
      "access-control-allow-origin": "*",
    },
    body: JSON.stringify(body),
  };
}
