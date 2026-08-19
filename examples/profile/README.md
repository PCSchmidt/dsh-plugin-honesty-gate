# Example dsh profile

This directory is a **documented** profile shape, not a running Harness home.

A real profile lives under `$DSH_HOME/profiles/<name>` and is created by:

```sh
# from the plugin checkout
dsh plugin --profile honesty-gate-demo add .
dsh --profile honesty-gate-demo --dump-config
```

Expected dump: a `# == dsh-plugin-honesty-gate` layer inserting `id: honesty-gate`.

## Files

| File | Role |
|------|------|
| [package.json](package.json) | `dsh.profile.bundles` order: `dsh-base` then this plugin |
| [cordis.patch.yml](cordis.patch.yml) | User overlay; may set `config.project` |

`dsh plugin` maintains the real profile manifest. Do not copy this folder into `$DSH_HOME` by hand unless you know the current Harness profile layout.

Requires the `dsh` CLI (npm `npx @deepseek-ai/dsh` or a source checkout). This plugin's unit tests and `npm run eval` do **not** need it.
