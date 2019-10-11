import { createRateLimitDirective } from "graphql-rate-limit";

export const graphQLRateLimit = createRateLimitDirective({
  identifyContext: ctx => ctx.prisma.person.id,
  formatError: ({ fieldName }) => {
    return `Woah there, you are doing way too much ${fieldName}`;
  }
});
