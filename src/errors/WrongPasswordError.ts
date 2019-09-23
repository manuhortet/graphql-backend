export class WrongPasswordError extends Error {
  constructor() {
    super("Invalid password");
  }
}
