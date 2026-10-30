---
name: implement-plan
description: Implement an approved repository plan for frontend, backend, cross-stack, or documentation work. Use when the plan is supplied or already approved; do not use to draft a plan.
---

# Implement an approved plan

Never launch, attach to, inspect, or control a browser, or check browser availability, during this workflow. This includes browser automation, headless browser tests, screenshots, and visual verification. Do not invoke browser or computer-use tools to perform these actions.

Use repository inspection, non-browser tests (including DOM tests using jsdom), typechecks, builds, and API/Socket.IO checks as appropriate. Leave manual browser and visual testing to the user. Report browser-dependent checks as unrun and visual acceptance criteria as unverified until the user validates them; do not claim automated checks establish visual correctness. If a required check launches a browser, skip that check, explain why, and continue with applicable non-browser checks.

Read the root `README.md` alongside relevant source/tests and specifications. It is the single maintained account of current capabilities, limitations, temporary implementation exceptions, and coverage. Update it when delivered behavior or coverage changes. Change `project-managment/` only when intended design changes; implementing an existing requirement does not qualify. Keep source comments/public types accurate as code changes, and update development/startup instructions only when tooling or startup requirements change. Keep individual check results, unresolved defects, manual validation reports, and progress tracking in chat or authorized GitHub updates.

1. Read the approved plan, relevant repository instructions, and affected code. Turn the intended behavior and acceptance criteria into a short implementation checklist.
2. Implement in small steps. For meaningful behavior changes or regressions, first write a test that fails for the intended reason, then make it pass. Use judgment for documentation, styling, and other low-risk edits. Test observable behavior rather than implementation details.
3. Give new or substantially changed source files a concise purpose comment. Add useful comments above exported or non-obvious functions; skip comments that only repeat the code.
4. For event-driven flows, add minimal, configurable logging when it helps diagnosis. Record outcomes and small useful metadata without sensitive data, full payloads, or routine noise. Follow the project's logger and configuration conventions.
5. If the plan conflicts with repository reality or misses a necessary step, make the smallest change that fulfills its intent and explain the deviation. Ask only when the choice would materially change the intended result.
6. During development, run only the focused tests necessary to verify the changed code and directly affected behavior or interfaces. Select specific test files, test names, or feature suites; do not run the complete test suite or the full pre-merge gate. Broaden focused coverage only when a change or failure shows that another area is affected. Run typechecks or builds only when needed to validate the change. Full-suite checks belong to the separate pre-merge stage, not routine implementation completion. For documentation-only edits, check references and requirements instead of running application tests or builds.
7. Report what changed, which focused checks passed, failed, or were not run, any plan deviation, and each acceptance criterion left unverified. State that full-suite verification is deferred to pre-merge; do not claim it passed. Give the user practical browser-testing instructions when visual validation is needed.
