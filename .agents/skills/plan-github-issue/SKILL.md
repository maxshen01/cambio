---
name: plan-github-issue
description: Create a staged repository plan intended for GitHub persistence, then publish or revise it as an issue after execution is enabled and requested. Use for planning-to-issue workflows, not ordinary coding requests or implementing issue steps.
---

# Plan work and persist it as a GitHub issue

This skill plans product work and publishes its agreed plan. Executing this workflow creates or updates the planning issue only; it does not implement the product steps. Later implementation requests are separate work, supported by the repository's `implement-plan` skill when available.

## Plan mode: explore and agree

1. Read relevant repository instructions, affected code, contracts, and any supplied issue. Establish current behavior, desired outcome, exclusions, and dependencies. Record the planning baseline commit and relevant uncommitted changes without modifying them.
2. Resolve material scope and implementation decisions with the user. Discover repository facts before asking questions. Do not silently include adjacent features just because they are prerequisites; agree whether to include or defer them and make any temporary limitation explicit.
3. Divide the work into logical, independently testable steps. Use as many steps as the task needs. Each step should specify the intended change, acceptance criteria, appropriate automated checks, and a practical user checkpoint. Identify dependencies that prevent a checkpoint from being exercised yet.
4. Prepare an issue title and body using the structure below. Resolve material decisions before finalizing. If the user requests revisions while still in Plan mode, revise the draft only; do not mutate GitHub or repository files.
5. In the final `<proposed_plan>` block, make the executable task **Publish the agreed plan as a GitHub issue**. State prominently: **Executing this workflow creates or updates the GitHub issue only. It does not implement the product steps.** Include the complete proposed issue title and body as publication content, so the work remains reviewable and survives a later execution request.

Respect the actual mode supplied by the environment. A request to execute does not itself end Plan mode. If still in Plan mode, explain the mode restriction briefly and retain the prepared issue content. If this workflow is invoked in execution mode without an agreed plan, establish the plan first rather than assuming approval or changing modes yourself.

## Issue content

Keep the issue self-contained and proportionate to the task. Include:

- Goal, current state, relevant repository links, and planning baseline commit.
- Included work, exclusions, dependencies, agreed assumptions, and any deliberate interim behavior that falls short of the final contract.
- Numbered implementation steps describing changes, acceptance criteria, checks, and user checkpoints. Each step has separate unchecked **Implementation/checks complete** and **User validation passed** boxes. If there is no meaningful manual check, explicitly mark user validation not applicable instead of adding an artificial checkpoint.
- A compact progress record for each step's implementation commit, automated test evidence, manual result, and unresolved defects. Distinguish checks already run at planning time from checks still required after implementation.
- The future-chat instructions below.

Include these future-chat instructions in the issue:

> Read the current issue, relevant repository instructions, and current code before implementing. Implement one requested step, record its commit and verification evidence, update the implementation checkbox only after required checks pass, then stop for its user checkpoint. Check user validation only after the user confirms it passed. Record unverified acceptance criteria and defects explicitly. Do not mark deferred work or a larger contract complete. Request the next step separately.

Progress updates during implementation belong to those implementation chats; this skill does not independently execute steps or mark them complete.

## Execution mode: publish only

Publish once execution is actually enabled and the user requests execution of the agreed publication plan. Existing authorization to publish is sufficient; do not ask again solely because publishing changes GitHub. Follow any tool-enforced approval requirements.

1. Determine the target repository from Git remotes and session context. Resolve competing plausible destinations with the user instead of guessing. Prefer an existing authenticated GitHub connector or CLI, then an authenticated API or browser fallback. Do not hard-code the repository, account, or authentication method; install no tools automatically and never expose credentials.
2. Read a referenced existing issue before updating it. Before a new issue is created, check for an existing issue from this workflow to avoid duplicates. A similar title alone is not sufficient evidence to overwrite an unrelated issue.
3. Publish the agreed title and body as one issue. For revisions, update the identified issue rather than creating a replacement. Preserve completed work, progress evidence, unrelated issue content, and existing metadata. Summarize material revisions in the body. If changed scope invalidates prior completion, preserve the historical evidence and explicitly identify the affected status and necessary revalidation; do not silently retain or reset completion.
4. Use structured text arguments or a correctly encoded body file to preserve Markdown, newlines, and checkboxes. Do not interpolate issue prose into executable shell text. Change no product code or unrelated repository files. Do not add assignees, labels, close issues, or create extra issues unless requested.
5. Read the issue back and verify the repository, title, body, and resulting URL. If submission times out or its result is uncertain, inspect GitHub for the issue or revision before retrying. Do not blindly repeat a create operation. If the result remains ambiguous, stop and report that uncertainty.
6. Return the verified issue URL, whether it was created or updated, and an example follow-up: **Read ISSUE_URL and implement step 1 only, then stop for my manual testing.** Confirm that product code was not changed by publication.

If authentication or write access is unavailable after reasonable supported recovery, preserve the issue-ready text in the conversation and report the concrete blocker. Do not claim the plan was persisted or ask the user to paste credentials into chat.
