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

## Cinematic studio edition — October 3, 2026

Run `node server-v2.js` and visit http://localhost:3060. The preview binds to
`127.0.0.1` only. Nothing was deployed and no domain settings were changed.

The latest design lives in `site-v2/index.html`, with the visual layer in
`site-v2/cinematic.css` and scroll depth in `site-v2/cinematic.js`. Existing
booking APIs, package prices, administration are preserved. The empty testimonials section stays hidden until real entries are
added to `testimonialData`.

Motion uses native scrolling, perspective transforms, and an IntersectionObserver
with one requestAnimationFrame per scroll event batch. Only visible project
scenes update. Small screens receive reduced displacement; reduced-motion
preferences disable the depth effects, including preference changes while open.
No video autoplay or animation dependencies are added.

### Asset budget

Higgsfield credits spent on this revision: **0 / 20**. Higgsfield was not available
through the connected tools or installable connectors. Existing project imagery
was reused; no substitute image generator was used. Optional future allocation:
up to 12 credits for one hero image, up to 8 for a necessary revision, only after
verifying actual generation costs. These are spending ceilings, not price quotes.
Do not generate if the total cannot be confirmed to stay within 20 credits.

### Local verification

Chromium checks passed at 320, 390, 768, 1024, and 1440px: no horizontal overflow
or JavaScript errors; menu open/Escape, pricing package selection, available-day
and time selection, and invalid-form validation work. Reduced-motion transforms
were verified. Booking submissions were not sent, so no real appointments or
calendar invitations were created during design QA.


## Portfolio policy — October 3, 2026

The user requested permanent removal of fictional concept projects. Their public
pages and dedicated media have been deleted. Only real work belongs in the
portfolio; do not reintroduce fictional brands or restore concepts from older
backups. SoBay Spotlights remains. This change is local only.

## Scroll-polish edition (site-scroll) — October 4, 2026

A copy of `site-live/` with a refined homepage scroll. Run `node server-scroll.js` → http://localhost:3090
(binds to 127.0.0.1 only; nothing deployed). `site-live/` (3080) and `site-v2/` (3060) are untouched.

- `site-scroll/depth.js` — small depth engine: `[data-depth]` layers move at a fraction of scroll speed
  (transform only, one rAF per scroll batch, idle when off screen, fully off under reduced motion).
- Hero has a palm-shadow plate behind the copy and the card drifting at different rates; the stage
  seam is gone; Services slides over the stage like a sheet; team portraits counter-drift; the page
  ends on a dusk Miami plate.
- Stage fixes: caption no longer collides with the exploded parts; outro appears only after the device lift.
- Fonts are self-hosted and preloaded (`site-scroll/fonts/`), which removed the headline reflow that
  was shifting the stage (CLS 0.07 → 0.00).
- Higgsfield: 4 stills with gpt_image_2_5 (2 palm-shadow plates, 2 dusk plates), about 1 credit total.
  Used `media/hero-plate.jpg` and `media/close-dusk.jpg`; unused originals are in `scrollcraft-src/`.
