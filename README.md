## A system for capturing, analyzing, and querying engineering decisions from GitHub activity.


*Architectural Design*:

1. *Data Ingestion*: Capture raw GitHub events as immutable records
2. *Normalization*: Unified event format across sources
3. *Decision Extraction*: LLM-powered decision identification
4. *Knowledge Graph*: Relationships between decisions and outcomes
5. *Decision Timeline*: Evolution tracking over time
6. *Knowledge Freshness*: Decay and reinforcement modeling
7. *Why-Query Engine*: Natural language decision queries
8. *Explainability*: Grounded answers with citations
9. *Failure Modes*: Explicit handling of edge cases
10. *Minimal Interface*: CLI/API focused design
11. *Documentation*: Clear design communication

## Project Structure

```
├── src/
│   ├── ingestion/          # Phase 1: GitHub data capture
│   ├── normalization/      # Phase 2: Event standardization
│   ├── extraction/         # Phase 3: Decision identification
│   ├── storage/            # Database layer
│   ├── web/                # Web interface
│   ├── pipeline/           # Async job processing
│   ├── analysis/           # Code analysis (AST, dependencies)
│   └── intelligence/       # AI/ML layer (vectors, reasoning)
├── storage/                # Event storage
├── config/                 # Configuration
└── docs/                   # Architecture documentation
```

## Getting Started

```bash
npm install
npm run dev
```

## Available Commands

```bash
# CLI interface
npm run dev

# Web interface
npm run web

# Intelligence API
npm run api
```


