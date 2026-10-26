// Fails an empty name selection while leaving Vitest's default reporting intact.
export default class SelectionReporter {
  onTestRunEnd(modules) {
    const ranTest = modules.some(module => [...module.children.allTests()]
      .some(test => ['passed', 'failed'].includes(test.result().state)));
    if (!ranTest) {
      console.error('No tests matched the selection.');
      process.exitCode = 1;
    }
  }
}
