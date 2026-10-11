# TAOG Visitor System

Browser-based visitor management app built with React, Vite, Express, and Neon Postgres. Vercel serves the frontend and API; Neon provides durable hosted data storage.

## Deploy the complete app to Vercel

1. Push this project to a Git provider and import that repository in [Vercel](https://vercel.com/new). The Vercel project root should be the repository root. The included `vercel.json` builds the Vite frontend to `dist`, routes `/api` to the Express Vercel Function, and sends browser page routes to the SPA.
2. In the Vercel project, add the **Neon** integration from the Vercel Marketplace and connect a Neon Postgres database. Make sure the project has a `DATABASE_URL` environment variable for Production and Preview deployments.
3. Add `SESSION_SECRET` and `INITIAL_SETUP_TOKEN` as private Vercel environment variables. Generate each locally with:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Run the command twice and use a different random value for each variable. Do not commit either value or put them in a `VITE_` variable.
4. Deploy. On the first visit, enter the `INITIAL_SETUP_TOKEN` in the one-time administrator setup screen, then create the admin email and password. Remove `INITIAL_SETUP_TOKEN` from the Vercel project after setup and redeploy. The admin can create further staff accounts in **Settings → Register staff**.

The Vercel-hosted frontend and API use the same origin. Visitor records, staff accounts, and sign-in sessions persist in Neon, not in Vercel's temporary function filesystem. A Neon database is required; local SQLite files are not used by the deployed application.

### Move existing local SQLite data

If you have visitor records or staff accounts in `server/visitors.db`, first set the Neon `DATABASE_URL` in an uncommitted `.env.local` file (see `.env.example`), then run:

```sh
npm install
npm run migrate-sqlite -- "C:\path\to\server\visitors.db"
```

The importer copies visitor records, follow-ups, and staff password hashes into Neon while keeping their IDs. It does not copy local session cookies. Do the migration before inviting staff to use the deployed app. Back up the SQLite file first.

## Local development

Copy `.env.example` to `.env.local`, add a Neon `DATABASE_URL`, then run:

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` to Express on port `5000`; both use the same Neon database specified in `.env.local`. When there are no staff accounts, the app shows the one-time administrator setup form. For local setup, no token is required.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the frontend and local Express API |
| `npm run build` | Build the Vercel static frontend |
| `npm start` | Run the Express server locally with production assets |
| `npm run migrate-sqlite -- <file>` | Import an existing SQLite database into the configured Neon database |
| `npm run lint` | Run ESLint |
