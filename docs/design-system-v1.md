# Design System v1

**Date:** 2026-04-01
**Status:** Draft
**Owner:** Design
**PRD Ref:** `docs/PRD.md` v4 — MVP Feature 1 (Visual Canvas)

---

## Purpose

This is the foundation layer for all AgentOS UI. Every React component, every email template, every notification is built from these tokens. This document is the source of truth — not Figma, not a separate design file.

Engineers implement from this document. Designers update this document when the design changes. No token exists in two places.

---

## Design Principles

1. **Warm professional** — Maria is a business owner, not a developer. The UI should feel like a premium tool (Linear, Notion) with warmer tones and more human language. Not cold enterprise blue. Not playful consumer pastels.

2. **Agent as employee** — The design language reinforces the hiring metaphor. Agents are workers with states. Cards show status. Notifications are "your agent needs you" not "action required."

3. **Readable at a glance** — Maria checks the app quickly, on her phone, between tasks. Information hierarchy must be legible in 3 seconds.

4. **Trust through transparency** — Reasoning traces, status indicators, activity logs — the UI shows what the agent is doing. Nothing is hidden. Clarity builds trust.

---

## Color System

### Background Layers

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-base` | `#FAFAF8` | Page background. Warm off-white. |
| `--bg-surface` | `#FFFFFF` | Cards, panels, modals. Pure white for contrast. |
| `--bg-elevated` | `#F5F5F3` | Nested panels, code blocks, input backgrounds. |
| `--bg-overlay` | `rgba(0,0,0,0.4)` | Modal backdrop. |

### Text

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#1C1C1A` | Headings, primary content. Near-black, warm. |
| `--text-secondary` | `#6B6B68` | Labels, metadata, timestamps. |
| `--text-tertiary` | `#A3A3A0` | Placeholders, disabled, decorative. |
| `--text-inverse` | `#FFFFFF` | Text on dark/colored backgrounds. |

### Brand

| Token | Hex | Usage |
|-------|-----|-------|
| `--brand-primary` | `#5B4FE9` | Primary actions. Indigo. |
| `--brand-primary-hover` | `#4A3ED8` | Hover state for primary. |
| `--brand-primary-subtle` | `#EEF0FC` | Light indigo backgrounds, chips. |
| `--brand-accent` | `#2DD4BF` | Active indicators, live status. Teal. |

### Agent Status Colors

| Token | Hex | Agent State |
|-------|-----|-------------|
| `--status-running` | `#22C55E` | Agent is actively working. Green. |
| `--status-running-bg` | `#DCFCE7` | Background tint for running indicator. |
| `--status-scheduled` | `#F59E0B` | Agent is waiting for next scheduled run. Amber. |
| `--status-scheduled-bg` | `#FEF3C7` | Background tint for scheduled indicator. |
| `--status-stopped` | `#A3A3A0` | Agent is idle/inactive. Gray. |
| `--status-stopped-bg` | `#F5F5F3` | Background tint for stopped indicator. |
| `--status-error` | `#EF4444` | Agent hit an error. Red. |
| `--status-error-bg` | `#FEE2E2` | Background tint for error indicator. |

### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--escalation-amber` | `#F59E0B` | Escalation warnings. |
| `--escalation-amber-bg` | `#FEF3C7` | Escalation background. |
| `--danger` | `#DC2626` | Destructive actions (delete, cancel). |
| `--danger-hover` | `#B91C1C` | Destructive hover. |
| `--success` | `#16A34A` | Confirmations, completion. |
| `--success-bg` | `#DCFCE7` | Success backgrounds. |

### Borders & Dividers

| Token | Hex | Usage |
|-------|-----|-------|
| `--border-default` | `#E5E5E3` | Card borders, dividers. Warm gray. |
| `--border-strong` | `#D4D4D1` | Focused inputs, active elements. |
| `--border-focus` | `#5B4FE9` | Focus ring (2px solid). |

---

## Typography

### Font Stack

```
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
```

**Rationale:** Inter is the standard for professional SaaS. JetBrains Mono for reasoning traces and code — agents use code, agents get monospace. Both are freely available via Google Fonts.

### Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `--text-xs` | 12px | 400 | 1.5 | Timestamps, badges, metadata |
| `--text-sm` | 14px | 400 | 1.5 | Secondary text, labels, table cells |
| `--text-base` | 16px | 400 | 1.6 | Body text, agent descriptions |
| `--text-lg` | 18px | 500 | 1.5 | Agent names, card headings |
| `--text-xl` | 20px | 600 | 1.4 | Section headings |
| `--text-2xl` | 24px | 700 | 1.3 | Page titles |
| `--text-3xl` | 32px | 700 | 1.2 | Hero text (landing only) |

### Heading Weights

- `h1`: `--text-2xl`, weight 700
- `h2`: `--text-xl`, weight 600
- `h3`: `--text-lg`, weight 500

### Truncation

- Agent names: max 2 lines, truncate with ellipsis
- Descriptions: max 3 lines on cards, full on detail view
- Reasoning trace steps: no truncation; full text always visible

---

## Spacing System

Based on a **4px base unit**.

| Token | Value |
|-------|-------|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |
| `--space-8` | 32px |
| `--space-10` | 40px |
| `--space-12` | 48px |
| `--space-16` | 64px |
| `--space-20` | 80px |

### Component Spacing Rules

- **Card padding:** `--space-5` (20px) all sides
- **Section gaps:** `--space-8` (32px) between major sections
- **Element gaps:** `--space-3` (12px) between related elements within a card
- **Grid gap:** `--space-5` (20px) between agent cards
- **Modal padding:** `--space-6` (24px) all sides

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Badges, chips, small buttons |
| `--radius-md` | 8px | Inputs, cards |
| `--radius-lg` | 12px | Modals, large panels |
| `--radius-xl` | 16px | Agent cards on canvas |
| `--radius-full` | 9999px | Avatars, status dots, pill buttons |

---

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle card lift, inputs |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | Cards on hover, dropdown menus |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.12)` | Modals, slide-in panels |
| `--shadow-focus` | `0 0 0 3px rgba(91,79,233,0.25)` | Focus ring — uses `--border-focus` color |

---

## Component Library

### Buttons

**Primary Button**
```
Background: --brand-primary
Text: --text-inverse
Padding: --space-3 --space-5
Border-radius: --radius-md
Hover: --brand-primary-hover
Active: scale(0.98)
Disabled: opacity 0.5, cursor not-allowed
```
Use for: The main action on a screen. "Activate", "Send", "Approve". One primary per screen maximum.

**Secondary Button**
```
Background: --bg-surface
Border: 1px solid --border-default
Text: --text-primary
Hover: border-color --border-strong, background --bg-elevated
```
Use for: Secondary actions. "Cancel", "Edit", "View Details".

**Ghost Button**
```
Background: transparent
Text: --text-secondary
Hover: background --bg-elevated, text --text-primary
```
Use for: Tertiary actions within cards. "Learn more", "See all".

**Danger Button**
```
Background: --danger
Text: --text-inverse
Hover: --danger-hover
```
Use for: Destructive actions. "Delete Agent", "Remove Access". Always confirm first.

**Button Sizes**
- Default: `--text-sm`, padding `--space-3 --space-5`
- Small: `--text-xs`, padding `--space-2 --space-3` (badges, chips)
- Large: `--text-base`, padding `--space-4 --space-6` (CTA on empty states)

---

### Agent Card

```
Background: --bg-surface
Border: 1px solid --border-default
Border-radius: --radius-xl
Padding: --space-5
Shadow: --shadow-sm
Hover: --shadow-md, border-color --border-strong
Transition: box-shadow 150ms ease, border-color 150ms ease
```

**Card anatomy:**
```
┌─────────────────────────────────────┐
│ [Status Dot] Agent Name    [⋮ ▾]  │  ← Row 1: 24px height
│ Agent description (2 lines max)    │  ← Row 2: --text-base, --text-secondary
│ ─────────────────────────────────  │
│ ● 12 emails read  ● 4 escalated    │  ← Row 3: stats, --text-sm
│ ─────────────────────────────────  │
│ [View Reasoning] [Edit] [Stop]   │  ← Row 4: action buttons
└─────────────────────────────────────┘
```

---

### Status Badge

```
Display: inline-flex, align-items: center, gap: --space-2
Padding: --space-1 --space-2
Border-radius: --radius-full
Font: --text-xs, weight 500
```

**Running badge:**
```
Background: --status-running-bg
Dot: 6px circle, --status-running, pulsing animation (opacity 0.6→1, 2s infinite)
Text: --text-primary
```

**Scheduled badge:**
```
Background: --status-scheduled-bg
Icon: clock (Lucide), --status-scheduled
Text: --text-primary
```

**Stopped badge:**
```
Background: --status-stopped-bg
Dot: 6px circle, --status-stopped
Text: --text-secondary
```

---

### Input Fields

```
Background: --bg-elevated
Border: 1px solid --border-default
Border-radius: --radius-md
Padding: --space-3 --space-4
Font: --text-base
Text color: --text-primary
Placeholder: --text-tertiary
Focus: border-color --border-focus, box-shadow --shadow-focus
Error: border-color --danger, box-shadow: 0 0 0 3px rgba(220,38,38,0.15)
```

**Textarea:** Same as input, min-height 80px, resize: vertical only.

---

### Modal

```
Background: --bg-surface
Border-radius: --radius-lg
Padding: --space-6
Shadow: --shadow-lg
Max-width: 480px (standard), 640px (large/escalation)
```

**Escalation Modal (larger):**
```
Max-width: 640px
Background: --bg-surface
Border-left: 4px solid --escalation-amber
```

---

### Reasoning Trace Panel

```
Background: --bg-base (page background — trace is part of the page, not a card)
Panel: --bg-surface, border-left 1px solid --border-default, slide from right
Width: 480px desktop, 100% mobile
```

**Step item:**
```
Padding: --space-3 --space-4
Border-bottom: 1px solid --border-default
Tool call: font-mono --text-sm
Decision: --text-sm, --text-primary, normal weight
Escalation: border-left 3px solid --escalation-amber, background --escalation-amber-bg
Timestamp: --text-xs, --text-tertiary, right-aligned
```

---

### Notification Toast

```
Background: --bg-surface
Border: 1px solid --border-default
Border-radius: --radius-md
Shadow: --shadow-lg
Padding: --space-4 --space-5
Position: bottom-right, 24px from edges
Width: 360px
Auto-dismiss: 5 seconds (non-escalation), persistent (escalation)
```

---

### Avatar

```
Size: 32px (default), 24px (small), 48px (large)
Border-radius: --radius-full
Background: --brand-primary-subtle
Text: --brand-primary, weight 600
Fallback: Initials from name
```

---

## Icon Set

**Library:** Lucide React (MIT license)

Rationale: Consistent 24px stroke icons, excellent coverage for SaaS UI, tree-shakeable.

**Critical icons for MVP:**

| Icon | Usage |
|------|-------|
| `Mail` | Email agent |
| `Calendar` | Calendar agent |
| `Search` | Research agent |
| `User` | Customer support agent |
| `Zap` | General purpose agent |
| `Play` | Start / Activate |
| `Square` | Stop |
| `Pencil` | Edit |
| `Trash-2` | Delete |
| `Clock` | Scheduled status |
| `AlertTriangle` | Escalation |
| `CheckCircle` | Completed |
| `XCircle` | Error |
| `ChevronRight` | Navigate into card |
| `ChevronDown` | Dropdown open |
| `Bell` | Notifications |
| `Settings` | Settings |
| `LogOut` | Sign out |
| `Plus` | Add / Hire |
| `MessageSquare` | Reasoning / chat |
| `Activity` | Activity log |

---

## Motion & Animation

### Principles

- **Meaningful, not decorative** — Animation communicates state change. If it doesn't communicate something, don't animate it.
- **Fast and subtle** — No bouncy animations. 150-250ms, ease-out.
- **Reduced motion respected** — All animations respect `prefers-reduced-motion`.

### Animation Tokens

| Token | Duration | Easing |
|-------|----------|--------|
| `--duration-fast` | 100ms | ease-out |
| `--duration-base` | 150ms | ease-out |
| `--duration-slow` | 250ms | ease-out |
| `--duration-panel` | 300ms | cubic-bezier(0.4, 0, 0.2, 1) |

### Key Animations

**Card hover:**
```
transform: translateY(-2px)
box-shadow: --shadow-md
transition: --duration-base
```

**Reasoning panel slide-in:**
```
transform: translateX(100%) → translateX(0)
transition: --duration-panel
```

**Status dot pulse (running):**
```
animation: pulse 2s ease-in-out infinite
opacity: 0.6 → 1
```

**Escalation shake:**
```
animation: shake 0.4s ease-in-out
translateX: 0 → -4px → 4px → 0
Triggered on: escalation step appears in trace
```

**Modal fade-in:**
```
opacity: 0 → 1
scale: 0.96 → 1
transition: --duration-slow
backdrop: fade in separately, --duration-base
```

---

## Accessibility

### WCAG AA Compliance (Minimum)

| Requirement | Implementation |
|---|---|
| Color contrast | All text: minimum 4.5:1 against background. Large text: 3:1. |
| Focus indicators | Custom `:focus-visible` using `--shadow-focus`. Never remove focus rings. |
| Keyboard navigation | All interactive elements reachable via Tab. Modal trap focus. |
| Screen readers | Semantic HTML. ARIA labels on icon-only buttons. Live regions for reasoning trace. |
| Reduced motion | Wrap all animations in `@media (prefers-reduced-motion: no-preference)` |
| Touch targets | Minimum 44x44px for all interactive elements on mobile. |

### Color + Meaning

**Never use color alone to convey information.** Status badges include an icon or label in addition to color. Error states include an icon + text.

---

## Responsive Breakpoints

| Breakpoint | Width | Canvas behavior |
|---|---|---|
| Mobile | < 640px | Single column, bottom sheet for actions |
| Tablet | 640px – 1024px | 2-column agent grid |
| Desktop | > 1024px | 3-4 column agent grid, side panel for reasoning trace |

**Mobile-first:** Start styles at mobile. Use `md:` and `lg:` Tailwind prefixes for larger breakpoints.

---

## Dark Mode

**Deferred to Phase 2.** MVP ships light mode only. Dark mode is a Phase 2 feature.

If dark mode is requested by early testers, the token system is designed to support it via CSS custom properties on a `[data-theme="dark"]` selector.

---

## Usage in Engineering

All tokens are defined as CSS custom properties in `app/app/globals.css`. Engineers reference tokens directly in CSS modules or inline styles. No hardcoded hex values in component files.

```css
/* CORRECT */
.my-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
}

/* WRONG */
.my-card {
  background: #FFFFFF;
  border: 1px solid #E5E5E3;
  border-radius: 16px;
  padding: 20px;
}
```

### Tailwind Configuration

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'var(--bg-base)',
          surface: 'var(--bg-surface)',
          elevated: 'var(--bg-elevated)',
        },
        brand: {
          primary: 'var(--brand-primary)',
        },
        // etc.
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      borderRadius: {
        xl: 'var(--radius-xl)',
        // etc.
      },
    },
  },
}
```

---

## What Is NOT in This Design System v1

- Email templates (deferred — one email handler template in MVP)
- Marketing/landing page styles (separate system, `landing/` directory)
- Print styles
- Dark mode (Phase 2)
- Multiple themes (Phase 2)
- Animation library beyond the token definitions above

---

## Document Roadmap

When this document is updated, append a changelog at the bottom:

```markdown
### Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-04-01 | 1.0 | Initial v1.0 release |
```
