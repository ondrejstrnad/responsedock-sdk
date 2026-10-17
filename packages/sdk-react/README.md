# ResponseDock React SDK

React components and hooks for embedding white-label ResponseDock surveys in React applications. It wraps [`@responsedock/sdk-browser`](https://www.npmjs.com/package/@responsedock/sdk-browser), so inline embeds, modals, event triggers, theming and identity verification work exactly as in the browser SDK.

- ES module build with TypeScript declarations.
- Marked `"use client"`, so it can be imported from Next.js App Router server components.
- Safe to render on the server: nothing touches the DOM until the components mount in the browser.

## Install

```sh
npm install @responsedock/sdk-react
```

React and React DOM 18 or later are peer dependencies. `@responsedock/sdk-browser` is installed with the package.

## SurveyProvider

Wrap your app, or the part of it that shows surveys, in `SurveyProvider`. It configures the SDK with your public project key before any child survey loads.

```tsx
import { SurveyProvider } from '@responsedock/sdk-react';

export function App() {
  return (
    <SurveyProvider
      projectKey="pk_live_xxxx"
      theme={{ primaryColor: '#0f766e', fontFamily: 'Inter, sans-serif' }}
      callbacks={{ onComplete: ({ surveyId }) => console.log('Completed', surveyId) }}
    >
      <YourApp />
    </SurveyProvider>
  );
}
```

Props are the browser SDK's `init()` options plus `identity` and `children`:

| Prop | Description |
| --- | --- |
| `projectKey` | Your public project key (`pk_…`). Required. |
| `theme` | Host branding forwarded to the survey frame. Changes are applied live. |
| `callbacks` | `onReady`, `onComplete`, `onDismiss`, `onError`, `onResize`, `onStepChange`, `onRedirect` for every survey. Always the latest function is called; changing them never re-initialises the SDK. |
| `identity` | The signed-in user: `{ externalUserId, traits?, userHash? }`. Applied before any child survey loads. Set it back to `null` on sign-out to clear it. |
| `apiUrl`, `surveyUrl` | Override the API and survey hosts (self-hosting, custom domains). |
| `autoTrack` | Opt-in automatic trigger events: `{ pageViews, exitIntent, scrollDepth, delaySeconds }`. See [Automatic triggers](#automatic-triggers). |
| `environment`, `debug`, `allowedContextKeys` | As in the browser SDK. |

When your workspace uses identity verification, compute `userHash` on your server as `hex(HMAC-SHA256(identitySecret, externalUserId))` and pass it in `identity`. Never put the identity secret or a secret API key (`sk_…`) in browser code.

```tsx
<SurveyProvider projectKey="pk_live_xxxx" identity={user ? { externalUserId: user.id, userHash: user.responseDockHash } : null}>
  <YourApp />
</SurveyProvider>
```

## SurveyEmbed

Renders a survey inline. The iframe sizes itself to the survey.

```tsx
import { SurveyEmbed } from '@responsedock/sdk-react';

export function FeedbackPage() {
  return (
    <SurveyEmbed
      surveyId="your-workspace/post-purchase"
      title="Post-purchase survey"
      minHeight={480}
      onComplete={({ responseId }) => console.log('Response', responseId)}
    />
  );
}
```

| Prop | Description |
| --- | --- |
| `surveyId` | Survey ID, or `workspaceSlug/surveySlug`. Required. |
| `title` | Accessible iframe title. Default `"Survey"`. |
| `minHeight` | Placeholder height until the survey reports its size. Default `400`. |
| `loading` | `'eager'` or `'lazy'`. |
| `scrollOffset` | Space kept above a question the survey scrolls to, e.g. a sticky header's height. |
| `loadTimeoutMs` | Raise `onError({ code: 'LOAD_TIMEOUT' })` when the survey is not ready in time. Default `15000`; `0` disables. |
| `className`, `style` | Applied to the container element. |
| `onReady`, `onComplete`, `onDismiss`, `onError`, `onResize`, `onStepChange`, `onRedirect` | Callbacks for this survey, in addition to the provider's. |

The embed is removed when the component unmounts and recreated when `surveyId` or the provider's project changes.

## SurveyModal

A controlled modal: it is open while `open` is `true`.

```tsx
import { useState } from 'react';
import { SurveyModal } from '@responsedock/sdk-react';

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Give feedback</button>
      <SurveyModal
        surveyId="your-workspace/nps"
        open={open}
        autoCloseAfterMs={3000}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
```

`onClose` fires when the respondent or the survey closes the modal (close button, Escape, backdrop click, `autoCloseAfterMs`), not when you set `open` to `false` yourself; update your state there. Without `autoCloseAfterMs` the thank-you screen stays until the respondent dismisses it. `SurveyModal` also accepts `title`, `loadTimeoutMs` and the same callbacks as `SurveyEmbed`.

## useSurvey

Inside a `SurveyProvider`, `useSurvey()` gives you the SDK's imperative API:

```tsx
import { useSurvey } from '@responsedock/sdk-react';

export function CheckoutComplete({ orderId }: { orderId: string }) {
  const { track, show, identify } = useSurvey();

  return (
    <>
      <button onClick={() => void track('checkout_completed', { orderId })}>Done</button>
      <button onClick={() => show('your-workspace/checkout-feedback', { autoCloseAfterMs: 3000 })}>Rate checkout</button>
    </>
  );
}
```

| Member | Description |
| --- | --- |
| `track(event, properties?)` | Sends a product event. Surveys whose trigger rules match open automatically. |
| `show(surveyIdOrSlug, options?)` | Opens a modal and returns a `{ iframe, close(), destroy() }` controller. |
| `identify({ externalUserId, traits?, userHash? })` | Sets the respondent. Prefer the provider's `identity` prop for the signed-in user. |

`useSurvey()` throws when it is used outside a `SurveyProvider`.

## Browser SDK access

`ResponseDock` and the browser SDK's types (`SdkInitOptions`, `SdkEmbedOptions`, `SdkShowOptions`, `EmbedTheme`, …) are re-exported, so you can use anything the provider does not cover without a second import:

```ts
import { ResponseDock } from '@responsedock/sdk-react';

ResponseDock.updateTheme({ primaryColor: '#2563eb' });
```

## Automatic triggers

Pass `autoTrack` to have the SDK send page views, scroll depth, time on page and exit intent as events. They are off by default; create trigger rules for the event names (`$pageview`, `$scroll_depth`, `$time_on_page`, `$exit_intent`) in the dashboard.

```tsx
<SurveyProvider
  projectKey="pk_live_xxxx"
  autoTrack={{ pageViews: true, exitIntent: true, scrollDepth: [50, 90], delaySeconds: [30] }}
>
  <YourApp />
</SurveyProvider>
```

Page views follow client-side navigation (History API and `#/` hash routes), so routers such as Next.js, React Router and TanStack Router need no extra wiring. Changing `autoTrack` re-initialises the SDK with the new settings; removing it stops automatic events. The [browser SDK README](https://github.com/ondrejstrnad/responsedock-sdk/tree/main/packages/sdk-browser#automatic-triggers) lists every event and its properties.

## Next.js

The package is ESM-only, and every entry point carries the `"use client"` directive. In the App Router you can render `SurveyProvider`, `SurveyEmbed` and `SurveyModal` directly from a server component such as `app/layout.tsx`; they hydrate and load the survey in the browser. Pass only serialisable props across that boundary: `callbacks`, `onComplete` and other functions need a wrapper client component of your own. Call `useSurvey()` from your own client components (files that start with `'use client'`).

```tsx
// app/layout.tsx (server component)
import { SurveyProvider } from '@responsedock/sdk-react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SurveyProvider projectKey={process.env.NEXT_PUBLIC_RESPONSEDOCK_PROJECT_KEY!} autoTrack={{ pageViews: true }}>
          {children}
        </SurveyProvider>
      </body>
    </html>
  );
}
```

The Pages Router works too: render the provider in `pages/_app.tsx`.

## Without React or a bundler

The browser SDK is also served from ResponseDock. `/sdk/0.2/` receives every 0.2.x patch release; use `/sdk/0.2.0/` to pin an exact release:

- ES module: `https://survey.responsedock.com/sdk/0.2/index.js`
- Classic script (defines `window.ResponseDock`): `https://survey.responsedock.com/sdk/0.2/responsedock.global.js`

## Documentation

- [React SDK guide](https://docs.responsedock.com/docs/sdk/react)
- [Browser SDK reference](https://docs.responsedock.com/docs/sdk/browser)
- [Events and triggers](https://docs.responsedock.com/docs/sdk/events)
- [Theming](https://docs.responsedock.com/docs/sdk/theming)

## License

MIT
