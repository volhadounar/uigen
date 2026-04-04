# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment

Set `ANTHROPIC_API_KEY` in `.env` to use the real Claude model. Without it, a `MockLanguageModel` returns static code instead (also used in tests).

## Commands

```bash
# First-time setup (install deps + generate Prisma client + run migrations)
npm run setup

# Development server (Turbopack)
npm run dev

# Development server in background (logs → logs.txt)
npm run dev:daemon

# Build
npm run build

# Lint
npm run lint

# Run all tests
npm test

# Run a single test file
npx vitest run src/lib/__tests__/file-system.test.ts

# Reset database
npm run db:reset

# Regenerate Prisma client after schema changes
npx prisma generate

# Run new migration
npx prisma migrate dev
```

> **Node 25+ compatibility**: All `npm run` scripts prepend `NODE_OPTIONS='--require ./node-compat.cjs'` to delete the non-functional `localStorage`/`sessionStorage` globals that Node 25 exposes via its experimental Web Storage API, preventing SSR crashes. Don't remove this from custom scripts.

## Architecture Overview

UIGen is a Next.js 15 (App Router) application that lets users describe React components in chat; Claude generates the code, which runs in a live browser preview via a virtual file system.

### Request Flow

1. User sends a chat message → `POST /api/chat` ([src/app/api/chat/route.ts](src/app/api/chat/route.ts))
2. The route reconstructs a `VirtualFileSystem` from serialized client state, calls `streamText` (Vercel AI SDK) with two tools: `str_replace_editor` and `file_manager`
3. Claude streams back tool calls that write/modify files in the `VirtualFileSystem`
4. On finish, if the user is authenticated and a `projectId` exists, messages + filesystem state are persisted to SQLite via Prisma
5. The client-side preview re-evaluates files using Babel standalone transform ([src/lib/transform/jsx-transformer.ts](src/lib/transform/jsx-transformer.ts))

### Key Subsystems

**Virtual File System** ([src/lib/file-system.ts](src/lib/file-system.ts))
In-memory tree of `FileNode` objects. Serializes/deserializes to plain JSON for transport between client and API route. Never writes to disk.

**AI Tools** ([src/lib/tools/](src/lib/tools/))
- `str_replace_editor` — creates/overwrites/patches files using str-replace semantics
- `file_manager` — renames and deletes files/directories

**JSX Transformer** ([src/lib/transform/jsx-transformer.ts](src/lib/transform/jsx-transformer.ts))
Uses `@babel/standalone` to transpile JSX/TSX in-browser. Resolves `@/` import aliases against the virtual FS; stubs out missing imports with placeholder modules so the preview doesn't crash.

**Provider** ([src/lib/provider.ts](src/lib/provider.ts))
Returns a real Anthropic model (`claude-haiku-4-5`) when `ANTHROPIC_API_KEY` is set, or a `MockLanguageModel` that returns static code otherwise. The mock model is also used in tests.

**Auth** ([src/lib/auth.ts](src/lib/auth.ts), [src/middleware.ts](src/middleware.ts))
JWT-based sessions via `jose`. `/api/projects` and `/api/filesystem` routes are protected. Anonymous users can still use the generator; their work is tracked by [src/lib/anon-work-tracker.ts](src/lib/anon-work-tracker.ts).

**Database** ([prisma/schema.prisma](prisma/schema.prisma))
SQLite (file `prisma/dev.db`). Two models: `User` and `Project`. `Project.messages` and `Project.data` are JSON-serialized strings.

**Generation Prompt** ([src/lib/prompts/generation.tsx](src/lib/prompts/generation.tsx))
System prompt sent with every chat request. Instructs Claude to always create `/App.jsx` as the entrypoint, use Tailwind CSS, and use `@/` aliases for local imports.

### Directory Structure

```
src/
  app/              # Next.js App Router pages & API routes
    [projectId]/    # Project-specific page
    api/chat/       # Main streaming AI endpoint
  actions/          # Next.js Server Actions (project CRUD)
  components/       # React components (chat, editor, preview, auth, ui)
  hooks/            # Custom React hooks
  lib/
    contexts/       # React context providers (filesystem, chat)
    prompts/        # System prompts for Claude
    tools/          # Vercel AI SDK tool definitions
    transform/      # Babel-based JSX transpiler
    __tests__/      # Unit tests
```

### Testing

Tests use Vitest + jsdom + React Testing Library. Test files live in `src/lib/__tests__/`. The vitest config ([vitest.config.mts](vitest.config.mts)) uses `vite-tsconfig-paths` so `@/` aliases resolve in tests.

## Code Style

Only comment non-obvious or complex logic. Skip comments on straightforward code.
