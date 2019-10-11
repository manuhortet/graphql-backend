import { QueryResolvers } from "../generated/graphqlgen";
import { GroupSearchResponse } from "../types";
import { getPersonId, isValidatedPerson } from "../utils";

export const Query: QueryResolvers.Type = {
  ...QueryResolvers.defaultResolvers,
  groups: (parent, args, ctx) => {
    const id = getPersonId(ctx);
    return ctx.prisma.person({ id }).groups({ orderBy: "createdAt_DESC" });
  },
  group: (parent, { id }, ctx) => {
    return ctx.prisma.group({ id });
  },
  me: (parent, args, ctx) => {
    const id = getPersonId(ctx);
    return ctx.prisma.person({ id });
  },
  searchGroups: async (parent, { searchQuery }, ctx) => {
    await isValidatedPerson(ctx);
    // TODO: handle languages other than english!
    // TODO: paginate, don't limit number of results
    const stage = process.env.NODE_ENV;
    const sqlQuery = `
      SELECT id, name, description, ts_rank(to_tsvector('english', name || ' ' || description), plainto_tsquery('english', '${searchQuery}')) AS rank
      FROM "wobbly$${stage}"."Group"
      WHERE to_tsvector('english', name || ' ' || description) @@ plainto_tsquery('english', '${searchQuery}')
      ORDER BY rank DESC
      LIMIT 25
      `
      .replace(/"/g, '\\"')
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ");
    return ctx.prisma
      .$graphql(
        `
      mutation {
        executeRaw(query: "${sqlQuery}")
      }
    `
      )
      .then((response: any) => response.executeRaw as GroupSearchResponse[]);
  },
  // TODO: One day it'd be nice to order these by most recent activity.
  // It's not supported by Prisma at the moment so we do it client-side.
  // If/when Prisma supports ordering by multiple fields, we can at least return threads
  // ordered by creation date (after they're ordered by pinned/unpinned) as an approximation of recent activity.
  threads: (parent, { groupId }, ctx) => {
    return ctx.prisma.threads({
      where: {
        group: {
          id: groupId
        }
      },
      orderBy: "pinned_DESC"
    });
  },
  posts: (parent, { threadId }, ctx) => {
    return ctx.prisma.posts({
      where: {
        thread: {
          id: threadId
        }
      },
      orderBy: "createdAt_DESC"
    });
  }
};
