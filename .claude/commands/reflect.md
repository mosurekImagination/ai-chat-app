---
description: Post-slice self-improvement loop. Run after /test-slice gate clears to capture new gotchas in CLAUDE.md.
allowed_tools: ["Read", "Edit", "Bash"]
---

After the slice gate has cleared, review what was just built and improve CLAUDE.md so future slices benefit.

## Step 1 — Review the slice

Read the test file for the slice just completed and compare it against the architecture proposal in `ai-documents/architecture-proposal.md`. Note:
- Any test case that had to be changed or skipped vs. the proposal
- Any bug that appeared and wasn't anticipated (Spring behavior, DB constraint, React state issue)
- Any gotcha that would have been faster to implement if known upfront

## Step 2 — Filter for CLAUDE.md-worthy findings

Only append a finding if it is:
- Non-obvious (a reader with the stated stack experience would not expect it)
- Applicable to future slices (not one-off to this exact code)
- Concrete enough to include a code example or precise rule

Skip: findings already documented, debugging steps that won't recur, library version noise.

## Step 3 — Append to CLAUDE.md

For each qualifying finding, append a new `###` subsection under `## Discovered Gotchas` in `CLAUDE.md`:

```
### <Short Name — What and Where It Bites>
<1-2 sentence explanation of the problem>

```<language>
// Concrete code example showing the wrong vs. correct pattern
```

<Optional: link to the spec section or test that exposed it>
```

Do NOT rewrite existing sections. Only append new `###` entries. Do NOT create a new `##` section.

## Step 4 — Note deviations from the proposal

If any test case in the proposal had to be modified to make the slice work, note it as a comment inside the relevant test class (not in CLAUDE.md). CLAUDE.md is for reusable patterns, not per-slice history.
