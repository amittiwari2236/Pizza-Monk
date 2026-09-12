# 🚀 Railway Deployment Guide for Pizza Monk's Smart Canteen

This application is 100% pre-configured and production-ready for **[Railway](https://railway.app)**.

---

## ⚡ Quick 2-Minute Deployment

### Step 1: Connect Repository to Railway
1. Go to **[railway.app](https://railway.app)** and log in with your GitHub account.
2. Click **"New Project"** (or **"+ Create Project"**).
3. Select **"Deploy from GitHub repo"**.
4. Choose your repository: **`amittiwari2236/Pizza-Monk`**.
5. Click **"Deploy Now"**.

---

### Step 2: (Optional but Recommended) Add MySQL Database
Railway lets you add a managed MySQL database with 1-click:
1. In your Railway project dashboard, click **"New"** (top right) $\rightarrow$ **"Database"** $\rightarrow$ **"Add MySQL"**.
2. Railway will automatically provision MySQL and expose `DATABASE_URL` and `MYSQLHOST`.
3. The app automatically detects this connection string with **zero code changes needed**.

> **Note:** If you do not add MySQL, the app will automatically run on the built-in local JSON database (`localDb`) without crashing!

---

### Step 3: Add Admin Credentials (Environment Variables)
In your Railway dashboard:
1. Click on your web service card $\rightarrow$ Go to the **"Variables"** tab.
2. Click **"New Variable"** and add:
   - `ADMIN_IDENTIFIERS`: `admin,admin@canteen.com,your_admin_username`
   - `ADMIN_PASSWORDS`: `admin123,your_secure_password`

*(You can also customize these passwords and emails to anything you prefer!)*

---

### Step 4: Generate Your Public Domain / Live URL
1. In your service card, go to the **"Settings"** tab.
2. Scroll to the **"Networking"** section.
3. Under **Public Networking**, click **"Generate Domain"** (e.g. `pizza-monk-production.up.railway.app`).
4. Click your live URL to open your app!

---

## 🎯 What Works Out of the Box:
- ✅ **Dynamic Hero Banners**: 7 dynamic sliding hero banners computed based on time-of-day and demand.
- ✅ **7-Category Sliding Row & Filters**: Smooth horizontal sliding category selector and advanced popup filter.
- ✅ **Real-Time WebSockets**: Socket.io real-time order and status updates between User and Admin panels.
- ✅ **Clean URLs**: Clean paths like `/admin`, `/login`, `/menu`, `/cart`, `/orders` without requiring `.html`.
- ✅ **Automated Health Check**: Accessible at `/health` for Railway monitoring.
- ✅ **Zero Credential Leaks**: Fully secured via environment variables.
