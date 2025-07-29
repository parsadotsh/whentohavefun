import { DurableObject } from 'cloudflare:workers';
import { type } from 'arktype';
import { processUpdate, RoomState, ServerPacket } from './state';
import { stateUpdatePayload, clientPacket, StateUpdate } from './state/updates';

//@ts-ignore
import { validate } from '@telegram-apps/init-data-node/web';
import { parse } from '@telegram-apps/init-data-node';

import { Bot, Context, InlineKeyboard, InlineQueryResultBuilder, webhookCallback } from 'grammy';

/**
 * Welcome to Cloudflare Workers! This is your first Durable Objects application.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your Durable Object in action
 * - Run `npm run deploy` to publish your application
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/durable-objects
 */

/** A Durable Object's behavior is defined in an exported Javascript class */

type SocketSession = {
	userId: number;
};
export class SocketObject extends DurableObject {
	room: RoomState = {
		meta: {
			users: {},
			title: '',
			description: '',
			everyoneCanEdit: false,
		},
		days: {},
		messages: [],
	};
	newRoom = false;

	BOT_TOKEN = '';

	sessions: Map<WebSocket, SocketSession>;
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		this.BOT_TOKEN = env.BOT_TOKEN;

		this.sessions = new Map();
		this.ctx.getWebSockets().forEach((ws) => {
			const attachment = ws.deserializeAttachment();

			if (attachment) {
				this.sessions.set(ws, attachment);
			} else {
				this.tryCloseWs(ws);
			}
		});

		this.ctx.blockConcurrencyWhile(async () => {
			const room = (await this.ctx.storage.get('room')) as RoomState | undefined;
			if (room) {
				this.room = room;
				this.newRoom = true;
			}
		});
	}

	tryCloseWs(ws: WebSocket) {
		try {
			ws.close();
		} catch (e) {
			console.error('Failed to close WebSocket', e);
		}
	}

	async fetch(request: Request) {
		const url = new URL(request.url);
		const path = url.pathname;

		if (path === '/api/socket') {
			let params = new URLSearchParams(url.search);
			params.delete('roomId');
			try {
				await validate(params, this.BOT_TOKEN);
				console.log('Validated');
			} catch (e) {
				console.error('not validated', e);

				return new Response('Invalid params', { status: 400 });
			}

			const parsed = parse(params);

			if (!parsed.user) {
				return new Response('Invalid params', { status: 400 });
			}

			if (request.headers.get('Upgrade') != 'websocket') {
				return new Response('expected websocket', { status: 400 });
			}

			const { 0: client, 1: server } = new WebSocketPair();

			await this.ctx.acceptWebSocket(server);
			const session = {
				userId: parsed.user.id,
			};
			server.serializeAttachment(session);
			this.sessions.set(server, session);

			if (!this.room.meta.users[session.userId]) {
				await this.processAndBroadcastUpdate(Math.random().toString(36).substring(7), [
					null,
					{
						type: 'updateUsers',
						users: {
							...this.room.meta.users,
							[session.userId]: {
								name: parsed.user.firstName,
								isAdmin: this.newRoom,
							},
						},
					},
				]);
			}

			return new Response(null, {
				status: 101,
				webSocket: client,
				headers: {
					'new-room': this.newRoom ? 'true' : 'false',
				},
			});
		}

		return new Response('Not found', { status: 404 });
	}

	async processAndBroadcastUpdate(updateId: string, update: StateUpdate) {
		processUpdate(update[0], this.room, update[1]);
		await this.ctx.storage.put('room', this.room);
		const serverUpdatePacket: ServerPacket = ['serverUpdate', updateId, update[0], update[1]];
		this.ctx.getWebSockets().forEach((ws) => {
			ws.send(JSON.stringify(serverUpdatePacket));
		});
	}

	static ParseMessage = type('string.json.parse').to(clientPacket);

	async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
		const message = SocketObject.ParseMessage(raw);
		const session = this.sessions.get(ws);

		if (!session) {
			console.error('Invalid session');
			this.tryCloseWs(ws);
			return;
		}

		if (message instanceof type.errors) {
			console.error('Invalid message', message.summary);
			return;
		}

		if (message[0] === 'update') {
			await this.processAndBroadcastUpdate(message[1], [session.userId, message[2]]);
		}

		if (message[0] == 'askForWhole') {
			const wholePacket: ServerPacket = ['whole', this.room];
			ws.send(JSON.stringify(wholePacket));
		}
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
		this.sessions.delete(ws);
		ws.close(1000, 'Durable Object is closing WebSocket');
	}

	/**
	 * The Durable Object exposes an RPC method sayHello which will be invoked when when a Durable
	 *  Object instance receives a request from a Worker via the same method invocation on the stub
	 *
	 * @param name - The name provided to a Durable Object instance from a Worker
	 * @returns The greeting to be sent back to the Worker
	
	async sayHello(name: string): Promise<string> {
		return `Hello, ${name}!`;
	}
		 */
}

function isValidRoomID(uuid: string): number | null {
	const uuidRegex = /^([0-9]{2})[0-9a-f]{6}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
	const match = uuid.match(uuidRegex);
	return match ? parseInt(match[1] ?? '', 10) : null;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
		const params = url.searchParams;

		if (path === '/api/webhook') {
			const bot = new Bot(env.BOT_TOKEN, { botInfo: JSON.parse(env.BOT_INFO) });

			bot.errorHandler;

			bot.command('start', async (ctx: Context) => {
				await ctx.reply('Hi there! Simply type "@pickadatebot " in any chat to get started.');
			});

			bot.on('inline_query', async (ctx) => {
				const query = ctx.inlineQuery.query.trim(); // query string

				let newUUID = '00' + crypto.randomUUID().slice(2);

				const result = InlineQueryResultBuilder.article(`id:${newUUID}`, `New Pick A Date room${query === '' ? '' : `: ${query}`}`, {
					reply_markup: new InlineKeyboard().url('Open Room', `${env.WEB_APP_URL}?startapp=${newUUID}`),
				}).text(
					`Room <b>${query ? `${query} ` : ''}(${newUUID.slice(-6)})</b>

Use <b>📅 Pick a Date! Bot</b> to schedule outings with friends!
To make your own room, type "@pickadatebot &lt;Your Title&gt;" in any chat to get started.

Tap the button below 👇 to open the room:`,
					{ parse_mode: 'HTML' },
				);

				// Answer the inline query.
				await ctx
					.answerInlineQuery(
						[result], // answer with result list
						{ cache_time: 1, is_personal: true },
					)
					.catch(console.error);
			});

			return webhookCallback(bot, 'cloudflare-mod')(request);
		}

		if (path === '/api/socket') {
			const roomId = params.get('roomId');

			if (!roomId) {
				return new Response('Missing room ID', { status: 400 });
			}

			const roomVersion = isValidRoomID(roomId);

			if (roomVersion === null) {
				return new Response('Invalid room ID', { status: 400 });
			}

			if (roomVersion !== 0) {
				return new Response('Room version not supported', { status: 400 });
			}

			const upgradeHeader = request.headers.get('Upgrade');
			if (!upgradeHeader || upgradeHeader !== 'websocket') {
				return new Response('Durable Object expected Upgrade: websocket', { status: 426 });
			}

			const id = env.SOCKET_OBJECT.idFromName(roomId);
			const stub = env.SOCKET_OBJECT.get(id);

			const response = await stub.fetch(request);

			console.log('response headers', JSON.stringify(Array.from(response.headers.entries())));

			return response;
		}

		return new Response('Not found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
