// Preserves Node's TAP output while treating an empty test selection as a failure.
import { tap } from 'node:test/reporters';

export default async function* report(source) {
  let selectedTests = 0;
  async function* checkedEvents() {
    for await (const event of source) {
      // Per-file summaries count real tests; the final summary can count an empty
      // file itself as a passing test when a name filter matches nothing.
      if (event.type === 'test:summary' && event.data.file) {
        selectedTests += event.data.counts.tests;
      }
      yield event;
    }
    if (selectedTests === 0) {
      process.exitCode = 1;
      yield { type: 'test:diagnostic', data: { nesting: 0, message: 'No tests matched the selection.' } };
    }
  }
  yield* tap(checkedEvents());
}
