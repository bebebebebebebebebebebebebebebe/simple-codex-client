# Agent Instructions

## Runtime and Tooling

- Default to Bun instead of Node.js for this project.
- Use `bun <file>` instead of `node <file>` or `ts-node <file>`.
- Use `bun test` for tests.
- Use `bun run <script>` for package scripts.
- Use `bunx <package> <command>` instead of `npx`.
- Use `bun install` instead of npm/yarn/pnpm installs.
- Bun automatically loads `.env`; do not add `dotenv`.

## Development Servers

- If an AI agent starts a development server for verification or testing, it must stop that process after use.
- Do not leave development servers such as `bun run dev`, `bun run server`, or `bun run webui` running in the background once the check is complete.

## Documentation Comments

- When adding or changing implementation code, write JSDoc/TSDoc comments for public classes, functions, types, and interfaces so their responsibility, inputs, return values, and important failure modes are clear.
- Use `@param`, `@returns`, and `@throws` on public methods when they clarify meaningful behavior.
- Add short intent comments for private helpers when the reason is not obvious, especially around protocol boundaries, transport lifecycle, pending request management, manual input handling, approval flow, error isolation, and shutdown behavior.
- Avoid comments that only restate the implementation line by line. Prefer comments that explain purpose, contract, or non-obvious tradeoffs.
- Keep test files readable through descriptive test names. Add comments in tests only for non-obvious setup, race conditions, timing behavior, or subtle protocol expectations.
- In this repository, write documentation comments in Japanese.
