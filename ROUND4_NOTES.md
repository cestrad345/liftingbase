# Homework 06 — Round 4: Functional Changes

This is an AI-assisted working copy of Group 8's Workout Tracker, preserving the original project structure. The supplied copy intentionally excludes `node_modules`, built assets, and local SQLite database records.

## Feature changes

- Register, log in, and log out via new `/api/auth` endpoints. Passwords are salted and hashed with Node's `scrypt`.
- API endpoints require an authenticated bearer token and sessions can be revoked on logout. Token hashes are stored in the database with 14-day expiration.
- `users` and `auth_tokens` tables are created automatically. `user_id` is added to the existing workout and session tables via a startup migration.
- All saved routines, completed workout history, weekly counts, exercise progress queries, and recent sets are restricted to the current user.
- Workout edit/delete and session delete operations verify ownership before modifying records.
- Draft workouts use user-specific localStorage keys, and the dashboard displays recently trained exercises.
- Legacy routines/sessions that existed before accounts were added retain a NULL user ID and are not automatically assigned to new accounts.

## Setup

From the project root, install dependencies with `npm install`, then `npm run dev`. Open http://localhost:5173 and register a user. For production, run `npm run build` followed by `npm start`.

The `DATABASE_URL` environment variable defaults to `file:local.db`; for remote Turso use the existing `.env.example` values. Do not commit secrets or share user databases.

## Suggested tests

1. Register account A, create and log a workout, verify history, dashboard, and progress.
2. Log out, register account B, verify A's data does not appear. Try accessing A's routine via the URL; it must return 404.
3. Verify B cannot edit/delete A's routine or delete A's session (404).
4. Start a workout as A, save draft, log out, log into B, verify B does not see A's draft. Log back into A and verify draft resume works.
5. Test invalid login, short registration passwords, and unauthenticated `/api/workouts` requests (401).
6. Delete A's saved routine and verify its completed session still appears in A's history.

## Verification status

TypeScript compiler checks passed for `client` and `server`. Full runtime/build integration was **not verified** in the preparation environment: the original ZIP contained Windows-specific native packages and the Linux-native Rollup/libSQL binaries were unavailable here. Perform `npm install` on the computer you will demo on and run all tests above before submitting.

## Round 5 direction

After functionality is verified, refactor without changing endpoints or UX: separate authentication and workout/session data access into services/repositories, add integration tests for authorization, remove duplicated response-shaping logic, and regenerate the architectural diagrams. Keep this Round 4 ZIP/commit as a baseline for before-and-after comparison.
