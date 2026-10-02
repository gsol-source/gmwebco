# GM Web Co. — Website

Local website for GM Web Co. with a booking system for free Google Meet consultations.

## Run it

Only needs Node.js (v18+). No installs.

```bash
node server.js
```

- Website: http://localhost:3050
- Admin (see all bookings): http://localhost:3050/admin — password protected

Locally, bookings are saved in `data/bookings.json`. On Vercel they’re stored in Redis (`REDIS_URL`, connected in Vercel → Storage).

## Live site (Vercel)

- Site: https://gm-web-co.vercel.app
- Admin: https://gm-web-co.vercel.app/admin
- Deploy changes: `vercel deploy --prod`
- Private settings live in Vercel → Project → Settings → Environment Variables:
  `ADMIN_PASSWORD`, `SESSION_SECRET`, and (optional) `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Database: Redis “redis-camel-diamond” (free, 30 MB) connected via Vercel → Storage.

## Settings

Copy `config.example.json` to `config.json` and edit:

| Setting | What it does |
|---|---|
| `hours` | Bookable hours per day, Miami time, 24h: `"0"` = Sunday … `"6"` = Saturday, e.g. `"1": [17, 21]` = Mon 5–9pm. Remove a day to close it. |
| `slotMinutes` | Call length |
| `daysAhead` | How far ahead people can book |
| `minNoticeHours` | Minimum notice before a call |
| `adminPassword` | Password for the admin page (`/admin`) |

Restart the server after changing config.

## Automatic Google Meet links (recommended)

Without this, bookings are saved and you send the Meet link yourself. With it, every booking
creates an event on your Google Calendar with a Meet link, and Google emails the client the invite.

1. Go to https://console.cloud.google.com → create a project (e.g. "GM Web Co").
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen** → External → fill in app name + your email.
   Under **Test users**, add the Google account whose calendar you'll use.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Type: **Web application**
   - Authorized redirect URIs: `http://localhost:3050/api/oauth2callback` and `https://gm-web-co.vercel.app/api/oauth2callback`
5. Copy the Client ID and Client Secret into `config.json` (`googleClientId`, `googleClientSecret`) for local use,
   and into Vercel env vars `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for the live site.
6. Restart/redeploy, log in to the admin page and click **Connect Google**.

Done — the admin page will show "Google Calendar connected".

> Tip: use a shared business Gmail (e.g. gmwebco@gmail.com) so both partners can see the calendar,
> or share that calendar with each other.

## Editing content

- Homepage text, prices, FAQ: `public/index.html`
- Homepage colors & styles: `public/home.css` (tokens at the top) · motion & booking: `public/site.js`
- Concept sites linked from the portfolio: `public/concepts/*.html` (standalone pages)
- Privacy and 404 share `public/home.css`; booking management still uses `public/styles.css`
- Previous homepages are in `backups/`
- Booking & admin logic: `lib/app.js` (storage in `lib/store.js`)
- Local server: `server.js` · Vercel entry: `api/index.js`

## Keep private

`config.json` and `data/` contain secrets and customer info — don't share or commit them.

## Local remaster — September 30, 2026

The homepage now uses an editorial layout with Instrument Serif and Manrope, a warm paper / vermilion palette, a four-project gallery, services, process, studio, pricing, FAQ, and the existing booking integration. This revision is local only. The prior homepage, motion code, styles, and theme override are saved in `backups/pre-remaster-2026-09-30/`. Earlier palettes are in `backups/theme-tests/`.

## Local rebuild (site-v2) — October 1, 2026

`site-v2/` is the improved live gmwebco.com design (cream / ink / orange), local only. Run it with `node server-v2.js` → http://localhost:3060 (site-v2 files first, everything else falls back to `public/`). Testimonials go in the `#testimonialData` JSON block in `site-v2/index.html`. The previous local redesign is saved in `backups/local-redesign-2026-10-01/`.
