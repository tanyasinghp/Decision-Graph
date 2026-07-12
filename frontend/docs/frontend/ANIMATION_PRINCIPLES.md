# Animation Principles

## Philosophy

Animations in Decision Graph serve exactly three purposes:

1. **Progression** — Move the audience through the narrative
2. **Discovery** — Reveal information in a controlled sequence
3. **Reasoning** — Show the system working, not just results

No decorative animation. If an animation doesn't serve one of these three purposes, remove it.

## Patterns

### Staggered Reveal
Used for: reasoning events, answer sections, stat cards.

```tsx
// Parent container
const container = {
  initial: {},
  animate: { transition: { staggerChildren: 0.08 } },
};

// Child item
const item = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
};
```

### Slide-In Panel
Used for: evidence drawer, node details.

```tsx
// Drawer enters from right
const panel = {
  initial: { x: "100%" },
  animate: { x: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
  exit: { x: "100%", transition: { duration: 0.2 } },
};
```

### Scale + Fade
Used for: confidence badge, status indicators.

```tsx
const badge = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: "easeOut" } },
};
```

### Pulse/Glow
Used for: active node in graph, streaming indicator.

```css
/* Use Tailwind animate-pulse-glow class */
@keyframes pulseGlow {
  0%, 100% { box-shadow: 0 0 8px rgba(245, 158, 11, 0.2); }
  50%      { box-shadow: 0 0 20px rgba(245, 158, 11, 0.4), 0 0 40px rgba(245, 158, 11, 0.1); }
}
```

## Duration

- Events enter: 0.3s
- Panels slide: 0.3s
- Stagger gap: 80ms per item
- Hero title: 0.8s
- Confidence reveal: 0.4s
- Page transition: 0.2s

## Easing

Always use `[0.16, 1, 0.3, 1]` (custom cubic-bezier). This is a snappy ease-out that feels premium — fast start, graceful finish. Avoid spring physics for UI elements.

## Silence

The hero reasoning sequence has 45 seconds of silence. During this time, animation carries the entire narrative. Every event must be:
- Readable at 15ft distance
- Distinct from the previous event
- Connected to a visible graph change

If a user can't tell what's happening without audio, the animation has failed.
