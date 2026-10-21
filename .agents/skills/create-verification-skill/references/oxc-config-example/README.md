# OXC starting pair (teaching-strict)

A validated `.oxlintrc.json` + `.oxfmtrc.json` for a TypeScript project that uses
the OXC toolchain instead of ESLint + Prettier. Copy them to the repo root, then
run each once before trusting either.

Both files here were executed against oxlint 1.80.0 with `oxlint-tsgolint`
installed. Every rule name in `.oxlintrc.json` resolves; none are guesses.

## Install

```bash
npm add -D oxlint oxlint-tsgolint oxfmt   # tsgolint is REQUIRED for options.typeAware
npx oxlint          # lint (type-aware rules included)
npx oxfmt --check . # format check; drop --check to write
```

Without `oxlint-tsgolint` the run aborts with `Failed to find tsgolint
executable`, so `"typeAware": true` in a config proves intent, not coverage.

## Why these severities

The split is "errors are defects, warnings teach". Errors are things that are
wrong at runtime or erase type safety: an unawaited promise, an `any` that
spreads through a call chain, a non-exhaustive switch. Warnings are things worth
learning but legal: `strict-boolean-expressions`, `no-unnecessary-condition`,
`prefer-nullish-coalescing`. A learner can ship with warnings and still read
them.

Category choices, and what each buys:

- `correctness` and `suspicious` at **error**. Real defects. `correctness` is on by default; naming it makes the bar explicit rather than inherited.
- `perf` and `pedantic` at **warn**. Useful, occasionally opinionated, never worth blocking a commit.
- `style` at **off**. This one is measured, not assumed. With `style` on, a five-line test file produced `import/prefer-default-export`, `import/no-named-export`, `capitalized-comments`, `no-inline-comments`, `func-style`, and `id-length` before it produced a single real finding. Two of those actively teach the wrong thing about modern module design, and the volume trains a reader to ignore warnings wholesale, which costs more than the category returns.
- `restriction` and `nursery` at **off**. Opinionated bans and unstable rules respectively.

`eslint/no-inline-comments` and `eslint/capitalized-comments` are turned off by
name rather than by dropping all of `pedantic`, which holds rules worth keeping.

## Two validation facts that decide how much you can trust a config by reading it

**oxlint rejects an unknown rule name.** A typo fails loudly at parse time:

```
x Rule 'this-rule-does-not-exist-at-all' not found in plugin 'typescript'
```

So `oxlint` run once IS the validation for `.oxlintrc.json`. Nothing silently no-ops.

**oxfmt silently accepts unknown option keys.** Adding `"notARealOption": true`
to `.oxfmtrc.json` changes nothing and reports nothing. A typo'd format option
does nothing forever. The `$schema` field is the only guard, and it only helps
in an editor, so keep it.

## Gotchas that cost a run

- **`plugins` overwrites the default set, it does not extend it.** Defaults are `eslint`, `typescript`, `unicorn`, `oxc`. The list here names all four plus `import` and `promise`; drop one and you silently lose its rules.
- **`options.typeAware` and `options.typeCheck` only work in the ROOT config.** Nested configs must not set them.
- **oxlint walks `node_modules/` when no `.gitignore` covers it.** In a fresh directory this produced hundreds of findings from `node_modules/oxlint/dist/lint.js`. The `ignorePatterns` entry here prevents it.
- **Namespaces differ from ESLint.** `typescript/no-floating-promises`, not `@typescript-eslint/no-floating-promises`. The schema follows ESLint v8 eslintrc, not flat config.
- **`options.typeCheck: true`** adds `tsc` diagnostics to the same run and can replace a separate `tsc --noEmit` tier. It is off here because it is the experimental leg; turn it on deliberately and say so in the generated skill's Gate section.

## Proving it works

Drop this in `src/probe.ts`, run `npx oxlint`, and confirm four errors:

```ts
async function work(): Promise<void> {}
export function go() {
  work();
  const v: any = 1;
  return v.whatever;
}
```

Expect `no-floating-promises`, `no-explicit-any`, `no-unsafe-return`, and
`no-unsafe-member-access`. If you get zero, `oxlint-tsgolint` is missing or
`typeAware` is not set in the root config. Delete the file afterwards.
