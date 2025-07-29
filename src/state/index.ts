import { writeInvalidConstructorMessage } from 'arktype/out/parser/tuple';
import { stateUpdatePayload, type StateUpdate, type ClientPacket, type ClientStateUpdatePayload, type StateUpdatePayload } from './updates';

export type { StateUpdate, ClientPacket, ClientStateUpdatePayload, StateUpdatePayload };

type UpdateId = string;
type UserId = number | null;

export type ServerPacket = ['serverUpdate', UpdateId, UserId, null | StateUpdatePayload] | ['whole', RoomState];

export type RoomState = {
	meta: {
		users: Record<
			number,
			{
				name: string;
				avatar?: string;
				isAdmin: boolean;
			}
		>;
		title: string;
		description: string;
		everyoneCanEdit: boolean;
	};
	days: Record<
		string,
		{
			markedUsers: Record<
				number,
				{
					isIn:
						| false
						| {
								morning?: true;
								afternoon?: true;
								evening?: true;
						  };
					note?: string;
				}
			>;
		}
	>;
	messages: {
		from: number | null;
		text: string;
	}[];
};

export function processUpdate(
	userId: number | null, // null means server
	state: RoomState,
	updatePayload: StateUpdatePayload,
) {
	switch (updatePayload.type) {
		case 'markDayIsIn': {
			if (!userId) return;
			const day = updatePayload.day;
			const mark = updatePayload.mark;
			const user = userId;
			if (!state.days[day]) {
				state.days[day] = {
					markedUsers: {},
				};
			}
			if (!state.days[day].markedUsers[user]) {
				state.days[day].markedUsers[user] = {
					isIn: false,
				};
			}
			if (mark && (mark?.afternoon || mark?.evening || mark?.morning)) {
				state.days[day].markedUsers[user].isIn = mark;
			} else {
				if (state.days[day].markedUsers[user].note) {
					state.days[day].markedUsers[user].isIn = false;
				} else {
					delete state.days[day].markedUsers[user];
				}
			}
			break;
		}
		case 'addMessage': {
			const message = updatePayload.message;
			const user = userId;
			state.messages.push({ from: user, text: message });
			break;
		}
		case 'changeMeta': {
			if (userId && !state.meta.users[userId]?.isAdmin && !state.meta.everyoneCanEdit) {
				console.log('User is not admin and not everyone can edit');
				return;
			}
			state.meta.title = updatePayload.title;
			state.meta.description = updatePayload.description;
			break;
		}
		case 'changeEveryoneCanEdit': {
			if (userId && !state.meta.users[userId]?.isAdmin) {
				console.log('User is not admin');
				return;
			}
			state.meta.everyoneCanEdit = updatePayload.value;
			break;
		}
		case 'updateUsers': {
			state.meta.users = updatePayload.users;
			break;
		}
		case 'setNote': {
			if (!userId) return;
			const day = updatePayload.day;
			const note = updatePayload.note;
			const user = userId;
			if (!state.days[day]) {
				state.days[day] = {
					markedUsers: {},
				};
			}
			if (!state.days[day].markedUsers[user]) {
				state.days[day].markedUsers[user] = {
					isIn: false,
				};
			}
			if (note) {
				state.days[day].markedUsers[user].note = note;
			} else {
				if (state.days[day].markedUsers[user].isIn) {
					state.days[day].markedUsers[user].note = '';
				} else {
					delete state.days[day].markedUsers[user];
				}
			}
			break;
		}
	}
}
