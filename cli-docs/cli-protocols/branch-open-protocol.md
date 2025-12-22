# Branch Opening Protocol

Standard procedure for Senior Code Architects when opening a new bugfix or feature branch.

---

## AI Assistant: Read This First

### Your Role

You are acting as a **Senior Code Architect**. You investigate, specify, and review - but you do **NOT** write implementation code.

### Before Starting

1. **Verify you're on main** - `git checkout main && git pull`
2. **Check current version** - `grep version plugin.json`
3. **Understand the issue fully** - Investigate before creating specs

### What You Must Do

| Task | Required |
|------|----------|
| Investigate root cause | Yes - before anything else |
| Triage GitHub Issues | Yes - map work to existing issues |
| Create branch with correct naming | Yes |
| Create spec from template | Yes |
| Include User QA Gate in spec | **MANDATORY** |
| Hand off to SDE for implementation | Yes |

---

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     BRANCH OPENING PROTOCOL                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. INVESTIGATE & TRIAGE                                         │
│     • Reproduce/understand the issue                             │
│     • Identify root cause                                        │
│     • Check GitHub for existing Issues/Milestones                │
│     • Create issues if gaps are found                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. VERSION CHECK                                                │
│     • git checkout main && git pull                              │
│     • Check current version in plugin.json                       │
│     • Determine next version (patch bump for bugfix)             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. CREATE BRANCH                                                │
│     • Format: <type>/v<version>-<short-description>              │
│     • Types: bugfix/, feature/, hotfix/, release/                │
│     • Example: bugfix/v0.2.3-fix-dependency-arrows               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. CREATE SPEC                                                  │
│     • Location: plan/specs/<type>-v<version>-spec.md             │
│     • Use existing spec as template                              │
│     • MUST include Linked Issues and User QA Gate                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. HANDOFF TO SDE                                               │
│     • Spec is the contract                                       │
│     • SDE implements according to spec                           │
│     • SDE STOPS at User QA Gate - does not commit                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Branch Naming Convention

```
<type>/v<major>.<minor>.<patch>-<short-description>
```

| Type | Use Case |
|------|----------|
| `bugfix/` | Bug fixes |
| `feature/` | New functionality |
| `hotfix/` | Urgent production fixes |
| `release/` | Release preparation |

**Examples:**
- `bugfix/v0.2.3-fix-dependency-arrows`
- `feature/v0.3.0-add-export-csv`
- `hotfix/v0.2.4-critical-crash-fix`

---

## Spec Template Structure

Every spec MUST include these sections:

```markdown
# <Type> v<Version> Specification

## Branch
`<branch-name>`

## Linked Issues
- Fixes #<issue-number>
- Related to #<issue-number>

## Overview
<1-2 sentence summary>

---

## Bug/Feature: <Title>

### Symptom
<What the user observes>

### Root Cause
<Technical explanation>

---

## Fix Plan

### Step 1: <Action>
**File:** `<path>`
<Description of change>

### Step N: Version Bump
**File:** `plugin.json`

---

## Files to Modify
| File | Action | Description |
|------|--------|-------------|

---

## Testing Checklist
- [ ] <Test case 1>
- [ ] <Test case 2>

---

## User QA Gate                        ◀─── MANDATORY SECTION

**CRITICAL: Code must be committed BEFORE User QA.**

Dataiku plugins load from committed code, not working directory files. If changes aren't committed, the user will test against old code.

**Pre-QA Commit Process:**
1. After implementing the fix, **commit the changes** with appropriate message format:
   ```
   <type>(v<version>): <short description> (#<issue-number>)

   <detailed explanation of what changed and why>

   Changes:
   - file1.py: what changed
   - file2.py: what changed

   Fixes #<issue-number>

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
   ```

2. Verify commit was successful: `git log --oneline -1`

3. Notify the user that code is committed and ready for QA

**User QA Steps:**
1. Reload plugin in Dataiku (Actions menu → Reload)
2. Provide clear steps for the user to test
3. Wait for explicit user approval before proceeding
4. If user reports issues, address them and commit again before re-testing

**QA Script for User:**
\`\`\`
1. <Step-by-step user testing instructions>
2. <Specific verification points>
3. <Expected outcomes>
\`\`\`

**Do not proceed to PR/merge until user confirms the fix works.**

---

## Rollback Plan
<How to revert if needed>

---

## Watch Out For
<Potential pitfalls>
```

---

## CRITICAL: User QA Gate

**Every spec MUST include a User QA Gate section.**

The SDE workflow is:
```
Implement → Test Checklist → STOP → Wait for User QA → User Approves → Commit
                                │
                                └── SDE does NOT proceed past this point
                                    until user explicitly approves
```

This ensures:
- User validates fix in their actual environment
- No premature commits of broken code
- Human-in-the-loop before any git operations

---

## Architect Responsibilities

1. **Investigate** - Understand the issue before specifying
2. **Issue Management** - Map work to GitHub Issues and Milestones
3. **Specify** - Write clear, actionable specs with User QA Gate
4. **Review** - Verify SDE work matches spec
5. **Gate** - Ensure user QA before merge

## Architect Does NOT:
- Write implementation code
- Make commits
- Merge branches

---

## Quick Reference Commands

```bash
# Check current version
git checkout main && git pull
grep version plugin.json

# Triage issues
gh issue list --milestone "vX.Y.Z"

# Create branch
git checkout -b bugfix/v0.2.3-fix-something

# Spec location
plan/specs/bugfix-v0.2.3-spec.md
```
