# MySQL Migration TODO

## Done

- [x] Clone the upstream `glink25/Cent` project into the workspace.
- [x] Read the app structure, current storage abstraction, and main business flow.
- [x] Confirm the current architecture is `Vite + React + IndexedDB cache + pluggable sync endpoints`.
- [x] Decide the migration strategy:
  Keep the existing front-end business layer and add a real MySQL backend plus a new `mysql` sync endpoint.

## In Progress

- [ ] Add a self-hosted Node.js API for MySQL persistence.
- [ ] Add username/password registration and login.
- [ ] Add book, collaborator, asset, and batch-sync APIs.
- [ ] Add a `mysql` endpoint on the front end and reuse the existing IndexedDB cache.
- [ ] Add MySQL login/register entry points to the login UI.
- [ ] Remove GitHub-specific UI assumptions when the active endpoint is MySQL.
- [ ] Add environment variables and deployment documentation.

## Verify

- [ ] Register a new account.
- [ ] Log in with username and password.
- [ ] Create a book.
- [ ] Add, edit, delete, and sync bills.
- [ ] Persist and reload meta data such as categories, tags, budgets, and preferences.
- [ ] Upload and display bill images.
- [ ] Add a collaborator by username and confirm shared book access.
- [ ] Run lint/build and record remaining risks.
