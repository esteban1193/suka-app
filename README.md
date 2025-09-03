# Interactive Scheduler (Vite + React)

This repo is pre-configured to deploy to **GitHub Pages** from the `dev` branch using GitHub Actions.

## Local dev
```bash
npm i
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## GitHub Pages (project site: https://USER.github.io/REPO_NAME/)
1. Edit `vite.config.js` and set:
   ```js
   base: '/REPO_NAME/'
   ```
2. Commit & push to `dev`.
3. In GitHub **Settings → Pages**, set Source: **GitHub Actions**.
4. After the workflow finishes, your site is live at `https://USER.github.io/REPO_NAME/`.

## GitHub Pages (root site: https://USER.github.io)
If your repo is named exactly `USER.github.io`, set:
```js
base: '/'
```
and push to `dev` (or adjust the workflow's branch).
