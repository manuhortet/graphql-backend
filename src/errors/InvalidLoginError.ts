export class InvalidLoginError extends Error {
  constructor() {
    super("Incorrect email or password");
  }
}
