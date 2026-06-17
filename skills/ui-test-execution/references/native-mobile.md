# Native Mobile UI Test Execution — XCUITest (iOS) & Espresso (Android)

Reference playbook for QA-Author and QA-Exec when the target surface is a native mobile app and the project uses XCUITest (iOS) or Espresso (Android) — the org defaults per `solution-defaults`.

## When to use this playbook

- SRS §3.4.2 UI Introspection Profile names SwiftUI / UIKit (iOS) or Compose / View-based (Android).
- The project has not adopted Appium for cross-platform unification (an Appium deviation requires an ADR per `.claude/skills/adr-author/`).

## iOS (XCUITest)

### Project layout

```
ios/
├── <AppName>/
└── <AppName>UITests/
    ├── ByUs/
    │   └── US001SpectatorJoinTests.swift
    ├── ByTask/
    │   └── T014/
    │       ├── E2ETests.swift
    │       └── StructuralTests.swift
    ├── Fixtures/
    │   ├── TestUsers.swift
    │   └── Matches.swift
    └── Helpers/
        └── XCUIElement+Waits.swift
```

### Selector convention

Set `accessibilityIdentifier = "<id>"` on every testable view. The instrumentation contract names the IDs. Patrol-style usage:

```swift
let spectateButton = app.buttons["spectateButton-\(matchId)"]
spectateButton.tap()
```

Never select by label text on stable UI — text changes with locale.

### File template

```swift
import XCTest

final class US001SpectatorJoinTests: XCTestCase {
  var app: XCUIApplication!

  override func setUpWithError() throws {
    continueAfterFailure = false
    app = XCUIApplication()
    app.launchEnvironment["BASE_URL"] = ProcessInfo.processInfo.environment["BASE_URL"]
    app.launchEnvironment["API_BASE_URL"] = ProcessInfo.processInfo.environment["API_BASE_URL"]
    app.launch()
  }

  func test_TC_US001_001_SpectatorJoinsLiveTournamentMatchEndToEnd() throws {
    // Arrange
    let viewer = TestUsers.spectatorVN
    let match = try Matches.seed(state: .inProgress, publiclySpectatable: true)

    // Act
    app.textFields["emailField"].typeText(viewer.email)
    app.secureTextFields["passwordField"].typeText(viewer.password)
    app.buttons["loginButton"].tap()
    app.buttons["spectateButton-\(match.id)"].tap()

    // Assert
    XCTAssertTrue(app.staticTexts["viewerCount"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.images["liveBadge"].exists)
  }
}
```

### Invocation

```sh
xcodebuild test \
  -scheme <AppName>UITests \
  -destination 'platform=iOS Simulator,name=iPhone 15,OS=17.4' \
  BASE_URL=$BASE_URL API_BASE_URL=$API_BASE_URL
```

### Artifact layout (QA-Exec consumes)

```
docs/qa-reports/<task-id>/
├── xcresult/<result-bundle>.xcresult/  (Xcode result bundle)
├── screenshots/                         (xctest attachments)
└── logs/
```

## Android (Espresso)

### Project layout

```
android/app/src/androidTest/java/<package>/
├── byus/
│   └── US001SpectatorJoinTest.kt
├── bytask/
│   └── t014/
│       ├── E2ETest.kt
│       └── StructuralTest.kt
├── fixtures/
│   ├── TestUsers.kt
│   └── Matches.kt
└── helpers/
    └── EspressoWaits.kt
```

### Selector convention

Set `contentDescription="<id>"` on every testable view. The instrumentation contract names the IDs. Selection:

```kotlin
onView(withContentDescription("spectateButton-${match.id}")).perform(click())
```

For Compose: use `Modifier.semantics { contentDescription = "<id>" }` and `composeTestRule.onNodeWithContentDescription("<id>")`.

### File template

```kotlin
@RunWith(AndroidJUnit4::class)
class US001SpectatorJoinTest {
  @get:Rule val activityRule = ActivityScenarioRule(MainActivity::class.java)

  @Test
  fun TC_US001_001_SpectatorJoinsLiveTournamentMatchEndToEnd() {
    // Arrange
    val viewer = TestUsers.spectatorVN
    val match = Matches.seed(state = "in-progress", publiclySpectatable = true)

    // Act
    onView(withContentDescription("emailField")).perform(typeText(viewer.email))
    onView(withContentDescription("passwordField")).perform(typeText(viewer.password))
    onView(withContentDescription("loginButton")).perform(click())
    onView(withContentDescription("spectateButton-${match.id}")).perform(click())

    // Assert
    onView(withContentDescription("viewerCount")).check(matches(isDisplayed()))
    onView(withContentDescription("liveBadge")).check(matches(isDisplayed()))
  }
}
```

### Invocation

```sh
./gradlew connectedAndroidTest \
  -PtestInstrumentationRunnerArguments.BASE_URL=$BASE_URL \
  -PtestInstrumentationRunnerArguments.API_BASE_URL=$API_BASE_URL
```

### Artifact layout (QA-Exec consumes)

```
docs/qa-reports/<task-id>/
├── android-report/         (HTML test report)
├── screenshots/
└── logs/
```

## Common pitfalls (both platforms)

- **Idling resources (Android) / waitForExistence (iOS)** — animations and network calls without proper synchronization produce flakes. Always wait on a condition (`waitForExistence(timeout:)` / `IdlingResource`), never on time.
- **Real-device variability** — simulators / emulators are deterministic; real devices add variance (battery, network, sensors). Pin the device matrix in the deploy report's `## Test Environment` `browser_targets` field.
- **Permission dialogs** — XCUITest and Espresso both have permission-handling helpers; use them, don't try to tap through with coordinates.
- **App state leaks across tests** — `setUp` must reset the app to a known state. Don't share state between `test_*` methods.

## References

- `.claude/skills/ui-test-execution/SKILL.md` — cross-runner principles
- XCUITest docs (external; Apple) — https://developer.apple.com/documentation/xctest/user_interface_tests
- Espresso docs (external; Google) — https://developer.android.com/training/testing/espresso
