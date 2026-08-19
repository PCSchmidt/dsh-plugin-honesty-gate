# Contributing

This package is an out-of-tree **dsh bundle**. Contracts live in [portfolio-kit](https://github.com/PCSchmidt/portfolio-kit).

## Checks

```sh
npm test
npm run eval
```

Both must stay green. `eval` is the published gate-catch table for this plugin.

## Bundle rules

- Keep `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` on the package root.
- Plugin rows in `cordis.patch.yml` resolve by **package name**, not a relative path.
- Config keys consumed by `apply()`: `gatesFile`, `workspaceRoot`, `memoryDir`, `project`.
- Do not add a `prepare` script that assumes a sibling monorepo. Ship runnable JS.

## License

MIT. See [LICENSE](LICENSE).
