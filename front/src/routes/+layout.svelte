<script lang="ts">
	// import { init } from '@telegram-apps/sdk-svelte';
	// try {
	// 	init();
	// } catch (e) {
	// 	console.error(e);
	// }

	import '../app.css';
	let { children } = $props();
</script>

<div class="h-screen w-screen">
	{@render children()}
</div>
