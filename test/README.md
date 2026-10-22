# Testing strategy

There are two levels of automated tests in the project:

- `npm test` — the fast Vitest tests of pure logic, contracts, errors and
  deterministic races;
- `npm run test:e2e` — the Playwright scenarios of the critical user paths in a
  real Nuxt application and Chromium.

Vitest must not prove that several Vue files are "wired up correctly" by reading
their source text. Guarantees like that are brittle, and E2E checks them through
observable behavior instead. What stays in the unit tests is the pure functions
and the complex branches that are expensive or non-deterministic to reproduce in
a browser.

## When to add a test

Add a Vitest test when it protects a separate rule or a class of errors:

- the public contract of a function, an API or a store;
- a security boundary, a validation, a limit or the handling of corrupted data;
- a deterministic race, a timeout or a rollback;
- a regression that cannot be caught reliably at another level.

Do not multiply the same matrix of adversarial values across every calling
function. The full matrix lives at the shared primitive or helper, while its
consumers check one characteristic value and their own unique branch.

Add a Playwright scenario when a guarantee travels through several layers: the
route, the hydration, the UI, a store, the Nitro API or SSR. A scenario has to
check the result for a person, not the internals of a component.

## Commands

```bash
npm test
npx vitest run test/<domain>/<file>.spec.ts
npm run test:e2e
npm run test:e2e:ui
```

Install Chromium before the first local E2E run:

```bash
npx playwright install chromium
```

Playwright starts the disposable external backend and the consumer fixture out of
`e2e/fixture` by itself; it needs neither PostgreSQL, nor S3, nor a hand-started
playground.

## What E2E covers

A small smoke set holds the most expensive end-to-end guarantees:

- creating a page through the UI and discovering the brick component of the
  consumer application;
- restoring the last edit of the form after an immediate reload;
- a blocking bootstrap error, the focus and a successful retry;
- ignoring a late save response after a move to another page;
- the SSR of a published page with the brick component of the consumer
  application;
- the keyboard of the viewport switcher (roving focus): moving the focus without
  changing the selection, selecting on Enter, wrapping around.

## Support folders

- `helpers/publishFixtures.ts` — the fixtures of the publish domain.
- `helpers/builderSessionHarness.ts` — the harness for the deterministic
  session and race tests of the builder.
- `helpers/asyncData.ts` — the stub of `useAsyncData` for the composables that
  read on SSR.
- `helpers/h3Events.ts` — a fake h3 event for the server tests; the one place
  where the shape of the fake is coerced to `H3Event`.
- `stubs/nuxt-imports.ts` — the stub of the Nuxt auto-imports for the node tests.

The directory of a spec matches a domain of `src/runtime/modules/`, or the server,
the build-time or the scripts layer. Put the new types of the test infrastructure into a
`types.d.ts` of their own, the same way production types go.
