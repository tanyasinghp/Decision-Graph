# Design Tokens

All tokens defined in `tailwind.config.ts` under `theme.extend`.

## Colors

```
Background: #0a0a0b    (near black)
Surface:    #18181b    (zinc-900)  — card, panel backgrounds
Hover:      #27272a    (zinc-800)  — surface hover state
Border:     #27272a    (zinc-800)  — default borders
BorderLight:#3f3f46    (zinc-700)  — elevated borders

Text Primary:   #fafafa  (zinc-50)
Text Secondary: #a1a1aa  (zinc-400)
Text Tertiary:  #71717a  (zinc-500)

Accent:     #f59e0b  (amber-500)  — decisions, confidence, primary action
AccentHover:#d97706  (amber-600)  — hover states
AccentGlow:  rgba(245,158,11,0.25)

Success:    #10b981  (emerald-500) — evidence, verification, support
Info:       #3b82f6  (blue-500)   — issues, discussions
Error:      #ef4444  (red-500)    — rejection, low confidence
Purple:     #a855f7  (purple-500) — commits, technical artifacts
```

## Typography

```
Font: Inter (--font-inter), system sans-serif fallback
Mono: ui-monospace, SFMono-Regular, Menlo

display:    3.5rem / 1.1  / 700  — Landing title
heading:    2rem   / 1.2  / 600  — Section headers
subheading: 1.25rem/ 1.4  / 500  — Card titles
body:       1rem   / 1.6         — Body text
small:      0.875rem/ 1.5        — Metadata, captions
caption:    0.75rem/ 1.4         — Labels, timestamps
stat:       2.5rem / 1    / 700  — Stat numbers
```

## Spacing

```
page:      2rem   — Outer page padding
section:   1.5rem — Between sections
component: 1rem   — Between components
stack:     0.5rem — Within components
```

## Animation

Duration reference (applied via Tailwind classes or Framer Motion):

```
Token: 0.2s  — Micro-interactions (hover, tap)
Token: 0.3s  — Panel slides, drawer open/close
Token: 0.4s  — Element enter/exit (single element)
Token: 0.6s  — Staggered reveal (list items)
Token: 0.8s  — Page transitions, hero animation
Token: 1.0s+ — Narrative moments (confidence reveal, graph traversal)

Easing: [0.16, 1, 0.3, 1]  — Custom cubic-bezier (snappy, premium feel)
```

See `ANIMATION_PRINCIPLES.md` for animation philosophy.
