---
description: Run all completed slice tests to confirm no regressions. Pass the current slice number (e.g. /regression-check 3 runs Slices 1-3).
allowed_tools: ["Bash"]
---

Run integration tests for all slices from 1 through $ARGUMENTS to confirm no regressions.

```bash
N=$ARGUMENTS
[[ ! "$N" =~ ^[0-9]+$ ]] && { echo "error: slice number must be numeric (e.g. /regression-check 3)"; exit 1; }
cd backend && TESTS="" && for i in $(seq 1 $N); do TESTS="$TESTS --tests \"*Slice${i}*\""; done && eval "./gradlew test $TESTS --continue 2>&1"
```

After running:
- If all tests pass: report "Regression check green — Slices 1-$ARGUMENTS all pass." Update `slice-progress.md` and commit.
- If any test fails: **do not commit and do not start the next slice.** Fix the regression first. A passing slice that now fails is a bug you introduced — treat it as higher priority than new functionality.

> Slices with `@Disabled` stubs count as skipped (not failed) — this is expected.
