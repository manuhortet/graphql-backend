import { compare } from 'bcryptjs';

import { sendConfirmationEmail } from "../../communications/email";
import { MutationResolvers } from "../../generated/graphqlgen";
import { Person } from "../../generated/prisma-client";

import { AuthError, WrongPasswordError } from '../../errors';
import {
  checkPasswordSecurity,
  getCode,
  getPasswordHash,
  getPersonId,
  validatePersonFields,
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

    const valid = oldPassword && (await compare(oldPassword, currentInfo.password));
    if (!valid) {
      throw new WrongPasswordError();
    }

    if (newPassword) {
      await checkPasswordSecurity(newPassword);
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
    const valid = await compare(password, currentPassword);
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

    // Check if the token exists already
    const tokenExists = await ctx.prisma.$exists.pushToken({ token });
    if (tokenExists) {
      // If it does, verify that it matches the current person
      const tokenIsAffiliated = await ctx.prisma.$exists.person({
        id: personId,
        pushTokens_some: { token }
      });
      if (tokenIsAffiliated) {
        // Do nothing
        return ctx.prisma.person({ id: personId }) as Promise<Person>;
      } else {
        // Throw an error -- don't allow people to modify tokens belonging to another account
        throw new AuthError();
      }
    }

    // The token does not exist already; create it.
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
    const tokenExistsAndAffiliated = await ctx.prisma.$exists.person({
      id: personId,
      pushTokens_some: { token }
    });

    if (!tokenExistsAndAffiliated) {
      return {
        id: token,
        success: false,
        message: "Failed to delete token."
      };
    }

    await ctx.prisma.deletePushToken({ token });
    return {
      id: token,
      success: true,
      message: "Push token deleted."
    };
  }
};
