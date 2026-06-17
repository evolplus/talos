# React Native Coding Standard

Read this when the task surface is a React Native or Expo app.

## Project shape

- Follow the current routing system: React Navigation, Expo Router, or a project-specific wrapper. Do not mix routing approaches.
- Keep screen components thin. Screens coordinate route params, data loading, permissions, and navigation; feature components render UI and emit typed events.
- Use TypeScript types for route params, API DTOs, component props, and event payloads when the project uses TypeScript.
- Keep platform-specific code explicit with `.ios.tsx`, `.android.tsx`, or small platform adapters. Avoid scattered `Platform.OS` branches in UI trees.

## UI and styling

- Use the existing design system, token file, component library, or theme provider before adding local styles.
- Prefer `StyleSheet.create` or the established styling library. Avoid ad-hoc inline style objects inside render loops unless the existing codebase does it for dynamic values.
- Wrap screen roots with safe-area handling per project convention. Account for notches, home indicators, status bars, keyboard overlap, and scroll insets.
- Use `Pressable` / project button components for interactive elements. Ensure disabled, pressed, loading, and accessibility states are visible.
- Use `FlatList` / `SectionList` for large or dynamic lists. Provide stable keys, empty components, pull-to-refresh where required, and item separators through list props.

## State and data

- Use the existing server-state and client-state libraries. Do not add Redux, Zustand, React Query, Apollo, or another store just because the feature needs state.
- Cancel, ignore, or guard stale async work when screens unmount or route params change.
- Keep optimistic updates reversible. Show user-visible failure and rollback when the server rejects the change.
- Store only durable preferences in async storage / secure storage. Do not put secrets in plain async storage.

## Accessibility and instrumentation

- Provide `accessibilityRole`, `accessibilityLabel`, `accessibilityHint` where the visible content is not enough.
- Add `testID` only from the instrumentation contract. The same visible control should not have different IDs across iOS and Android unless the contract says so.
- Maintain touch targets of at least 44 by 44 logical pixels unless the project standard is stricter.
- Announce important async state changes, errors, and modal openings when the existing accessibility layer supports it.

## Performance

- Avoid recreating expensive callbacks, renderItem functions, or derived arrays on every render for large lists.
- Memoize only where it prevents real re-render cost; do not add blanket `memo` / `useCallback` noise.
- Keep images sized and cached through the existing image component or asset pipeline.
- Move CPU-heavy transforms out of render and into selectors, memoized helpers, or native/worker-backed utilities when available.

## Tests and checks

- Update Jest / React Native Testing Library tests for component behavior and state transitions.
- Update Detox or the configured mobile E2E runner when the task changes a critical flow.
- Run the platform checks the project supports, usually lint, typecheck, Jest, and at least one iOS or Android build/test path when native code or permissions changed.

## Red flags

- DOM APIs, browser-only globals, or CSS assumptions in shared RN code.
- New native permissions without architecture approval and user-facing copy.
- Layout that works on one simulator size but ignores safe area, keyboard, text scaling, or orientation.
