# Branch Exit Protocol

This document defines the complete workflow for closing a development branch.

---

## AI Assistant: Read This First

### Your Role

You are preparing a branch for merge. You must generate all documentation artifacts before the PR can be created.

### Before Starting

1. **Verify all code changes are complete** - User should have approved via QA Gate
2. **Verify tests pass** - Run test suite before documentation
3. **Verify version is bumped** - Check plugin.json matches branch version

### The Four Phases (Do Not Skip Any)

| Phase | Purpose | Output |
|-------|---------|--------|
| 1. Gather Context | Understand what was done | Commit analysis, file list |
| 2. Analyze | Compare spec to reality | Tracking table, learnings |
| 3. Generate Artifacts | Create documentation | Release notes, post-mortem, CHANGELOG |
| 4. Review and Commit | Get approval, commit docs | Tagged release-ready branch |

### What You Must Generate

| Artifact | Location | Required |
|----------|----------|----------|
| Release notes | `plan/releases/vX.Y.Z-release-notes.md` | **Yes** |
| CHANGELOG entry | `CHANGELOG.md` | **Yes** |
| Post-mortem | `plan/post-mortems/vX.Y.Z-post-mortem.md` | Yes (skip only for trivial fixes) |
| CLI docs updates | `plan/cli-docs-template-update.md` | Only if new learnings |

### Common AI Mistakes

1. **Skipping phases** - All 4 phases are required. Don't jump to commit.
2. **Not reading commit history** - You must analyze ALL commits, not just recent ones
3. **Generating sparse release notes** - Be thorough, list all changes
4. **Forgetting to tag** - Create annotated tag before merge
5. **Not presenting drafts** - Show user all artifacts before committing

### When to Ask the User

| Situation | Action |
|-----------|--------|
| Commit history is messy/unclear | Ask what was actually intended |
| Spec items weren't implemented | Confirm if deferred or dropped |
| Unsure if something is a breaking change | Ask before documenting |
| Post-mortem reveals process issues | Discuss before finalizing |

### Verification Commands

Run these before generating artifacts:

```bash
# Verify you have the full picture
git log main..HEAD --oneline | wc -l  # Total commits
git diff main --stat | tail -1         # Files changed summary

# Verify version
cat plugin.json | grep version

# Verify tests pass
pytest tests/ -q 2>/dev/null || echo "Check test status with user"
```

### Output to Show User

Present all artifacts for review before committing:

```
Branch Exit Documentation Ready:

1. Release Notes: plan/releases/v0.2.3-release-notes.md
2. CHANGELOG: Updated with v0.2.3 section
3. Post-mortem: plan/post-mortems/v0.2.3-post-mortem.md
4. CLI Docs: [No new learnings / Updated with X]

Please review. Reply 'approve' to commit, or provide corrections.
```

---

## Phase 1: Gather Context

### 1.1 Identify Branch and Version

```bash
# Get current branch name
git branch --show-current

# Get current version from plugin.json
cat plugin.json | grep '"version"'

# Determine branch type from name prefix
# feature/ → Feature release
# bugfix/  → Bugfix release  
# hotfix/  → Hotfix release
```

**Extract from branch name:**

- Branch type (feature/bugfix/hotfix)
- Target version number
- Short description

**Example:** `bugfix/v0.1.2-config-race-condition` → Type: bugfix, Version: 0.1.2

### 1.2 Gather Git History

#### 1.2.1 Get Commit Overview

```bash
# List all commits in this branch (not in main)
git log main..HEAD --oneline

# Total commit count
git log main..HEAD --oneline | wc -l

# Get files modified with change stats (cumulative)
git diff main --stat

# Get list of files changed (names only)
git diff main --name-only
```

#### 1.2.2 Analyze Each Commit

**Iterate through every commit and examine its changes:**

```bash
# Get all commit hashes in the branch
COMMITS=$(git log main..HEAD --pretty=format:"%h" --reverse)

# For each commit, display full context
for commit in $COMMITS; do
    echo "=============================================="
    echo "COMMIT: $commit"
    echo "=============================================="
    
    # Commit message (full)
    git show $commit --pretty=format:"Author: %an%nDate: %ad%nMessage: %B" -s
    
    # Files changed with line counts
    git show $commit --stat
    
    # Actual diff (truncate if huge)
    git show $commit --pretty=format:"" -- | head -200
    
    echo ""
done
```

**Or single command for full analysis:**

```bash
# Complete commit-by-commit breakdown with diffs
git log main..HEAD --pretty=format:"%n=== COMMIT %h ===%nAuthor: %an%nDate: %ad%n%nMessage:%n%B%n--- Changes ---" --stat -p
```

#### 1.2.3 Identify Patterns and Problems

```bash
# Find files with high churn (modified in multiple commits)
git log main..HEAD --name-only --pretty=format:"" | sort | uniq -c | sort -rn | head -20

# Find fix/debug commits
git log main..HEAD --oneline | grep -iE "fix|debug|revert|wip|broken|attempt"

# Find reverts specifically
git log main..HEAD --oneline | grep -i "revert"

# Find commits that undo previous work (same file, opposite changes)
# Look for files appearing in both "fix:" and earlier commits
git log main..HEAD --pretty=format:"%h %s" --name-only | grep -B1 "app.js" | head -30

# Identify debugging cycles (consecutive commits to same file)
git log main..HEAD --pretty=format:"%h" --follow -- [high-churn-file.js]
```

#### 1.2.4 Deep Dive on Problem Files

For files identified with high churn, trace their evolution:

```bash
# Full history of changes to a specific file in this branch
git log main..HEAD -p -- path/to/problem-file.js

# Show what changed in each commit for that file
git log main..HEAD --pretty=format:"%h %s" -p -- path/to/problem-file.js
```

#### 1.2.5 Categorize Commits

Review each commit and categorize:

| Hash   | Message                    | Type    | Files | Assessment           |
| ------ | -------------------------- | ------- | ----- | -------------------- |
| abc123 | feat: Add sorting          | feature | 3     | ✅ Clean              |
| def456 | fix: Sort order wrong      | fix     | 1     | 🔧 Expected iteration |
| ghi789 | fix: Still broken          | fix     | 1     | ⚠️ Churn              |
| jkl012 | Revert "fix: Still broken" | revert  | 1     | 🔴 Problem            |

**Calculate metrics:**

- Total commits
- Feature/enhancement commits (feat, add, implement, new)
- Fix/debug commits (fix, debug, broken, attempt, wip)
- Revert commits
- Churn ratio = (fix + revert commits) / total commits
- High-churn files = files modified in 3+ commits

**Flag for post-mortem discussion if:**

- Churn ratio > 30%
- Any file modified in 5+ commits
- More than 1 revert
- Consecutive fix commits on same file

### 1.3 Analyze Intervention Logs

If intervention logs exist, extract key information:

```bash
# Find intervention logs for this version
find plan/interventions -name "*$(git branch --show-current | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+')*"
```

**Read each intervention log and extract:**

1. **Issues Encountered** - What problems were hit?
   - Look for headers like "Issue", "Problem", "Symptom"
   - Note the error messages or unexpected behaviors

2. **Root Causes** - What was actually wrong?
   - Look for "Cause", "Root Cause", "Reason"
   - These often contain CLI docs candidates

3. **Fixes Applied** - What solved it?
   - Look for "Resolution", "Fix", "Solution"
   - Check if these fixes are in the final code

4. **Failed Attempts** - What didn't work?
   - Important for post-mortem "What Didn't Go Well"
   - Prevents repeating mistakes

5. **Version/Debug Markers** - Track debugging progression
   - Look for version bumps (v0.1.1-DEBUG, v0.1.2-DEBUG)
   - Count iterations to resolution

**Create intervention summary:**

| Issue               | Root Cause                 | Resolution               | Attempts | CLI Docs? |
| ------------------- | -------------------------- | ------------------------ | -------- | --------- |
| Scrollbars missing  | Nested overflow containers | Set inner wrapper height | 5        | ✅ Yes     |
| Config not updating | Stale backend call         | Use live webAppConfig    | 2        | ✅ Yes     |

### 1.4 Locate Existing Documentation

Check for these files related to current version:

```bash
# Specs (planning documents)
ls -la plan/specs/ | grep -i "$(git branch --show-current | sed 's/.*v/v/' | cut -d'-' -f1)"

# Or search by version pattern
find plan/ -name "*v0.1.2*" -o -name "*0.1.2*"

# Interventions (debugging sessions)
ls -la plan/interventions/

# Check if post-mortem already exists
ls -la plan/post-mortems/

# Current changelog state
cat CHANGELOG.md

# CLI docs current state
cat plan/cli-docs-template-update.md 2>/dev/null
```

**Read each relevant file found:**

- Spec files → What was planned
- Intervention logs → What problems occurred, how resolved
- Existing changelog → What format is used, what's already documented

### 1.5 Run Tests

```bash
# Run test suite (try common patterns)
make test 2>/dev/null || \
pytest tests/ 2>/dev/null || \
python -m pytest tests/ 2>/dev/null

# Capture test count
pytest tests/ --collect-only -q 2>/dev/null | tail -1

# Check for new test files in this branch
git diff main --name-only | grep -E "test_.*\.py$"
```

**Record:**

- Total tests
- Tests passing/failing
- New tests added in this branch

### 1.6 Check for Deferred Items

```bash
# TODOs and FIXMEs in modified files
git diff main --name-only | xargs grep -l "TODO\|FIXME" 2>/dev/null

# Search for "deferred", "later", "future" in specs
grep -ri "defer\|later\|future\|v0\." plan/specs/ 2>/dev/null
```

### 1.7 Identify Breaking Changes

```bash
# Check for API changes in key files
git diff main -- "*.json" | grep -E "^\+|^\-" | head -50

# Parameter renames or removals
git diff main -- "**/webapp.json" "**/plugin.json"

# Public function signature changes
git diff main -- "python-lib/**/*.py" | grep -E "^[\+\-]def "
```

**Flag as breaking if:**

- Parameters renamed or removed
- Required parameters added
- Return types changed
- File paths changed that users might reference

---

## Phase 2: Analyze

### 2.1 Compare Spec to Reality

**Read the spec file and check each planned item against actual commits:**

```bash
# Find the spec for this version
SPEC_FILE=$(find plan/specs -name "*$(git branch --show-current | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+')*" | head -1)

# Display spec contents
cat "$SPEC_FILE"
```

**For each item in the spec:**

1. Identify the feature/fix described

2. Search commits for implementation:

   ```bash
   # Search commit messages for feature keywords
   git log main..HEAD --oneline | grep -i "[keyword]"
   
   # Search actual code changes for implementation
   git log main..HEAD -p | grep -A5 -B5 "[function or pattern]"
   ```

3. Verify the change exists in final code:

   ```bash
   # Check current state of relevant file
   grep -n "[expected code pattern]" path/to/file.py
   ```

4. Mark as: ✅ Implemented | ⚠️ Partial | ❌ Missing | 🔄 Deferred

**Create tracking table:**

| Spec Item | Status        | Implementing Commit(s) | Notes                      |
| --------- | ------------- | ---------------------- | -------------------------- |
| Feature A | ✅ Implemented | abc123, def456         | Works as specified         |
| Feature B | ⚠️ Partial     | ghi789                 | Missing edge case handling |
| Feature C | ❌ Missing     | -                      | Never started              |
| Bug fix D | 🔄 Deferred    | -                      | Moved to v0.2.0            |

### 2.2 Categorize Changes

Review git diff and categorize each change:

| Category    | Description                 | CHANGELOG Section             |
| ----------- | --------------------------- | ----------------------------- |
| New feature | New user-facing capability  | Added                         |
| Bug fix     | Corrects incorrect behavior | Fixed                         |
| Enhancement | Improves existing feature   | Changed                       |
| Deprecation | Feature marked for removal  | Deprecated                    |
| Removal     | Feature removed             | Removed                       |
| Internal    | Refactoring, no user impact | (omit or note in post-mortem) |
| Docs        | Documentation only          | (omit from CHANGELOG)         |
| Tests       | Test additions/changes      | (omit or brief note)          |

### 2.3 Extract Technical Learnings

From intervention logs and git history, identify:

1. **Dataiku-specific gotchas** → CLI docs candidates
2. **Library quirks** (Frappe Gantt, pandas, etc.) → CLI docs candidates
3. **Patterns that worked** → Document for future reference
4. **Patterns that failed** → Document to avoid repetition

**CLI Docs criteria - include if:**

- Would affect other plugin developers
- Took significant debugging time to discover
- Not documented elsewhere
- Dataiku platform-specific behavior

### 2.4 Assess Outcome

Determine overall branch outcome:

| Outcome     | Criteria                                                     |
| ----------- | ------------------------------------------------------------ |
| ✅ Success   | All planned features delivered, tests pass, no major issues  |
| ⚠️ Partial   | Some features delivered, some deferred, or minor issues remain |
| ❌ Abandoned | Branch will not be merged, work scrapped or restarted        |

---

## Phase 3: Generate Artifacts

### 3.1 Release Notes

**File:** `plan/releases/vX.Y.Z-release-notes.md`

```markdown
# Release Notes: vX.Y.Z

**Release Date:** YYYY-MM-DD
**Type:** Feature | Bugfix | Hotfix
**Branch:** `[branch-name]`

---

## Summary

[One paragraph: what this release accomplishes and why it matters]

---

## Changes

### Added
- [New feature]: [Brief description]
  - [Implementation detail if relevant]

### Fixed
- [Bug symptom] ([Root cause])
  - [How it was fixed]

### Changed
- [What changed]: [Old behavior] → [New behavior]

---

## Files Modified

| File | Change Type | Description |
|------|-------------|-------------|
| `path/to/file.py` | Modified | [What changed] |
| `path/to/new.py` | Added | [Purpose] |
| `path/to/old.py` | Deleted | [Why removed] |

---

## Testing

- **Unit Tests:** X/Y passing
- **Integration Tests:** X/Y passing
- **New Tests Added:**
  - `test_feature_x.py` - [What it tests]
- **Manual Verification:** [Checklist items completed]

---

## Breaking Changes

[None]

OR

| Change | Migration Path |
|--------|----------------|
| `oldParam` renamed to `newParam` | Update config to use `newParam` |

---

## Known Issues

- [Issue description] - [Workaround if any] - [Planned fix version]

---

## Dependencies

[None]

OR

- Added: `package==version` - [Why needed]
- Updated: `package` from `old` to `new` - [Why updated]
- Removed: `package` - [Why removed]

---

## Related Documents

- Spec: `plan/specs/[spec-file].md`
- Post-mortem: `plan/post-mortems/vX.Y.Z-post-mortem.md`
- Intervention Log: `plan/interventions/vX.Y.Z-intervention.md` (if exists)
```

### 3.2 Post-Mortem

**File:** `plan/post-mortems/vX.Y.Z-post-mortem.md`

**For successful/partial branches:**

```markdown
# Post-Mortem: vX.Y.Z

**Branch:** `[branch-name]`
**Type:** Feature | Bugfix | Hotfix
**Duration:** X days (Started: YYYY-MM-DD, Completed: YYYY-MM-DD)
**Outcome:** ✅ Success | ⚠️ Partial | ❌ Abandoned

---

## Summary

[2-3 sentences: what was attempted, what was achieved]

---

## Scope

### Planned
- [ ] Feature/Fix A
- [ ] Feature/Fix B
- [ ] Feature/Fix C

### Delivered
- [x] Feature/Fix A
- [x] Feature/Fix B
- [ ] Feature/Fix C → Deferred to vX.Y.Z

### Deferred Items
| Item | Reason | Target Version |
|------|--------|----------------|
| Feature C | [Why deferred] | vX.Y.Z |

---

## Timeline

| Milestone | Planned | Actual | Variance |
|-----------|---------|--------|----------|
| Start | YYYY-MM-DD | YYYY-MM-DD | - |
| Feature complete | YYYY-MM-DD | YYYY-MM-DD | +X days |
| Testing complete | YYYY-MM-DD | YYYY-MM-DD | +X days |
| Release | YYYY-MM-DD | YYYY-MM-DD | +X days |

---

## Commit Analysis

| Metric | Value | Assessment |
|--------|-------|------------|
| Total commits | N | |
| Feature commits | N | |
| Fix/debug commits | N | |
| Reverts | N | |
| Churn ratio | X% | 🟢 Low (<20%) / 🟡 Medium (20-40%) / 🔴 High (>40%) |

[If churn ratio > 30%, explain why]

---

## What Went Well

- [Specific positive outcome]
- [Technique that worked]
- [Decision that paid off]

---

## What Didn't Go Well

- [Problem encountered]
- [Approach that failed]
- [Unexpected issue]

---

## Blockers Encountered

| Blocker | Impact | Resolution | Time Lost |
|---------|--------|------------|-----------|
| [Description] | [What it blocked] | [How resolved] | X hours/days |

---

## Technical Discoveries

### Platform Behavior
- [Dataiku-specific finding]

### Library Behavior  
- [Third-party library finding]

### Architecture Insights
- [Design pattern that worked/failed]

---

## CLI Docs Candidates

Items that should be added to cli-docs-template-update.md:

1. **[Topic]**: [Brief description of the learning]
2. **[Topic]**: [Brief description of the learning]

---

## Recommendations

### For Next Release
- [Specific recommendation]

### Process Improvements
- [What to do differently]

### Technical Debt
- [Items to address in future]

---

## Lessons Learned

1. [Key takeaway]
2. [Key takeaway]
3. [Key takeaway]
```

**For abandoned branches, use the more detailed failure analysis format (see existing v0.1.0-post-mortem.md as template)**

### 3.3 CHANGELOG Entry

**File:** `CHANGELOG.md` (prepend after `## [Unreleased]` section)

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- [User-facing feature description]

### Fixed
- [Bug fix description - describe symptom, not implementation]

### Changed
- [Behavior change description]

### Deprecated
- [Feature being phased out]

### Removed
- [Feature removed]

### Security
- [Security-related fix]
```

**CHANGELOG guidelines:**

- Write from user perspective, not developer perspective
- Describe WHAT changed, not HOW
- Be concise - one line per item
- Link to issues/specs if available
- Don't include internal refactoring unless it affects users

### 3.4 CLI Docs Updates

**File:** `plan/cli-docs-template-update.md` (append new sections)

Only add entries that meet the criteria from Phase 2.2.

```markdown
## N. [Title of Learning]

### Context
[When would a developer encounter this? Why does it matter?]

### The Problem
[What goes wrong if you don't know this? Error messages, symptoms, wasted time.]

### The Solution
[Clear explanation of correct approach]

### Implementation

```[language]
[Code example if applicable]
```

### Verification

[How to confirm the solution works]

### Related

- [Links to relevant docs, issues, or other CLI docs sections]

```
---

## Phase 4: Review and Commit

### 4.1 Present Drafts

Display each generated artifact for user review:

1. Show release notes draft
2. Show post-mortem draft
3. Show CHANGELOG entry
4. Show CLI docs additions (if any)

Ask: "Review these artifacts. Any corrections or additions before I commit?"

### 4.2 Apply Corrections

Make any requested changes to the drafts.

### 4.3 Verify Version Bump

```bash
# Check plugin.json has correct version
cat plugin.json | grep '"version"'

# If not updated, update it
# Use str_replace or sed to update version
```

### 4.4 Commit Documentation

```bash
# Stage documentation files
git add plan/releases/vX.Y.Z-release-notes.md
git add plan/post-mortems/vX.Y.Z-post-mortem.md
git add CHANGELOG.md
git add plan/cli-docs-template-update.md  # if modified

# Commit with conventional commit message
git commit -m "docs(vX.Y.Z): Add release notes and post-mortem

- Release notes for vX.Y.Z
- Post-mortem analysis
- Updated CHANGELOG
- [CLI docs updates if applicable]"
```

### 4.5 Tag the Release

```bash
# Create an annotated tag for the release
git tag -a vX.Y.Z -m "Release vX.Y.Z - [Short Description]"
```

### 4.6 Push to Origin

```bash
# Push branch and tags to remote
git push origin [branch-name] --tags
```

### 4.7 Create Pull Request

Use the release notes to create a PR:

```bash
gh pr create --title "vX.Y.Z: [Short Description]" --body "$(cat <<'EOF'
## Summary
[1-3 bullet points from release notes]

## Changes

### Added
[From release notes]

### Fixed
[From release notes]

## Files Modified
[List key files]

## Test Plan
[QA verification checklist]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 4.8 Final Status

Report:

- Files created/modified
- Commit hash
- Tag created
- PR URL
- Ready for review and merge

---

## File Naming Conventions

| Artifact       | Location              | Naming Pattern                                      |
| -------------- | --------------------- | --------------------------------------------------- |
| Release notes  | `plan/releases/`      | `vX.Y.Z-release-notes.md`                           |
| Spec (feature) | `plan/specs/`         | `vX.Y.Z-feature-spec.md`                            |
| Spec (bugfix)  | `plan/specs/`         | `vX.Y.Z-bugfix-spec.md`                             |
| Post-mortem    | `plan/post-mortems/`  | `vX.Y.Z-post-mortem.md`                             |
| Intervention   | `plan/interventions/` | `vX.Y.Z-intervention.md`                            |
| CLI docs       | `plan/`               | `cli-docs-template-update.md` (single file, append) |

---

## Directory Structure Reference

```
plan/
├── cli-docs-template-update.md        # Accumulated learnings (append-only)
├── interventions/
│   └── vX.Y.Z-intervention.md         # Debugging session logs
├── post-mortems/
│   └── vX.Y.Z-post-mortem.md          # Release retrospectives
├── releases/
│   └── vX.Y.Z-release-notes.md        # What shipped
├── specs/
│   └── vX.Y.Z-[type]-spec.md          # What was planned
└── wip-status/
    └── [current work status files]
```

---

## Quick Reference: Minimum Viable Exit

If time is short, minimum required artifacts:

1. ✅ CHANGELOG entry (always)
2. ✅ Release notes (always)
3. ⚠️ Post-mortem (skip only if trivial bugfix with no learnings)
4. ⚠️ CLI docs (only if new platform learnings)

---

## Troubleshooting

### No main branch to diff against

```bash
# Use the parent branch or first commit
git log --oneline | tail -5
git diff [first-commit-hash]..HEAD --stat
```

### Can't find spec files

Check alternative locations:

- Root directory
- `docs/` folder
- Named differently (search by version number)

### Tests won't run

```bash
# Check for test requirements
cat requirements-test.txt 2>/dev/null
cat code-env/python/spec/requirements.txt

# Install and retry
pip install pytest --break-system-packages
```