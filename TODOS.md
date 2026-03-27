# AgentOS TODOs

## T1: Define the capability matching algorithm

**What:** Specify exactly how `capabilityLookup()` determines that a capability matches the selected tools. Exact set matching (`toolIds.every(id => selectedToolIds.has(id))`) vs. fuzzy/semantic matching vs. capability ID references.
**Why:** If the matching algorithm is underspecified, the graph silently fails to render edges for legitimate capabilities. This is a hard dependency on the capability DB seeding — you can't seed 30 entries without knowing what "match" means.
**Pros:** Eliminates a silent failure mode; gives capability curators a clear spec for what entries need.
**Cons:** If we want fuzzy matching later, exact matching now creates path dependency.
**Context:** The CEO review assumed exact set matching. The adversarial review caught that "toolIds.every()" was assumed, not specced. If exact matching is the answer, it needs to be documented as the spec. If semantic matching is needed, it's a separate R&D item before v1.
**Effort:** S | CC: S
**Priority:** P1
**Depends on:** Capability DB schema decision
**Status:** OPEN

---

## T2: Add rollback procedure to CI/CD

**What:** Specify how to roll back a bad GitHub Pages deployment. GitHub Pages has no native rollback — you redeploy the previous known-good commit.
**Why:** If a malformed build ships to production, there's no defined procedure to recover. Engineers waste time figuring out what to do during an incident.
**Pros:** Incident recovery is faster and less error-prone.
**Cons:** Rollback procedure is manual (git revert + force push to deploy branch). Not automated.
**Context:** The CI/CD workflow (`peaceiris/actions-gh-pages@v3`) deploys the latest `dist/` to the `gh-pages` branch. To rollback: identify last good commit, `git revert` or `git checkout` to it, push, trigger a new deploy. This should be documented as a runbook entry, not automated.
**Effort:** S | CC: S
**Priority:** P2
**Depends on:** None
**Status:** OPEN

---

## T3: Specify the auto-layout algorithm for the capability graph

**What:** Define the tool placement algorithm for the horizontal category layout. Specifically: ordering within a category (alphabetical? by selection order? by toolId?), what happens when a category has 10+ tools, vertical overflow strategy, and capability label positioning.
**Why:** "Tools in horizontal row by category" is underspecified. At 20+ tools, layout decisions directly affect graph readability. This is the core UX of the graph — getting it wrong means rebuilding it.
**Pros:** Eliminates a "figured out during implementation" moment that bloats scope.
**Cons:** Over-specifying before user feedback could lock in the wrong mental model.
**Context:** v1 uses auto-layout (no force-directed, no drag-to-rearrange). The categories are Web → Files → Code → Memory → System. Within each category: alphabetical. If a category overflows the viewport width, the graph scrolls horizontally OR wraps to a second row. The CEO design review flagged this at 20+ tools as "graph degrades." That degradation strategy needs a spec — either horizontal scroll or wrapping rows. Wrapping is simpler; horizontal scroll requires pan/zoom.
**Effort:** S | CC: S
**Priority:** P1
**Depends on:** Capability DB seeding (knowing how many tools per category)
**Status:** OPEN

---

## T4: Validate Discovery Panel's Partial/Unverified states before building

**What:** Decide whether to show "Partial" and "Unverified" capability cards at launch. Specifically: if users see orange "Partial" cards and don't know what to do about them, does it cause confusion or help discovery? If users see gray "AI-generated" badges, does it build or erode trust?
**Why:** The kill condition (20% engagement 90d post-v1.1) could be caused by Partial/Unverified cards driving users away. Building the feature before validating the states means building a potential churn-inducing feature.
**Pros:** Validates a core UX assumption before engineering investment.
**Cons:** Delays v1 by the time it takes to run 5 builder interviews with the wireframe.
**Context:** The CEO review kept this as a post-launch measurement. The adversarial review argues it should be pre-launch validation. This is a CEO-level decision: ship fast vs. validate first. The wireframe at `/tmp/gstack-sketch-1743085568.html` shows Partial/Unverified states. Show it to 5 builders and ask: "Do you understand what 'Partial' means here? Would seeing this make you more or less likely to trust the Discovery Panel?"
**Effort:** M | CC: S
**Priority:** P2
**Depends on:** Wireframe review with real users
**Status:** OPEN
