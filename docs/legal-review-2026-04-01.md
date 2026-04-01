# Legal Review: Claude Code Reference — Required Before External Sharing

**Date:** 2026-04-01
**Status:** Pending Legal Counsel
**Priority:** Critical — gates all external sharing of PRD

---

## Why This Review Is Required

The PRD (all versions) was written with reference to a leaked Claude Code source repository (github.com/lowcortisolprogrammer/claude-code). The PRD appendices describe patterns extracted from that source.

**The problem:** If this PRD is shared with investors, potential hires, or partners — even under NDA — the framing creates legal exposure. The question is not whether the document is defamatory or copyrighted. The question is whether using the leaked source as an architectural reference for a commercial product creates liability.

**This document is the prerequisite for any external sharing of:**
- The PRD
- Engineering plans derived from the PRD
- Any communication that references Claude Code as a competitive reference

---

## Questions to Resolve with Legal Counsel

### Q1: Can We Reference Claude Code at All?

**The question:** "Analysis of publicly available Claude Code behavior and architectural patterns" is how the PRD v4 frames it. Is this framing legally sufficient, or does it need to go further?

**What to determine:**
- Does referencing a publicly visible GitHub repository (even if subsequently private or deleted) as "publicly available behavior" create any liability?
- Does the level of architectural detail in our appendices (file names, function names, specific algorithm descriptions like "4-tier compaction strategy") exceed the scope of "publicly available behavior"?
- Is there a meaningful legal difference between (a) studying public CLI behavior and (b) studying leaked source code that was not intended to be public?

**Likely resolution:** The appendices with specific file/function names (forkSubagent.ts, compact.ts, etc.) should be removed or significantly redacted regardless. The competitive analysis section should reference only publicly observable behavior.

---

### Q2: Do We Need to Remove Specific Content?

**The question:** What specific content in the PRD creates the most legal risk?

**Candidates for removal or redaction:**
- Appendix A (Claude Code patterns table) — lists specific file names and implementation details. High risk.
- Any section that says "leaked," "source code," or references the GitHub URL. High risk.
- The brainstorm document (archived) that explicitly says "Leaked Claude Code source (github.com/lowcortisolprogrammer/claude-code)." Already archived — confirm this is not referenced anywhere active.

**What to keep:**
- "Claude Code is converging on the same architecture" — this is observable from Anthropic's public Claude Code documentation, their published papers, and the public API behavior. No source code required.
- "KAIROS, PROACTIVE, COORDINATOR_MODE" — these are feature names Anthropic has discussed publicly. Using them as descriptive shorthand is fine.
- "Analysis of publicly available Claude Code behavior" — this framing should replace all references to "leaked source."

---

### Q3: Does Our Engineering Create IP Risk?

**The question:** If we build durable execution, streaming tool execution, and checkpoint/resume — does building these systems using Claude Code's approach create patent or copyright liability?

**What to determine:**
- Are any of these patterns patented? (Unlikely for software patterns, but worth a search.)
- Is the specific implementation structure (e.g., "4-tier compaction algorithm") copyrightable? (Generally no — algorithms are not copyrightable, only specific expression.)
- Does our engineering team having read the leaked source create "contamination" of our internal development? (If engineers have read the leaked code, does that affect whether our independent implementation is clean?)

**Key point:** Engineers who independently implement checkpoint/resume after studying public documentation and thinking is clean. Engineers who read leaked source and then implement the same class names and function structure may not be.

**Recommended action:** Confirm with legal whether any engineers who will work on durable execution, streaming tool execution, or checkpoint/resume read the leaked source. If yes, those engineers should not be the primary architects — they should be handed the PRD requirements and implement from scratch without reference to the leaked code.

---

### Q4: What Is the Competitive Disclosure Risk?

**The question:** Does this PRD expose strategic information that could harm AgentOS if shared?

**What it exposes:**
- That we believe Anthropic has a 6-12 month window before shipping KAIROS broadly
- That we are using Anthropic's architectural patterns as our engineering blueprint
- That our competitive moat is UX, not runtime (which reveals our vulnerability — Anthropic could hire UX talent)

**Whether this matters:** Under NDA, investors and hires routinely receive this level of strategic disclosure. The risk is that this PRD is not under NDA. If it leaks publicly, it tells Anthropic exactly what we're building and why.

**Recommended action:** This PRD should only be shared under NDA until legal confirms the Claude Code reference is clean. Even then, the competitive window estimate (6-12 months) is strategic information that should not be widely shared.

---

## Recommended Actions

### Immediate (Before End of Week)

- [ ] Legal counsel reviews Q1–Q3
- [ ] Remove or redact Appendix A (Claude Code patterns table) from PRD v4 if legal advises
- [ ] Confirm no engineer who will architect durable execution/streaming/checkpoint read the leaked source
- [ ] Change all "leaked source" references in any remaining document to "publicly available behavior"

### Before Any External Sharing

- [ ] Legal confirms Q1 (reference framing is sufficient)
- [ ] PRD is shared only under NDA
- [ ] Competitive window estimate (6-12 months) is removed or softened

### Before Engineering Kickoff

- [ ] Legal confirms Q3 (engineering team is clean)
- [ ] If any engineer is contaminated, reassign them from architecture roles on durable execution

---

## What to Keep in the PRD

The following framing is clean and should be preserved:

> "Anthropic's Claude Code is a world-class agent harness for developers. We studied its public behavior, its published documentation, and its public API to understand what makes a great agent harness. We are building the same engineering quality for non-technical business users — with Canva-level UX that Anthropic, as a model company, will never build."

This is defensible. Public behavior study. No leaked source required.

---

*This document is for internal use only. Do not share externally until legal review is complete.*
