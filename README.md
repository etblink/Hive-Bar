# Hive-Bar

Hive-Bar is a focused Hive community experience for 4th Street Bar in Reno, Nevada. The rebuild is currently at the M1 foundation milestone: public read paths are available, while identity, blockchain writes, wallets, inboxes, and payments remain deliberately disabled.

## M1 configuration

| Item | Value |
| --- | --- |
| Community | `hive-108590` |
| Production threads container | `fourthst.threads` |
| Write mode | `disabled` |
| Runtime | Node.js 24 |

M1 never asks for, stores, signs with, or broadcasts using a Hive private key.

## Run locally

Prerequisites: Node.js 24 and npm 11 or newer.

```sh
git clone https://github.com/etblink/Hive-Bar.git
cd Hive-Bar
cp .env.example .env
npm ci --ignore-scripts
npm run build
npm start
```

Open `http://localhost:3000`. Development mode rebuilds CSS once and then watches the Node process:

```sh
npm run dev
```

The defaults in `.env.example` are suitable for local read-only development. Production configuration must retain `HIVE_WRITE_MODE=disabled` during M1 and provide at least three distinct credential-free HTTPS RPC nodes.

## Quality gate

```sh
npm run check
```

This runs the repository secret scan, ESLint, the Node test suite, the production CSS build, and a high-severity production dependency audit. The same command runs in GitHub Actions.

Individual commands:

| Command | Purpose |
| --- | --- |
| `npm test` | Deterministic unit and HTTP integration tests |
| `npm run test:coverage` | Tests with Node's built-in coverage report |
| `npm run lint` | Server and browser JavaScript checks |
| `npm run build` | Minified Tailwind CSS build |
| `npm run check:secrets` | Targeted repository credential scan |
| `npm run audit:prod` | High/critical production dependency gate |

## Application structure

- `src/app.js` creates the Express application without opening a network port.
- `src/server.js` owns startup and graceful shutdown.
- `src/config.js` validates every supported environment setting.
- `src/hive/rpc-pool.js` provides timeout, failover, response limits, and circuit breaking for Hive JSON-RPC reads.
- `routes/` and `views/` contain the read-only product surface.
- `test/` covers configuration, HTTP headers/errors, sanitization, profile metadata, RPC failover, and the M1 no-write boundary.

See [docs/M1_FOUNDATION.md](docs/M1_FOUNDATION.md) for the milestone boundary and [docs/M1_ACCEPTANCE_EVIDENCE.md](docs/M1_ACCEPTANCE_EVIDENCE.md) for the deliverable-to-test matrix.

## Operational endpoints

- `GET /healthz` — process liveness; does not call Hive.
- `GET /readyz` — readiness; succeeds only when a configured Hive RPC node answers a read.

Both endpoints return JSON and disable caching.

## Rebuild roadmap

M2 completes the read-only vertical slice, including sparse community states and live read smoke tests. Verified identity and controlled social writes begin in M3. No write milestone begins without its approved safety gates and explicit authorization for any real on-chain operation.
