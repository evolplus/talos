# Flutter Coding Standard

Read this when the task surface is a Flutter app.

## Project shape

- Follow the existing feature/module layout under `lib/`. Common patterns are feature folders, layered `presentation/domain/data`, or package-based modules.
- Keep widgets focused. Pages/screens coordinate navigation, async state, and permissions; smaller widgets render specific sections.
- Use null safety and strong Dart types. Avoid `dynamic` unless crossing an untyped boundary, and convert external data into typed models quickly.
- Prefer `const` constructors and immutable widget inputs whenever possible.

## State and data

- Use the project's current state approach: Bloc/Cubit, Riverpod, Provider, ValueNotifier, setState, or a project wrapper. Do not introduce a second state architecture for one feature.
- Keep async state explicit: initial, loading, data, empty, error, and refreshing where applicable.
- Keep repositories/services separate from widgets when the project already has a data layer.
- Dispose controllers, focus nodes, animation controllers, streams, and subscriptions.

## UI and theming

- Use `ThemeData`, extension tokens, shared widgets, and design-system components before adding local colors or typography.
- Build responsive layouts with constraints, `LayoutBuilder`, adaptive widgets, and scroll behavior. Avoid fixed pixel layouts that fail on small devices.
- Respect safe areas, keyboard insets, text scaling, and platform navigation conventions.
- Keep forms on reactive/validated patterns already used by the project. Show field-level errors and submit-level errors separately.

## Navigation

- Use the configured navigation approach: Navigator, GoRouter, AutoRoute, or a project-specific wrapper.
- Keep route arguments typed. Do not pass large mutable objects through route extras when an ID plus repository fetch is the established pattern.
- Handle back navigation, deep links, guarded routes, and restoration only through project-approved mechanisms.

## Accessibility and instrumentation

- Add `Key` values and semantics identifiers from the instrumentation contract for testable controls.
- Use `Semantics`, labels, hints, button roles, and focus order when visible UI is not enough.
- Maintain touch targets of at least 48 by 48 logical pixels unless the project standard is stricter.

## Tests and checks

- Update widget tests for rendering, validation, and state transitions.
- Update unit tests for blocs/notifiers/repositories and integration tests for critical flows.
- Run `flutter analyze`, formatting, relevant unit/widget tests, and platform build checks when platform-specific code or permissions changed.

## Red flags

- Business rules inside `build()` methods.
- Controllers or subscriptions created without disposal.
- Hardcoded colors/text styles that bypass the app theme.
- Platform channel or permission changes without architecture approval.
