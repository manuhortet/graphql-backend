import { MutationResolvers } from "../../generated/graphqlgen";
import { validateMember, getPersonId } from "../../utils";

export const group: Pick<MutationResolvers.Type, "createGroup" | "updateGroup" | "joinGroup" | "leaveGroup"> = {
  createGroup: async (parent, { name, description }, ctx, info) => {
    const personId = getPersonId(ctx);
    const groupExists = await ctx.prisma.$exists.group({ name });
    if (groupExists) {
      throw new Error("A group with that name already exists");
    }

    return ctx.prisma.createGroup({
      name,
      description: description as string | undefined,
      members: {
        connect: { id: personId }
      },
      threads: {
        create: {
          title: "Welcome!",
          pinned: true,
          posts: {
            create: {
              content: "Welcome to your new group! Use this thread to introduce yourself.",
              firstPost: true,
              author: {
                connect: {
                  email: "wobbly@wobbly.app"
                }
              }
            }
          }
        }
      }
    });
  },

  updateGroup: async (parent, { groupId, name, description }, ctx) => {
    const personId = getPersonId(ctx);
    await validateMember(ctx, groupId);

    if (!name) {
      throw new Error("Cannot unset group name.");
    }

    return ctx.prisma.updateGroup({
      data: {
        name,
        description: description || ""
      },
      where: {
        id: groupId
      }
    });
  },

  joinGroup: (parent, { groupId }, ctx, info) => {
    const personId = getPersonId(ctx);
    return ctx.prisma.updateGroup({
      data: {
        members: {
          connect: { id: personId }
        }
      },
      where: {
        id: groupId
      }
    });
  },

  leaveGroup: async (parent, { groupId }, ctx, info) => {
    const personId = getPersonId(ctx);
    await validateMember(ctx, groupId);

    const leftGroup = await ctx.prisma.updateGroup({
      where: { id: groupId },
      data: {
        members: {
          disconnect: {
            id: personId
          }
        }
      }
    });
    return {
      id: leftGroup.id,
      success: true,
      message: `Successfully left group ${leftGroup.name}`
    };
  }
};
