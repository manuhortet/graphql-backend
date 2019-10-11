import { AuthError } from '../errors'
import { IContext } from '../types';
import { getPersonId } from '../utils';


/* Verifies that the user is a member of the group with `groupId`.
 * If not, throws an `AuthError`. */

export async function isMember(ctx: IContext, groupId: string) {
  const personId = getPersonId(ctx);
  const isMember = await ctx.prisma.$exists.group({
    id: groupId,
    members_some: {
      id: personId
    }
  });
  if (!isMember) {
    throw new AuthError();
  }
}