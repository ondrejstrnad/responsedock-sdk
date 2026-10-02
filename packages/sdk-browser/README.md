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

Use `identify()` for a known respondent, `track()` for event-triggered surveys, `show()` for a modal, and `updateTheme()` for live theme changes. The renderer handles responsive iframe height, uploads, conditional logic, presentation images, banners, and confidential answers without additional host code.

The project key is public. Secret API keys used to create privileged admin or respondent embed sessions must stay on your server.

When the workspace uses identity verification, pass the hash your backend computes as `hex(HMAC-SHA256(identitySecret, externalUserId))`: `ResponseDock.identify({ externalUserId: user.id, userHash })`. The identity secret, like secret API keys, must never reach the browser.

See the [browser SDK documentation](https://docs.responsedock.com/docs/sdk/browser) and the
[share and embed guide](https://docs.responsedock.com/docs/guides/share-and-embed-how-to).
