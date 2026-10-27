---
name: plan-github-issue
description: Create a staged repository plan intended for GitHub persistence, then publish or revise it as an issue or parent with sub-issues after execution is enabled and requested. Use for planning-to-issue workflows, not ordinary coding requests or implementing issue steps.
---

# Plan work and persist it as a GitHub issue

Never launch, attach to, inspect, or control a browser, or check browser availability, during this workflow. This includes browser automation, headless browser tests, screenshots, and visual verification. Do not invoke browser or computer-use tools to perform these actions, including for GitHub access or authentication.

Use repository inspection, non-browser tests (including DOM tests using jsdom), typechecks, builds, and authenticated connectors, CLI, or APIs as appropriate. Assign browser-dependent checks to the user and report them as unrun; do not claim automated checks establish visual correctness.

This skill plans product work and publishes its agreed plan. Executing this workflow creates or updates the agreed planning issues and their parent-child relationships only; it does not implement the product steps. Later implementation requests are separate work, supported by the repository's `implement-plan` skill when available.

## Plan mode: explore and agree

1. Read the root `README.md`, relevant repository instructions, affected code, contracts, and any supplied issue. Establish current behavior, desired outcome, exclusions, and dependencies. Record the planning baseline commit and relevant uncommitted changes without modifying them.
2. Reuse an approved conversation plan, incorporating subsequent user corrections. Preserve its agreed steps, issue structure, exclusions, and final checkpoint without reopening settled decisions. Resolve only remaining material scope and implementation decisions with the user. Discover repository facts before asking questions. Do not silently include adjacent features just because they are prerequisites; agree whether to include or defer them and make any temporary limitation explicit.
3. For work not already structured by an agreed plan, divide it into logical, independently testable steps and apply the sub-issue policy below. Use as many steps as the task needs. Each step should specify the intended change, acceptance criteria, appropriate automated checks, and a manual checkpoint only where practical under the guidance below. Identify dependencies that prevent a checkpoint from being exercised yet.
4. Prepare a title and body for each proposed issue using the structure below. Resolve material decisions before finalizing, including any parent-child structure and dependencies. If the user requests revisions while still in Plan mode, revise the draft only; do not mutate GitHub or repository files.
5. In the final `<proposed_plan>` block, make the executable task **Publish the agreed plan as GitHub issues** (or one issue when appropriate). State prominently: **Executing this workflow creates or updates the agreed GitHub issues and their parent-child relationships only. It does not implement the product steps.** Include every proposed title and complete body, the parent-child relationships, and implementation dependencies as publication content, so the work remains reviewable and survives a later execution request.

Respect the actual mode supplied by the environment. A request to execute does not itself end Plan mode. If still in Plan mode, explain the mode restriction briefly and retain the prepared issue content. If this workflow is invoked in execution mode without an agreed plan, establish the plan first rather than assuming approval or changing modes yourself.

## Sub-issue policy

Propose a sub-issue for substantial work that can be implemented and tested independently, including refactoring. Keep small refactors required by a feature within that feature's issue; do not split work merely because it touches several files or subsystems.

Keep the parent focused on the overall outcome, child work, dependencies, and combined acceptance criteria. Give each child its own goal, implementation steps, acceptance criteria, checks, and manual checkpoints where practical. Identify prerequisites and execution order explicitly; being a child does not itself establish a dependency. Avoid duplicating a child's detailed implementation plan in the parent.

Agree the complete structure during planning. A request to publish that agreed structure authorizes creating and linking its parent and children without another routine confirmation. It does not authorize additional, unplanned issues.

## Documentation maintenance

Use the root `README.md` as the single account of implementation capabilities, limitations, temporary exceptions, and coverage. Include its maintenance in implementation steps when those facts change. Plan changes under `project-managment/` only for intended design changes; implementing an existing requirement does not qualify. Keep source comments/public types accurate as code changes, and maintain development/startup instructions only for actual tooling or startup changes.

## Issue content

Keep the issue self-contained and proportionate to the task. Include:

- Goal, current state, relevant repository links, and planning baseline commit.
- Included work, exclusions, dependencies, agreed assumptions, and any deliberate interim behavior that falls short of the final contract.
- Numbered implementation steps describing changes, acceptance criteria, checks, and practical user checkpoints. For new steps, add an unchecked **Implementation/checks complete** box and, only where a useful manual check exists, a separate unchecked **User validation passed** box. Label these as user-managed tracking. Otherwise write **User validation: not applicable** without a checkbox. When revising an issue, preserve existing progress and evidence; do not reset completion or claim validation has passed merely because the plan changed.
- Relevant verification evidence already available during planning, clearly distinguished from checks still required after implementation. Do not require an implementation commit or an agent-maintained progress record.
- The future-chat instructions below.

Include these future-chat instructions in the issue:

> Read the issue, root `README.md`, relevant repository instructions, specifications, and current code/tests. Implement the requested step, update the root README when capabilities, limitations, temporary implementation exceptions, or coverage change, and change `project-managment/` only if intended design changes. Keep source comments/public types accurate and update development/startup instructions only for tooling or startup changes. Run required checks and report changes, verification results, unresolved defects, and unverified acceptance criteria in chat. Stop at the specified user checkpoint; if no manual checkpoint applies, report automated results and stop after the requested step. Commits and GitHub status updates require a separate user request; this issue does not authorize them.

> Never launch, attach to, inspect, or control a browser, or check browser availability. This includes browser automation, headless browser tests, screenshots, and visual verification. Use non-browser checks, including jsdom, and leave manual browser testing to the user. Report browser-dependent checks as unrun and visual acceptance criteria as unverified until the user validates them.

Individual check results, unresolved defects, manual validation reports, and progress tracking belong in chat or authorized GitHub updates. Current capabilities, limitations, temporary implementation exceptions, and coverage belong in the root README. Do not instruct implementing agents to commit changes, update checkboxes, or maintain GitHub progress. Completing a step must not trigger requests to commit or update GitHub; leave those actions to a separate user request. User confirmation that manual validation passed is not itself a request to edit GitHub.

## Practical manual checkpoints

Include a manual checkpoint only when it offers a quick, useful check of observable behavior. Infrastructure steps may rely entirely on automated verification. Do not create utilities, debug endpoints, or extra implementation work solely to manufacture a manual checkpoint.

A completed UI is not required to validate observable backend behavior. Consider existing tools such as Postman, command-line clients, or direct API requests, choosing tools appropriate to the actual protocol. These are options, not required tools.

Give each practical check minimal setup, exact actions or payloads, expected results, and an approximate duration. Share setup between related steps and explain when restarting requires repeating it. Keep checks to a few minutes where feasible; leave exhaustive coverage automated.

Clearly label manual browser checkpoints as user-performed. Plans must not require implementing agents to launch a browser or run browser-dependent tests; list such checks separately for the user. Non-browser automated checks do not replace visual user validation.

State what the check proves and what remains deferred. For example, inspecting events can check recipient-specific payloads but cannot prove that the UI visually hides a card. Do not substitute an artificial manual check for automated infrastructure verification or imply that an event check completes later visual validation.

## Execution mode: publish only

Publish once execution is actually enabled and the user requests execution of the agreed publication plan. Existing authorization to publish is sufficient; do not ask again solely because publishing changes GitHub. Follow any tool-enforced approval requirements.

1. Determine the target repository from Git remotes and session context. Resolve competing plausible destinations with the user instead of guessing. Use an existing authenticated GitHub connector or CLI, or an authenticated API only. Do not use a browser fallback or browser-based authentication recovery. Do not hard-code the repository, account, or authentication method; install no tools automatically and never expose credentials.
2. Read every referenced existing issue and its parent-child relationships before updating it. Before creating each planned issue, check for an existing issue from this workflow to avoid duplicates. A similar title alone is not sufficient evidence to overwrite an unrelated issue.
3. Publish the agreed titles and bodies as one issue or the agreed parent and children. Create or identify the parent, create or identify each child, then establish GitHub's parent-child relationships and include the actual issue links in the planned dependency references. For revisions, update the identified issues rather than creating replacements. Preserve completed work, progress evidence, unrelated issue content, and existing metadata. Summarize material revisions in the body. If changed scope invalidates prior completion, preserve the historical evidence and explicitly identify the affected status and necessary revalidation; do not silently retain or reset completion.
4. Use structured text arguments or a correctly encoded body file to preserve Markdown, newlines, and checkboxes. Do not interpolate issue prose into executable shell text. Change no product code or unrelated repository files. Do not add assignees, labels, close issues, or create issues beyond the agreed publication structure unless requested.
5. Read every published issue back and verify its repository, title, body, and resulting URL; verify each agreed parent-child relationship and dependency reference. If a submission times out or its result is uncertain, inspect GitHub for that issue, revision, or relationship before retrying. Do not blindly repeat a create or linking operation. If the result remains ambiguous or linking is unavailable, stop and report the verified URLs, incomplete relationships, and remaining publication work; do not claim the hierarchy is complete or recreate successfully published issues.
6. Return the verified parent and child URLs (or the single issue URL), whether each was created or updated, and an example follow-up targeting the first executable issue and step. When that step has a manual checkpoint, use **Read ISSUE_URL and implement step 1 only, then stop for my manual testing.** Otherwise use **Read ISSUE_URL and implement step 1 only, report automated check results, then stop.** Substitute the actual next step number as needed. Confirm that product code was not changed by publication.

If authenticated connectors, CLI, or APIs cannot complete publication after reasonable non-browser recovery, preserve the issue-ready text in the conversation and report the concrete blocker and any verified partial results. Do not attempt browser access, claim the plan was persisted, or ask the user to paste credentials into chat.
