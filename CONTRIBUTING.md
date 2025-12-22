# Contributing to Papyrus

Thanks for taking the time to contribute.

## Getting started
1) Fork and clone the repo.
2) Install dependencies:
```
npm install
```
3) Run the web demo:
```
npm run dev
```

## Repo layout
- `packages/`: SDK modules (core, engines, UI, types)
- `examples/`: demo apps
- `docs/`: documentation

## Development workflow
- Keep changes focused and scoped to a single concern.
- Update docs and examples when behavior changes.
- Prefer TypeScript and follow the existing patterns in each package.
- If you add dependencies, explain why in the PR description.

## Testing
There is no automated test suite yet. If you add tests or tooling, document how to run them. Otherwise include manual verification steps in your PR.

## Pull requests
- Describe the problem and solution clearly.
- Link related issues or discussions.
- Call out breaking changes and migration notes when applicable.
