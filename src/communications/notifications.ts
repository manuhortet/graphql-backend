import cliTruncate from "cli-truncate";
import { ExpoPushMessage } from "expo-server-sdk";
import kue, { DoneCallback, Job } from "kue";

import { prisma } from "../generated/prisma-client";

import * as expoClient from "./expoClient";

export const notificationsQueue = kue.createQueue({
  redis: process.env.REDIS_URL
});
// https://github.com/Automattic/kue#unstable-redis-connections
notificationsQueue.watchStuckJobs(5000);

notificationsQueue.process("notificationChunk", async (job: Job, done: DoneCallback) => {
  await expoClient.sendNotifications(job.data).then(tickets => {
    // Delay the ticket 5 minutes -- it can take Expo a while to deliver push notifications when the servers are busy
    // (up to 30 mins)
    const delay = process.env.NODE_ENV === "PRODUCTION" ? 300000 : 5000;
    notificationsQueue
      .create("ticketChunk", tickets)
      .delay(300000)
      .attempts(3)
      .priority("low")
      .save();
  });
  done();
});

notificationsQueue.process("ticketChunk", async (job: Job, done: DoneCallback) => {
  await expoClient.processReceipts(job.data.map((c: any) => c.id));
  done();
});

notificationsQueue.on("error", err => {
  // tslint:disable-next-line:no-console
  console.error(`Error in notificationsQueue: ${err}`);
});

/**
 * Add push notifications for a new post to the notification queue
 * @param groupMemberIds the IDs of everyone who should receive a notification. Make sure to filter out the author.
 * @param authorName the name of author to be shown
 * @param threadTitle the thread title to be shown
 * @param content the post content. This will be truncated to 100 characters.
 */
export const sendPostNotificationsAsync = async (
  groupMemberIds: string[],
  authorName: string,
  threadTitle: string,
  content: string
) => {
  const tokens = await prisma.pushTokens({
    where: {
      person: {
        id_in: groupMemberIds
      }
    }
  });
  const notifications = tokens.map(
    token =>
      ({
        to: token.token,
        sound: "default",
        title: `${authorName} in ${threadTitle}`,
        body: cliTruncate(content, 100),
        priority: "high"
      } as ExpoPushMessage)
  );
  const chunks = expoClient.expo.chunkPushNotifications(notifications);
  chunks.forEach(chunk => {
    notificationsQueue
      .create("notificationChunk", chunk)
      .priority("high")
      .attempts(3)
      .delay(Math.pow(1000, expoClient.NOTIFICATION_DELAY_EXP))
      .backoff({ delay: 30000, type: "fixed" })
      .ttl(1800000) // 30 mins. if it takes us this long to send notifications something is very wrong anyway
      .save();
  });
};

export const stopNotificationsQueueAsync = async () => {
  return new Promise((resolve, reject) => {
    notificationsQueue.shutdown(5000, (err: any) => {
      if (err) {
        reject(err);
      }
      resolve();
    });
  });
};
