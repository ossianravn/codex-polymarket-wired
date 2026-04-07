# relevant polymarket repos

## current prototype stance

This prototype currently uses:
- direct TypeScript HTTP calls for public Gamma, Data, and CLOB reads
- `py-clob-client` through a Python helper for authenticated trading actions

That keeps the repo runnable today while still leaving room to move the write path to TypeScript later.

## highest priority

### Polymarket/py-clob-client
Use as the current authenticated trading bridge for API credential derivation, order creation, posting, cancellations, allowance checks, and order-scoring queries.

### Polymarket/clob-client
Treat as the preferred long-term TypeScript trading client once you want to collapse the Python bridge and move to a pure TypeScript runtime.

### Polymarket/real-time-data-client
Use for RTDS topics such as comments and activity, plus other streaming data helpful for watchlists and catalyst monitoring.

### Polymarket/builder-relayer-client
Use later if you want builder-mode gasless wallet operations, Safe/proxy flows, approvals, and CTF operations.

### Polymarket/builder-signing-sdk
Use later when builder authentication headers should be generated locally or by a remote signing service.

### Polymarket/agents
Use as a reference for research workflows, AI-assisted market analysis, local/remote RAG, and a practical CLI around Polymarket data and trading.

## also relevant

### Polymarket/rs-clob-client
Useful for Rust systems or latency-sensitive infrastructure.

### Polymarket/ctf-exchange
Relevant for onchain cancellation, settlement, and contract-level understanding.

### Polymarket/uma-ctf-adapter
Relevant for understanding resolution plumbing.

### Polymarket/neg-risk-ctf-adapter
Relevant for multi-outcome negative-risk markets and redeem flows.

## repo usage recommendation

For this prototype:
- keep TypeScript as the plugin and skills layer
- keep Python as the current authenticated trading sidecar
- treat `agents` as design inspiration, not the runtime dependency
- move to a pure TypeScript trading path only after you verify feature parity and auth flows
