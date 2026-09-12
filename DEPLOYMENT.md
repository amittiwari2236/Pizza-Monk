# 🚀 Render Blueprint Deployment Guide (100% Free)

This project includes a native **Render Blueprint (`render.yaml`)**, allowing you to deploy the full-stack application (Frontend + Backend + Real-time Socket.io) in **1-click on Render's Free tier**.

---

## ⚡ Quick 2-Minute Deployment (Using Blueprint)

### Step 1: Connect to Render
1. Go to **[render.com](https://render.com)** and sign in with your GitHub account.
2. In your dashboard, click **"New +"** (top right) $\rightarrow$ Select **"Blueprint"**.

---

### Step 2: Select Your Repository
1. Select your repository: **`amittiwari2236/Pizza-Monk`**.
2. Render will automatically read `render.yaml` and configure:
   - **Service Name**: `pizza-monk`
   - **Plan**: `Free` ($0/month)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
   - **Environment Variables**: Pre-filled automatically.

---

### Step 3: (Optional) Customize Admin Login Credentials
Before clicking Apply, you can customize the environment variables or keep the defaults:
- `ADMIN_IDENTIFIERS`: `admin,admin@canteen.com,your_custom_id`
- `ADMIN_PASSWORDS`: `admin123,your_custom_password`

---

### Step 4: Click "Apply"
1. Click **"Apply"** at the bottom of the page.
2. Render will build and deploy your project automatically.
3. Once the build finishes (takes ~1-2 minutes), click on your service to get your live URL:
   - **Live URL**: `https://pizza-monk.onrender.com` (or your custom service name).

---

## 🎯 What Works Out of the Box:
- ✅ **Full-Stack on a Single Domain**: Zero CORS issues between frontend, APIs, and WebSockets.
- ✅ **Real-Time WebSockets**: Socket.io real-time order and status sync between Admin and User panels.
- ✅ **Dynamic 7-Banner Engine & Sliding Categories**: Fully functional food ordering experience.
- ✅ **Clean URLs**: Clean paths like `/admin`, `/login`, `/menu`, `/cart`, `/orders` without requiring `.html`.
- ✅ **Zero Database Setup Needed**: Automatically runs on resilient built-in storage (`localDb`), or connects to external MySQL if configured.
- ✅ **Zero Credential Exposure**: Fully secured via environment variables.
