---
name: Auth & Storage setup
description: Clerk auth and Object Storage integration details and gotchas
---

## Clerk Auth

- Status: Replit-managed Clerk, `not_configured` → provisioned via `setupClerkWhitelabelAuth()`
- Server: `@clerk/express` clerkMiddleware in app.ts; proxy middleware at CLERK_PROXY_PATH mounted BEFORE body parsers
- Client: `@clerk/react` ClerkProvider in App.tsx; `publishableKeyFromHost` from `@clerk/react/internal` (not raw env var)
- Sign-in/sign-up: `/sign-in/*?` and `/sign-up/*?` routes in wouter (/*? wildcard is required — not /*, not /:rest*)
- All /api/* routes protected by global requireAuth middleware in app.ts EXCEPT /api/storage/public-objects/*
- Individual route-level requireAuth in documents.ts is redundant but harmless

**Why:** Single-owner private management app; Clerk dev keys active in development (pk_test warning in console is normal and expected).

## Object Storage

- Provisioned via `setupObjectStorage()` — bucket ID in DEFAULT_OBJECT_STORAGE_BUCKET_ID secret
- Template files copied from `.local/skills/object-storage/templates/` into api-server
- Storage route uses Clerk `getAuth(req)` instead of Replit Auth `req.isAuthenticated()` (template was adapted)
- Express 5 requires named wildcards: `/storage/objects/*path` not `/storage/objects/*`
- `RequestUploadUrlBody` and `RequestUploadUrlResponse` added manually to `lib/api-zod/src/generated/api.ts` (no codegen script)
- pnpm overrides use explicit version `^18.3.1` not `$react` (root package.json has no react direct dep)
- `@workspace/object-storage-web` added to: root tsconfig.json refs, dashboard tsconfig.json refs, dashboard package.json deps

## Documents route

- Fully migrated off multer / /tmp — now uses presigned URL flow
- Client: requests presigned URL → uploads to GCS via XHR (with progress) → POSTs metadata+objectPath to /api/documents/upload
- Files served via /api/storage/objects/* (auth-protected)

## GitHub

- Only internal gitsafe-backup remote exists; no GitHub remote configured
- gitPush returns NO_REMOTE — user must connect GitHub account in Replit first, then I can push
