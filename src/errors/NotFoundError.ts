export class NotFoundError extends Error {
  constructor(recordType: string) {
    super(`${recordType} not found.`);
  }
}
