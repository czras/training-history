# Architecture

## Source observations

The source systems provide observations of physical activity and related
information. The original source representation is preserved as evidence.

The source system's terminology and ontology are not assumed to be the
conceptual model of this repository.

Currently Intervals.icu is the primary source, but the model should not
depend on it unnecessarily.

## Activities

An activity represents a recorded physical activity.

An activity may be a run, hike, bike ride, swim, or another type of activity.

An activity corresponds to what a source system recorded. It does not
necessarily correspond to the complete real-world occurrence in which the
activity took place.

One real-world occurrence may therefore produce multiple activities.

## Efforts

An effort represents the athlete's actual participation in a coherent
physical or sporting occurrence.

The relationship between activities and an effort is semantic rather than
purely temporal or geographic.

Temporal adjacency and geographic continuity can provide evidence, but are
not sufficient to define an effort.

Examples include:

- an ultra recorded as multiple files
- a Backyard Ultra with one file per yard
- a multi-day effort
- a stage race
- an effort with interrupted or incomplete recordings

The athlete is the authoritative source for deciding which activities
constitute an effort.

Automated grouping may provide evidence or suggestions, but should not
silently establish this relationship as fact.

## Events

An event represents the real-world occurrence in which an effort takes place.

An event is distinct from the athlete's effort.

An event may have information originating outside the training-record source,
including:

- official results
- course files
- organizer information
- event websites
- event announcements
- other external documentation

This allows the historical record to preserve both information about the
event itself and information about the athlete's participation.

An effort does not necessarily require an associated event.

## Event classification

Events can be classified according to their role or nature in the athlete's
training history.

The initial vocabulary is:

- major race
- minor preparatory/test race
- low-stakes event
- performance assessment
- workout
- community event
- club session

These classifications describe the event in the context of the athlete's
history and should not simply reproduce source-system categories.

"Major race" describes significance within the athlete's season rather than
an objective property of the race.

The vocabulary is expected to remain open to additional categories when the
historical corpus requires them.

## Performance assessments

A performance assessment is an event with an associated athlete effort.

Assessment reports and measurements are evidence belonging to that effort.

Derived values such as thresholds or training zones must remain
distinguishable from the underlying assessment evidence.

## Geography

Geographic information is derived from recorded geographic observations and
external geographic knowledge.

The recorded coordinates remain part of the activity evidence.

Geographic interpretation is therefore separate from the activity itself.

Geographic coverage may be incomplete. An activity for which no geographic
interpretation is available remains a valid activity; unknown geography is
an observable state rather than an ingestion failure.

## Derived information

Source observations and derived information remain distinguishable.

Derived information may include:

- geographic interpretation
- relationships between activities and efforts
- relationships between efforts and events
- performance characteristics
- aggregated historical measurements

Derived information should not overwrite the evidence from which it was
derived.

## Evolution

The model is intentionally shaped by the historical corpus.

When recurring data cannot be represented cleanly by the current concepts,
the model should evolve rather than forcing the data into an existing
category.

The goal is to preserve the richness of the historical record while keeping
the conceptual model as small as the evidence allows.
