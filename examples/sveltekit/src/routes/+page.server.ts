import { trpc } from '$lib/trpc/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  await trpc.names.list.ssr(event);
};
