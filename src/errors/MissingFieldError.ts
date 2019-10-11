export class MissingFieldError extends Error {
  constructor(requiredField: string) {
    super(`Must have ${requiredField}.`);
  }
}
