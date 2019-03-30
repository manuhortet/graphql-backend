import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";

import { sendPasswordReset } from "../../communications/email";
import { sendConfirmationEmail } from "../../communications/email";
import { MutationResolvers } from "../../generated/graphqlgen";
import { DateTimeInput, Int } from "../../generated/prisma-client";
import {
  AuthError,
  checkForPwnedPassword,
  getCode,
  getPasswordHash,
  getPersonId,
  InvalidLoginError,
  MissingFieldError,
  NotFoundError,
  validatePersonFields
} from "../../utils";

export const RESET_CODE_LIFESPAN = 1000 * 60 * 10; // 10 minutes

export const auth: Pick<
  MutationResolvers.Type,
  "signup" | "login" | "confirmEmail" | "sendPasswordReset" | "resetPassword"
> = {
  signup: async (parent, { email, name, password }, ctx) => {
    if (!process.env.APP_SECRET) {
      throw new Error("Server authentication error");
    }

    validatePersonFields(email, name, password);
    await checkForPwnedPassword(password);
    if (await ctx.prisma.$exists.person({ email })) {
      throw new Error("Email unavailable");
    }

    const hashedPassword = await getPasswordHash(password);
    const confirmationCode = getCode(6);
    const person = await ctx.prisma.createPerson({
      emailConfirmed: false,
      confirmationCode,
      email,
      name,
      password: hashedPassword,
      resetCodeValidUntil: new Date(0)
    });

    const token = jwt.sign({ personId: person.id }, process.env.APP_SECRET);
    if (process.env.NODE_ENV !== "dev") {
      sendConfirmationEmail(email, confirmationCode);
    }

    return {
      token,
      person
    };
  },

  login: async (parent, { email, password }, ctx) => {
    if (!process.env.APP_SECRET) {
      throw new Error("Server authentication error");
    }

    const person = await ctx.prisma.person({ email });
    if (!person) {
      throw new InvalidLoginError();
    }

    const valid = await bcrypt.compare(password, person.password);
    if (!valid) {
      throw new InvalidLoginError();
    }

    return {
      token: jwt.sign({ personId: person.id }, process.env.APP_SECRET),
      person
    };
  },

  confirmEmail: async (parent, { confirmationCode }, ctx) => {
    if (!confirmationCode) {
      throw new Error("No code");
    }
    const personId = getPersonId(ctx);
    const currentInfo = await ctx.prisma.person({ id: personId });

    if (confirmationCode !== currentInfo.confirmationCode) {
      throw new Error("Incorrect code");
    }

    return ctx.prisma.updatePerson({
      where: {
        id: personId
      },
      data: {
        emailConfirmed: true
      }
    });
  },
  sendPasswordReset: async (parent, { email }, ctx) => {
    if (!process.env.APP_SECRET) {
      throw new Error("Server authentication error");
    }
    if (!email) {
      throw new MissingFieldError("email");
    }
    const currentInfo = await ctx.prisma.person({ email });
    // if user is not found, return true anyway
    // (a different response could be used to confirm membership)
    if (!currentInfo) {
      return true;
    }
    const passwordResetCode = getCode(6);

    await ctx.prisma.updatePerson({
      where: {
        id: currentInfo.id
      },
      data: {
        passwordResetCode,
        resetCodeValidUntil: new Date(Date.now() + RESET_CODE_LIFESPAN)
      }
    });

    await sendPasswordReset(email, passwordResetCode);
    return true;
  },
  resetPassword: async (parent, { passwordResetCode, newPassword, email }, ctx) => {
    if (!process.env.APP_SECRET) {
      throw new Error("Server authentication error");
    }

    if (!email) {
      throw new Error("Email required");
    }

    const person = await ctx.prisma.person({ email });
    if (!person || !person.passwordResetCode) {
      // Same error if wrong email as wrong code for security
      throw new Error("Incorrect code");
    }

    const now = new Date();
    const resetCodeValidUntil = new Date(person.resetCodeValidUntil);

    if (resetCodeValidUntil < now) {
      throw new Error("Incorrect code");
    }
    if (person.passwordResetCode !== passwordResetCode) {
      throw new Error("Incorrect code");
    }

    await checkForPwnedPassword(newPassword);
    const hashedPassword = await getPasswordHash(newPassword);

    await ctx.prisma.updatePerson({
      where: {
        email
      },
      data: {
        password: hashedPassword,
        resetCodeValidUntil: new Date(0) // set to invalidate code
      }
    });

    return {
      token: jwt.sign({ personId: person.id }, process.env.APP_SECRET),
      person
    };
  }
};
