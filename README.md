# Relay

Relay is a team kanban board for forward-deployed engineers (FDEs) and engineers, with a ranked feature-request backlog that connects customer needs to delivery.

## Features

- **Board:** To do, Doing, and Done columns; add, edit, delete, and drag cards with keyboard support; Doing WIP limit; filters.
- **Cards:** Tasks, bugs, features, and customer escalations with priority, assignee, customer account, labels, due date, blocked reason, and comments with `@mentions`.
- **Inbox:** Review recent activity and mentions.
- **Feature requests:** Ranked by a weighted score: RICE (50%), team votes (30%), and ARR at stake (20%). Each factor is normalized against the top active request. Each member has a 10-point vote budget and can spend at most 5 points per request. Leads can edit the weights in Settings.
- **Delivery loop:** Promote a request to a card; moving its linked card to Done automatically marks the request shipped.
- **Data:** Export/import workspace JSON or reset the demo data.

## Stack

React, TypeScript, and Vite; Zustand; Tailwind CSS v4; dnd-kit; Lucide icons; Vitest.

## Scripts

```sh
npm install
npm run dev
npm run test
npm run typecheck
npm run lint
npm run build
```

## Architecture

- `src/domain/`: shared data types and pure scoring functions.
- `src/store/`: seed data and the Zustand app store, persisted to browser localStorage under `relay:data` (version 1). This is the seam for a future backend.
- `src/lib/`: UI helpers and the transient UI store.
- `src/components/`: reusable UI components.
- `src/views/`: board, requests, inbox, and settings views.

## Roadmap to production

Add real authentication and SSO; replace the local persisted store with a backend API and multi-user sync; enforce role permissions server-side; add Slack/email notifications; and provide a durable audit log.
