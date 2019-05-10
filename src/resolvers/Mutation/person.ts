import * as bcrypt from "bcryptjs";

import { sendConfirmationEmail } from "../../communications/email";
import { MutationResolvers } from "../../generated/graphqlgen";
import {
  AuthError,
  checkForPwnedPassword,
  getCode,
  getPasswordHash,
  getPersonId,
  InvalidPasswordError,
  validatePersonFields
} from "../../utils";

export const person: Pick<
  MutationResolvers.Type,
  "deletePerson" | "updatePerson" | "addPushToken" | "deletePushToken"
> = {
  updatePerson: async (parent, { email, name, oldPassword, newPassword }, ctx) => {
    let hash;
    let confirmationCode;
    let emailConfirmed;
    const personId = getPersonId(ctx);
    const currentInfo = await ctx.prisma.person({ id: personId });
    if (!currentInfo) {
      throw new AuthError();
    }

    if (!email && !name && !newPassword) {
      throw new Error("Did not receive fields to update");
    }

    // in case we did not receive a field to validate, pass a dummy value that will pass validation.
    // this is so we can use the same validator in the login and signup resolvers.
    validatePersonFields(email || "dummy@dummy.com", name || "dummy name", newPassword || "dummy password");

    const valid = oldPassword && (await bcrypt.compare(oldPassword, currentInfo.password));
    if (!valid) {
      throw new InvalidPasswordError();
    }

    if (newPassword) {
      await checkForPwnedPassword(newPassword);
      hash = await getPasswordHash(newPassword);
    }

    if (email && email !== currentInfo.email) {
      if (await ctx.prisma.$exists.person({ email })) {
        throw new Error("Email unavailable");
      }

      if (process.env.NODE_ENV !== "env") {
        confirmationCode = getCode(6);
        emailConfirmed = false;
        sendConfirmationEmail(email, confirmationCode);
      }
    }

    return ctx.prisma.updatePerson({
      where: {
        id: personId
      },
      data: {
        email: email as string | undefined,
        password: hash as string | undefined,
        name: name as string | undefined,
        confirmationCode: confirmationCode as string | undefined,
        emailConfirmed: emailConfirmed as boolean | undefined
      }
    });
  },

  deletePerson: async (parent, { password }, ctx) => {
    if (!password) {
      throw new AuthError();
    }
    const personId = getPersonId(ctx);
    const currentPassword = await ctx.prisma.person({ id: personId }).password();
    const valid = await bcrypt.compare(password, currentPassword);
    if (!valid) {
      throw new AuthError();
    }

    await ctx.prisma.deletePerson({ id: personId });
    return {
      id: personId,
      success: true,
      message: `Successfully deleted person`
    };
  },

  addPushToken: async (parent, { token }, ctx) => {
    const personId = getPersonId(ctx);
    return ctx.prisma.updatePerson({
      where: {
        id: personId
      },
      data: {
        pushTokens: {
          create: {
            token
          }
        }
      }
    });
  },

  deletePushToken: async (parent, { token }, ctx) => {
    const personId = getPersonId(ctx);
    if (
      !ctx.prisma.$exists.person({
        id_not: personId,
        pushTokens_some: { token }
      })
    ) {
      throw new Error(`Token ${token} not affiliated with user.`);
    }
    try {
      await ctx.prisma.deletePushToken({ token });
    } catch {
      return {
        id: token,
        success: false,
        message: "Failed to delete token"
      };
    }
    return {
      id: token,
      success: true,
      message: "Push token deleted"
    };
  }
};
