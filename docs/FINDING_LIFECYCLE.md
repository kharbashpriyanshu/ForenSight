# ForenSight V2.2 — Finding Lifecycle & Analyst Review

## 1. Overview & Admissibility Standards

In legal and investigative forensics, automated tools must never present algorithmic detections as definitive judicial conclusions. ForenSight adheres strictly to a human-in-the-loop lifecycle:
- Automated findings are initially labeled as `GENERATED`.
- Any automated finding with severity `HIGH` or `SUSPICIOUS` requires human review and is tagged `REVIEW_REQUIRED`.
- Only a verified human investigator or forensic examiner can transition a finding to `CONFIRMED_BY_ANALYST`, `DISMISSED`, or `INCONCLUSIVE`.
- Every transition is immutably logged in the audit ledger with timestamps, user identities, and mandatory technical review rationales.

---

## 2. State Transition Machine

```
      [ Automated Rule Engine ]
                 |
                 v
           +-----------+
           | GENERATED |
           +-----------+
                 |
        (If HIGH/SUSPICIOUS)
                 |
                 v
        +-----------------+
        | REVIEW_REQUIRED | <------+
        +-----------------+        |
                 |                 |
        (Analyst triages)          |
                 |                 |
                 v                 |
          +--------------+         |
          | ACKNOWLEDGED | --------+ (Analyst can re-open)
          +--------------+
                 |
        +--------+--------+
        |                 |
        v                 v
+-----------------------+ +-----------+ +--------------+
| CONFIRMED_BY_ANALYST  | | DISMISSED | | INCONCLUSIVE |
+-----------------------+ +-----------+ +--------------+
```

### Valid Transition Matrix

| Current State | Permitted Transitions | Required Review Decision | Justification Required? |
| :--- | :--- | :--- | :--- |
| `GENERATED` | `REVIEW_REQUIRED`, `ACKNOWLEDGED`, `DISMISSED` | Any valid decision | Yes (for dismissals) |
| `REVIEW_REQUIRED` | `ACKNOWLEDGED`, `CONFIRMED_BY_ANALYST`, `DISMISSED`, `INCONCLUSIVE` | `CONFIRMED`, `DISMISSED`, `INCONCLUSIVE` | Yes (mandatory review note) |
| `ACKNOWLEDGED` | `CONFIRMED_BY_ANALYST`, `DISMISSED`, `INCONCLUSIVE` | `CONFIRMED`, `DISMISSED`, `INCONCLUSIVE` | Yes (mandatory review note) |
| `CONFIRMED_BY_ANALYST` | `DISMISSED`, `INCONCLUSIVE` (Re-evaluation) | `DISMISSED`, `INCONCLUSIVE` | Yes (strict audit note) |
| `DISMISSED` | `REVIEW_REQUIRED` (Reopened on new evidence) | `PENDING_REVIEW` | Yes (reopening reason) |
| `INCONCLUSIVE` | `CONFIRMED_BY_ANALYST`, `DISMISSED` | `CONFIRMED`, `DISMISSED` | Yes |

---

## 3. Mandatory Review Metadata

When submitting a finding review via `POST /api/cases/{case_id}/findings/{finding_id}/review`:
```json
{
  "decision": "CONFIRMED",
  "review_note": "Confirmed cloned pixel structure across spatial region [120,40] and [350,210]. DCT quantization tables confirm identical resaving profile."
}
```

The system automatically enforces:
1. **Case Access & RBAC**: The user must have read/write access to the parent case (assigned investigator or admin).
2. **Reviewer Identity**: Attributed directly from JWT claims (`current_user.username`).
3. **Audit Event**: An event of type `FINDING_REVIEWED` is committed to `audit_events` with:
   - `finding_id`
   - `previous_status`
   - `new_status`
   - `decision`
   - `reviewer`
   - `note`
4. **Report Admissibility**: Findings marked `DISMISSED` are visibly flagged as dismissed in judicial PDF/JSON export summaries with their accompanying dismissal rationale, ensuring exculpatory evidence is preserved.
