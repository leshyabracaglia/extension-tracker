# Extension Tracker

A self-hosted dashboard and weekly email digest for your browser extension's store stats on
**Chrome, Firefox, Edge and Safari**. Each extension is a *product* with one or more store
*listings*. You can see the totals across every browser or break them down by browser.

- **Daily snapshots** of users, average rating, rating count and version for every listing
- **Combined and per-browser charts** (30 days / 90 days / 1 year)
- **Week-over-week (or 30/90-day) changes** for each extension and each browser
- **Weekly email digest** with totals, per-browser rows, and new releases
- Nothing to install in your extensions. It reads the public store listings.

## Where the numbers come from

| Store   | Source                                         | Users means…          | Notes |
|---------|------------------------------------------------|-----------------------|-------|
| Chrome  | Public listing page (scraped)                  | Weekly active users   | No official API, so this breaks if Google changes the page markup. See `server/stores/chrome.ts`. |
| Firefox | `addons.mozilla.org/api/v5` (public JSON API)  | Average daily users   | Also stores weekly downloads. |
| Edge    | Edge Add-ons product-details JSON              | Active installs       | |
| Safari  | iTunes lookup API (App Store)                  | —                     | Apple doesn't publish install counts, so only rating, rating count and version are tracked. Ratings are per country (`SAFARI_COUNTRY`). |

Totals add up the users from each browser. The combined rating is weighted by each store's
rating count. Stores define "users" differently (see the table), so treat the combined users
number as a rough overall size, not an exact count. Stores only show current numbers, so your
history starts the day you add a listing. A listing added mid-week doesn't count as growth in
that week's comparison. If a fetch fails, the last known value is carried forward and the
listing is flagged in the dashboard and in the email.

## Running it with GitHub Actions (no server)

1. List your extensions in `extensions.json` (see `extensions.example.json`). Each store
   accepts a store URL or an ID.
2. `.github/workflows/collect-stats.yml` runs daily at about 7am US Eastern. It snapshots every
   listing, saves the history (`tracker.db`) on the `stats-data` branch, and writes this week's
   email to `stats-data/digest.html` and `digest-subject.txt`.
3. Get the email every Monday in one of two ways (pick one, or you'll get two emails):
   - **SMTP from the workflow:** add repository secrets `SMTP_URL` and `DIGEST_TO` (and
     optionally `DIGEST_FROM`). On Mondays the workflow then sends the digest itself.
   - **Claude routine:** a weekly scheduled Claude session sends `digest.html` from your Gmail.
     The routine needs the Gmail connector attached.

Run the workflow by hand from the Actions tab ("Collect stats" → Run workflow) to check that
every store returns numbers. To browse the history in the dashboard, download `tracker.db` from
the `stats-data` branch and point `DATABASE_PATH` at it.

## Running it as a server

Requires Node 22.13+. The database is Node's built-in SQLite, so there's nothing native to compile.

```bash
npm install
cp .env.example .env      # fill in SMTP + DIGEST_TO for the email
npm run dev               # API on :3000, dashboard on http://localhost:5173
```

Production:

```bash
npm run build && npm start              # serves the API and dashboard on $PORT
# or
docker build -t extension-tracker .
docker run -d -p 3000:3000 -v tracker-data:/app/data --env-file .env extension-tracker
```

It's a long-running process: it runs its own cron jobs and keeps SQLite on disk. Host it
somewhere with a persistent disk, such as a small VPS, Fly.io with a volume, or Railway with a
volume. Serverless hosts like Vercel won't work. Set `APP_PASSWORD` to put the dashboard
behind HTTP basic auth.

### Schedules

- `FETCH_CRON` (default `0 6 * * *`): snapshot every listing daily
- `DIGEST_CRON` (default `0 9 * * 1`): refresh, then email the digest every Monday at 9am
- `TZ`: timezone for both schedules and for which calendar day a snapshot belongs to

### Email

`SMTP_URL` takes any SMTP provider in nodemailer URL form, for example
`smtps://resend:API_KEY@smtp.resend.com:465` or `smtps://you%40gmail.com:APP_PASSWORD@smtp.gmail.com:465`.
`DIGEST_TO` takes a comma-separated list of recipients.

### Handy commands

```bash
npm run fetch            # snapshot all listings now
npm run digest:preview   # write data/digest-preview.html without sending
npm run digest           # send the digest now
DATABASE_PATH=./data/demo.db npm run demo   # fill an empty DB with fake history to try the UI
npm test                 # parser, aggregation and digest tests
```
