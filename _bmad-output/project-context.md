---
project_name: 'FlowReader'
user_name: 'Michael'
date: '2026-02-04'
sections_completed: ['technology_stack', 'language_rules', 'testing', 'quality', 'workflow', 'anti_patterns']
status: 'complete'
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- **Backend**: Go 1.22+
  - Router: `go-chi/chi/v5`
  - DB Driver: `jackc/pgx/v5`
  - Websocket: `nhooyr/websocket`
- **Frontend**: React 18+ (Vite)
  - Language: TypeScript 5+
  - State: Zustand (Client), TanStack Query v5 (Server)
  - Styling: Tailwind CSS v3 (Mobile First)
- **Database**: PostgreSQL 16+ (Alpine Docker)
- **Infra**: Docker Compose

## Critical Implementation Rules

### Language-Specific Rules (Go)

- **Layout**: Follow Standard Go Project Layout (`cmd/`, `internal/`, `pkg/`).
- **Interfaces**: Define interfaces at consumer side (Ports & Adapters).
- **Error Handling**: Always wrap errors with context: `fmt.Errorf("op failed: %w", err)`.
- **Dependency Injection**: Explicit injection via constructors (`NewService(repo)`). No Globals.

### Language-Specific Rules (TypeScript/React)

- **Strict Mode**: `strict: true` in `tsconfig.json`.
- **Components**: Functional Components only.
- **Naming**: `PascalCase` for Components, `camelCase` for hooks/utils.
- **State Separation**: strictly use React Query for API data, Zustand for UI state.

### Testing Rules

- **Backend (Go)**:
  - Unit Tests: Co-located with code (`service_test.go`). Use `tables` (Table Driven Tests).
  - Integration Tests: In `tests/`. Use `testcontainers-go` or direct Docker DB.
  - **Rule**: No Logic in Handlers = No Handler Unit Tests (Integration only for API).
- **Frontend**:
  - Components: Vitest + React Testing Library.

### Code Quality & Style

- **Linter**: `golangci-lint` (Standard) + `eslint` (React).
- **Comments**: Go: Standard GoDoc compliant comments on Exported entities.
- **Complexity**: Keep functions small. If > 50 lines, likely needs refactor.

### Project Structure & Boundaries

- **API Boundary**: Handlers ONLY translate HTTP <-> Domain. No business logic.
- **DB Boundary**: Repositories ONLY talk SQL. No business logic.
- **Frontend Boundary**: Feature-based folders (`features/auth`, `features/feed`).

### Development Workflow Rules

- **Branches**: `feat/` for new features, `fix/` for bugs.
- **Commits**: Conventional Commits (`feat: add login`, `fix: resolve crash`).
- **PRs**: Must have Passing CI (Lint + Test) before merge.

### Critical Don't-Miss Rules (A.K.A The "No-Go" Zone)

- ❌ **No ORM**: Do not use GORM or similar. Raw SQL/pgx only.
- ❌ **No JWT**: Use Stateful Sessions (Cookies) only.
- ❌ **No Global State in Go**: No `var DB *sql.DB`. Pass dependencies.
- ❌ **No Logic in Handlers**: Handlers are dumb translators.
- ❌ **No Heavy Libraries**: Avoid large dependencies (e.g. AWS SDK if not needed). Keep RAM < 150MB.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time
