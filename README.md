# To Do App
Node.js server + REST API + web frontend. No dependencies, no install step. Accounts with private lists per user, light/dark mode.

## Run locally (1 terminal)
    node server.js          # http://localhost:3000  (Node 16+)

## 1. Push to GitHub
    git init && git add . && git commit -m "To Do app"
    git branch -M main
    git remote add origin https://github.com/YOUR-USERNAME/todo-app.git
    git push -u origin main

## 2a. Deploy frontend + backend together on Render (recommended)
1. render.com -> New -> Blueprint -> pick your repo (it reads render.yaml).
2. Deploy. Your app is live at https://todo-app.onrender.com (login included).
render.yaml attaches a 1 GB persistent disk (paid "starter" plan) so data survives restarts.
On the free plan, remove the `disk:` block and `DATA_DIR`; data then resets on restart/redeploy.

## 2b. Docker (any host: Fly.io, Railway, VPS)
    docker build -t todo-app .
    docker run -p 3000:3000 -v todo-data:/data -e SECRET=change-me todo-app

## 3. Optional: frontend on GitHub Pages, backend elsewhere
1. Deploy the backend (2a). In Render set env var ALLOW_ORIGIN=https://YOUR-USERNAME.github.io
2. Edit public/config.js -> window.API_BASE = 'https://todo-app.onrender.com';
3. GitHub repo -> Settings -> Pages -> Source: "GitHub Actions". Push to main; the included workflow publishes public/.

## Environment variables
PORT (default 3000) | DATA_DIR (where data.json lives) | SECRET (token signing key; auto-generated if unset) | ALLOW_ORIGIN (CORS, default *)

## Notes
Passwords are hashed with scrypt. Login/register are rate limited. Sessions last 30 days.
Storage is a JSON file: fine for personal or small-team use; move to a database for heavy traffic.
