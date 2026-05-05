# payBot

Discord bot for Coinos Lightning deposits and withdrawals.

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

## Supabase Postgres

1. Create a Supabase project.
2. Go to Project Settings -> Database -> Connection string.
3. Copy the `postgresql://` connection string into `DATABASE_URL`.
4. Apply the schema in [sql/schema.sql](sql/schema.sql).

## Commands

- `/deposit amount:<sats>`
  - Creates a Lightning invoice via Coinos and returns it.
- `/link address:<name@domain>`
   - Links a Lightning address for withdrawals.
- `/withdraw amount:<sats>`
   - Withdraws sats to your linked Lightning address.
- `/balance`
   - Shows your balance after syncing paid deposit invoices.
- `/tip user:<@user> amount:<sats>`
   - Sends sats from your balance to another user.
- `/rain amount:<sats> maxcount:<n>`
   - Sends sats to recent users in the current channel.
- `/history`
   - Shows your last 10 balance entries.

## Rain selection

`/rain` selects the most recent unique users from up to the last 1000 messages in the channel (excluding bots and the sender).

Global commands can take a few minutes to appear in all servers.
