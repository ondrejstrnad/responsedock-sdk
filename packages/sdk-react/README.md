# ResponseDock React SDK

React bindings for [`@responsedock/sdk-browser`](https://www.npmjs.com/package/@responsedock/sdk-browser). Use them to embed ResponseDock surveys inline, open them in a modal, or launch them from product events in React 18 and 19 apps. The components are safe to render on the server; the SDK only touches the DOM in effects.

```sh
npm install @responsedock/sdk-react
```

`@responsedock/sdk-browser` is installed with it. `react` and `react-dom` (18 or later) are peer dependencies.

## Provider

Wrap the part of your app that shows surveys in a `SurveyProvider`. It accepts the same options as `ResponseDock.init()` and initialises the SDK before any child survey loads.

```tsx
import { SurveyProvider } from '@responsedock/sdk-react';

export function App({ children }: { children: React.ReactNode }) {
  return (
    <SurveyProvider
      projectKey="pk_live_xxxx"
      theme={{ primaryColor: '#0f766e', fontFamily: 'Inter, sans-serif' }}
      callbacks={{ onComplete: ({ surveyId }) => console.log('Completed', surveyId) }}
    >
      {children}
    </SurveyProvider>
  );
}
```

The project key is public. Secret API keys must stay on your server.

## Inline embed

```tsx
import { SurveyEmbed } from '@responsedock/sdk-react';

<SurveyEmbed
  surveyId="workspace/survey-slug"
  title="Product feedback"
  onComplete={({ responseId }) => console.log('Response', responseId)}
/>;
```

The iframe resizes to fit the survey and is removed when the component unmounts.

## Modal

`SurveyModal` is controlled by `open`. `onClose` fires when the respondent or the survey closes the modal, not when you set `open` to `false` yourself.

```tsx
import { useState } from 'react';
import { SurveyModal } from '@responsedock/sdk-react';

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Give feedback</button>
      <SurveyModal surveyId="workspace/survey-slug" open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

## Events and imperative calls

`useSurvey()` returns `track`, `show` and `identify` from the nearest provider:

```tsx
import { useSurvey } from '@responsedock/sdk-react';

export function CheckoutComplete() {
  const { track } = useSurvey();
  return <button onClick={() => track('checkout_completed', { plan: 'pro' })}>Done</button>;
}
```

`track()` sends the event to ResponseDock and opens the first survey whose trigger matches it. `show(surveyId)` opens a modal and returns a controller with `close()` and `destroy()`.

## Identity

Pass the signed-in user through the provider's `identity` prop. It is applied before the first survey loads, and setting it back to `null` clears it:

```tsx
<SurveyProvider projectKey="pk_live_xxxx" identity={user ? { externalUserId: user.id, userHash: user.responseDockHash } : null}>
```

When the workspace uses identity verification, include `userHash`. Your backend computes it as `hex(HMAC-SHA256(identitySecret, externalUserId))`. The identity secret must never reach the browser.

## Without React or a bundler

The browser SDK is also served from ResponseDock. `/sdk/0.2/` receives every 0.2.x patch release; use `/sdk/0.2.0/` to pin an exact release:

- ES module: `https://survey.responsedock.com/sdk/0.2/index.js`
- Classic script (defines `window.ResponseDock`): `https://survey.responsedock.com/sdk/0.2/responsedock.global.js`

## Documentation

- [React SDK](https://docs.responsedock.com/docs/sdk/react)
- [Browser SDK](https://docs.responsedock.com/docs/sdk/browser)
- [Events and triggers](https://docs.responsedock.com/docs/sdk/events)

## License

MIT
