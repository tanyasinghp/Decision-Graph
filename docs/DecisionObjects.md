# Decision Objects

## What Is a Decision?

A Decision is the core entity in Decision Graph. It represents a design choice made during engineering — why code was written a particular way.

## Structure

```typescript
interface Decision {
  id: string;                    // Unique identifier
  component: string;             // Component name (e.g., "Dropdown")
  title: string;                 // Human-readable title
  status: DecisionStatus;        // active | superseded | deprecated | proposed
  confidence: Confidence;        // high | medium | low
  reasoning: string;             // Why this decision was made
  alternatives: Alternative[];   // Options that were considered
  evidence: EvidenceReference[]; // Links to supporting artifacts
}
```

### Status Values

| Status | Meaning |
|--------|---------|
| `active` | Currently in effect |
| `superseded` | Replaced by a newer decision |
| `deprecated` | No longer recommended |
| `proposed` | Suggested but not yet implemented |

### Confidence Levels

| Level | Meaning |
|-------|---------|
| `high` | Strong evidence, clear reasoning, multiple sources |
| `medium` | Moderate evidence, some inference required |
| `low` | Weak evidence, significant inference required |

### Alternatives

```typescript
interface Alternative {
  description: string;            // What was considered
  pros: string[];                 // Advantages
  cons: string[];                 // Disadvantages
  decision: "accepted" | "rejected";
  evidence?: EvidenceReference[]; // Why it was accepted/rejected
}
```

### Evidence References

```typescript
interface EvidenceReference {
  source: SourceSystem;       // github, slack, jira, etc.
  externalId: string;         // PR #1234, issue #567, etc.
  url: string;                // Link to the artifact
  excerpt?: string;           // Relevant quote
}
```

## How Decisions Are Extracted

1. **Ingestion**: Connectors pull artifacts (PRs, issues, commits) from external sources
2. **Evidence extraction**: An LLM agent reads the artifacts and identifies decision-worthy content
3. **Decision formulation**: The agent synthesizes the decision: what was decided, why, what alternatives were considered
4. **Confidence assignment**: The agent assigns a confidence level based on evidence quality
5. **Storage**: Decisions are stored as JSON in `./.decisiongraph/decisions/<component>.json`

## Example

```json
{
  "id": "decision:razorpay/blade:dropdown:native-vs-custom",
  "component": "Dropdown",
  "title": "Dropdown uses a custom listbox instead of native <select>",
  "status": "active",
  "confidence": "high",
  "reasoning": "A native <select> cannot be styled consistently across browsers, does not support grouped options natively, and has poor cross-platform accessibility.",
  "alternatives": [
    {
      "description": "Use native <select> with CSS styling",
      "pros": ["Native keyboard handling", "Smaller bundle size"],
      "cons": ["Inconsistent styling", "No grouped option support", "Poor mobile UX"],
      "decision": "rejected",
      "evidence": [{"source": "github", "externalId": "PR #1284", "url": "https://github.com/razorpay/blade/pull/1284"}]
    }
  ],
  "evidence": [
    {"source": "github", "externalId": "PR #1284", "url": "https://github.com/razorpay/blade/pull/1284"},
    {"source": "github", "externalId": "Issue #456", "url": "https://github.com/razorpay/blade/issues/456"}
  ]
}
```
