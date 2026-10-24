# PHPForge Web Languages

Independent JavaScript, TypeScript, React and Vue language integration for PHPForge IDE 0.2.13. Install from the plugin catalog and explicitly grant project.read and workbench. Language UI code runs as a trusted workbench contribution. It does not receive Node APIs.

The package contributes TypeScript compiler configuration, actual framework declarations, a self-contained Vue/Volar worker, language providers and project snapshots. Monaco and its generic TypeScript worker are supplied by the IDE. Vue supports HTML single-file-component templates; Pug/Jade requires Node and is excluded. Bundled framework declarations permit offline use; local project declarations take priority.

Project snapshots preserve unsaved editor buffers, cap indexing at 750 source files/500 declarations/8 MiB and show partial-index feedback. Project reset cancels stale reads and releases owned models. Disabling unregisters Vue providers, markers, listeners, framework extra libraries and worker resources.

The Vue worker is gzip-compressed inside workbench.js and decompressed locally using browser DecompressionStream before creating a Blob worker. No CDN, remote imports or sibling repository is used. The package owns its worker runtime and framework types.

## Development

Node is build/test tooling only. Run npm ci --ignore-scripts, npm run build and npm test. To verify actual JavaScript JSDoc, TypeScript cross-file navigation, React prop/type inference, Vue template completion and diagnostics, imported component props, snapshots and disposal: npx playwright install webkit; npm run test:browser. CI checks both browser behavior and deterministic committed workbench.js output.

## Host integration

activate(sdk) registers sdk.provide('webLanguages', {installWebLanguages, WebProject, frameworkTypes, webLanguage}). APIs preserve their previous signatures. SDK supplies the existing Monaco instance, msg template function, own disposers and provide registration. WebProject accepts the permission-brokered read/tree/listFiles/workspace API. The host must stop calling a contribution after unregistration and reset owned snapshots on project switch. Generic Monaco worker bootstrapping stays in the IDE.

MIT implementation extracted from PHPForge. Third-party licenses are included in licenses/.
