# Branch Opening Protocol

Standard procedure for Senior Code Architects when opening a new bugfix or feature branch.

---

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     BRANCH OPENING PROTOCOL                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. INVESTIGATE                                                  │
│     • Reproduce/understand the issue                             │
│     • Identify root cause                                        │
│     • Locate affected files                                      │
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
│     • MUST include User QA Gate section                          │
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

**STOP: Do not commit or merge until user has completed QA.**

After implementing the fix:
1. Notify the user that the fix is ready for QA
2. Provide clear steps for the user to test
3. Wait for explicit user approval before proceeding
4. If user reports issues, address them before continuing

**QA Script for User:**
\`\`\`
1. <Step-by-step user testing instructions>
2. <Specific verification points>
3. <Expected outcomes>
\`\`\`

**Do not proceed to commit until user confirms the fix works.**

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
2. **Specify** - Write clear, actionable specs with User QA Gate
3. **Review** - Verify SDE work matches spec
4. **Gate** - Ensure user QA before merge

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

# Create branch
git checkout -b bugfix/v0.2.3-fix-something

# Spec location
plan/specs/bugfix-v0.2.3-spec.md
```
