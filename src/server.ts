import { ApolloServer, gql, PubSub } from "apollo-server";
import * as fs from "fs";
import * as path from "path";

import { stopNotificationsQueueAsync } from "./communications/notifications";
import { prisma } from "./generated/prisma-client";
import resolvers from "./resolvers";
import { IWebSocketContext } from "./types";
import { AuthError } from './errors'

import { getPersonIdFromToken, graphQLRateLimit } from "./utils";

export const pubsub = new PubSub();
export const PORT = process.env.NODE_ENV === "test" ? 4001 : parseInt(process.env.PORT || "4000", 10);

const playground = ["dev", "test"].indexOf(process.env.NODE_ENV || "") > -1 ? { endpoint: "/" } : false;
const typeDefs = gql`
  ${fs.readFileSync(path.join(__dirname, "schema.graphql"), "utf8").toString()}
`;
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: req => {
    // This path is for WebSocket connections. TODO: open ticket about the bad types!
    // @ts-ignore
    if (req.connection) {
      return {
        // @ts-ignore
        ...req.connection.context,
        prisma
      } as IWebSocketContext;
    }
    // HTTP connections
    return {
      ...req,
      prisma
    };
  },
  playground,
  introspection: true,
  schemaDirectives: {
    rateLimit: graphQLRateLimit
  },
  subscriptions: {
    path: "/ws",
    onConnect: async (connectionParams: any, _) => {
      if (connectionParams.Authorization) {
        const personId = getPersonIdFromToken(connectionParams.Authorization);
        return prisma.$exists.person({ id: personId }).then(exists => {
          if (exists) {
            return {
              personId
            } as IWebSocketContext;
          }
          throw new AuthError();
        });
      }
      throw new AuthError();
    }
  }
});

export const startServer = async () => {
  await server.listen({ port: PORT }).then(({ url, subscriptionsUrl }) => {
    // tslint:disable-next-line:no-console
    console.log(`🚀 Server ready at ${url}`);
    // tslint:disable-next-line:no-console
    console.log(`🚀 Subscriptions ready at ${subscriptionsUrl}`);
  });
};

export const stopServer = async () => {
  await stopNotificationsQueueAsync();
  await server.stop();
};
