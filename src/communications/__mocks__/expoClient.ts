import Expo, { ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";

export const expo = new Expo();
const ticketIdToToken: { [ticketId: string]: string } = {};

export const sendNotifications = async (messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> =>
  new Promise(resolve => {
    // TODO: also write tests for failing notifications
    setTimeout(() => {
      const tickets = messages.map(msg => ({ id: `ticketIdTo${msg.to}`, status: "ok" as "ok" }));
      for (let i = 0; i < tickets.length; i++) {
        const ticketId = tickets[i].id;
        const notification: ExpoPushMessage = messages[i];
        ticketIdToToken[ticketId] = notification.to;
      }
      resolve(tickets);
    }, 100);
  });

export const processReceipts = async (receiptIds: string[]) => {
  receiptIds.forEach(receiptId => {
    delete ticketIdToToken[receiptId];
  });
};
