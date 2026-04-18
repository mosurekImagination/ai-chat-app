---
description: Run integration tests and enforce the slice gate. Pass a slice number to filter (e.g. /test-slice 4).
allowed_tools: ["Bash"]
---

Run integration tests for the given slice.

If the argument $ARGUMENTS contains a slice number (e.g. "4" or "Slice 4"), filter tests for that slice only:

```bash
cd backend && ./gradlew test --tests "*Slice$ARGUMENTS*" --continue 2>&1
```

If no argument was given, run all tests:

```bash
cd backend && ./gradlew test --continue 2>&1
```

After running:
- If all tests pass: report "Gate cleared — Slice $ARGUMENTS tests pass." Then run `/regression-check $ARGUMENTS` to confirm prior slices are not broken. Only after the regression check is also green: update `slice-progress.md`, commit, and start the next slice.
- If any tests fail: list each failing test class and method with the failure message. **Stop. Do not write any more code. Do not proceed to the next slice.** Fix failures and re-run `/test-slice`.
