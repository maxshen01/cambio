---
name: plan-github-issue
description: Create a staged repository plan intended for GitHub persistence, then publish or revise it as an issue or parent with sub-issues after execution is enabled and requested. Use for planning-to-issue workflows, not ordinary coding requests or implementing issue steps.
---

# Plan work and persist it as a GitHub issue

This skill plans product work and publishes its agreed plan. Executing this workflow creates or updates the agreed planning issues and their parent-child relationships only; it does not implement the product steps. Later implementation requests are separate work, supported by the repository's `implement-plan` skill when available.

## Plan mode: explore and agree

1. Read relevant repository instructions, affected code, contracts, and any supplied issue. Establish current behavior, desired outcome, exclusions, and dependencies. Record the planning baseline commit and relevant uncommitted changes without modifying them.
2. Resolve material scope and implementation decisions with the user. Discover repository facts before asking questions. Do not silently include adjacent features just because they are prerequisites; agree whether to include or defer them and make any temporary limitation explicit.
3. Divide the work into logical, independently testable steps. Use as many steps as the task needs. Each step should specify the intended change, acceptance criteria, appropriate automated checks, and a practical user checkpoint. Identify dependencies that prevent a checkpoint from being exercised yet. Apply the sub-issue policy below when deciding which work belongs in separate issues.
4. Prepare a title and body for each proposed issue using the structure below. Resolve material decisions before finalizing, including any parent-child structure and dependencies. If the user requests revisions while still in Plan mode, revise the draft only; do not mutate GitHub or repository files.
5. In the final `<proposed_plan>` block, make the executable task **Publish the agreed plan as GitHub issues** (or one issue when appropriate). State prominently: **Executing this workflow creates or updates the agreed GitHub issues and their parent-child relationships only. It does not implement the product steps.** Include every proposed title and complete body, the parent-child relationships, and implementation dependencies as publication content, so the work remains reviewable and survives a later execution request.

Respect the actual mode supplied by the environment. A request to execute does not itself end Plan mode. If still in Plan mode, explain the mode restriction briefly and retain the prepared issue content. If this workflow is invoked in execution mode without an agreed plan, establish the plan first rather than assuming approval or changing modes yourself.

## Sub-issue policy

Propose a sub-issue for substantial work that can be implemented and tested independently, including refactoring. Keep small refactors required by a feature within that feature's issue; do not split work merely because it touches several files or subsystems.

Keep the parent focused on the overall outcome, child work, dependencies, and combined acceptance criteria. Give each child its own goal, implementation steps, acceptance criteria, checks, and meaningful user checkpoints. Identify prerequisites and execution order explicitly; being a child does not itself establish a dependency. Avoid duplicating a child's detailed implementation plan in the parent.

Agree the complete structure during planning. A request to publish that agreed structure authorizes creating and linking its parent and children without another routine confirmation. It does not authorize additional, unplanned issues.

## Issue content

Keep the issue self-contained and proportionate to the task. Include:

- Goal, current state, relevant repository links, and planning baseline commit.
- Included work, exclusions, dependencies, agreed assumptions, and any deliberate interim behavior that falls short of the final contract.
- Numbered implementation steps describing changes, acceptance criteria, checks, and user checkpoints. Each step has separate unchecked **Implementation/checks complete** and **User validation passed** boxes, explicitly labeled as user-managed tracking. If there is no meaningful manual check, explicitly mark user validation not applicable instead of adding an artificial checkpoint.
- Relevant verification evidence already available during planning, clearly distinguished from checks still required after implementation. Do not require an implementation commit or an agent-maintained progress record.
- The future-chat instructions below.

Include these future-chat instructions in the issue:

> Read the issue, relevant repository instructions, and current code. Implement the requested step, run its required checks, and report changes, verification results, unresolved defects, and unverified acceptance criteria in chat. Stop at the specified user checkpoint. Commits and GitHub status updates require a separate user request; this issue does not authorize them.

Implementation results belong in chat. Do not instruct implementing agents to commit changes, update checkboxes, or maintain GitHub progress. Completing a step must not trigger requests to commit or update GitHub; leave those actions to a separate user request. User confirmation that manual validation passed is not itself a request to edit GitHub.

## Execution mode: publish only

Publish once execution is actually enabled and the user requests execution of the agreed publication plan. Existing authorization to publish is sufficient; do not ask again solely because publishing changes GitHub. Follow any tool-enforced approval requirements.

1. Determine the target repository from Git remotes and session context. Resolve competing plausible destinations with the user instead of guessing. Prefer an existing authenticated GitHub connector or CLI, then an authenticated API or browser fallback. Do not hard-code the repository, account, or authentication method; install no tools automatically and never expose credentials.
2. Read every referenced existing issue and its parent-child relationships before updating it. Before creating each planned issue, check for an existing issue from this workflow to avoid duplicates. A similar title alone is not sufficient evidence to overwrite an unrelated issue.
3. Publish the agreed titles and bodies as one issue or the agreed parent and children. Create or identify the parent, create or identify each child, then establish GitHub's parent-child relationships and include the actual issue links in the planned dependency references. For revisions, update the identified issues rather than creating replacements. Preserve completed work, progress evidence, unrelated issue content, and existing metadata. Summarize material revisions in the body. If changed scope invalidates prior completion, preserve the historical evidence and explicitly identify the affected status and necessary revalidation; do not silently retain or reset completion.
4. Use structured text arguments or a correctly encoded body file to preserve Markdown, newlines, and checkboxes. Do not interpolate issue prose into executable shell text. Change no product code or unrelated repository files. Do not add assignees, labels, close issues, or create issues beyond the agreed publication structure unless requested.
5. Read every published issue back and verify its repository, title, body, and resulting URL; verify each agreed parent-child relationship and dependency reference. If a submission times out or its result is uncertain, inspect GitHub for that issue, revision, or relationship before retrying. Do not blindly repeat a create or linking operation. If the result remains ambiguous or linking is unavailable, stop and report the verified URLs, incomplete relationships, and remaining publication work; do not claim the hierarchy is complete or recreate successfully published issues.
6. Return the verified parent and child URLs (or the single issue URL), whether each was created or updated, and an example follow-up targeting the first executable issue: **Read ISSUE_URL and implement step 1 only, then stop for my manual testing.** Confirm that product code was not changed by publication.

If authentication or write access is unavailable after reasonable supported recovery, preserve the issue-ready text in the conversation and report the concrete blocker. Do not claim the plan was persisted or ask the user to paste credentials into chat.
