<script lang="ts">
	import { Calendar as CalendarPrimitive, type WithoutChildrenOrChild } from 'bits-ui';
	import * as Calendar from '$lib/components/ui/calendar';
	import { cn } from '$lib/utils.js';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import type { UsersMap } from './+page.svelte';

	import type { RoomState } from '../../../src/state/index';

	import PhX from '~icons/ph/x';

	let {
		usersMap,
		roomStateDays,
		ref = $bindable(null),
		value = $bindable(),
		placeholder = $bindable(),
		class: className,
		weekdayFormat = 'short',
		...restProps
	}: WithoutChildrenOrChild<CalendarPrimitive.RootProps> & {
		usersMap: UsersMap;
		roomStateDays: RoomState['days'];
	} = $props();
</script>

<!--
Discriminated Unions + Destructing (required for bindable) do not
get along, so we shut typescript up by casting `value` to `never`.
-->
<CalendarPrimitive.Root
	bind:value={value as never}
	bind:ref
	bind:placeholder
	{weekdayFormat}
	class={cn('justify-center p-3', className)}
	{...restProps}
>
	{#snippet children({ months, weekdays })}
		<Calendar.Header class="-mb-2 py-0">
			<Calendar.PrevButton />
			<Calendar.Heading />
			<Calendar.NextButton />
		</Calendar.Header>
		<Calendar.Months class="items-center">
			{#each months as month}
				<Calendar.Grid class={'w-full'}>
					<Calendar.GridHead>
						<Calendar.GridRow class="flex">
							{#each weekdays as weekday}
								<Calendar.HeadCell class="w-[14.285%]">
									{weekday.slice(0, 2)}
								</Calendar.HeadCell>
							{/each}
						</Calendar.GridRow>
					</Calendar.GridHead>
					<Calendar.GridBody>
						{#each month.weeks as weekDates}
							<Calendar.GridRow class="w-full">
								{#each weekDates as date}
									<Calendar.Cell {date} month={month.value} class="w-[14.285%]">
										<Calendar.Day
											class="flex w-full flex-col justify-start gap-0  data-[selected]:bg-white"
										>
											{#snippet children(props)}
												{@const day = date.toString()}
												<span class="h-3 pt-0.5 leading-none">{props.day}</span>
												<div
													class="mt-1 flex w-full flex-1 grid-cols-4 grid-rows-2 flex-row flex-wrap content-start items-center justify-center gap-px px-2"
												>
													{#if roomStateDays[day]}
														{@const entries = Object.entries(roomStateDays[day].markedUsers)}
														{#each entries.slice(0, 7) as [userId, { isIn }]}
															{@const userMapped = usersMap.get(+userId)}

															<div class="relative">
																<Avatar class="relative size-2 text-[4px]">
																	<AvatarImage src={userMapped?.avatar} />
																	<AvatarFallback
																		class="pt-0.5"
																		style={`background-color:${userMapped?.color ?? 'gray'}`}
																		>{userMapped?.initials}</AvatarFallback
																	>
																</Avatar>
																{#if isIn === false}
																	<div
																		class="absolute inset-0 flex flex-row items-center justify-center"
																	>
																		<!-- <PhX class="!size-3 text-black" /> -->
																		<!-- <div
																			class="translate-y-[-50%]] absolute -left-px -right-px top-1/2 h-px rotate-45 bg-black bg-opacity-60"
																		></div>
																		<div
																			class="translate-y-[-50%]] absolute -left-px -right-px top-1/2 h-px -rotate-45 bg-black bg-opacity-60"
																		></div> -->

																		<div
																			class="absolute -inset-px flex flex-row items-center justify-center overflow-visible"
																		>
																			<div
																				class="h-px w-[120%] -rotate-45 bg-black bg-opacity-80"
																			></div>
																		</div>
																		<div
																			class="absolute -inset-px flex flex-row items-center justify-center overflow-visible"
																		>
																			<div
																				class="h-px w-[120%] rotate-45 bg-black bg-opacity-80"
																			></div>
																		</div>
																	</div>
																{/if}
															</div>
														{/each}
														{#if entries.length > 7}
															<span class="size-2 text-[8px] leading-none">
																+{entries.length - 7}
															</span>
														{/if}
													{/if}
													<!-- <Avatar class="size-2 text-[6px]">
														
													</Avatar> -->
												</div>
											{/snippet}
										</Calendar.Day>
									</Calendar.Cell>
								{/each}
							</Calendar.GridRow>
						{/each}
					</Calendar.GridBody>
				</Calendar.Grid>
			{/each}
		</Calendar.Months>
	{/snippet}
</CalendarPrimitive.Root>
