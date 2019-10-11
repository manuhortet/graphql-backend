import { getPersonId } from '.';

import { AuthError } from '../errors'
import { IContext } from "../types";


export async function isValidatedPerson(ctx: IContext) {
  const personId = getPersonId(ctx);
  const personExists = await ctx.prisma.$exists.person({
    id: personId
  });
  if (!personExists) {
    throw new AuthError();
  }
}
