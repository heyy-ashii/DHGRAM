# DHGRAM — Share & Message

A chat and thought-sharing platform for students: a public **Thoughts** feed, one-to-one **Messages** between students, and a built-in **Chat with Admin** inside Messages. Sign-up is by name + admission number on the student roster.

Created by **Ashique.Pilassery**.

One Vercel project serves both parts:

| Part | Tech | Path |
| --- | --- | --- |
| Frontend | Vite · React 19 · TypeScript · Tailwind CSS v4 · TanStack Query · React Router | `src/` → built to `dist/` |
| API | Express 5 · Mongoose (MongoDB) · JWT in HttpOnly cookie · Zod · Helmet · rate limiting · Nodemailer | `server/`, exposed by `api/index.js` at `/api/v1/*` |

Because the site and the API share one domain, there is no cross-site cookie/CORS setup to get wrong.

## Routes

**Public:** `/` (stories + Thoughts feed) · `/feed` (Thoughts) · `/messages` (one-to-one chat + support, signed-in) · `/profile` (own profile, signed-in) · `/u/:username` (any profile) · `/about` · `/contact` · `/login` · `/signup` · `/account` (signed-in users)

Legacy `/discover`, `/programs/:id`, `/search` and `/admin/*` redirect to `/feed` or `/`.

**API (`/api/v1`):**

| Area | Endpoints |
| --- | --- |
| Health | `GET /health` |
| Auth | `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/password/request-otp`, `POST /auth/password/reset`, `GET /auth/me`, `GET /auth/users/:username`, `PATCH /auth/update-me`, `PATCH /auth/update-password` |
| Posts | `GET /posts` (optionally `?author=<id>`), signed-in: `POST /posts`, `PATCH /posts/:id`, `DELETE /posts/:id`, `POST /posts/:id/like` |
| Stories | `GET /stories`, signed-in: `GET /stories/mine`, `POST /stories`, `DELETE /stories/:id`, `POST /stories/:id/view`, `GET /stories/:id/viewers` |
| Messages | signed-in: `GET /messages`, `GET /messages/directory`, `POST /messages/start`, `GET /messages/:id`, `POST /messages/:id`, `GET /messages/unread` |
| Support chat | user: `GET /chat/me`, `GET /chat/me/unread`, `POST /chat/me/messages`; admin: `GET /chat/conversations`, `GET/POST /chat/conversations/:id/messages`, `PATCH /chat/conversations/:id` |

## Features

- **Stories:** the home page opens with an Instagram-style story tray. Signed-in students post a photo that stays live for **24 hours**; a coloured ring marks unseen stories. Tapping an avatar opens a full-screen viewer with tap/arrow navigation. Views are recorded per viewer, and the author can see who watched.
- **Thoughts:** any signed-in account can post text thoughts to the public feed, edit or delete their own, and like others' posts. Thoughts appear under the story tray on the home page and on each profile.
- **Profiles:** `/u/:username` shows anyone's avatar, thought count and thoughts. Your own profile (`/profile`) also lets you change your name/username and **add, change or remove a profile picture**.
- **About:** `/about` is a public page describing how DHGRAM works; the same content is available from the profile's three-dot menu.
- **Messages:** signed-in students see **all other students** in the Messages sidebar (not just existing conversations) and start a one-to-one chat from there. The page is full-screen. Messages refresh by polling.
- **30-day retention:** messages older than `CHAT_RETENTION_DAYS` (30 by default) are deleted when a thread is read and by the daily cleanup cron.
- **Chat with Admin:** lives inside Messages. Students open the **Support** conversation (sidebar or header button) to message the admin team; admins land on the support inbox in Messages and can reply or mark conversations resolved. There is no separate admin dashboard.
- **Create Account:** on `/login` or `/signup`. The student enters the name and admission number on the student list; a matching entry creates an account whose username is built from the name and whose initial password is the admission number. There is no email step.
- **Forgot password:** reset by emailed code.

> Images (avatars and stories) are downscaled in the browser and stored inline as data URLs, so there is no object-storage service to configure. Keep an eye on row size if you raise the client compression limits.

## Security

- Passwords hashed with bcrypt (cost 12); OTP codes hashed too, expire after 10 min, allow 5 attempts, have a 60 s resend cooldown, and can be used once.
- JWT in an `HttpOnly`, `Secure` (prod), `SameSite=Lax` cookie; tokens are invalidated after a password change or when the account is disabled.
- Sign-up always creates `role: user` (the request body can't set role).
- Rate limits on the whole API, plus stricter ones on login, OTP and chat; accounts lock for 15 min after 5 failed logins.
- Helmet headers, no `X-Powered-By`, CORS limited to an explicit allow-list (never reflects arbitrary origins).
- Input validation with Zod; invalid IDs return a clean 400/404; production errors never expose database internals.

## Local development

Requires Node 20+ (22 recommended).

```bash
npm install
npm run dev          # web on http://localhost:5173, API on http://localhost:4000 (proxied at /api)
```

Without `MONGODB_URI`, the dev server starts an **in-memory MongoDB** and seeds sample data plus two accounts:

| Username | Password | Role |
| --- | --- | --- |
| `admin` | `admin12345` | admin |
| `student` | `student12345` | user |

These exist **only** in local dev with in-memory data. They are never created in production.

**OTP without SMTP:** if the `SMTP_*` variables aren't set, the code is printed in the API terminal (`[mail:dev] …`). Outside production, the sign-up form also shows it so you can test the flow end to end.

To use a real database locally, copy `.env.example` to `.env` and fill it in.

Other scripts:

```bash
npm run build        # type-check + production build
npm run lint         # oxlint
npm test             # API integration tests (in-memory MongoDB)
npm run seed:admin   # create/update an admin (see below)
```

## Deploying to Vercel

1. **MongoDB Atlas.** Create a cluster (the free M0 tier works) and a database user. Under *Network Access*, allow `0.0.0.0/0`, since Vercel uses dynamic IPs. Copy the connection string, e.g. `mongodb+srv://user:pass@cluster0.xxxx.mongodb.net/dhgram`.
2. **Gmail App Password** (for email codes). Turn on 2-Step Verification for the DHGRAM Gmail account, then create an App Password at https://myaccount.google.com/apppasswords.
3. **Import the repo.** In Vercel, click *Add New → Project* and pick this repo. Vercel detects **Vite** from `vercel.json`; leave the build settings at their defaults.
4. **Environment variables.** Add these under *Project → Settings → Environment Variables* (Production + Preview):

   | Name | Required | Value |
   | --- | --- | --- |
   | `MONGODB_URI` | yes | Atlas connection string |
   | `JWT_SECRET` | yes | random 64+ chars: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `SMTP_HOST` | for email OTP | `smtp.gmail.com` |
   | `SMTP_PORT` | for email OTP | `465` |
   | `SMTP_USER` | for email OTP | DHGRAM Gmail address |
   | `SMTP_PASS` | for email OTP | the 16-char App Password |
   | `MAIL_FROM` | optional | `DHGRAM <dhgram.app@gmail.com>` |
   | `CORS_ORIGINS` | optional | only if another domain must call the API |

   > Without SMTP in production, sign-up codes only appear in *Vercel → Logs*. Set SMTP before you announce sign-ups.
5. **Deploy**, then open `https://<your-app>.vercel.app/api/v1/health`. It should return `{"status":"success","message":"DHGRAM API running"}`.
6. **Create the first admin** from your machine (once):
   ```bash
   MONGODB_URI="mongodb+srv://..." ADMIN_USERNAME=ashique ADMIN_PASSWORD='a-strong-password' ADMIN_EMAIL=dhgram.app@gmail.com npm run seed:admin
   ```
   Running it again resets that admin's password.
7. **Custom domain** (optional): *Project → Settings → Domains*. Nothing else needs to change, because the API is same-origin.

### How it runs on Vercel

- `vercel.json` builds the SPA into `dist/`, rewrites `/api/*` to the single serverless function `api/index.js` (the Express app), and serves `index.html` for all other paths (client-side routing).
- The Mongo connection is cached on `globalThis`, so warm function calls reuse it.
- Hashed assets are cached for a year (`immutable`), and security headers are added to every response.

## Adding SMS later

Phone sign-up is intentionally deferred. To add it, pick a provider (MSG91, Fast2SMS, Twilio), add a `sendOtpSms()` next to `sendOtpEmail()` in `server/utils/email.js`, and accept `phone` as an alternative to `email` in `server/routes/auth.js` and the `Otp`/`User` models.

## Project structure

```
api/index.js            Vercel function entry (exports the Express app)
server/
  app.js                Express app: security middleware, routes, errors
  config.js  db.js      env config, cached Mongo connection
  models/               User, Otp, Post, Chat (Conversation/Message), PeerChat
  routes/               auth, posts, stories, messages, chat
  middleware/           auth guards, Zod validation, rate limits, error handler
  utils/                email (OTP), JWT cookies, AppError
  scripts/              seed-admin, dev-seed
  tests/                API integration tests (Vitest + Supertest)
  dev.js                local API server (in-memory Mongo fallback)
src/
  pages/                Home, Feed, Messages, Profile, About, Contact, Account, Login
  components/           Navbar, Footer, AdminChat, SupportInbox, AuthPanel, ui
  context/              Auth + UI (theme, toasts)
  lib/                  API client, queries, types, utils
vercel.json             build, rewrites, headers
```
