# Validation

Validated on 2026-10-17 using Node.js 20.19.4.

## Automated checks

- `npm run lint`: passed, no warnings.
- `npm run typecheck`: passed with TypeScript strict mode.
- `npm test`: 51 tests passed across 6 files.
- `npm run build`: passed using the configured Next.js webpack builder, including Next.js's TypeScript check.
- Dependency declarations match the included lockfile.

The tests cover deterministic mock execution; exact Writer → Reviewer ordering; passing the complete draft, original request, and history; failed and timed-out stages; cancellation; missing live configuration; configurable provider selection; no external requests in mock mode; official SDK request mapping; incomplete live output; request validation and size/deadline bounds; same-origin handling; JSON/SSE contracts; fragmented SSE decoding; network interruption; and bounded conversation history.

## Browser checks

Chromium checked at 1440 × 960 and 390 × 844. The main desktop/mobile conversation flow passed against both the development server and the optimized production server:

- Initial page, composer, and clearly labeled mock mode.
- Actual Writer and Reviewer progress events and complete final answer.
- Draft/final comparison panel.
- Multi-turn context and reload persistence.
- New conversation reset, including persistence after reload.
- Stop restores the message without resubmitting it.
- Network failure followed by successful retry.
- Mobile layout without horizontal overflow and a successful mobile chat.
- Reviewer failure shows an explicit unreviewed warning and no Reviewed badge; the warning survives reload.
- Keyboard multiline input.
- Configuration error presentation.
- Browser storage unavailable: a visible notice and a still-functional chat.

No client-side exceptions were observed during the successful browser flows. Automated axe-core checks of the initial desktop screen and mobile fallback/comparison state reported no WCAG 2 A/AA or WCAG 2.1 AA rule violations. These checks do not replace a full manual accessibility audit.

Browser tooling was run from temporary tooling outside the application dependencies. The Vitest suite is retained in `tests/` and is reproducible with `npm ci && npm test`.

## Unverified external behavior

No real API credentials were available or used. Real adapter contracts were tested with mocked official SDK calls; selected model availability, live account permissions, and live output quality need a credentialed smoke test after setting `.env.local`.
