import type { LayoutLoad } from './$types';

import { init } from '@telegram-apps/sdk-svelte';

import { browser } from '$app/environment';
if (browser) {
	try {
		init();
	} catch (e) {
		console.error(e);
	}
}

export const ssr = false;
export const csr = true;
// export const prerender = true;

export const load = (async () => {
	return {};
}) satisfies LayoutLoad;
