import { type } from 'arktype';

type UserId = number | null;

export const stateUpdatePayload = type({
	type: '"markDayIsIn"',
	day: 'string',
	mark: type('null').or({
		'morning?': 'true',
		'afternoon?': 'true',
		'evening?': 'true',
	}),
})
	.or({
		type: '"addMessage"',
		message: 'string',
	})
	.or({
		type: '"changeMeta"',
		title: 'string',
		description: 'string',
	})
	.or({
		type: '"changeEveryoneCanEdit"',
		value: 'boolean',
	})
	.or({
		type: '"setNote"',
		day: 'string',
		note: 'string',
	});

export const clientPacket = type(['"update"', 'string', stateUpdatePayload]).or(['"askForWhole"']);

export type ServerOnlyUpdatePayloads = {
	type: 'updateUsers';
	users: Record<
		number,
		{
			name: string;
			avatar?: string;
			isAdmin: boolean;
		}
	>;
};

export type ClientStateUpdatePayload = typeof stateUpdatePayload.infer;

export type StateUpdatePayload = typeof stateUpdatePayload.infer | ServerOnlyUpdatePayloads;

export type StateUpdate = [UserId, StateUpdatePayload];

export type ClientPacket = typeof clientPacket.infer;
