# PRICE-Watch Citizen Guided Trust UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-screen Flutter consumer scanner with the approved Guided Trust Citizen journey while preserving authentication, camera capture, SHA-256 hashing, decimal validation, SQLite store lookup, and multipart upload behavior.

**Architecture:** Keep `ConsumerScanScreen` as the integration boundary, but split presentation into focused Citizen views and a small testable journey controller. Existing device and network operations remain in the orchestrator; stateless views receive display state and callbacks, allowing responsive and error-state widget tests without camera hardware or live HTTP.

**Tech Stack:** Flutter/Dart, Material 3, `camera`, `crypto`, `http`, `sqflite`, `flutter_test`.

## Global Constraints

- Scope is limited to `mobile/` UI/UX and UI-supporting tests.
- Do not modify Laravel, Supabase, API routes, database schema, sync permissions, or DTI officer workflow behavior.
- Preserve hardware-only receipt capture; do not add gallery upload.
- Preserve SHA-256 hashing of captured image bytes.
- Preserve `RegExp(r'\d+\.\d{2}')` price validation.
- Preserve SQLite store loading through `DbHelper.searchStores`.
- Preserve authenticated multipart submission to `/api/tips`.
- Display only a real returned `tip.id`; never fabricate a reference.
- Use platform-native sans-serif typography with no runtime font downloads.
- Use 48 logical-pixel minimum primary touch targets and do not communicate status by color alone.
- Keep the existing emulator/development camera fallback behavior visually separated from the production path.

---

## File Structure

### Files to create

- `mobile/lib/theme/price_watch_theme.dart` — Guided Trust color tokens and Material 3 theme.
- `mobile/lib/screens/citizen/citizen_journey_controller.dart` — testable Citizen stage transitions and returned report ID.
- `mobile/lib/screens/citizen/citizen_widgets.dart` — trust trail, status banner, privacy card, and action buttons.
- `mobile/lib/screens/citizen/citizen_welcome_view.dart` — Citizen landing screen.
- `mobile/lib/screens/citizen/citizen_capture_view.dart` — camera presentation and camera-unavailable state.
- `mobile/lib/screens/citizen/citizen_review_view.dart` — receipt, store, detected-text, secured, empty-store, and submit UI.
- `mobile/lib/screens/citizen/citizen_success_view.dart` — received state and follow-up actions.
- `mobile/test/citizen/citizen_journey_controller_test.dart` — stage transition tests.
- `mobile/test/citizen/citizen_views_test.dart` — focused view, semantics, error, and responsive tests.
- `mobile/test/citizen/consumer_scan_screen_test.dart` — orchestrator navigation and preservation tests.

### Files to modify

- `mobile/lib/main.dart` — apply the Guided Trust theme, restyle shared login, and route consumers without a floating logout button.
- `mobile/lib/screens/consumer_scan_screen.dart` — coordinate the approved journey while retaining device/network operations.
- `mobile/test/widget_test.dart` — update smoke-test expectations only where approved copy changes.

---

### Task 1: Guided Trust Theme

**Files:**
- Create: `mobile/lib/theme/price_watch_theme.dart`
- Modify: `mobile/lib/main.dart`
- Test: `mobile/test/widget_test.dart`

**Interfaces:**
- Produces: `abstract final class PriceWatchColors` and `ThemeData buildPriceWatchTheme()`.
- Consumes: Flutter Material 3 only; no new package.

- [ ] **Step 1: Update the smoke test to expect the scoped Citizen light theme**

Add assertions after the existing login-screen checks. Read the effective theme below `MobileLoginScreen`, not the `MaterialApp` theme, because the officer workspace must retain its current dark theme:

```dart
final loginContext = tester.element(find.byType(MobileLoginScreen));
final loginTheme = Theme.of(loginContext);
expect(loginTheme.brightness, Brightness.light);
expect(loginTheme.colorScheme.primary, const Color(0xFF215FBF));
```

- [ ] **Step 2: Run the smoke test and verify it fails**

Run:

```powershell
cd mobile
flutter test test/widget_test.dart
```

Expected: FAIL because the login currently inherits the dark amber application theme.

- [ ] **Step 3: Create the theme tokens and builder**

Create `mobile/lib/theme/price_watch_theme.dart` with:

```dart
import 'package:flutter/material.dart';

abstract final class PriceWatchColors {
  static const cloud = Color(0xFFF5F8FC);
  static const surface = Color(0xFFFFFFFF);
  static const primary = Color(0xFF215FBF);
  static const trust = Color(0xFF187B70);
  static const ink = Color(0xFF17243A);
  static const muted = Color(0xFF68778C);
  static const error = Color(0xFFC63D4A);
  static const outline = Color(0xFFDCE3EB);
  static const camera = Color(0xFF101821);
}

ThemeData buildPriceWatchTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: PriceWatchColors.primary,
    brightness: Brightness.light,
    primary: PriceWatchColors.primary,
    secondary: PriceWatchColors.trust,
    error: PriceWatchColors.error,
    surface: PriceWatchColors.surface,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: PriceWatchColors.cloud,
    fontFamily: null,
    textTheme: const TextTheme(
      headlineLarge: TextStyle(
        color: PriceWatchColors.ink,
        fontSize: 32,
        height: 1.1,
        fontWeight: FontWeight.w800,
      ),
      headlineSmall: TextStyle(
        color: PriceWatchColors.ink,
        fontSize: 24,
        height: 1.2,
        fontWeight: FontWeight.w800,
      ),
      bodyLarge: TextStyle(
        color: PriceWatchColors.ink,
        fontSize: 16,
        height: 1.5,
      ),
      bodyMedium: TextStyle(
        color: PriceWatchColors.muted,
        fontSize: 14,
        height: 1.45,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: PriceWatchColors.surface,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: PriceWatchColors.outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: PriceWatchColors.outline),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
    ),
  );
}
```

- [ ] **Step 4: Scope the theme to the unauthenticated entry screen**

Import the theme file, retain the existing dark `MaterialApp.theme` for the officer workspace, and wrap only the unauthenticated branch in `AuthWrapper.build`:

```dart
if (_token == null) {
  return Theme(
    data: buildPriceWatchTheme(),
    child: MobileLoginScreen(onLoginSuccess: _onLoginSuccess),
  );
}
```

- [ ] **Step 5: Run the smoke test and verify it passes**

Run: `flutter test test/widget_test.dart`

Expected: PASS with the Guided Trust light color scheme scoped to login; officer screens still inherit the existing dark theme.

- [ ] **Step 6: Commit the theme foundation**

```powershell
git add lib/theme/price_watch_theme.dart lib/main.dart test/widget_test.dart
git commit -m "feat: add Guided Trust mobile theme"
```

---

### Task 2: Citizen Journey Controller

**Files:**
- Create: `mobile/lib/screens/citizen/citizen_journey_controller.dart`
- Test: `mobile/test/citizen/citizen_journey_controller_test.dart`

**Interfaces:**
- Produces: `enum CitizenJourneyStage`, `CitizenJourneyController.stage`, `reportId`, `startReport()`, `reviewCapture()`, `beginSubmission()`, `completeSubmission(String?)`, `failSubmission()`, `backToWelcome()`, and `startAnotherReport()`.
- Consumes: Flutter `ChangeNotifier`.

- [ ] **Step 1: Write failing transition tests**

Create tests that assert the full approved state path and retry behavior:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:price_watch/screens/citizen/citizen_journey_controller.dart';

void main() {
  test('moves through the Guided Trust journey', () {
    final controller = CitizenJourneyController();

    expect(controller.stage, CitizenJourneyStage.welcome);
    controller.startReport();
    expect(controller.stage, CitizenJourneyStage.capture);
    controller.reviewCapture();
    expect(controller.stage, CitizenJourneyStage.review);
    controller.beginSubmission();
    expect(controller.stage, CitizenJourneyStage.submitting);
    controller.completeSubmission('104');
    expect(controller.stage, CitizenJourneyStage.success);
    expect(controller.reportId, '104');
  });

  test('failed submission returns to review and preserves report id absence', () {
    final controller = CitizenJourneyController()
      ..startReport()
      ..reviewCapture()
      ..beginSubmission()
      ..failSubmission();

    expect(controller.stage, CitizenJourneyStage.review);
    expect(controller.reportId, isNull);
  });

  test('starting another report clears the returned report id', () {
    final controller = CitizenJourneyController()
      ..startReport()
      ..reviewCapture()
      ..beginSubmission()
      ..completeSubmission('104')
      ..startAnotherReport();

    expect(controller.stage, CitizenJourneyStage.capture);
    expect(controller.reportId, isNull);
  });
}
```

- [ ] **Step 2: Run the controller test and verify it fails**

Run: `flutter test test/citizen/citizen_journey_controller_test.dart`

Expected: FAIL because the controller file does not exist.

- [ ] **Step 3: Implement the controller**

```dart
import 'package:flutter/foundation.dart';

enum CitizenJourneyStage { welcome, capture, review, submitting, success }

class CitizenJourneyController extends ChangeNotifier {
  CitizenJourneyStage _stage = CitizenJourneyStage.welcome;
  String? _reportId;

  CitizenJourneyStage get stage => _stage;
  String? get reportId => _reportId;

  void startReport() => _setStage(CitizenJourneyStage.capture);
  void reviewCapture() => _setStage(CitizenJourneyStage.review);
  void beginSubmission() => _setStage(CitizenJourneyStage.submitting);

  void completeSubmission(String? reportId) {
    _reportId = reportId;
    _setStage(CitizenJourneyStage.success);
  }

  void failSubmission() => _setStage(CitizenJourneyStage.review);

  void backToWelcome() {
    _reportId = null;
    _setStage(CitizenJourneyStage.welcome);
  }

  void startAnotherReport() {
    _reportId = null;
    _setStage(CitizenJourneyStage.capture);
  }

  void _setStage(CitizenJourneyStage value) {
    _stage = value;
    notifyListeners();
  }
}
```

- [ ] **Step 4: Run controller tests**

Run: `flutter test test/citizen/citizen_journey_controller_test.dart`

Expected: all three tests PASS.

- [ ] **Step 5: Commit journey state**

```powershell
git add lib/screens/citizen/citizen_journey_controller.dart test/citizen/citizen_journey_controller_test.dart
git commit -m "feat: add Citizen journey state controller"
```

---

### Task 3: Shared Citizen Widgets and Welcome View

**Files:**
- Create: `mobile/lib/screens/citizen/citizen_widgets.dart`
- Create: `mobile/lib/screens/citizen/citizen_welcome_view.dart`
- Test: `mobile/test/citizen/citizen_views_test.dart`

**Interfaces:**
- Produces: `CitizenTrustTrail(currentStep: int)`, `CitizenStatusBanner`, `CitizenPrimaryButton`, `CitizenSecondaryButton`, and `CitizenWelcomeView(onStart, onLogout)`.
- Consumes: `PriceWatchColors` from Task 1.

- [ ] **Step 1: Write failing welcome and semantics tests**

Test that the welcome view shows the approved copy, exposes one primary report action, invokes `onStart`, and labels logout semantically:

```dart
testWidgets('Citizen welcome starts a guided report', (tester) async {
  var started = false;
  await tester.pumpWidget(testApp(
    CitizenWelcomeView(
      onStart: () => started = true,
      onLogout: () {},
    ),
  ));

  expect(find.text('Help keep prices fair.'), findsOneWidget);
  expect(find.text('Report a receipt'), findsOneWidget);
  expect(find.text('Your report is protected'), findsOneWidget);

  await tester.tap(find.text('Report a receipt'));
  expect(started, isTrue);
});
```

The shared `testApp` helper must wrap the child with `MaterialApp(theme: buildPriceWatchTheme(), home: child)`.

- [ ] **Step 2: Run the view test and verify it fails**

Run: `flutter test test/citizen/citizen_views_test.dart`

Expected: FAIL because the widgets and welcome view do not exist.

- [ ] **Step 3: Implement shared widgets**

Implement:

```dart
class CitizenPrimaryButton extends StatelessWidget {
  const CitizenPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.loading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: FilledButton.icon(
        onPressed: loading ? null : onPressed,
        icon: loading
            ? const SizedBox.square(
                dimension: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Icon(icon ?? Icons.arrow_forward_rounded),
        label: Text(loading ? 'Sending report' : label),
      ),
    );
  }
}
```

Implement `CitizenTrustTrail` with three labeled segments: **Photo**, **Check details**, and **Send**. Active/completed states must include icons as well as color. Implement `CitizenStatusBanner` with `Semantics(liveRegion: true)` and success/error icons.

- [ ] **Step 4: Implement the welcome view**

Build a safe-area layout containing:

```dart
CitizenWelcomeView(
  onStart: controller.startReport,
  onLogout: widget.onLogout,
)
```

Use the exact approved primary copy, a receipt/security illustration made from Material icons and containers, a **How it works** expansion, and an account overflow menu containing **Log out**.

- [ ] **Step 5: Run the focused view test**

Run: `flutter test test/citizen/citizen_views_test.dart`

Expected: welcome and semantics tests PASS.

- [ ] **Step 6: Commit shared Citizen UI**

```powershell
git add lib/screens/citizen/citizen_widgets.dart lib/screens/citizen/citizen_welcome_view.dart test/citizen/citizen_views_test.dart
git commit -m "feat: add Guided Trust welcome experience"
```

---

### Task 4: Citizen Capture View

**Files:**
- Create: `mobile/lib/screens/citizen/citizen_capture_view.dart`
- Modify: `mobile/test/citizen/citizen_views_test.dart`

**Interfaces:**
- Produces: `CitizenCaptureView(preview, cameraReady, loading, errorMessage, developmentFallback, onBack, onCapture, onRetry, onSimulate)`.
- Consumes: a ready-made preview `Widget` so widget tests do not require camera hardware.

- [ ] **Step 1: Write failing capture-state tests**

Add tests for:

```dart
testWidgets('capture view explains framing and invokes capture', (tester) async {
  var captured = false;
  await tester.pumpWidget(testApp(CitizenCaptureView(
    preview: const ColoredBox(color: Colors.black),
    cameraReady: true,
    loading: false,
    errorMessage: null,
    developmentFallback: false,
    onBack: () {},
    onCapture: () => captured = true,
    onRetry: () {},
    onSimulate: null,
  )));

  expect(find.text('Keep the whole receipt inside the frame'), findsOneWidget);
  expect(find.text('Choose from gallery'), findsNothing);
  await tester.tap(find.bySemanticsLabel('Take receipt photo'));
  expect(captured, isTrue);
});
```

Add a second test verifying a camera error shows **Try camera again** and does not show raw exception text.

- [ ] **Step 2: Run the capture tests and verify they fail**

Run: `flutter test test/citizen/citizen_views_test.dart --plain-name "capture"`

Expected: FAIL because `CitizenCaptureView` does not exist.

- [ ] **Step 3: Implement the capture view**

Use:

```dart
Stack(
  fit: StackFit.expand,
  children: [
    if (cameraReady && preview != null)
      preview!
    else
      _CameraUnavailable(
        errorMessage: errorMessage,
        developmentFallback: developmentFallback,
        onRetry: onRetry,
        onSimulate: onSimulate,
      ),
    if (cameraReady)
      const ReceiptGuideOverlay(
        instruction: 'Keep the whole receipt inside the frame',
      ),
    SafeArea(child: _CaptureTopBar(onBack: onBack)),
    Align(
      alignment: Alignment.bottomCenter,
      child: _CaptureControls(
        loading: loading,
        onCapture: onCapture,
      ),
    ),
  ],
)
```

The capture control must use `Semantics(button: true, label: 'Take receipt photo')`. The error state must map technical initialization errors to **Camera is unavailable. Check permission and try again.** The development fallback action appears only when `developmentFallback` is true and `onSimulate` is not null.

- [ ] **Step 4: Run capture tests**

Run: `flutter test test/citizen/citizen_views_test.dart --plain-name "capture"`

Expected: capture success and camera-error tests PASS.

- [ ] **Step 5: Commit the capture presentation**

```powershell
git add lib/screens/citizen/citizen_capture_view.dart test/citizen/citizen_views_test.dart
git commit -m "feat: add guided Citizen receipt capture UI"
```

---

### Task 5: Citizen Review and Success Views

**Files:**
- Create: `mobile/lib/screens/citizen/citizen_review_view.dart`
- Create: `mobile/lib/screens/citizen/citizen_success_view.dart`
- Modify: `mobile/test/citizen/citizen_views_test.dart`

**Interfaces:**
- Produces: `CitizenReviewView` with selected-store, stores, preview, OCR controller, hash-ready, loading, message, and callback parameters.
- Produces: `CitizenSuccessView(reportId, onDone, onReportAnother)`.
- Consumes: shared widgets from Task 3.

- [ ] **Step 1: Write failing review and success tests**

Cover these exact cases:

```dart
testWidgets('review disables secure send when stores are unavailable', (tester) async {
  await tester.pumpWidget(testApp(CitizenReviewView(
    receiptPreview: const ColoredBox(color: Colors.grey),
    stores: const [],
    selectedStore: null,
    ocrController: TextEditingController(text: 'RICE PHP 43.50'),
    hashReady: true,
    loading: false,
    message: null,
    messageIsError: false,
    onStoreChanged: (_) {},
    onRetake: () {},
    onSubmit: () {},
  )));

  expect(find.text('Store list unavailable'), findsOneWidget);
  final button = tester.widget<FilledButton>(find.byType(FilledButton));
  expect(button.onPressed, isNull);
});
```

Add tests that **Photo secured** appears when `hashReady` is true, a loading review shows **Sending report**, and success omits the reference block when `reportId` is null but shows `Report #104` when it is `'104'`.

- [ ] **Step 2: Run review/success tests and verify they fail**

Run: `flutter test test/citizen/citizen_views_test.dart`

Expected: FAIL because review and success views do not exist.

- [ ] **Step 3: Implement the review view**

Use a scrollable `CustomScrollView` or `SingleChildScrollView` with safe bottom padding. Render, in order:

1. `CitizenTrustTrail(currentStep: loading ? 3 : 2)`.
2. Captured preview in an accessible aspect-ratio card.
3. Store selector or **Store list unavailable** status.
4. Editable **Receipt details** field backed by the existing controller.
5. **Photo secured** banner when a real or development checksum exists.
6. Any actionable submission error as a live-region banner.
7. **Send securely** and **Retake photo** controls.

Disable submission when `stores.isEmpty`, `selectedStore == null`, `loading`, or `!hashReady`.

- [ ] **Step 4: Implement the success view**

The success view must show:

```dart
Text('Report received')
Text('Thank you for helping DTI monitor fair prices in Antique.')
if (reportId != null) Text('Report #$reportId')
CitizenPrimaryButton(label: 'Done', onPressed: onDone)
CitizenSecondaryButton(
  label: 'Report another receipt',
  onPressed: onReportAnother,
)
```

Also include the approved explanation that a DTI evaluator will review the receipt and store details.

- [ ] **Step 5: Run all Citizen view tests**

Run: `flutter test test/citizen/citizen_views_test.dart`

Expected: all welcome, capture, review, empty-store, loading, semantics, and success tests PASS.

- [ ] **Step 6: Commit review and success presentation**

```powershell
git add lib/screens/citizen/citizen_review_view.dart lib/screens/citizen/citizen_success_view.dart test/citizen/citizen_views_test.dart
git commit -m "feat: add Citizen report review and confirmation UI"
```

---

### Task 6: Integrate Existing Camera and Upload Behavior

**Files:**
- Modify: `mobile/lib/screens/consumer_scan_screen.dart`
- Create: `mobile/test/citizen/consumer_scan_screen_test.dart`

**Interfaces:**
- Consumes: all Citizen views and `CitizenJourneyController`.
- Preserves: `DbHelper.searchStores`, `availableCameras`, `CameraController`, SHA-256, decimal regex validation, and multipart `/api/tips` request.
- Produces: `ConsumerScanScreen(token, onLogout, storeLoader, submitter, developmentCapture, initializeCamera)` with production defaults and deterministic test seams.

- [ ] **Step 1: Add failing orchestration tests with injected adapters**

Define these test seams in the production widget signature:

```dart
typedef CitizenStoreLoader = Future<List<Map<String, dynamic>>> Function();
typedef CitizenSubmitter = Future<CitizenSubmissionResult> Function(
  CitizenSubmissionPayload payload,
);
typedef CitizenDevelopmentCapture = Future<CitizenCapturedReceipt> Function();
```

`ConsumerScanScreen` accepts nullable `storeLoader`, `submitter`, and `developmentCapture` callbacks plus `initializeCamera` (default `true`). Production defaults call the current SQLite, camera, and HTTP implementations. Widget tests pass `initializeCamera: false` and deterministic fakes, so they never require a camera plugin or network.

Write tests asserting:

- Welcome -> capture after tapping **Report a receipt**.
- The supplied development capture moves capture -> review with a deterministic checksum.
- Captured review data remains present after `CitizenSubmitter` throws.
- A successful fake result with ID `104` reaches success and displays **Report #104**.
- **Report another receipt** returns to capture and clears the previous store/photo/message state.

- [ ] **Step 2: Run the orchestration tests and verify they fail**

Run: `flutter test test/citizen/consumer_scan_screen_test.dart`

Expected: FAIL because the new constructor, adapters, and journey orchestration do not exist.

- [ ] **Step 3: Define submission value objects**

Place beside the orchestrator or in a focused private section:

```dart
class CitizenCapturedReceipt {
  const CitizenCapturedReceipt({
    required this.imagePath,
    required this.imageHash,
  });

  final String? imagePath;
  final String imageHash;
}

class CitizenSubmissionPayload {
  const CitizenSubmissionPayload({
    required this.storeId,
    required this.imagePath,
    required this.imageHash,
    required this.extractedLines,
  });

  final int storeId;
  final String? imagePath;
  final String imageHash;
  final List<String> extractedLines;
}

class CitizenSubmissionResult {
  const CitizenSubmissionResult({this.reportId});
  final String? reportId;
}
```

- [ ] **Step 4: Refactor the widget into the approved stage switch**

Use `AnimatedBuilder` on `CitizenJourneyController` and return exactly one view for the current stage:

```dart
switch (_journey.stage) {
  case CitizenJourneyStage.welcome:
    return CitizenWelcomeView(
      onStart: _journey.startReport,
      onLogout: widget.onLogout,
    );
  case CitizenJourneyStage.capture:
    final cameraReady = _cameraInitialized && _cameraController != null;
    return CitizenCaptureView(
      preview: cameraReady ? CameraPreview(_cameraController!) : null,
      cameraReady: cameraReady,
      loading: _loading,
      errorMessage: _isError ? _statusMessage : null,
      developmentFallback: kDebugMode,
      onBack: _confirmBackToWelcome,
      onCapture: _takePicture,
      onRetry: _initCamera,
      onSimulate: kDebugMode ? _simulateDevelopmentCapture : null,
    );
  case CitizenJourneyStage.review:
  case CitizenJourneyStage.submitting:
    return CitizenReviewView(
      receiptPreview: _buildReceiptPreview(),
      stores: _stores,
      selectedStore: _selectedStore,
      ocrController: _ocrTextController,
      hashReady: _imageHash.isNotEmpty,
      loading: _journey.stage == CitizenJourneyStage.submitting,
      message: _statusMessage.isEmpty ? null : _statusMessage,
      messageIsError: _isError,
      onStoreChanged: (store) => setState(() => _selectedStore = store),
      onRetake: _confirmRetake,
      onSubmit: _submitTip,
    );
  case CitizenJourneyStage.success:
    return CitizenSuccessView(
      reportId: _journey.reportId,
      onDone: _finishJourney,
      onReportAnother: _startAnotherReport,
    );
}
```

Call `_initCamera()` from `initState` only when `widget.initializeCamera` is true. Retain the existing camera initialization and capture implementations. On successful capture, calculate SHA-256 and call `_journey.reviewCapture()`.

Implement `_simulateDevelopmentCapture()` by invoking `widget.developmentCapture` when supplied; otherwise retain the existing debug checksum fallback. Store its nullable `imagePath`, retain its real or debug `imageHash`, and advance to review. `_buildReceiptPreview()` renders `Image.file` for a real path and a clearly labeled development placeholder when the path is null. The default HTTP submitter preserves the current `simulated_upload=true` field when `imagePath` is null.

- [ ] **Step 5: Preserve validation and improve citizen-facing errors**

Before submission, keep:

```dart
final priceRegex = RegExp(r'\d+\.\d{2}');
if (!priceRegex.hasMatch(_ocrTextController.text)) {
  _setMessage(
    'We could not find a price such as 45.00. Check the receipt details and try again.',
    isError: true,
  );
  return;
}
```

Map upload outcomes without exposing raw bodies:

```dart
String citizenUploadMessage(int statusCode) {
  if (statusCode == 401 || statusCode == 403) {
    return 'Your session has expired. Sign in again before sending this report.';
  }
  if (statusCode == 422) {
    return 'Check the store, receipt photo, and price details before trying again.';
  }
  if (statusCode >= 500) {
    return 'DTI reporting is temporarily unavailable. Your receipt is still here—try again shortly.';
  }
  return 'The report could not be sent. Check your connection and try again.';
}
```

On failure call `_journey.failSubmission()` without clearing `_capturedImage`, `_imageHash`, `_selectedStore`, or OCR text.

- [ ] **Step 6: Parse only a real returned report ID**

For a 200/201 response:

```dart
final decoded = json.decode(responseBody) as Map<String, dynamic>;
final tip = decoded['tip'];
final reportId = tip is Map<String, dynamic> ? tip['id']?.toString() : null;
_journey.completeSubmission(reportId);
```

Do not create a fallback identifier.

- [ ] **Step 7: Run orchestration tests**

Run: `flutter test test/citizen/consumer_scan_screen_test.dart`

Expected: all navigation, retry-preservation, real-ID, and reset tests PASS.

- [ ] **Step 8: Commit integration**

```powershell
git add lib/screens/consumer_scan_screen.dart test/citizen/consumer_scan_screen_test.dart
git commit -m "feat: integrate Guided Trust Citizen journey"
```

---

### Task 7: Shared Sign-In and Consumer Routing Polish

**Files:**
- Modify: `mobile/lib/main.dart`
- Modify: `mobile/test/widget_test.dart`

**Interfaces:**
- Consumes: `buildPriceWatchTheme()` and `ConsumerScanScreen(token, onLogout)`.
- Preserves: existing mock credentials, saved token/role keys, and officer routing.

- [ ] **Step 1: Add failing login usability assertions**

Assert the sign-in screen exposes these labels and semantics:

```dart
expect(find.text('Sign in to PRICE-Watch'), findsOneWidget);
expect(find.bySemanticsLabel('Email address'), findsOneWidget);
expect(find.bySemanticsLabel('Password'), findsOneWidget);
expect(find.text('Sign in'), findsOneWidget);
```

Retain a separate assertion that the existing officer credential path still opens **DTI Officer Node**.

- [ ] **Step 2: Run the smoke test and verify it fails**

Run: `flutter test test/widget_test.dart`

Expected: FAIL on the new approved sign-in copy and form structure.

- [ ] **Step 3: Restyle the shared sign-in screen**

Replace the dark centered column with a `SafeArea` plus scrollable, width-constrained form. Use:

- PRICE-Watch mark and **DTI Antique** eyebrow.
- **Sign in to PRICE-Watch** headline.
- `TextFormField` controls with email keyboard, password obscuring, autofill hints, and 48px targets.
- A live-region error card using plain language.
- The existing `_handleLogin` credential logic unchanged.

Do not expose demo credentials in the primary error message. Place the existing demo credentials in a clearly labeled development-only helper guarded by `kDebugMode`.

- [ ] **Step 4: Replace the consumer floating logout route**

Change the consumer branch to:

```dart
if (_role == 'consumer') {
  return Theme(
    data: buildPriceWatchTheme(),
    child: ConsumerScanScreen(
      token: _token!,
      onLogout: _onLogout,
    ),
  );
}
```

Do not wrap it in a second `Scaffold` or floating action button.

- [ ] **Step 5: Run login and routing tests**

Run: `flutter test test/widget_test.dart`

Expected: the light sign-in test and existing officer-route test PASS; the officer route continues to inherit the existing dark application theme.

- [ ] **Step 6: Commit shared entry polish**

```powershell
git add lib/main.dart test/widget_test.dart
git commit -m "feat: polish PRICE-Watch mobile sign-in"
```

---

### Task 8: Accessibility, Responsive Layout, and Full Verification

**Files:**
- Modify: `mobile/test/citizen/citizen_views_test.dart`
- Modify: only Citizen Flutter files if a verification failure requires a scoped correction.

**Interfaces:**
- Consumes: all completed Citizen views.
- Produces: verified narrow-screen, large-text, semantics, analysis, tests, and Android debug build evidence.

- [ ] **Step 1: Add narrow-screen and large-text tests**

Pump each Citizen view at `320x640` and at `textScaler: const TextScaler.linear(1.5)`. After `pumpAndSettle()`, assert:

```dart
expect(tester.takeException(), isNull);
```

Ensure the test scrolls to the bottom action before asserting it remains reachable.

- [ ] **Step 2: Add semantics assertions**

Use `tester.ensureSemantics()` and verify labels for:

- **Report a receipt**
- **Take receipt photo**
- **Send securely**
- **Retake photo**
- **Log out**
- Success and error live regions

- [ ] **Step 3: Run Citizen tests**

Run:

```powershell
flutter test test/citizen
```

Expected: all Citizen controller, view, orchestration, responsive, and semantics tests PASS.

- [ ] **Step 4: Format modified Dart files**

Run:

```powershell
dart format lib test
```

Expected: formatter completes without errors.

- [ ] **Step 5: Run static analysis and the full test suite**

Run:

```powershell
flutter analyze
flutter test
```

Expected: no analyzer issues and all tests PASS.

- [ ] **Step 6: Build the Android debug APK**

Run:

```powershell
flutter build apk --debug
```

Expected: `build/app/outputs/flutter-apk/app-debug.apk` is produced successfully.

- [ ] **Step 7: Audit scope and diff**

Run:

```powershell
git status --short
git diff --check
git diff --name-only HEAD~7..HEAD
```

Expected: implementation changes are limited to `mobile/`; the already-approved spec/plan documents may also appear in history. No `backend/`, database, Supabase, or web dashboard application files are changed.

- [ ] **Step 8: Commit final accessibility verification adjustments**

If Task 8 required source or test corrections, commit only those files:

```powershell
git add mobile/lib mobile/test
git commit -m "test: verify Guided Trust Citizen accessibility"
```

If no files changed in Task 8, do not create an empty commit.
