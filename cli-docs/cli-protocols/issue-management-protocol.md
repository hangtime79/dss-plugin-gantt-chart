# Issue Management Protocol

Standard procedure for creating, updating, and managing GitHub issues during development sessions.

---

## AI Assistant: Read This First

### Before Starting

1. **Verify GitHub CLI is available** - Run `gh --version` to confirm
2. **Check repository context** - Ensure you're in the correct repo directory
3. **Understand the current task** - Is this a new feature, bug fix, or technical debt?

### When to Ask the User

| Situation | Action |
|-----------|--------|
| Unsure if task warrants an issue | Ask user |
| Priority level is ambiguous | Ask user |
| Issue already exists for this work | Ask user before creating duplicate |
| User mentions "deferred" items | Ask if they want them migrated now |
| Bulk operations affecting many issues | Ask user before executing |

### When to Proceed Autonomously

| Situation | Action |
|-----------|--------|
| Bug discovered during development | Create issue immediately |
| Technical debt identified | Create issue with technical-debt label |
| Feature gap found while implementing | Create issue for future consideration |
| Work item needs to be captured before context-switch | Create issue |

### Common AI Mistakes

1. **Creating issues without labels** - Always add at least type and status labels
2. **Using web UI instead of CLI** - Prefer `gh issue create` for speed
3. **Not linking related issues** - Use "Related to #123" or "Blocks #456" in body
4. **Overly verbose issue bodies** - Keep descriptions concise and technical
5. **Creating issues for work already completed** - Only create issues for future/current work
6. **Not updating issue status** - Mark issues as `in-progress` when starting work
7. **Forgetting to close issues when work is done** - Close with PR reference: "Fixes #123"

### Verification Commands

Run these to check state before operations:

```bash
# 1. Verify gh CLI works
gh auth status

# 2. Check existing issues to avoid duplicates
gh issue list --search "keyword"

# 3. Verify label exists before applying
gh label list | grep "label-name"

# 4. Check issue status
gh issue view 123

# 5. List issues in specific state
gh issue list --label "needs-triage"
gh issue list --label "in-progress"
```

### Output to Show User

When creating issues during a session, summarize:

```
Issues created this session:
- #45 [FEATURE] Add rate limiting - enhancement, needs-spec
- #46 [BUG] Fix null pointer in parser - bug, priority-high, in-progress
- #47 [TECH DEBT] Refactor auth module - technical-debt, deferred

Current work:
- #46 in progress
```

---

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                   ISSUE LIFECYCLE                                │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
    ┌───────┐           ┌──────────┐         ┌──────────┐
    │Feature│           │   Bug    │         │Tech Debt │
    └───┬───┘           └────┬─────┘         └────┬─────┘
        │                    │                     │
        └────────────────────┼─────────────────────┘
                             ▼
                    ┌─────────────────┐
                    │  needs-triage   │
                    │  (Auto-applied) │
                    └────────┬────────┘
                             ▼
                    ┌─────────────────┐
                    │  Triage Review  │
                    │  Add priority   │
                    └────────┬────────┘
                             │
                ┌────────────┼────────────┐
                ▼            ▼            ▼
         ┌──────────┐  ┌─────────┐  ┌─────────┐
         │needs-spec│  │deferred │  │rejected │
         └────┬─────┘  └─────────┘  └─────────┘
              ▼
         ┌──────────┐
         │  ready   │
         └────┬─────┘
              ▼
         ┌──────────────┐
         │ in-progress  │
         └────┬─────────┘
              ▼
         ┌──────────────┐
         │    Closed    │
         │  (via PR)    │
         └──────────────┘
```

---

## Phase 1: Creating Issues

### 1.1 Feature Requests

**Quick Creation:**
```bash
gh issue create \
  --title "[FEATURE] Add user authentication" \
  --label "enhancement,needs-triage" \
  --body "Add JWT-based authentication with refresh tokens.

Implementation notes:
- Use jsonwebtoken library
- Store tokens in httpOnly cookies
- Add middleware to protected routes

Acceptance criteria:
- [ ] Login endpoint returns JWT
- [ ] Protected routes reject invalid tokens
- [ ] Token refresh mechanism works"
```

**Interactive (uses template):**
```bash
gh issue create --web
```

### 1.2 Bug Reports

**Quick Creation:**
```bash
gh issue create \
  --title "[BUG] Parser crashes on empty input" \
  --label "bug,priority-high" \
  --body "Parser crashes when given empty string input.

Reproduction:
1. Call parse() with empty string
2. NullPointerException thrown

Expected: Return empty result or validation error
Actual: Crashes with stack trace

Error output:
\`\`\`
NullPointerException at line 42
\`\`\`"
```

### 1.3 Technical Debt

```bash
gh issue create \
  --title "[TECH DEBT] Refactor authentication module" \
  --label "technical-debt,priority-low" \
  --body "Auth module has grown to 500+ lines with multiple responsibilities.

Suggested approach:
- Split into AuthService, TokenManager, SessionStore
- Add unit tests (currently 30% coverage)
- Remove deprecated session methods"
```

### 1.4 Batch Creation

For migrating existing backlog:

```bash
# Create multiple issues from a list
while IFS='|' read -r title type priority body; do
  gh issue create \
    --title "$title" \
    --label "$type,$priority,needs-triage" \
    --body "$body"
  sleep 1  # Rate limit protection
done < backlog.txt
```

---

## Phase 2: Managing Active Issues

### 2.1 Starting Work on an Issue

```bash
# Mark as in-progress
gh issue edit 45 --add-label "in-progress"

# Assign to yourself (if needed)
gh issue edit 45 --add-assignee "@me"

# Add comment
gh issue comment 45 --body "Starting implementation"
```

### 2.2 Updating Issue Status

```bash
# Change priority
gh issue edit 45 \
  --remove-label "priority-medium" \
  --add-label "priority-high"

# Mark as blocked
gh issue edit 45 --add-label "blocked"
gh issue comment 45 --body "Blocked by #42 - needs API endpoint"

# Move to ready
gh issue edit 45 \
  --remove-label "needs-spec" \
  --add-label "ready"
```

### 2.3 Adding Context During Development

```bash
# Add implementation notes
gh issue comment 45 --body "Decision: Using bcrypt for password hashing. 
Considered argon2 but bcrypt has better library support."

# Reference related issues
gh issue comment 45 --body "Related to #42 and #43. Should be implemented after those."
```

---

## Phase 3: Closing Issues

### 3.1 Via Pull Request (Preferred)

In your PR description:
```markdown
Fixes #45
Related to #46

## Changes
- Implemented JWT authentication
- Added token refresh endpoint
- All acceptance criteria met
```

GitHub automatically closes #45 when PR merges.

### 3.2 Manual Close

```bash
# Close with comment
gh issue close 45 --comment "Implemented in commit abc1234"

# Close without work (won't fix, duplicate, etc)
gh issue close 45 --comment "Duplicate of #42" --reason "not planned"
```

---

## Phase 4: Triage and Grooming

### 4.1 Regular Triage (Weekly)

```bash
# List untriaged issues
gh issue list --label "needs-triage"

# For each issue, add priority and next-status
gh issue edit 47 \
  --add-label "priority-medium,needs-spec" \
  --remove-label "needs-triage"
```

### 4.2 Backlog Grooming (Monthly)

```bash
# List old deferred issues
gh issue list --label "deferred" --json number,title,updatedAt

# Close stale deferred issues (90+ days old)
# Review before running - this is destructive
gh issue list --label "deferred" --json number,updatedAt --jq \
  '.[] | select(.updatedAt | fromdateiso8601 < (now - 7776000)) | .number' \
  | xargs -I {} gh issue close {} --comment "Closing due to age" --reason "not planned"
```

### 4.3 Re-prioritization

```bash
# Bump priority of customer-reported issues
gh issue list --label "priority-low" --search "customer" --json number \
  | jq -r '.[].number' \
  | xargs -I {} gh issue edit {} \
    --remove-label "priority-low" \
    --add-label "priority-high"
```

---

## Quick Reference Commands

### Common Operations

```bash
# Create feature
gh issue create --title "[FEATURE] ..." --label "enhancement,needs-triage"

# Create bug
gh issue create --title "[BUG] ..." --label "bug,priority-high"

# List by label
gh issue list --label "in-progress"

# Update status
gh issue edit 123 --add-label "ready" --remove-label "needs-spec"

# Add comment
gh issue comment 123 --body "Progress update"

# Close with PR
# In PR body: "Fixes #123"

# Close manually
gh issue close 123 --comment "Done"
```

### Filtering

```bash
# Open issues only
gh issue list --state "open"

# By multiple labels (AND)
gh issue list --label "bug,priority-high"

# Search in title/body
gh issue list --search "authentication"

# By assignee
gh issue list --assignee "@me"

# By milestone
gh issue list --milestone "v1.0"
```

---

## Troubleshooting

### Cannot Create Issue - Not Authenticated

```bash
# Check auth status
gh auth status

# Login if needed
gh auth login
```

### Label Doesn't Exist

```bash
# List available labels
gh label list

# Create missing label
gh label create "priority-critical" --color "b60205" --description "Drop everything"
```

### Issue Number Not Found

```bash
# List all issues (including closed)
gh issue list --state "all" | grep "keyword"

# View specific issue
gh issue view 123
```

### Too Many Results

```bash
# Limit results
gh issue list --limit 20

# Use more specific labels
gh issue list --label "bug,priority-critical,in-progress"
```

### Web UI and CLI Out of Sync

```bash
# CLI caches results - force refresh
gh issue list --limit 1  # This updates cache

# Or clear cache
rm -rf ~/.config/gh/cache
```

---

## Best Practices

### DO

✅ Create issues immediately when gaps are identified  
✅ Use clear, searchable titles with [TYPE] prefix  
✅ Add at least type + status labels  
✅ Link related issues in the body  
✅ Update status as work progresses  
✅ Close via PR with "Fixes #123"  
✅ Add comments for context and decisions  
✅ Triage regularly (weekly minimum)

### DON'T

❌ Create duplicate issues - search first  
❌ Leave issues in needs-triage indefinitely  
❌ Forget to update status when starting work  
❌ Create issues for already-completed work  
❌ Let deferred backlog grow without bounds  
❌ Use only web UI - CLI is much faster  
❌ Close issues without comment/PR reference

---

## Integration with Development Workflow

### During Planning Session

```bash
# 1. Review ready issues
gh issue list --label "ready"

# 2. Prioritize for sprint
gh issue list --label "ready" --json number,title

# 3. Mark selected issues for work
gh issue edit 45 46 47 --add-label "sprint-current"
```

### During Implementation

```bash
# 1. Mark issue as in-progress
gh issue edit 45 --add-label "in-progress"

# 2. Create branch referencing issue
git checkout -b feature/45-add-authentication

# 3. Work and commit
git commit -m "feat: add JWT auth middleware (#45)"

# 4. Create PR
gh pr create --title "Add authentication" --body "Fixes #45"
```

### After Merge

```bash
# Issue is auto-closed by PR
# Verify closure
gh issue view 45  # Should show "Closed"
```

---

## Checklist

Before ending development session:

- [ ] All discovered bugs have issues created
- [ ] Technical debt items documented as issues
- [ ] In-progress issues updated with comments
- [ ] Completed work closed via PR or manually
- [ ] New issues triaged and labeled
- [ ] Blocked issues have comments explaining blockers

---

## Related Protocols

- [Branch Exit Protocol](branch-exit-protocol.md) - Pre-merge workflow
- [Branch Post-Merge Protocol](branch-post-merge-protocol.md) - Post-merge cleanup
- [Branch Open Protocol](branch-open-protocol.md) - Starting new work

---

## Files

- **Issue Templates**: `.github/ISSUE_TEMPLATE/*.yml`
- **Quick Reference**: `.github/QUICK_ISSUE_REFERENCE.md`
- **Setup Guide**: `.github/GITHUB_ISSUES_SETUP.md`
- **Deployment**: `.github/DEPLOY.md`