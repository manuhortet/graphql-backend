import request, { GraphQLClient } from "graphql-request";

import { notificationsQueue } from "../communications/notifications";
import { Group, Person, prisma } from "../generated/prisma-client";
import { PORT, startServer, stopServer } from "../server";
import { getLoginMutation } from "../testutils";

jest.mock("../communications/expoClient");
const HOST = `http://localhost:${PORT}`;
let aliceClient: GraphQLClient;
let bobClient: GraphQLClient;
let bobId: string;

const notificationBody = "Lorem ipsum";
const threadTitle = "Thread for notifications";
const notification = {
  body: notificationBody,
  priority: "high",
  sound: "default",
  title: `Alice in ${threadTitle}`,
  to: "test-token"
};

beforeAll(async () => {
  await startServer();
  notificationsQueue.testMode.enter(); // https://github.com/Automattic/kue#testing

  // Users defined in prisma/seed.graphql
  const aliceToken = await request(HOST, getLoginMutation("alice@wobbly.app", "secret42")).then(
    (response: any) => response.login.token
  );
  aliceClient = new GraphQLClient(HOST, {
    headers: { Authorization: `Bearer ${aliceToken}` }
  });
  await aliceClient.request(`query { me { id } }`).then((resp: any) => (resp.me as Person).id);

  const bobToken = await request(HOST, getLoginMutation("bob@wobbly.app", "secret43")).then(
    (response: any) => response.login.token
  );
  bobClient = new GraphQLClient(HOST, {
    headers: { Authorization: `Bearer ${bobToken}` }
  });
  bobId = await bobClient.request(`query { me { id } }`).then((resp: any) => (resp.me as Person).id);
});

afterEach(() => {
  notificationsQueue.testMode.clear();
});

describe("notifications", () => {
  let threadId: string;

  // This must come before the tests for the notifications queue -- this is because notifications are only sent to
  // accounts with one or more push tokens.
  it("can add a push token", async () => {
    const pushTokenExists = await prisma.$exists.pushToken({
      person: {
        id: bobId
      }
    });
    expect(pushTokenExists).toBeFalsy();

    await bobClient.request(`mutation { addPushToken(token: "test-token") { id } } `);
    const pushTokens = await prisma.pushTokens({
      where: {
        person: {
          id: bobId
        }
      }
    });
    expect(pushTokens.length).toEqual(1);
  });

  it("adds a notification to the queue on new thread", async () => {
    expect(notificationsQueue.testMode.jobs.length).toEqual(0);
    const groupId = await aliceClient
      .request(`query { groups { id, name } }`)
      .then((r: any) => r.groups.filter((g: Partial<Group>) => g.name === "Shared group")[0].id);
    threadId = await aliceClient
      .request(
        `mutation {
      createThread(groupId: "${groupId}", title: "${threadTitle}", content: "${notificationBody}") {
        id
      }
    }`
      )
      .then((r: any) => r.createThread.id);
    // Note that there are notifications in the queue because Alice made a new thread, and Bob has push notification
    // tokens set. If Bob had made the thread, he would not receive a push notification himself.
    expect(notificationsQueue.testMode.jobs.length).toEqual(1);
    expect(notificationsQueue.testMode.jobs[0].type).toEqual("notificationChunk");
    expect(notificationsQueue.testMode.jobs[0].data).toEqual([notification]);
  });

  it("adds a notification to the queue on new post", async () => {
    expect(notificationsQueue.testMode.jobs.length).toEqual(0);
    await aliceClient.request(`mutation {
      createPost(threadId: "${threadId}", content: "${notificationBody}") {
        id
      }
    }`);
    expect(notificationsQueue.testMode.jobs.length).toEqual(1);
    expect(notificationsQueue.testMode.jobs[0].type).toEqual("notificationChunk");
    expect(notificationsQueue.testMode.jobs[0].data).toEqual([notification]);
  });

  // Must come after notifications queue tests
  it("can add multiple push tokens", async () => {
    await bobClient.request(`mutation { addPushToken(token: "test-token-2") { id } } `);
    const pushTokens = await prisma.pushTokens({
      where: {
        person: {
          id: bobId
        }
      }
    });
    expect(pushTokens.length).toEqual(2);
  });

  it("can delete push tokens", async () => {
    await bobClient.request(`mutation { deletePushToken(token: "test-token") { id } } `);
    const pushTokens = await prisma.pushTokens({
      where: {
        person: {
          id: bobId
        }
      }
    });
    expect(pushTokens.length).toEqual(1);

    await bobClient.request(`mutation { deletePushToken(token: "test-token-2") { id } } `);
    const pushTokensExist = await prisma.$exists.pushToken({
      person: {
        id: bobId
      }
    });
    expect(pushTokensExist).toBeFalsy();
  });

  it("can handle duplicate tokens", async () => {
    await bobClient.request(`mutation { addPushToken(token: "test-token") { id } } `);
    let pushTokens = await prisma.pushTokens({
      where: {
        person: {
          id: bobId
        }
      }
    });
    expect(pushTokens.length).toEqual(1);

    await bobClient.request(`mutation { addPushToken(token: "test-token") { id } } `);
    pushTokens = await prisma.pushTokens({
      where: {
        person: {
          id: bobId
        }
      }
    });
    expect(pushTokens.length).toEqual(1);
  });

  it("does not let you overwrite other's tokens", async () => {
    const check = async () => {
      await aliceClient.request(`mutation { addPushToken(token: "test-token") { id } } `);
    };
    await expect(check()).rejects.toThrow();
  });
});

afterAll(async () => {
  await bobClient.request(`mutation { deletePushToken(token: "test-token") { id } } `);
  notificationsQueue.testMode.exit();
  await stopServer();
});
