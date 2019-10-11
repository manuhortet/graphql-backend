import { createHash } from 'crypto';
import { inflect } from 'inflection';

/**
 * Checks Pwned Passwords, a database of passwords that have been exposed in data breaches.
 * Sends the first 5 characters of the SHA-1 hash to a remote server and receives a list of breached
 * hashes that start with those 5 characters.
 *
 * Throws an error if the password has been seen in a data breach.
 *
 * See more: https://haveibeenpwned.com/API/v2#PwnedPasswords
 * @param password the password to check
 */
export async function isPwned(password: string) {
  const hasher = createHash("sha1");
  hasher.update(password);
  const hash = hasher.digest("hex");

  const response = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`).then(r => r.text());
  const suffixes: { [suffix: string]: number } = {};
  response.split("\n").forEach(line => {
    const split = line.split(":");
    suffixes[split[0]] = parseInt(split[1], 10);
  });

  const count = suffixes[hash.toUpperCase().slice(5)] || 0;
  // tslint:disable-next-line:no-string-literal
  if (process.env.NODE_ENV !== "dev") {
    if (count > 0) {
      // FIXME: Type this error and move to /errors
      throw new Error(
        `This password has been seen ${count} ${inflect(
          "time",
          count
        )} in data breaches. Please choose a more secure one.`
      );
    }
  }
}