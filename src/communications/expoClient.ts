import Expo, { ExpoPushMessage, ExpoPushReceipt } from "expo-server-sdk";

import { prisma } from "../generated/prisma-client";

export const expo = new Expo();
// Used if we need to slow down notifications because of rate limiting
// TODO: as it is, this only ever goes up!
export let NOTIFICATION_DELAY_EXP = 0;
const ticketIdToToken: { [ticketId: string]: string } = {};

export const sendNotifications = async (messages: ExpoPushMessage[]) =>
  expo.sendPushNotificationsAsync(messages).then(tickets => {
    // Save a mapping of ticket ID to pushToken. This is so we can remove any push tokens for which the
    // device cannot receive notifications any longer.
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket.status === "ok") {
        const notification: ExpoPushMessage = messages[i];
        ticketIdToToken[ticket.id] = notification.to;
      } else {
        processErrorReceipt(ticket);
      }
    }

    return tickets;
  });

export const processReceipts = async (receiptIds: string[]) =>
  expo.getPushNotificationReceiptsAsync(receiptIds).then(async receipts => {
    const promises = Object.keys(receipts).map(id => processErrorReceipt(receipts[id], id));
    await Promise.all(promises);
  });

const processErrorReceipt = async (receipt: ExpoPushReceipt, id?: string): Promise<void> => {
  if (receipt.status === "ok") {
    throw new Error("Received an 'ok' receipt in the error processing queue!");
  }

  // If there are errors, attempt to handle them here.
  // TODO: Note that we don't actually retry sending the push notification(s) that failed.
  // Error documentation: https://docs.expo.io/versions/latest/guides/push-notifications/#receipt-response-format
  const error = receipt.details && receipt.details.error;
  if (error === "DeviceNotRegistered" && id) {
    // The device cannot receive push notifications anymore. Remove the token from our database so we don't keep
    // trying.
    const token = ticketIdToToken[id];
    await prisma.deletePushToken({ token });
  } else if (error === "MessageTooBig") {
    // tslint:disable-next-line:no-console
    console.error("Push notification was too long.");
  } else if (error === "InvalidCredentials") {
    throw new Error("Push notification credentials are invalid!");
  }
  if (error === "MessageRateExceeded") {
    // We need to slow down.
    NOTIFICATION_DELAY_EXP++;
  } else {
    NOTIFICATION_DELAY_EXP = 0;
  }

  if (id) {
    delete ticketIdToToken[id];
  }
};
