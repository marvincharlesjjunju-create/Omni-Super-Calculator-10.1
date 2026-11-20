# Omni Calculator

A polished, offline-first calculator app prepared for Android packaging with Capacitor. The Android launcher icon and splash screen are generated from the artwork in `assets/`; the APK therefore carries the Omni Calculator logo instead of the default Capacitor icon.

## Included capabilities

- Standard calculator with expression preview, repeated equals, keyboard input, history, clear-all control, native CSV sharing/export and persistent memory
- Scientific functions: trigonometry and inverse functions, hyperbolic functions, logarithms, roots, powers, factorials, combinations, permutations, constants, degree/radian modes and random values
- Data-only math parser (no JavaScript `eval` or `new Function` for calculator expressions)
- Spoken calculations using native Android speech recognition in the APK, with browser speech-recognition fallback where available
- Smooth live-reorder keypad editing with pointer/touch dragging, animated placement feedback, persistent custom layout and reset-to-default control
- Android hardware-back navigation that closes the current screen first and returns from tool screens to the Tools menu
- Phone landscape layout with the basic and scientific keypads visible together and resized to the available screen
- Unit conversion for angle, area, data, energy, force, fuel economy, length, power, pressure, speed, temperature, time, volume and weight
- Currency conversion using online USD-based exchange rates, a visible update timestamp, manual refresh and cached rates for offline use
- Math notes with optional stacked variables and persistent handwriting/drawing
- Function graphing with pinch/scroll zoom where supported and touch/mouse panning
- Tip, loan-payment and compound-interest calculators (annual, semi-annual, quarterly, monthly and daily compounding)
- Statistics summary including count, sum, mean, median, mode, range, variance, standard deviation and quartiles
- Themes, custom accent colors, haptics, local persistence and service-worker caching for the web build
- Omni Intelligence: redesigned computational workspace with the original Omni Aperture identity, capability overview, suggested prompts, responsive conversation area and locally stored history; offline-first routing for calculations, percentages, loan amortisation, budget splits, supported unit conversions and maths explanations

## Build the Android APK with GitHub Actions

1. Create a new GitHub repository and upload the **contents** of this folder (so `package.json`, `www/`, `assets/`, `src/` and `.github/` are at the repository root).
2. Push the files to the `main` or `master` branch.
3. Open the repository's **Actions** tab and select **Build Android APK**. It also runs from **Run workflow**.
4. When the workflow finishes, open its run and download the `Omni-Calculator-Android-APK` artifact. Extract it and install `app-debug.apk` on the Android phone. On some phones, Android will ask you to allow installation from that browser or file manager.

The project includes `@capacitor/app` for Android system-back events. The workflow uses `android-actions/setup-android@v4` to handle the current Android command-line tools installation, accept SDK licenses and install Platform 35 / Build Tools 35.0.0. This avoids the version mismatch caused by the older v3 action when the GitHub runner already has command-line tools 20.0. It then bundles the native speech plugin, creates the Android project, generates launcher assets, syncs Capacitor and builds the debug APK. The workflow verifies the APK and uploads it with a SHA-256 checksum. The generated `android/` folder is intentionally ignored by Git because GitHub Actions creates it during the build.

## Omni Intelligence

Open Tools → Omni Intelligence to use the local computational assistant. The screen uses the original Omni Aperture mark (four open corner brackets around a central diamond), not a copied third-party AI mark. It routes supported requests to the safe maths parser and specialist finance, budgeting and conversion functions. Conversations remain on the device. This release is a deterministic, offline-capable tool-using assistant, not a hosted large language model; cloud generative AI requires a separately deployed secure backend and provider credentials.

## Product roadmap

The project includes a staged super-app roadmap covering Omni AI, Finance, Scan, Academy, Planner, World, Vault and advanced Omni Lab tools. These are product proposals and delivery phases, not claims that every module is already implemented. See [`docs/SUPER-APP-ROADMAP.md`](docs/SUPER-APP-ROADMAP.md).

## Local Android build (optional)

Install Node.js 22, Android Studio with Android SDK Platform 35 and Build Tools 35.0.0, and JDK 21. From the project root run:

```bash
npm install
npm run build
npx cap add android
npx @capacitor/assets generate --android
npx cap sync android
cd android
./gradlew assembleDebug
```

On Windows PowerShell use `.\gradlew.bat assembleDebug` from inside `android`. The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Remove an older installation first if it was signed with a different debug key; Android will not install it as an in-place update.

## Voice, currency and offline behavior

- The native speech plugin requests Android speech-recognition/microphone permission when the microphone control is first used. Speech recognition also requires an on-device or network speech service provided by the Android device. The current recognition language is English (US). Native CSV export writes a temporary file and opens Android’s share sheet so it can be saved or sent.
- Currency rates are retrieved from the public `open.er-api.com` service and require internet access to refresh. A previously downloaded rate table remains available offline; check the rate timestamp before relying on a cached conversion for a financial transaction.
- Calculations, history, settings, keypad layout, notes and drawings are stored locally on the device. Cloud Sync is not connected to a backend in this source build; use CSV export to back up calculation history.

## Project layout

```text
.
├── .github/workflows/android-apk.yaml
├── assets/                   # App icon, Omni Aperture mark, adaptive layers and splash artwork
├── src/native-bridge.js      # Capacitor speech, filesystem, share and Android back-button plugin bundle entry
├── www/
│   ├── index.html
│   ├── app.js
│   ├── native-bridge.js      # Web fallback; replaced by npm run build
│   ├── sw.js
│   └── manifest.json
├── capacitor.config.json
└── package.json
```

## Notes

This repository creates a **debug-signed APK** intended for testing and direct installation. For a Play Store or production release, configure a private signing key in GitHub Actions secrets and add a signed release build; never commit signing keys or passwords to the repository.
