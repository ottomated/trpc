import { trpc } from '$lib/trpc/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	console.log('load /');
  await trpc.names.list.ssr(event);
};
