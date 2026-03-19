# Git Checkpoint Suggestion

## Recommended Commit Message

```
Checkpoint: CoC acceptance, QR/token check-in, attendance state machine, credit restoration rules, and checkpoint docs
```

## Recommended Tag

```
bpm-checkpoint-2026-03-18
```

## Optional Next Branch

```
phase/production-foundation
```

## Why This Naming

This checkpoint captures the completion of the operational attendance layer built on top of the previous checkpoint (commit `29ae121`). The key additions are:

1. **Code of Conduct** — versioned acceptance requirement before booking
2. **QR/token check-in** — per-booking tokens, QR display, token validation
3. **Self-check-in / staff check-in** — distinct rules, configurable time windows
4. **Attendance state machine** — single-source-of-truth with credit reversal on corrections
5. **Credit restoration** — absent/excused restore credits; present/late consume
6. **Student-visible status** — attendance outcome overrides raw booking status
7. **Penalty lifecycle** — attendance-corrected penalties hidden from students

## What This Checkpoint Represents

A fully operational local prototype where:
- Students can browse → accept CoC → book → view QR → cancel → restore
- Staff can check in via manual, token, or QR validation
- Attendance corrections cascade correctly through credits and penalties
- All business rules are enforced server-side and reflected in student-facing UI
- Dev tools provide full testing capability

## Tag Command (do not execute unless explicitly asked)

```bash
git tag -a bpm-checkpoint-2026-03-18 -m "Checkpoint: CoC, QR check-in, attendance state machine, credit rules"
```
