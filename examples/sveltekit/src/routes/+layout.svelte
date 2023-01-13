<script lang="ts">
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';

	const client = new QueryClient();
</script>

<QueryClientProvider {client}>
	<slot />
</QueryClientProvider>
