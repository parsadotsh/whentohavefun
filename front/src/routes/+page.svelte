<script module>
	export type UsersMap = Map<
		number,
		{
			id: number;
			name: string;
			avatar?: string;
			color: string;
			initials: string;
			isAdmin: boolean;
		}
	>;
</script>

<script lang="ts">
	import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date';
	import Calendar from './Calendar.svelte';
	import type { PageData } from './$types';

	import { create } from 'mutative';

	import Button from '$lib/components/ui/button/button.svelte';

	import PhX from '~icons/ph/x';
	import PhCheckCircleFill from '~icons/ph/check-circle-fill';
	import PhXCircleFill from '~icons/ph/x-circle-fill';

	import Card from '$lib/components/ui/card/card.svelte';
	import Avatar from '$lib/components/ui/avatar/avatar.svelte';
	import { AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';

	import { processUpdate } from '../../../src/state/index';
	import type {
		RoomState,
		ServerPacket,
		ClientStateUpdatePayload,
		ClientPacket,
		StateUpdate
	} from '../../../src/state/index';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Textarea } from '$lib/components/ui/textarea';

	import { initDataRaw, useLaunchParams, useSignal } from '@telegram-apps/sdk-svelte';
	import * as Dialog from '$lib/components/ui/dialog/';
	import { onMount } from 'svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { doc } from 'prettier';

	let realState = $state(null) as RoomState | null;

	let fakeState: RoomState | null = $state(null);

	let roomState = $derived(fakeState ?? realState);

	function initalsAndColor(id: any, name: string) {
		if (typeof +id !== 'number') id = 5;
		const colors = [
			'#FF6B6B',
			'#4ECDC4',
			'#45B7D1',
			'#96CEB4',
			'#FFEEAD',
			'#D4A5A5',
			'#9B59B6',
			'#3498DB',
			'#E74C3C',
			'#2ECC71'
		];
		const initials = name
			.split(' ')
			.map((n) => n[0])
			.join('');
		const color = colors[+id % colors.length]!;
		return { initials, color };
	}

	const palette = [
		'#59e2c5',
		'#e7abe6',
		'#f89b97',
		'#bab5f1',
		'#cbeaa1',
		'#80c3ef',
		'#e3bf78',
		'#9bbff0',
		'#d2d27a',
		'#e7b2d3',
		'#91d89c',
		'#f0ab75',
		'#67e1db',
		'#ecb59c',
		'#5fcee5',
		'#d4d19b',
		'#93dcd9',
		'#a7ddb8'
	];

	const users = () => roomState?.meta?.users || {};

	let usersMap = $derived.by(() => {
		let map: UsersMap = new Map();

		const entries = Object.entries(users());

		let initialUsed = new Map<string, number>();

		for (const [i, [id, user]] of entries.entries()) {
			const firstLetter = user.name.match(/\p{L}/u)?.[0] ?? '';

			let initials = firstLetter;

			const usedBefore = initialUsed.get(initials) ?? 0;
			initialUsed.set(initials, usedBefore + 1);
			if (usedBefore) {
				initials = firstLetter + (usedBefore + 1);
			}

			const color = palette[i % palette.length]!;
			map.set(+id, {
				id: +id,
				name: user.name,
				avatar: user.avatar,
				color,
				initials,
				isAdmin: user.isAdmin
			});
		}
		return map;
	});

	let lp: { initDataRaw: string; initData: { user: { id: number }; startParam: string } };

	try {
		const params = useLaunchParams();
		if (params.initDataRaw && params.initData?.user && params.initData?.startParam) {
			lp = {
				initDataRaw: params.initDataRaw,
				initData: { user: params.initData.user, startParam: params.initData.startParam }
			};
		} else {
			throw new Error('Invalid launch params');
		}
	} catch (e) {
		lp = { initDataRaw: '', initData: { user: { id: 5 }, startParam: '' } };
	}

	const myUserId = lp.initData.user.id;

	const myUser = $derived(
		usersMap.get(myUserId) ?? {
			id: myUserId,
			color: 'white',
			initials: '-',
			name: 'Loading',
			isAdmin: false
		}
	);

	let inner = $state(undefined);
	let calendar = {
		get value() {
			return inner;
		},
		set value(v: CalendarDate | undefined) {
			inner = undefined;
			if (v instanceof CalendarDate) {
				dialog.date = v;
				dialog.open = true;
			}
		}
	};

	let dialog = $state({
		open: false,
		date: undefined as CalendarDate | undefined
	});

	let dateString = $derived(dialog.date?.toString() ?? '');
	let dateDisplay = $derived(dialog.date?.toDate(getLocalTimeZone()).toDateString() ?? '');

	const selfMark = $derived(
		(dateString !== undefined &&
			dateString.length > 0 &&
			roomState?.days[dateString]?.markedUsers[myUserId]?.isIn) ||
			undefined //back compatibility hacky
	);

	let sendUpdate: (updatePayload: ClientStateUpdatePayload) => void = () => {};

	let loading = $state(true);

	function setup() {
		loading = true;

		let ws = new WebSocket(
			`${import.meta.env.VITE_WS_ENDPOINT}?roomId=${lp.initData.startParam}&` +
				(lp.initDataRaw ?? 'a=b')
		);

		let updateStore = $state({}) as Record<
			string,
			{
				promise: Promise<boolean>;
				resolve: (to: boolean) => void;
				reject: (reason?: any) => void;
			}
		>;

		const randomId = () => Math.random().toString(36).substring(7);

		sendUpdate = function sendUpdate(updatePayload: ClientStateUpdatePayload) {
			if (!realState) return;
			if (!fakeState) fakeState = realState;

			fakeState = create(fakeState, (draft) => {
				processUpdate(myUserId, draft, updatePayload);
			});

			const id = randomId();

			let resolve: (to: boolean) => void;
			let reject: (reason?: any) => void;
			const promise = new Promise<boolean>((res, rej) => {
				resolve = res;
				reject = rej;
			});

			updateStore[id] = {
				promise,
				resolve: resolve!,
				reject: reject!
			};

			const packet: ClientPacket = ['update', id, updatePayload];

			ws.send(JSON.stringify(packet));
		};

		let realUpdateQueue = [] as StateUpdate[];

		function tryFlush() {
			if (Object.keys(updateStore).length !== 0) return;
			if (realUpdateQueue.length === 0) return;

			if (!realState) return;

			for (const update of realUpdateQueue) {
				processUpdate(update[0], realState, update[1]);
			}

			realUpdateQueue = [];
			fakeState = null;
		}

		ws.onopen = () => {
			const packet: ClientPacket = ['askForWhole'];
			ws.send(JSON.stringify(packet));
		};
		ws.onmessage = (event) => {
			try {
				const parsed = JSON.parse(event.data) as ServerPacket;
				if (parsed[0] === 'serverUpdate') {
					const packet = parsed;

					const updateId = packet[1];
					const updateUserId = packet[2];
					const updatePayloadOrFail = packet[3];

					if (updateStore[updateId]) {
						if (updatePayloadOrFail) {
							updateStore[updateId].resolve(true);
							delete updateStore[updateId];
						} else {
							updateStore[updateId].reject();
							delete updateStore[updateId];
						}
					}

					if (updatePayloadOrFail) {
						realUpdateQueue.push([updateUserId, updatePayloadOrFail]);
						tryFlush();
					}
				} else if (parsed[0] === 'whole') {
					const packet = parsed;

					const state = packet[1] as RoomState;

					console.log('whole', state);

					realState = state;
					fakeState = null;
					realUpdateQueue = [];
					updateStore = {};

					setTimeout(() => {
						loading = false;
					}, 100);
				}
			} catch {}
		};

		ws.onclose = () => {
			fakeState = null;
			realState = null;

			loading = false;
		};

		ws.onerror = () => {
			fakeState = null;
			realState = null;

			loading = false;
		};
	}

	setup();

	onMount(() => {
		// Check screen height and adjust zoom level
		const setZoomLevel = () => {
			const height = window.innerHeight;
			if (height <= 400) {
				document.documentElement.style.zoom = '0.6';
			} else if (height <= 500) {
				document.documentElement.style.zoom = '0.7';
			} else if (height <= 600) {
				document.documentElement.style.zoom = '0.8';
			} else if (height <= 700) {
				document.documentElement.style.zoom = '0.9';
			} else {
				document.documentElement.style.zoom = '1';
			}
		};
		// // Set zoom level on mount
		setZoomLevel();

		// setInterval(() => {
		// 	const focused = document.activeElement;
		// 	debug = focused?.tagName ?? '';
		// 	// debug = height - (window.visualViewport?.height ?? 0) + '';
		// 	// document.documentElement.style.paddingBottom =
		// 	// 	height - (window.visualViewport?.height ?? 0) + 'px';
		// 	if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) {
		// 		// document.body.classList.add('keyboard');
		// 		// focused.scrollIntoView({ behavior: 'instant', block: 'center' });
		// 	} else if (document.documentElement.scrollTop > 0) {
		// 		// document.body.classList.remove('keyboard');
		// 		document.documentElement.scroll({ top: 0, behavior: 'instant' });
		// 	}
		// }, 100);

		// height = window.innerHeight;
		document.body.style.height = window.innerHeight + 'px';

		const isIosDevice = (() => {
			try {
				return (
					[
						'iPad Simulator',
						'iPhone Simulator',
						'iPod Simulator',
						'iPad',
						'iPhone',
						'iPod'
					].includes(navigator.platform) ||
					(navigator.userAgent.includes('Mac') &&
						'ontouchend' in document &&
						navigator.maxTouchPoints > 2)
				);
			} catch (error) {
				return false;
			}
		})();

		if (isIosDevice) {
			document.body.style.overflow = 'hidden';
		}
		// Set zoom level on resize
		// window.addEventListener('resize', setZoomLevel);
		// let upInterval: ReturnType<typeof setInterval> = 0 as any;
		// const setupInterval = () => {
		// 	upInterval = setInterval(() => {
		// 		document.documentElement.scroll({ top: 0, behavior: 'instant' });
		// 	}, 50);
		// };
		// setupInterval();
		//@ts-ignore
		// navigator.virtualKeyboard.overlaysContent = true;
		// document.body.addEventListener(
		// 	'focus',
		// 	(event) => {
		// 		clearInterval(upInterval);
		// 		alert('focus');
		// 		const target = event.target;
		// 		switch ((target as any)?.tagName) {
		// 			case 'INPUT':
		// 			case 'TEXTAREA':
		// 				document.body.classList.add('keyboard');
		// 				if (target instanceof HTMLElement) {
		// 					target.scrollIntoView({ behavior: 'smooth', block: 'center' });
		// 				}
		// 			// document.documentElement.scroll({ top: 9999, behavior: 'instant' });
		// 		}
		// 	},
		// 	true
		// );
		// document.body.addEventListener(
		// 	'blur',
		// 	() => {
		// 		setupInterval();
		// 		document.body.classList.remove('keyboard');
		// 		document.documentElement.scroll({ top: 0, behavior: 'instant' });
		// 	},
		// 	true
		// );
	});

	let chatNode = $state(null) as HTMLDivElement | null;
	let initial = true;
	$effect(() => {
		const parent = chatNode?.parentNode?.parentNode;
		if (!parent || !(parent instanceof HTMLDivElement)) return;

		if (messages().length > 0 && initial) {
			initial = false;
			parent.scroll({ top: parent.scrollHeight, behavior: 'smooth' });
			return;
		}

		if (
			messages().length > 0 &&
			parent.scrollHeight - parent.clientHeight - parent.scrollTop < 100
		) {
			parent.scroll({ top: parent.scrollHeight, behavior: 'smooth' });
		}
	});

	const messages = () => {
		const messages = roomState?.messages || [];
		return messages.toReversed();
	};

	let chatInput = $state('');

	let tab = $state('chat') as 'details' | 'chat';

	const currentNote = $derived(
		(dateString !== undefined &&
			dateString.length > 0 &&
			roomState?.days[dateString]?.markedUsers[myUserId]?.note) ||
			''
	);
	let noteTextArea = $state('');
	$effect(() => {
		noteTextArea = currentNote;
	});

	const currentMeta = $derived(roomState?.meta || { title: '', description: '' });
	let titleInput = $state('');
	let descriptionTextArea = $state('');
	$effect(() => {
		roomState?.meta.everyoneCanEdit;
		titleInput = currentMeta.title;
		descriptionTextArea = currentMeta.description;
	});

	function timesText(times: { morning?: boolean; afternoon?: boolean; evening?: boolean }) {
		let arr = [];
		if (times.morning) arr.push('morning');
		if (times.afternoon) arr.push('afternoon');
		if (times.evening) arr.push('evening');

		if (arr.length === 0) return 'is free!';
		if (arr.length === 1) return `is free in the ${arr[0]}!`;
		if (arr.length === 2) return `is free in the ${arr[0]} and ${arr[1]}!`;
		if (arr.length === 3) return 'is free all day!';
	}
</script>

{#snippet button(condition: any, text: string, update: ClientStateUpdatePayload)}
	<Button
		variant={condition ? 'default' : 'outline'}
		onclick={() => sendUpdate(update)}
		class={'w-full px-0'}
		>{text}
		{#if condition}<PhCheckCircleFill color="white" />{/if}</Button
	>
{/snippet}

{#snippet avatar(userId: any, user: { name: string })}
	{@const { initials, color } = initalsAndColor(+userId, user.name)}
	<Avatar>
		<!-- <AvatarImage src="https://github.com/Bradcn.png" alt="@Bradcn" /> -->
		<AvatarFallback style={`background-color:${color}`}>{initials}</AvatarFallback>
	</Avatar>
{/snippet}

<div class="absolute inset-0 flex flex-col gap-y-2 px-2 pb-8 pt-2">
	<Card class="flex flex-1 flex-col">
		<ScrollArea
			class="flex flex-row items-center [&>[data-scroll-area-scrollbar]]:h-1.5"
			orientation="horizontal"
		>
			<div class="items-cente</ScrollArea>r flex flex-row gap-2 p-2">
				<Button variant="outline" class="flex flex-row gap-1 p-1">
					<Avatar>
						<AvatarImage src={myUser.avatar} />
						<AvatarFallback style={`background-color:${myUser.color}`}
							>{myUser.initials}</AvatarFallback
						>
					</Avatar>
					<span class="pr-0.5">{myUser.name}</span>
				</Button>
				{#each usersMap as [userId, user], i}
					{#if userId !== myUserId}
						<Button variant="outline" class="flex flex-row gap-1 p-1">
							<Avatar>
								<AvatarImage src={user.avatar} />
								<AvatarFallback style={`background-color:${user.color}`}
									>{user.initials}</AvatarFallback
								>
							</Avatar>
							<span class="pr-0.5">{user.name}</span>
						</Button>
					{/if}
				{/each}
			</div>
		</ScrollArea>
		<div class="flex flex-1 flex-col gap-2 px-2 pb-2">
			<Tabs.Root bind:value={tab}>
				<Tabs.List class="grid w-full grid-cols-2">
					<Tabs.Trigger value="details">Details</Tabs.Trigger>
					<Tabs.Trigger value="chat">Chat</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Root>
			{#if tab === 'chat'}
				<Card class="relative flex min-h-32 w-full flex-1 flex-col items-start  ">
					<ScrollArea class="!absolute inset-0">
						<div bind:this={chatNode} class="flex flex-col-reverse gap-2 p-2">
							{#each messages() as { from, text }, i}
								{@const user = usersMap.get(from ?? 0)}
								<div class="flex flex-row items-center gap-2">
									{#if user}
										<Avatar>
											<AvatarImage src={user.avatar} />
											<AvatarFallback style={`background-color:${user.color}`}
												>{user.initials}</AvatarFallback
											>
										</Avatar>
									{/if}
									<p>{text}</p>
								</div>
							{/each}
						</div>
					</ScrollArea>
				</Card>
				<Card class="flex w-full items-center gap-2 p-2">
					<Avatar class="size-10">
						<AvatarImage src={myUser.avatar} />
						<AvatarFallback style={`background-color:${myUser.color}`}
							>{myUser.initials}</AvatarFallback
						>
					</Avatar>

					<form
						class="flex w-full flex-row gap-2"
						onsubmit={(e) => {
							e.preventDefault();
							if (!chatInput) return;
							sendUpdate({
								type: 'addMessage',
								message: chatInput
							});
							chatInput = '';
						}}
					>
						<Input bind:value={chatInput} type="text" placeholder="Type your message here" />
						<Button type="submit">Send</Button>
					</form>
				</Card>
			{:else}
				{#if myUser.isAdmin}
					<Card class="flex items-center space-x-2 p-2">
						<Checkbox
							id="terms"
							checked={roomState?.meta.everyoneCanEdit}
							onCheckedChange={(newValue) => {
								sendUpdate({
									type: 'changeEveryoneCanEdit',
									value: newValue
								});
							}}
							aria-labelledby="terms-label"
						/>
						<Label
							id="terms-label"
							for="terms"
							class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
						>
							Allow others to edit the title and description
						</Label>
					</Card>
				{/if}
				<Input
					type="text"
					disabled={!roomState?.meta.everyoneCanEdit && !myUser.isAdmin}
					bind:value={titleInput}
					placeholder="Title"
				/>
				<Textarea
					disabled={!roomState?.meta.everyoneCanEdit && !myUser.isAdmin}
					class="min-h-20 flex-1"
					bind:value={descriptionTextArea}
					placeholder="Description"
				/>
				{#if titleInput !== currentMeta.title || descriptionTextArea !== currentMeta.description}
					<div class="grid w-full grid-cols-2 gap-2">
						<Button
							variant="outline"
							onclick={() => {
								titleInput = currentMeta.title;
								descriptionTextArea = currentMeta.description;
							}}
						>
							Cancel
						</Button>
						<Button
							onclick={() => {
								sendUpdate({
									type: 'changeMeta',
									title: titleInput,
									description: descriptionTextArea
								});
							}}
						>
							Save
						</Button>
					</div>
				{/if}
			{/if}
		</div>
	</Card>
	<Calendar
		type="single"
		{usersMap}
		roomStateDays={roomState?.days ?? {}}
		bind:value={calendar.value}
		class="rounded-md border"
	/>
</div>

<Dialog.Root open={realState === null}>
	<Dialog.Content
		noCloseButton
		class="scale-[0.952] rounded-lg border p-2 [backface-visibility:hidden]"
		escapeKeydownBehavior="ignore"
		interactOutsideBehavior="ignore"
	>
		{#if !loading}
			<h1 class="w-full p-2 text-center">Connection lost...</h1>
			<Button
				onclick={() => {
					setup();
				}}
			>
				Retry Connection
			</Button>
		{:else}
			<h1 class="w-full p-2 text-center">Loading...</h1>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={dialog.open}>
	<Dialog.Content class="scale-[0.952] rounded-lg border p-2 [backface-visibility:hidden]">
		<!-- <Dialog.Header>
			<Dialog.Title>Are you sure s sure?</Dialog.Title>
			<Dialog.Description>This action cannot be undone.</Dialog.Description>
		</Dialog.Header> -->
		{@const markedUsers = Object.entries(roomState?.days[dateString]?.markedUsers ?? {}).sort(
			(a, b) => +a[0] - +b[0]
		)}
		<h1 class="font-bold">{dateDisplay}</h1>
		<Card class="relative flex flex-col items-center">
			<!-- <PhXCircleFill
				class="absolute right-0 top-0 m-2 cursor-pointer text-xl hover:opacity-80"
				onclick={() => {
					dialog.open = false;
				}}
			></PhXCircleFill> -->

			<ScrollArea class="max-h-[40vh] w-full">
				<div class="flex w-full flex-col items-start gap-2 p-2">
					{#each markedUsers as [userId, userMark]}
						{@const user = usersMap.get(+userId)}
						{#if user}
							<div class="flex w-full flex-col">
								<div class="flex w-full flex-row items-center justify-start gap-2">
									<div class="relative">
										<Avatar class="relative">
											<AvatarImage src={user.avatar} />
											<AvatarFallback style={`background-color:${user.color}`}
												>{user.initials}</AvatarFallback
											>
										</Avatar>
										{#if userMark.isIn === false}
											<div
												class="absolute -inset-1 flex flex-row items-center justify-center overflow-visible"
											>
												<div class="h-0.5 w-[120%] -rotate-45 bg-black"></div>
											</div>
											<div
												class="absolute -inset-1 flex flex-row items-center justify-center overflow-visible"
											>
												<div class="h-0.5 w-[120%] rotate-45 bg-black"></div>
											</div>
										{/if}
									</div>

									<span class="inline"
										>{users()[+userId]?.name}
										{#if userMark.isIn}
											{timesText(userMark.isIn)}
										{:else}
											is out...
										{/if}</span
									>
								</div>
								{#if userMark.note}
									<span class="-mt-2 ml-10">
										"{userMark.note}"
									</span>
								{/if}
							</div>
						{/if}
					{/each}
					{#if markedUsers.length === 0}
						No one is in yet...
					{/if}
				</div>
			</ScrollArea>
		</Card>
		<!-- {@render button(selfMark, "I'm in!", {
			type: 'markDayIsIn',
			day: dateString,
			mark: selfMark ? null : {}
		})} -->
		<!-- {#if selfMark} -->
		<div class="flex flex-row gap-2">
			<div class="flex-1">
				{@render button(selfMark?.morning, 'Morning', {
					type: 'markDayIsIn',
					day: dateString,
					mark: { ...selfMark, morning: selfMark?.morning ? undefined : true }
				})}
			</div>
			<div class="flex-1">
				{@render button(selfMark?.afternoon, 'Afternoon', {
					type: 'markDayIsIn',
					day: dateString,
					mark: { ...selfMark, afternoon: selfMark?.afternoon ? undefined : true }
				})}
			</div>
			<div class="flex-1">
				{@render button(selfMark?.evening, 'Evening', {
					type: 'markDayIsIn',
					day: dateString,
					mark: { ...selfMark, evening: selfMark?.evening ? undefined : true }
				})}
			</div>
		</div>
		<!-- {/if} -->
		<Textarea
			bind:value={noteTextArea}
			placeholder={'Add notes' + (selfMark ? '' : " if you're out...")}
		/>
		{#if noteTextArea !== currentNote}
			<div class="grid w-full grid-cols-2 gap-2">
				<Button
					variant="outline"
					onclick={() => {
						noteTextArea = currentNote;
					}}
				>
					Cancel
				</Button>
				<Button
					onclick={() => {
						sendUpdate({
							type: 'setNote',
							day: dateString,
							note: noteTextArea
						});
					}}
				>
					Save
				</Button>
			</div>
		{:else if currentNote !== ''}
			<Button
				onclick={() => {
					sendUpdate({
						type: 'setNote',
						day: dateString,
						note: ''
					});
					noteTextArea = '';
				}}
			>
				Clear Note
			</Button>
		{/if}
		<!-- <Dialog.Footer>
			<Dialog.Close>Close</Dialog.Close>
		</Dialog.Footer> -->
	</Dialog.Content>
</Dialog.Root>
