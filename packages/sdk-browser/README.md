# ResponseDock Browser SDK

Embed branded ResponseDock surveys in any browser application or launch them from product events. The SDK has no runtime dependencies, includes TypeScript declarations, and is safe to import during server rendering.

Load it from ResponseDock without a build step. `/sdk/0.2/` receives every 0.2.x patch release; use `/sdk/0.2.0/` to pin an exact release:

```html
<!-- ES module -->
<script type="module">
  import { ResponseDock } from 'https://survey.responsedock.com/sdk/0.2/index.js';
</script>

<!-- Classic script (tag managers, older CMSs): defines window.ResponseDock -->
<script src="https://survey.responsedock.com/sdk/0.2/responsedock.global.js"></script>
```

With a bundler, install the package from npm:

```sh
npm install @responsedock/sdk-browser
```

```ts
import { ResponseDock } from '@responsedock/sdk-browser';

ResponseDock.init({
  projectKey: 'pk_live_xxxx',
  theme: {
    primaryColor: '#0f766e',
    backgroundColor: '#ffffff',
    fontFamily: 'Inter, sans-serif',
  },
  callbacks: {
    onComplete: ({ surveyId }) => console.log('Completed', surveyId),
    onError: ({ message }) => console.error(message),
  },
});

const embed = ResponseDock.embed('workspace/survey-slug', '#survey-root');

// Clean up when a single-page application removes the view.
embed?.destroy();
```

Use `identify()` for a known respondent, `track()` for event-triggered surveys, `show()` for a modal, `launcher()` for a floating feedback button, and `updateTheme()` for live theme changes. The renderer handles responsive iframe height, uploads, conditional logic, presentation images, banners, and confidential answers without additional host code.

## Automatic triggers

Automatic events are off by default. Turn on the ones you need and create trigger rules for their event names in the dashboard:

```ts
ResponseDock.init({
  projectKey: 'pk_live_xxxx',
  autoTrack: { pageViews: true, exitIntent: true, scrollDepth: [50, 90], delaySeconds: [30] },
});
ResponseDock.identify({ externalUserId: user.id }); // same tick as init(): the first page view includes it
```

| Option | Event | Properties | Fires |
| --- | --- | --- | --- |
| `pageViews` | `$pageview` | page properties | on load and on every SPA navigation (`pushState`, `replaceState` to a new URL, back/forward, `#/` hash routes) |
| `scrollDepth` | `$scroll_depth` | `depth` (percent) | once per page for each threshold reached |
| `delaySeconds` | `$time_on_page` | `seconds` | once per page after each delay |
| `exitIntent` | `$exit_intent` | none | once per page when a mouse leaves through the top of the window (desktop only) |

Every event goes through `track()`, so it carries `pageUrl`, `pagePath`, `pageTitle` and `referrer` for trigger conditions, and the server applies sampling, cooldowns and frequency caps. A survey a trigger opens never replaces one that is already open. Call `init()` again without `autoTrack` to stop.

## Floating launcher

```ts
const launcher = ResponseDock.launcher({
  surveyId: 'workspace/feedback',
  label: 'Feedback',
  position: 'bottom-right', // or 'bottom-left'
  theme: { primaryColor: '#0f766e', primaryTextColor: '#ffffff' },
});
launcher.destroy(); // removes the button
```

The launcher is a real `<button>` with `aria-haspopup="dialog"` and `aria-expanded`. It opens the standard modal (focus trap, Escape and backdrop close), and focus goes back to the button when the modal closes. It also accepts every `show()` option, such as `onComplete` and `autoCloseAfterMs`.

## Anonymous visitors

The SDK creates a random `anonymousId` for each browser, keeps it in `localStorage` (or in memory when storage is blocked) and sends it with every event. Sampling, holdouts, cooldowns and display caps then apply to each anonymous visitor individually. `reset()` (on logout, for example) deletes it, so the next person on the device starts with a new id.

## Keys and identity verification

The project key is public. Secret API keys used to create privileged admin or respondent embed sessions must stay on your server.

When the workspace uses identity verification, pass the hash your backend computes as `hex(HMAC-SHA256(identitySecret, externalUserId))`: `ResponseDock.identify({ externalUserId: user.id, userHash })`. The identity secret, like secret API keys, must never reach the browser.

See the [browser SDK documentation](https://docs.responsedock.com/docs/sdk/browser) and the
[share and embed guide](https://docs.responsedock.com/docs/guides/share-and-embed-how-to).
