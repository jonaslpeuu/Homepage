export default async () => {
  const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://hoppedev.app";
  const appsResponse = await fetch(`${baseUrl}/api/apps`, {
    headers: { accept: "application/json" },
  });

  if (!appsResponse.ok) {
    throw new Error(`Could not warm app cache: ${appsResponse.status}`);
  }

  const payload = await appsResponse.json();
  const imageUrls = [
    ...new Set(
      (payload.apps || [])
        .flatMap((app) => [app.icon, ...(app.screenshots || [])])
        .filter(Boolean),
    ),
  ];

  const results = await Promise.allSettled(
    imageUrls.map((src) =>
      fetch(`${baseUrl}/api/app-image?src=${encodeURIComponent(src)}`, {
        headers: { accept: "image/*" },
      }),
    ),
  );

  const warmed = results.filter((result) => result.status === "fulfilled" && result.value.ok).length;
  const failed = results.length - warmed;

  console.log(`Warmed ${warmed} app images. Failed: ${failed}.`);
  return new Response(JSON.stringify({ apps: payload.apps?.length || 0, warmed, failed }), {
    headers: { "content-type": "application/json" },
  });
};

export const config = {
  schedule: "0 0 */2 * *",
};
