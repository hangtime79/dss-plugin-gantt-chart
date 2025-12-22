# Protocol Index

Quick reference for choosing the correct branch protocol.

---

## Decision Tree

```
┌─────────────────────────────────────────────────────────────────┐
│                    WHICH PROTOCOL DO I USE?                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                 ┌────────────────────────┐
                 │ What stage are you at? │
                 └────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ Starting new  │   │ Ready to merge  │   │ PR was merged   │
│ work?         │   │ to main?        │   │ on GitHub?      │
└───────────────┘   └─────────────────┘   └─────────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ branch-open-  │   │ branch-exit-    │   │ branch-post-    │
│ protocol.md   │   │ protocol.md     │   │ merge-protocol  │
└───────────────┘   └─────────────────┘   └─────────────────┘
```

---

## Protocol Summary

| Protocol | When to Use | Key Output |
|----------|-------------|------------|
| [branch-open-protocol.md](branch-open-protocol.md) | Starting a new bug fix or feature | Branch + Spec file |
| [branch-exit-protocol.md](branch-exit-protocol.md) | Code complete, ready for PR | Release notes + CHANGELOG + Post-mortem |
| [branch-post-merge-protocol.md](branch-post-merge-protocol.md) | PR merged on GitHub | GitHub Release + Local cleanup |

---

## Quick Reference: What Each Protocol Does

### Branch Open Protocol
**Trigger:** User reports bug or requests feature

```
Investigate → Version Check → Create Branch → Create Spec → Handoff to SDE
```

**You are:** Senior Code Architect (no coding)
**Output:** `plan/specs/<type>-v<version>-spec.md`

---

### Branch Exit Protocol
**Trigger:** User approved QA, ready to merge

```
Gather Context → Analyze → Generate Artifacts → Review & Commit → Create PR
```

**You are:** Documentation generator
**Output:** Release notes, CHANGELOG, Post-mortem, Tag

---

### Branch Post-Merge Protocol
**Trigger:** PR merged on GitHub

```
Create GitHub Release → Sync Local Main → Delete Local Branch
```

**You are:** Release manager
**Output:** GitHub Release, clean local state

---

## Common Scenarios

| Scenario | Protocol |
|----------|----------|
| "There's a bug where..." | Open |
| "Can you add a feature that..." | Open |
| "The fix is ready, create a PR" | Exit |
| "I merged the PR, clean up" | Post-Merge |
| "Create a release on GitHub" | Post-Merge |
| "Delete the old branch" | Post-Merge |

---

## Protocol Lifecycle

```
         ┌──────────────────────────────────────────────────────┐
         │                    FULL LIFECYCLE                     │
         └──────────────────────────────────────────────────────┘

User Request                                              GitHub Release
     │                                                          ▲
     ▼                                                          │
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌───────┐
│  OPEN   │───▶│   SDE   │───▶│  EXIT   │───▶│   PR    │───▶│ POST- │
│PROTOCOL │    │  CODES  │    │PROTOCOL │    │ MERGED  │    │ MERGE │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └───────┘
     │              │              │              │              │
     ▼              ▼              ▼              ▼              ▼
   Spec         User QA       Docs +          Merged         Release
  Created       Approved       Tag            to Main        Created
```

---

## AI: Which Protocol?

**Quick Test:**

1. Is there a branch that needs creating? → **Open**
2. Is there a branch ready for PR? → **Exit**
3. Is there a merged PR needing release? → **Post-Merge**

**Still unsure?** Ask the user: "What stage is this work at?"
