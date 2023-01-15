import { trpc } from '$lib/trpc/client';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	console.log('layout load' + event.route.id);
  return {
    trpc: trpc.ssr(event),
  };
};
