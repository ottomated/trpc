import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { procedure, router } from '../server';

const db = new Map<string, string>();

export const nameRouter = router({
  list: procedure.query(() => {
    return [...db.entries()].map(([id, name]) => ({ id, name }));
  }),
  get: procedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(({ input }) => {
      return db.get(input.id);
    }),
  add: procedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .mutation(({ input }) => {
      db.set(crypto.randomUUID(), input.name);
    }),
  delete: procedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(({ input }) => {
      db.delete(input.id);
    }),
  update: procedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
      }),
    )
    .mutation(({ input }) => {
      if (!db.has(input.id)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
        });
      }
      db.set(input.id, input.name);
      return input;
    }),
});
