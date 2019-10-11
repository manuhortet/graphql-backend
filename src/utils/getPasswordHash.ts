import { hash } from 'bcryptjs';


/* Auto-generates a salt, then hashes it with the password.
bcrypt is made specifically for password hashing. */

export async function getPasswordHash(password: string) {
  return await hash(password, 10);
}

