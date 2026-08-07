import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";

const themeValidator = {
  id: v.string(),
  name: v.string(),
  backgroundColor: v.string(),
  textColor: v.string(),
  accentColor: v.string(),
  mutedColor: v.string(),
  surfaceColor: v.string(),
  fontFamily: v.string(),
  isDark: v.optional(v.boolean()),
  category: v.optional(
    v.union(v.literal("light"), v.literal("dark"), v.literal("editorial")),
  ),
};

async function migrateLegacyBoardId(ctx: MutationCtx, newBoardId: string) {
  const legacyItems = await ctx.db
    .query("items")
    .withIndex("by_boardId", (q) => q.eq("boardId", "main"))
    .collect();

  for (const item of legacyItems) {
    await ctx.db.patch(item._id, { boardId: newBoardId });
  }

  const legacyCheckpoints = await ctx.db
    .query("checkpoints")
    .withIndex("by_boardId", (q) => q.eq("boardId", "main"))
    .collect();

  for (const checkpoint of legacyCheckpoints) {
    await ctx.db.patch(checkpoint._id, { boardId: newBoardId });
  }
}

export const listBoards = query({
  args: {},
  handler: async (ctx) => {
    const boards = await ctx.db.query("boards").collect();
    return boards.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const ensureDefaultBoard = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("boards").first();
    if (existing) return existing._id;

    const boardId = await ctx.db.insert("boards", {
      name: "Untitled",
      sortOrder: 0,
      updatedAt: Date.now(),
    });

    await migrateLegacyBoardId(ctx, boardId);
    return boardId;
  },
});

export const createBoard = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const boards = await ctx.db.query("boards").collect();
    const maxOrder = boards.reduce((max, board) => Math.max(max, board.sortOrder), -1);

    return await ctx.db.insert("boards", {
      name: args.name?.trim() || "Untitled",
      sortOrder: maxOrder + 1,
      updatedAt: Date.now(),
    });
  },
});

export const renameBoard = mutation({
  args: { id: v.id("boards"), name: v.string() },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Board name cannot be empty");
    await ctx.db.patch(args.id, { name, updatedAt: Date.now() });
  },
});

export const updateBoardTheme = mutation({
  args: {
    id: v.id("boards"),
    theme: v.object(themeValidator),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      theme: args.theme,
      updatedAt: Date.now(),
    });
  },
});

export const deleteBoard = mutation({
  args: { id: v.id("boards") },
  handler: async (ctx, args) => {
    const boards = await ctx.db.query("boards").collect();
    if (boards.length <= 1) {
      throw new Error("Cannot delete the last board");
    }

    const boardId = args.id;
    const items = await ctx.db
      .query("items")
      .withIndex("by_boardId", (q) => q.eq("boardId", boardId))
      .collect();
    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    const checkpoints = await ctx.db
      .query("checkpoints")
      .withIndex("by_boardId", (q) => q.eq("boardId", boardId))
      .collect();
    for (const checkpoint of checkpoints) {
      await ctx.db.delete(checkpoint._id);
    }

    await ctx.db.delete(args.id);
  },
});

export const getItems = query({
  args: { boardId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("items")
      .withIndex("by_boardId", (q) => q.eq("boardId", args.boardId))
      .collect();
  },
});

export const saveItem = mutation({
  args: {
    id: v.optional(v.id("items")),
    type: v.union(
      v.literal('text'),
      v.literal('image'),
      v.literal('rect'),
      v.literal('arrow'),
    ),
    x: v.number(),
    y: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    content: v.string(),
    color: v.optional(v.string()),
    fontFamily: v.optional(v.string()),
    fontSize: v.optional(v.number()),
    zIndex: v.optional(v.number()),
    boardId: v.string(),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    if (id) {
      await ctx.db.patch(id, data);
      return id;
    } else {
      return await ctx.db.insert("items", data);
    }
  },
});

export const deleteItem = mutation({
  args: { id: v.id("items") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const createCheckpoint = mutation({
  args: { boardId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("items")
      .withIndex("by_boardId", (q) => q.eq("boardId", args.boardId))
      .collect();

    const checkpointItems = items.map(({ type, x, y, width, height, content, color, fontFamily, fontSize, zIndex }) => ({
      type,
      x,
      y,
      width,
      height,
      content,
      color,
      fontFamily,
      fontSize,
      zIndex,
    }));

    return await ctx.db.insert("checkpoints", {
      boardId: args.boardId,
      name: args.name,
      items: checkpointItems,
    });
  },
});

export const getCheckpoints = query({
  args: { boardId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("checkpoints")
      .withIndex("by_boardId", (q) => q.eq("boardId", args.boardId))
      .order("desc")
      .collect();
  },
});

export const restoreCheckpoint = mutation({
  args: { checkpointId: v.id("checkpoints") },
  handler: async (ctx, args) => {
    const checkpoint = await ctx.db.get(args.checkpointId);
    if (!checkpoint) throw new Error("Checkpoint not found");

    const currentItems = await ctx.db
      .query("items")
      .withIndex("by_boardId", (q) => q.eq("boardId", checkpoint.boardId))
      .collect();

    for (const item of currentItems) {
      await ctx.db.delete(item._id);
    }

    for (const item of checkpoint.items) {
      await ctx.db.insert("items", {
        ...item,
        boardId: checkpoint.boardId,
      });
    }
  },
});
