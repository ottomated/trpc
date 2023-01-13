import { createTRPCSvelte, httpBatchLink } from '@trpc/svelte-query';
import type { AppRouter } from './routes/_app';

export const trpc = createTRPCSvelte<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
    }),
  ],
});
