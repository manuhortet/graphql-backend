export class MaxAttemptsError extends Error {
  constructor() {
    super("Too many attempts.");
  }
}
