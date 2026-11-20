# Omni Calculator — Super-App Product Roadmap

## Product direction

Evolve Omni Calculator from a capable offline-first calculator into a modular personal utility and productivity platform. Keep the calculator fast, reliable and immediately accessible; make every larger capability an optional module so the home screen does not become crowded.

## Differentiating modules

### 1. Omni AI — intelligent problem-solving
- Natural-language math and everyday calculation requests.
- Explain solutions step by step and show the formula used.
- Convert scanned or typed questions into structured expressions.
- Clearly label online AI answers; retain deterministic offline calculation when disconnected.
- Never silently send private notes or financial records to a remote model.

### 2. Omni Finance — personal money workspace
- Income and expense ledger, categories, budgets and savings goals.
- Loan amortization, debt payoff comparisons and compound-growth projections.
- UGX-first display option, editable tax/fee assumptions and currency conversion.
- Exportable reports; local-first storage and explicit backup controls.
- Clearly distinguish estimates from official tax, bank or mobile-money charges.

### 3. Omni Scan — camera-to-calculation
- Receipt and document capture with crop, rotate and perspective correction.
- OCR for amounts, dates, units and printed/handwritten equations.
- Review extracted values before calculating or saving; never assume uncertain OCR is correct.
- On-device processing where practical; ask before uploading images.

### 4. Omni Lab — advanced mathematics
- Equation and inequality solver, matrices, complex numbers and numerical methods.
- 2D/3D plotting, sliders for parameters and exportable graph images/data.
- Statistics, probability distributions, regression and scientific constants.
- Formula library with units, assumptions and worked examples.

### 5. Omni Academy — learning mode
- Guided lessons, interactive practice and hints before revealing solutions.
- Step-by-step derivations, formula flashcards and revision sets.
- Exam/practice mode with optional timer and progress tracking.

### 6. Omni Planner — time and task tools
- Calendar, reminders, recurring events, countdowns and date/time arithmetic.
- Time-zone comparison and focus timers.
- Local notifications with user-controlled permissions.

### 7. Omni World — everyday utilities
- World clock, weather, travel/unit tools and offline reference tables.
- Currency data with source, timestamp and stale/offline warning.
- Smart Clipboard that detects possible numbers, units or expressions only after user permission.

### 8. Omni Vault — private personal workspace
- Searchable history, notes, formulas, documents and saved calculations.
- Optional encrypted export/backup; no claim of cloud sync until a backend exists.
- App lock and biometric unlock where supported by the native platform.

## Signature experience

- Omni Command: one search/command field that finds tools, formulas, saved items and actions.
- Split Workspace: calculator + notes + graph/converter panels at once.
- Voice Actions: spoken calculations and navigation with a visible confirmation before consequential actions.
- Quick Tools: home-screen shortcuts/widgets and a floating mini-calculator where Android permits it.
- Personal Dashboard: user-arranged modules, favourites and recent work.
- Accessibility: large-key mode, screen-reader labels, high contrast, reduced motion and haptic controls.
- Offline-first core: all basic/scientific calculations, saved history and locally stored tools remain usable offline.

## Delivery phases

### Phase 0 — Reliability (current)
- Fix the Android SDK command-line-tools mismatch in GitHub Actions.
- Build the Capacitor Android wrapper reproducibly and upload the APK artifact.
- Verify the APK exists and publish a SHA-256 checksum.
- Preserve the current calculator, converter, graph, notes and local-first experience.

### Phase 1 — Foundation and navigation
- Introduce a modular home dashboard, global command search and consistent design tokens.
- Add a versioned local data model, migrations, import/export and automated tests.
- Add privacy settings, permissions explanations and accessible interaction patterns.

### Phase 2 — Omni Finance + Omni Academy
- Build the offline finance ledger and budgeting tools.
- Add learning mode, formula library and worked-solution explanations.

### Phase 3 — Omni Scan + Omni Lab
- Add OCR capture/review flow and equation extraction.
- Expand mathematical engine, matrices, equation solving and 3D graphing.

### Phase 4 — Omni AI + Omni Planner + Omni World
- Add optional AI provider integration with explicit online/offline states.
- Add reminders, world clock, weather and smart clipboard with permission controls.

### Phase 5 — Sync, widgets and release readiness
- Add opt-in encrypted sync only after authentication, key management and conflict resolution are designed.
- Add Android widgets/shortcuts and signed release builds.
- Complete privacy, security, accessibility, performance and Play Store policy reviews.

## Engineering guardrails

- Keep the core calculator deterministic; do not use a language model to evaluate arithmetic.
- Show units, formulas, assumptions, source and freshness for financial or live-data results.
- Keep offline functions independent of network services.
- Request camera, microphone, notification, location and storage permissions only when a feature needs them.
- Do not describe local storage as cloud backup or estimate outputs as professional financial/tax advice.
- Add unit, integration and UI tests before expanding high-impact financial or OCR workflows.
