# Omni Calculator 2.1 — UX update

## Android back navigation

The Capacitor App plugin now reports Android hardware-back presses to the web application. Omni closes the top-most context menu, drawer, settings panel, scientific overlay or keypad-edit mode first. When a user opens a tool from the Tools drawer, Back returns to Tools before leaving that area. If no in-app surface is open, Android's normal app-exit behavior is invoked.

## Keypad editing

Keypad edit mode now supports direct pointer/touch dragging with live grid reordering, FLIP-style movement animation, a lifted active key and persistent ordering. The edit hint explains the gesture. Reset to default remains available.

## Omni Intelligence visual refresh

The Intelligence workspace has a new responsive header, compact capability overview, focused prompt chips, a scrollable conversation panel and a persistent message composer. The new Omni Aperture mark uses four asymmetric open corner brackets framing a central diamond. It is an original geometric identity and intentionally avoids the familiar starburst/knot visual language used by several AI products.

## Build note

`@capacitor/app` is included as a runtime dependency. GitHub Actions installs dependencies with `npm install`, creates the lockfile during the run, then uses `npm ci` for the actual build steps. The Android project is generated cleanly by Capacitor during CI.
