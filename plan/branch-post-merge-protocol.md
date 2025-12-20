# Branch Post-Merge Protocol

Standard procedure after a pull request has been merged into main on GitHub.

---

## AI Assistant: Read This First

### Before Starting

1. **Confirm the PR was actually merged** - Check GitHub or ask the user. Don't assume.
2. **Identify the correct branch name** - Use `git branch` to see exact local branch name.
3. **Check for the version tag** - The tag should exist before creating a release: `git tag -l "v*"`

### When to Ask the User

| Situation | Action |
|-----------|--------|
| Release notes file missing | Ask user - don't generate from scratch |
| Branch not showing as merged | Ask user before force deleting |
| Version tag doesn't exist | Ask user - tag should have been created in exit protocol |
| Conflicts during pull | Stop and ask user |

### When to Proceed Autonomously

| Situation | Action |
|-----------|--------|
| All verification steps pass | Proceed with cleanup |
| Branch clearly in `--merged` list | Safe to delete with `-d` |
| Local main behind remote | Safe to pull |

### Common AI Mistakes

1. **Creating release before PR is merged** - Always verify merge first
2. **Generating release notes instead of using existing ones** - Notes should already exist in `plan/releases/`
3. **Using `git branch -D` instead of `-d`** - Use `-d` (safe delete) unless user explicitly approves force delete
4. **Deleting branch while still on it** - Must `checkout main` first
5. **Not verifying the pull succeeded** - Always run `git status` after pull

### Verification Commands

Run these in order and check output before proceeding:

```bash
# 1. Verify PR was merged (should show merge commit)
gh pr view <PR-NUMBER> --json state,mergedAt

# 2. Verify tag exists
git fetch --tags
git tag -l "v$(cat plugin.json | grep version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"

# 3. Verify release notes exist
ls -la plan/releases/ | grep "$(cat plugin.json | grep version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"

# 4. After pull, verify sync
git status  # Should say "up to date with origin/main"

# 5. Before delete, verify branch is merged
git branch --merged main | grep <branch-name>
```

### Output to Show User

After completing the protocol, report:

```
Post-merge cleanup complete:
- Release: https://github.com/org/repo/releases/tag/v0.2.3
- Now on: main (up to date with origin/main)
- Deleted: bugfix/v0.2.3-fix-dependency-arrows
- HEAD: 848d13e docs: integrate learnings into cli-docs
```

---

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                   BRANCH POST-MERGE PROTOCOL                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. CREATE GITHUB RELEASE                                        │
│     • Go to GitHub → Releases → "Create new release"             │
│     • Select the version tag (e.g., v0.2.3)                      │
│     • Use release notes from plan/releases/                      │
│     • Publish release                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. SYNC LOCAL MAIN                                              │
│     • git checkout main                                          │
│     • git pull origin main                                       │
│     • Verify HEAD matches merged commit                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. CLEANUP LOCAL BRANCH                                         │
│     • Verify branch was merged: git branch --merged              │
│     • Delete local branch: git branch -d <branch-name>           │
│     • Confirm deletion                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Create GitHub Release

### 1.1 Locate Release Notes

```bash
# Find the release notes for this version
VERSION=$(cat plugin.json | grep '"version"' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
echo "Version: $VERSION"

# Check if release notes exist
cat plan/releases/v${VERSION}-release-notes.md
```

### 1.2 Create Release via GitHub CLI

```bash
# Get version from plugin.json
VERSION=$(cat plugin.json | grep '"version"' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')

# Create release using existing release notes
gh release create "v${VERSION}" \
  --title "v${VERSION}" \
  --notes-file "plan/releases/v${VERSION}-release-notes.md"
```

**Or via GitHub Web UI:**

1. Navigate to repository → **Releases** → **Create new release**
2. Click **Choose a tag** → Select `vX.Y.Z`
3. Set **Release title** to `vX.Y.Z`
4. Copy content from `plan/releases/vX.Y.Z-release-notes.md` into description
5. Click **Publish release**

### 1.3 Verify Release

```bash
# Confirm release was created
gh release view "v${VERSION}"
```

---

## Phase 2: Sync Local Main

### 2.1 Switch to Main and Pull

```bash
# Switch to main branch
git checkout main

# Pull latest from remote
git pull origin main
```

### 2.2 Verify Sync

```bash
# Check that local main matches remote
git log --oneline -3

# Verify the merge commit is present
git log --oneline | head -1

# Compare with remote
git status
# Should show: "Your branch is up to date with 'origin/main'"
```

---

## Phase 3: Cleanup Local Branch

### 3.1 Verify Branch Was Merged

```bash
# List branches that have been merged into main
git branch --merged main

# Your feature branch should appear in this list
# Example output:
#   bugfix/v0.2.3-fix-dependency-arrows
#   feature/v0.2.0-color-coding
#   * main
```

### 3.2 Delete Local Branch

```bash
# Delete the merged branch (safe - only works if fully merged)
git branch -d bugfix/v0.2.3-fix-dependency-arrows

# If you need to force delete (use with caution):
# git branch -D bugfix/v0.2.3-fix-dependency-arrows
```

### 3.3 Verify Cleanup

```bash
# List remaining local branches
git branch

# Should only show main (and any other active work)
```

---

## Quick Reference Commands

```bash
# Full post-merge cleanup sequence
VERSION=$(cat plugin.json | grep '"version"' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
BRANCH="bugfix/v${VERSION}-description"  # Adjust to your branch name

# 1. Create GitHub release
gh release create "v${VERSION}" --title "v${VERSION}" --notes-file "plan/releases/v${VERSION}-release-notes.md"

# 2. Sync local main
git checkout main
git pull origin main

# 3. Delete merged branch
git branch -d "$BRANCH"

# 4. Verify
git branch
git log --oneline -3
```

---

## Troubleshooting

### Branch Not Showing as Merged

```bash
# Check if branch exists on remote (it shouldn't after merge + delete)
git fetch --prune
git branch -r | grep <branch-name>

# If branch exists locally but not in --merged list, check merge status
git log main..<branch-name> --oneline
# Empty output = fully merged
```

### Release Notes File Missing

If `plan/releases/vX.Y.Z-release-notes.md` doesn't exist:

1. Check if release notes are in a different location
2. Generate from CHANGELOG.md section for this version
3. Create minimal release notes from commit history:

```bash
# Generate from commits since last tag
git log $(git describe --tags --abbrev=0 HEAD^)..HEAD --oneline
```

### Cannot Delete Branch

```bash
# Error: "branch not fully merged"
# This means commits exist that aren't in main

# Check what's not merged
git log main..<branch-name> --oneline

# If you're sure it's safe, force delete
git branch -D <branch-name>
```

### Local Main Behind Remote

```bash
# If pull fails or shows conflicts
git fetch origin
git reset --hard origin/main

# Warning: This discards any local main changes
```

---

## Checklist

After merge completion:

- [ ] GitHub release created with version tag
- [ ] Release notes copied from `plan/releases/`
- [ ] Local main pulled and up to date
- [ ] Local feature branch deleted
- [ ] `git branch` shows only main (and active work branches)

---

## Related

- [Branch Exit Protocol](branch-exit-protocol.md) - Pre-merge documentation
- [Branch Open Protocol](branch-open-protocol.md) - Starting new branches
