import { describe, expect, it, vi } from 'vitest';
import { PresenceClient } from '../src/client.js';
import { defaultConfig } from '@urbaninversion/shared';

/**
 * Minimal WebSocket double: records sent frames so we can assert the
 * hello wire format (including the dev capability block).
 */
class FakeWebSocket {
	/** @type {FakeWebSocket[]} */
	static instances = [];
	constructor(url) {
		this.url = url;
		this.sent = [];
		this.listeners = new Map();
		FakeWebSocket.instances.push(this);
	}
	addEventListener(type, fn) {
		this.listeners.set(type, fn);
	}
	send(text) {
		this.sent.push(JSON.parse(text));
	}
	close() {}
	open() {
		this.listeners.get('open')?.();
	}
	// Fire 'open' after listeners attach, like a real socket coming online.
	simulateConnected() {
		setTimeout(() => this.open(), 0);
	}
}

vi.stubGlobal('WebSocket', FakeWebSocket);

describe('PresenceClient hello', () => {
	it('includes the dev capability block when provided', async () => {
		const dev = {
			clientId: 'test-client-1',
			display: 'hud2d',
			audio: true,
			headingSource: 'compass',
			locationSource: 'paired-phone',
			locale: 'es',
		};
		const client = new PresenceClient({ cfg: defaultConfig, dev });
		await client.start();
		await client.updatePosition({ lat: 52.52, lon: 13.405, accuracy: 5, tsMs: Date.now() });
		const home = FakeWebSocket.instances.at(-1);
		expect(home).toBeDefined();
		home.simulateConnected();
		await vi.waitFor(() => {
			const hello = home.sent.find((f) => f.op === 'hello');
			expect(hello).toBeDefined();
			expect(hello.dev).toEqual(dev);
			// Any socket (home or edge) carries the same capability block.
		});
	});

	it('sends hello.pair instead of turnstile when a pairTicket is set', async () => {
		const client = new PresenceClient({
			cfg: defaultConfig,
			pairTicket: 'pt_abcdefghij1234567890abcdefghij123',
		});
		await client.start();
		await client.updatePosition({ lat: 52.52, lon: 13.405, accuracy: 5, tsMs: Date.now() });
		const home = FakeWebSocket.instances.at(-1);
		home.simulateConnected();
		await vi.waitFor(() => {
			const hello = home.sent.find((f) => f.op === 'hello');
			expect(hello).toBeDefined();
			expect(hello.pair).toBe('pt_abcdefghij1234567890abcdefghij123');
			expect(hello.turnstile).toBeUndefined();
		});
	});

	it('omits dev when not provided (older clients stay valid)', async () => {
		const client = new PresenceClient({ cfg: defaultConfig });
		await client.start();
		await client.updatePosition({ lat: 52.52, lon: 13.405, accuracy: 5, tsMs: Date.now() });
		const home = FakeWebSocket.instances.at(-1);
		home.simulateConnected();
		await vi.waitFor(() => {
			const hello = home.sent.find((f) => f.op === 'hello');
			expect(hello).toBeDefined();
			expect(hello.dev).toBeUndefined();
		});
	});
});
