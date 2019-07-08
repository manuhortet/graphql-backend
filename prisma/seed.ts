import { prisma } from "../src/generated/prisma-client";

async function main() {
  // Create test data: alice and bob + their groups
  // Be careful when editing this! A lot of tests are dependent on the contents.
  await prisma.createPerson({
   email: "alice@wobbly.app",
   name: "Alice",
   password: "$2b$10$dqyYw5XovLjpmkYNiRDEWuwKaRAvLaG45fnXE5b3KTccKZcRPka2m", // "secret42"
   groups: {
     create: [
       {
         name: "Alice's group",
         description: "This is Alice's group for testing purposes. Word for search tests: supernova."
       },
       {
         name: "Shared group",
         description: "This is a shared group for testing purposes."
       }
     ]
   },
   emailConfirmed: true,
   resetCodeValidUntil: "2019-03-19T04:52:38+00:00",
   passwordResetCode: "111111"
  })
  await prisma.createPerson({
   email: "bob@wobbly.app",
   name: "Bob",
   password: "$2b$10$o6KioO.taArzboM44Ig85O3ZFZYZpR3XD7mI8T29eP4znU/.xyJbW", // "secret43"
   groups: {
     create: {
       name: "Bob's group",
       description: "This is Bob's group for testing purposes"
     },
     connect: {
       name: "Shared group"
     }
   },
   emailConfirmed: true,
   passwordResetCode: "111111"
  })

  // Production data
  // The dummy user that creates the first thread in new groups
  await prisma.createPerson({
   email: "wobbly@wobbly.app",
   name: "Wobbly",
   password: "", // not a valid hash, i.e. no-one can log in as this user
   emailConfirmed: true,
  })
}

main()
