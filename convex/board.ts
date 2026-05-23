import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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
    type: v.union(v.literal('text'), v.literal('image')),
    x: v.number(),
    y: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    content: v.string(),
    color: v.optional(v.string()),
    fontFamily: v.optional(v.string()),
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

    const checkpointItems = items.map(({ type, x, y, width, height, content, color, fontFamily }) => ({
      type,
      x,
      y,
      width,
      height,
      content,
      color,
      fontFamily,
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
