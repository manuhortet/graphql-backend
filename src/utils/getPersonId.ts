import * as jwt from "jsonwebtoken";


export function getPersonIdFromToken(token: string) {
  if (process.env.APP_SECRET) {
    const { personId } = jwt.verify(token.replace("Bearer ", ""), process.env.APP_SECRET) as {
      personId: string;
    };
    if (personId) {
      return personId;
    }
  }

  throw new AuthError();
}

export function getPersonId(ctx: IContext) {
  const token = ctx.req.get("Authorization");
  if (token) {
    return getPersonIdFromToken(token);
  }

  throw new AuthError();
}