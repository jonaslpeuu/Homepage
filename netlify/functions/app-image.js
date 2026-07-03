const ALLOWED_HOSTS = new Set([
  "is1-ssl.mzstatic.com",
  "is2-ssl.mzstatic.com",
  "is3-ssl.mzstatic.com",
  "is4-ssl.mzstatic.com",
  "is5-ssl.mzstatic.com",
]);

exports.handler = async (event) => {
  try {
    const src = event.queryStringParameters?.src;
    if (!src) return text("Missing image source.", 400);

    const url = new URL(src);
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
      return text("Image source is not allowed.", 400);
    }

    const response = await fetch(url, {
      headers: {
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "user-agent": "hoppedev.app image cache",
      },
    });

    if (!response.ok) return text(`Image fetch failed: ${response.status}`, response.status);

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const bytes = Buffer.from(await response.arrayBuffer());

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=172800, immutable",
        "cdn-cache-control": "public, max-age=172800, stale-while-revalidate=86400",
        "netlify-cdn-cache-control": "public, durable, max-age=172800, stale-while-revalidate=86400",
        "access-control-allow-origin": "*",
      },
      body: bytes.toString("base64"),
    };
  } catch (error) {
    return text(error.message || "Image proxy failed.", 500);
  }
};

function text(body, statusCode) {
  return {
    statusCode,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
    body,
  };
}
