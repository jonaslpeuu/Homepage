# hoppedev.app

Static first version of the `hoppedev.app` homepage.

## Run locally

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Notes

- Product cards are placeholders until the real iOS app list is available.
- App cards are loaded from the App Store through `netlify/functions/apps.js`.
- Local static preview uses `data/apps.json`, generated from the same function, so screenshots work without Netlify Dev.
- The featured area shows the first three apps from the feed unless `FEATURED_APP_IDS` is set in Netlify.
- The legal section is prepared in English for German requirements, but still needs the final imprint details.
- The page uses a small custom Three.js background inspired by pseudo-height fog and rotating product panels.
