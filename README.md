# payBot

Discord bot for Coinos Lightning deposits, withdrawals and in-server tipping.

## Requirements

- Node.js >= 18
- A Postgres database (Supabase recommended)

## Setup

1. Install dependencies:
   - `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `COINOS_TOKEN`
   - `COINOS_PIN`
   - `DATABASE_URL`
3. Start the bot:
   - `npm start`

## Project structure

```
src/
  index.js            Entry point: creates the client, wires events, logs in
  config.js           Env vars and constants (guild IDs, Coinos API URL)
  emoji.js            Custom Discord emoji IDs and tags
  db.js               Postgres pool
  events/             Discord event handlers (clientReady, interactionCreate)
  commands/           One file per slash command (data + execute); index.js registers them
  services/           Coinos API, LNURL / Lightning address, wallet balance + ledger logic
  utils/              Formatting, interaction helpers, admin checks, bot status
sql/                  Database schema
docs/                 Deployment guide and original requirements
```

To add a command, create `src/commands/<name>.js` exporting `data` and `execute`, then add it to the list in `src/commands/index.js`.

Deployment steps are in [docs/deployment.md](docs/deployment.md).

## Supabase / Postgres

1. Create a Postgres project (Supabase recommended).
2. Go to Project Settings -> Database -> Connection string and copy the `postgresql://` URL into `DATABASE_URL`.
3. Apply the schema in [sql/schema.sql](sql/schema.sql).

## What's new / Features

- Deposit responses now include a QR image of the BOLT11 invoice and a "Copy Invoice" button for easy copying.
- `/pay payreq` — pay a BOLT11 Lightning invoice directly from your bot balance.
- `/leaderboard type` — view top rain *makers* or *catchers*.
- `/help` — interactive help summary of available commands.
- Admin commands: `/admin`, `/userstats`, `/changestatus` (admin-only).

## Commands

- `/deposit amount:<sats>`
  - Creates a Lightning invoice via Coinos, shows the invoice text and a QR code image, and provides a quick "Copy Invoice" button. The invoice expires after 10 minutes; the bot checks it every 10 seconds until then and DMs you when the deposit is confirmed.
- `/link address:<name@domain>`
  - Link a Lightning Address (LNURL/pay style) for withdrawals.
- `/withdraw amount:<sats>`
  - Withdraw sats to your linked Lightning address (uses the address' pay callback).
- `/pay payreq:<bolt11>`
  - Pay a BOLT11 invoice using your bot balance. Invoice must include an amount.
- `/balance`
  - Shows your current balance and linked address.
- `/tip user:<@user> amount:<sats>`
  - Tip another user publicly from your balance.
- `/rain amount:<sats> maxcount:<n>`
  - Send sats to recent active users in the current channel (scans up to the last 1000 messages).
- `/minedrop amount:<sats> tiles:<2x2|3x3|4x4|5x5> duration:<5m|2h|24h>`
  - Drop sats on a board of hidden squares; the first user to click the treasure square wins. One try per user. Unclaimed drops expire after `duration` (default 5 minutes, 1 minute to 24 hours) and refund the host. Open drops are stored in the `minedrops` table, so they survive a restart.
- `/history`
  - Shows your last 10 balance ledger entries.
- `/leaderboard type:<makers|catchers>`
  - Shows top makers (who rain) or catchers (who received rain).
- `/help`
  - Shows the command summary.

## Amounts

Balances are kept to two decimal places. `/tip`, `/rain` and `/minedrop` accept amounts such as `0.25` (minimum `0.01`). `/deposit`, `/withdraw` and `/pay` work in whole sats only, so a fractional remainder can be tipped but not withdrawn on its own.

## Rain selection

`/rain` selects the most recent unique users from up to the last 1000 messages in the channel (excluding bots and the sender).

## Admin Commands (restricted)

- `/admin` — shows admin dashboard with total balances and a button to view recent withdrawals.
- `/userstats user:<@user>` — view a user's recent stats and balances.
- `/changestatus type name` — change the bot activity status (Playing/Listening/etc.).

Global slash commands may take a few minutes to appear in all servers after registering.
