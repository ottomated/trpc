import { trpc } from '$lib/trpc/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { params } = event;
	console.log('load /names/' + params.id);
  await trpc.names.get.ssr({ id: params.id }, event);
};
