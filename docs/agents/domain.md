# Domain Docs

Engineering skills should read the following domain documentation before exploring the codebase:

- `GLOSSARY.md` at the repo root, if it exists
- `docs/adr/` for architecture decisions relevant to the work

If these files do not exist, proceed without flagging their absence. Create them only when domain terms or architectural decisions are actually established.

## File structure

This is a single-context repository:

```text
/
├── GLOSSARY.md
├── docs/adr/
└── src/
```

Use glossary terms consistently in issue titles, proposals, refactors, and tests. Surface any conflict with an existing ADR instead of silently overriding it.
