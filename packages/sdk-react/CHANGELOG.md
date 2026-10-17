# @responsedock/sdk-react

## 0.2.0

### Minor Changes

- aa48b27: Make embeds smooth on any host page.

  - `show()` now returns a `{ iframe, close(), destroy() }` controller instead of a Promise (awaiting it still works). The modal stays open after completion so respondents see the thank-you page; it closes on the close button, Escape, a backdrop click, `close()` or `autoCloseAfterMs`. It is an accessible dialog with a focus trap, scrolls inside 90dvh, and locks host scrolling while open.
  - `onReady` fires when the survey has loaded, not on iframe `load`. New `onResize`, `onStepChange`, `onRedirect`, `onDismiss` and `onClose` callbacks; `onComplete` carries `responseId`; `onError` carries a `code` (`LOAD_TIMEOUT`, `THEME_REJECTED`, `SESSION_EXPIRED`, …).
  - Inline embeds get a `title`, drop their minimum height after the first resize, and scroll the host page only when the frame asks for a field that is off-screen (`scrollOffset` for sticky headers).
  - Iframe URLs carry `rd_origin`, so the frame talks to hosts that send no referrer.
  - New `responsedock.global.js` IIFE build exposing `window.ResponseDock` for pages that cannot load modules.
  - React: `SurveyProvider` initialises before child embeds, so a custom `surveyUrl`/`apiUrl` works; `SurveyModal` is driven by `open` and reports `onClose`/`onComplete` reliably.
  - Identity verification: `identify({ externalUserId, userHash })` forwards a backend-computed `hex(HMAC-SHA256(workspaceSecret, externalUserId))` to the survey frame so the workspace can trust browser-supplied user IDs. React: new `identity` prop on `SurveyProvider`.

- Publishable release: MIT license, README, ESM-only build with correct `exports`, and a `"use client"` directive so the components work in the Next.js App Router. CommonJS consumers must switch to `import`.
- `SurveyProvider` accepts the browser SDK's `autoTrack` option and re-initialises the SDK when it changes.

### Patch Changes

- Updated dependencies [aa48b27]
  - @responsedock/sdk-browser@0.2.0

## 0.1.1

### Patch Changes

- f93be6e: Add guarded Changesets release automation for the public SDKs. Publishing remains disabled until SDK licensing is approved.
- Updated dependencies [f93be6e]
  - @responsedock/sdk-browser@0.1.1
