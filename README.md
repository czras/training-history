# Personal Endurance Training Data

## Status

Initial technical infrastructure for preserving and working with personal endurance-training data.

This is a **public repository containing my own training data and its derived representations**.

The repository is designed as an evidence-preservation and accessibility layer. Its purpose is to make historical and ongoing training evidence:

* inspectable by humans;
* accessible to agents;
* reproducible;
* versioned;
* attributable to its original source;
* suitable for future analysis.

The first question this repository should help answer is:

> **What did I actually do?**

before attempting to answer:

> **What should I do?**

---

## 1. Initial Data Source

The initial external source is **Intervals.icu**.

Initial data domains:

1. Activities
2. Activity-level metrics
3. Activity streams / laps where available
4. Wellness data
5. Events

The repository may eventually incorporate additional sources.

External systems are treated as source systems rather than as the repository's conceptual model.

---

## 2. Architecture

The intended architecture is:

```text
                         Intervals.icu
                              │
                 ┌────────────┴────────────┐
                 │                         │
              webhooks                 REST API
                 │                         │
                 └────────────┬────────────┘
                              ▼
                    ┌───────────────────┐
                    │ Ingestion layer   │
                    │                   │
                    │ receive events    │
                    │ fetch source data │
                    │ preserve source   │
                    │ deduplicate       │
                    │ synchronize       │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ Evidence corpus   │
                    │                   │
                    │ Git repository    │
                    │                   │
                    │ source.json       │
                    │ evidence.md       │
                    └─────────┬─────────┘
                              │
                 ┌────────────┴────────────┐
                 │                         │
          direct repository          agent-facing API
              access                      │
                 │                         │
                 └────────────┬────────────┘
                              ▼
                         Analysis /
                           agents
```

The repository is the **evidence corpus**.

An agent-facing API or MCP server may provide an additional access mechanism for the corpus, but it is not the source of truth.

---

## 3. Evidence Layers

The repository should preserve a distinction between source evidence and subsequent interpretation.

A possible progression is:

```text
L0  Source data
L1  Normalized evidence
L2  Derived metrics
L3  Observations
L4  Hypotheses
L5  Interventions
```

The initial implementation establishes **L0 → L1**.

Higher layers should emerge from actual use rather than being designed prematurely.

In particular:

* source data must not be silently transformed into conclusions;
* derived measurements must remain distinguishable from source data;
* observations must remain distinguishable from measurements;
* hypotheses must remain distinguishable from observations;
* decisions must remain distinguishable from hypotheses.

---

## 4. Source Data Is Canonical

For every imported source object, the original source representation should be preserved.

Conceptually:

```text
activity/
└── <source-id>/
    ├── source.json
    └── evidence.md
```

### `source.json`

`source.json` is the preserved source representation.

It should contain the data retrieved from the source with as little irreversible transformation as practical.

It is the canonical evidence record for the imported object.

Do not discard source fields merely because they are not currently useful.

Do not replace source data with calculated values.

Do not make future analysis dependent on an irreversible normalization step.

The purpose is to retain the ability to regenerate derived representations later.

---

## 5. Human-Oriented Evidence

`evidence.md` is a generated human-readable projection of the source data.

It exists for:

* human inspection;
* Git diffs;
* research work;
* direct repository navigation;
* compact contextual reading;
* documentation;
* agents that benefit from a contextual Markdown representation.

It is **not** the canonical source representation.

It should be generated from `source.json` or from the normalized source model.

Conceptually:

```text
source.json
     │
     └──────► evidence.md
```

The Markdown representation must not become the only place where information is preserved.

If its format changes, it should be possible to regenerate it from the preserved source data.

---

## 6. Agent Access

Agents may access the evidence corpus in two ways.

### Direct repository access

When an agent has direct access to the repository, it may inspect:

```text
source.json
evidence.md
```

Agents should generally prefer structured JSON when exact data is required.

Markdown may be preferable when contextual or human-oriented evidence is required.

Agents must not assume that Markdown contains the complete source dataset.

### Agent-facing API / MCP

An MCP server or equivalent API may provide a deliberately small interface to the evidence corpus.

Candidate operations:

```text
get_activities(start, end, sport?)
get_activity(activity_id)
get_activity_streams(activity_id)
get_wellness(start, end)
get_events(start, end)

search_evidence(...)
get_evidence(...)
get_provenance(...)
```

The exact interface may evolve according to demonstrated use.

The API should expose the evidence corpus rather than simply reproducing the complete source API.

---

## 7. Ingestion Model

The source system is accessed through two complementary mechanisms:

```text
Source
  │
  ├── webhook ──────► event-driven ingestion
  │
  └── REST API ──────► authoritative retrieval / reconciliation
```

A webhook is an event signal.

The source API is used to retrieve the actual source data.

The ingestion system must not assume that every relevant change will always arrive through a webhook.

Periodic reconciliation may therefore be required.

The general principle is:

> **A webhook tells the ingestion layer that something may have changed. The source API provides the evidence.**

---

## 8. Initial Historical Dataset

The first synchronization should establish a historical baseline.

At minimum, where available:

* running activities;
* cycling activities;
* relevant cross-training;
* wellness data;
* historical races/events.

Older historical data should not be discarded merely because it is not immediately relevant to current analysis.

Historical evidence may become useful later.

---

## 9. Provenance

Every imported source object must carry sufficient provenance to answer:

> **Where did this evidence come from?**

At minimum:

```text
source
source object type
source object ID
retrieval timestamp
original source timestamps
synchronization identifier
synchronization status
```

For Intervals.icu:

```text
source = intervals.icu
source_id = <Intervals activity ID>
```

The source identifier should be treated as the stable identity of the imported object where available.

Provenance must survive subsequent transformations.

A derived value should eventually be traceable to the source evidence from which it was calculated.

---

## 10. Identity and Deduplication

Imports must be idempotent.

Running the same synchronization multiple times must not create multiple representations of the same source object.

The primary identity is conceptually:

```text
(source, source_id)
```

For example:

```text
intervals.icu / activity / 12345678
```

If an existing source object changes, the repository should preserve its history rather than silently creating unrelated duplicates.

---

## 11. Synchronization

The first synchronization establishes the historical baseline.

Normal operation should subsequently become incremental.

Synchronization state should record enough information to establish:

```text
last successful synchronization
synchronization window
objects retrieved
objects created
objects updated
objects skipped
errors
```

The desired operating model is:

```text
initial historical sync
        │
        ▼
incremental synchronization
        │
        ├── webhook-triggered retrieval
        │
        └── periodic reconciliation
```

---

## 12. Git as Initial Evidence Infrastructure

Git is intentionally used as the initial evidence-store mechanism.

This provides:

* version history;
* inspectable changes;
* provenance through commits;
* human-readable evidence;
* easy backup and replication;
* direct agent access;
* low infrastructure complexity.

The repository itself therefore becomes part of the evidence infrastructure.

A database should not be introduced merely because databases are conventional for data ingestion.

---

## 13. Storage Evolution

Storage complexity should increase only when the experiment demonstrates a requirement for it.

The intended progression is:

```text
Git + files
     │
     │ demonstrated retrieval/query limitations
     ▼
SQLite
     │
     │ demonstrated infrastructure/scale requirements
     ▼
PostgreSQL
```

SQLite may become a derived index/query layer over the evidence corpus rather than replacing it.

PostgreSQL is not part of the initial architecture.

The principle is:

> **Use the least powerful storage mechanism that adequately represents and retrieves the evidence.**

---

## 14. Scope

The initial implementation does **not** attempt to provide:

* automatic training plans;
* workout prescriptions;
* AI coaching;
* race predictions;
* athlete scoring;
* optimization;
* automatic interpretation;
* a dashboard;
* a generalized fitness platform;
* an Intervals.icu clone;
* automatic modification of source data.

These capabilities are outside the scope of the initial evidence infrastructure.

Avoid implementing speculative abstractions for future capabilities.

---

## 15. First Vertical Slice

The first implementation should be deliberately small.

The first successful path is:

```text
Intervals.icu
     │
     ▼
retrieve one real activity
     │
     ▼
preserve source.json
     │
     ▼
generate evidence.md
     │
     ▼
commit to Git
     │
     ▼
retrieve through direct repository access
     │
     ▼
retrieve through the intended agent-facing interface
```

Then expand from one activity to the historical dataset.

The first implementation should be tested against the actual source account rather than only against mocked API responses.

---

## 16. First Success Criterion

The first milestone is reached when the repository can reliably answer:

> **Show me my historical training evidence from Intervals.icu.**

without requiring a manual data export.

At minimum, the system should support retrieval of:

* all activities in a period;
* activities filtered by sport;
* the complete source record of a particular activity;
* available HR/pace/power/other streams;
* wellness measurements;
* upcoming and historical events.

Every returned object must retain source provenance.

No interpretation is required for this milestone.

---

## 17. Design Principles

### Preserve before transforming

Source evidence must survive ingestion.

Derived representations can be regenerated.

### Observe before optimizing

The evidence layer comes before recommendations.

### Separate evidence from interpretation

Measurements are not observations.

Observations are not hypotheses.

Hypotheses are not decisions.

### Generate projections

Human-readable Markdown is a projection of preserved source data, not the source of truth.

### Optimize representations for their consumers

Structured JSON is appropriate for exact machine/agent access.

Markdown is appropriate for human inspection and contextual access.

Neither representation should be forced to serve every purpose.

### Prefer simple infrastructure

Start with Git and files.

Add SQLite only when demonstrated need emerges.

Add PostgreSQL only when demonstrated need justifies it.

### Keep the agent boundary small

An agent-facing API should expose evidence access rather than unnecessarily exposing the complete source API.

### Let actual use create the architecture

Future requirements should be discovered through use of the evidence.

Do not prematurely design the final system.

---

## 18. Guiding Principle

> **First preserve what actually happened.**
>
> Make it inspectable.
>
> Make it accessible.
>
> Make it reproducible.
>
> Then build things that reason about it.

---

## License

This repository is licensed under **CC BY-NC-SA 4.0**.

See [`LICENSE`](LICENSE) for the full license text.
