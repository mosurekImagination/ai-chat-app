---
description: Verify the Gradle build compiles cleanly without running tests. Fast incremental build.
allowed_tools: ["Bash"]
---

Run an incremental Gradle build without tests to verify the project compiles.

```bash
./gradlew build -x test 2>&1
```

After running:
- If the build succeeds: report "Build clean — no compilation errors." and show the build time.
- If the build fails: show the full error output including file name, line number, and error message for every compilation error. **Do not attempt to fix errors automatically** — list them and stop so the user can review.

Note: this uses incremental compilation (no `clean`) for speed. If you suspect stale build artifacts are causing false failures, run `./gradlew clean build -x test` instead.
