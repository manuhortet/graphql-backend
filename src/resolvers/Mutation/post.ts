import { sendPostNotificationsAsync } from "../../communications/notifications";
import { MutationResolvers } from "../../generated/graphqlgen";

import { AuthError } from '../../errors'
import { getPersonId } from "../../utils";

export const post: Pick<MutationResolvers.Type, "createPost" | "editPost" | "deletePost"> = {
  createPost: async (parent, { threadId, content }, ctx, info) => {
    const personId = getPersonId(ctx);
    const isGroupMember = await ctx.prisma.$exists.group({
      members_some: {
        id: personId
      },
      threads_some: {
        id: threadId
      }
    });
    if (!isGroupMember) {
      throw new AuthError();
    }

    const newPost = await ctx.prisma.createPost({
      content,
      firstPost: false,
      author: {
        connect: {
          id: personId
        }
      },
      thread: {
        connect: {
          id: threadId
        }
      }
    });

    // Add notifications for all other group members to queue
    const authorName = await ctx.prisma.person({ id: personId }).name();
    const threadTitle = await ctx.prisma.thread({ id: threadId }).title();
    const groupMemberIds = await ctx.prisma
      .thread({ id: threadId })
      .group()
      .members()
      .then(persons => persons.map(person => person.id).filter(id => id !== personId));
    await sendPostNotificationsAsync(groupMemberIds, authorName, threadTitle, content);

    return newPost;
  },

  editPost: async (parent, { postId, content }, ctx, info) => {
    const personId = getPersonId(ctx);
    const isAuthor = await ctx.prisma.$exists.post({
      id: postId,
      author: {
        id: personId
      }
    });
    if (!isAuthor) {
      throw new AuthError();
    }
    return await ctx.prisma.updatePost({
      where: {
        id: postId
      },
      data: {
        content
      }
    });
  },

  deletePost: async (parent, { postId }, ctx, info) => {
    const personId = getPersonId(ctx);
    const isAuthor = await ctx.prisma.$exists.post({
      id: postId,
      author: {
        id: personId
      }
    });
    if (!isAuthor) {
      throw new AuthError();
    }
    await ctx.prisma.deletePost({
      id: postId
    });

    return {
      id: postId,
      success: true,
      message: `Successfully deleted post`
    };
  }
};
