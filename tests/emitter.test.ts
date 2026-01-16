import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createEmitter } from '../src/emitter';

type TestEvents = {
	message: [ text: string ],
	count: [ value: number ],
	flag: [ enabled: boolean ],
	move: [ x: number, y: number ],
	error: [ message: string, code?: number ],
	ready: []
};

describe( 'emitter', () => {
	describe( '.on() and .emit()', () => {
		it( 'should emit and listen to events', () => {
			const emitter = createEmitter<TestEvents>();
			let result = '';

			emitter.on( 'message', ( text ) => {
				result = text;
			} );
			emitter.emit( 'message', 'hello' );

			assert.strictEqual( result, 'hello' );
		} );

		it( 'should support multiple listeners', () => {
			const emitter = createEmitter<TestEvents>();
			const results: number[] = [];

			emitter.on( 'count', ( value ) => results.push( value ) );
			emitter.on( 'count', ( value ) => results.push( value * 2 ) );
			emitter.emit( 'count', 5 );

			assert.deepStrictEqual( results, [ 5, 10 ] );
		} );

		it( 'should support multiple arguments', () => {
			const emitter = createEmitter<TestEvents>();
			const result: number[] = [];

			emitter.on( 'move', ( x, y ) => result.push( x, y ) );
			emitter.emit( 'move', 10, 20 );

			assert.deepStrictEqual( result, [ 10, 20 ] );
		} );

		it( 'should support optional arguments', () => {
			const emitter = createEmitter<TestEvents>();
			const results: Array<[string, number?]> = [];

			emitter.on( 'error', ( message, code ) => results.push( [ message, code ] ) );
			emitter.emit( 'error', 'Failed', 404 );
			emitter.emit( 'error', 'Unknown' );

			assert.deepStrictEqual( results, [ [ 'Failed', 404 ], [ 'Unknown', undefined ] ] );
		} );

		it( 'should support events with no arguments', () => {
			const emitter = createEmitter<TestEvents>();
			let called = false;

			emitter.on( 'ready', () => {
				called = true;
			} );
			emitter.emit( 'ready' );

			assert.strictEqual( called, true );
		} );

		it( 'should return unsubscribe function', () => {
			const emitter = createEmitter<TestEvents>();
			let count = 0;

			const unsubscribe = emitter.on( 'flag', () => count++ );
			emitter.emit( 'flag', true );
			unsubscribe();
			emitter.emit( 'flag', false );

			assert.strictEqual( count, 1 );
		} );
	} );

	describe( '.off()', () => {
		it( 'should remove specific listener', () => {
			const emitter = createEmitter<TestEvents>();
			let count = 0;
			const callback = () => count++;

			emitter.on( 'flag', callback );
			emitter.emit( 'flag', true );
			emitter.off( 'flag', callback );
			emitter.emit( 'flag', false );

			assert.strictEqual( count, 1 );
		} );

		it( 'should remove all listeners when no callback provided', () => {
			const emitter = createEmitter<TestEvents>();
			let count = 0;

			emitter.on( 'flag', () => count++ );
			emitter.on( 'flag', () => count++ );
			emitter.off( 'flag' );
			emitter.emit( 'flag', true );

			assert.strictEqual( count, 0 );
		} );
	} );

	describe( '.once()', () => {
		it( 'should invoke listener only once', () => {
			const emitter = createEmitter<TestEvents>();
			let count = 0;

			emitter.once( 'flag', () => count++ );
			emitter.emit( 'flag', true );
			emitter.emit( 'flag', false );

			assert.strictEqual( count, 1 );
		} );
	} );

	describe( '.next()', () => {
		it( 'should resolve promise on next event', async () => {
			const emitter = createEmitter<TestEvents>();
			const promise = emitter.next( 'message' );

			setTimeout( () => emitter.emit( 'message', 'delayed' ), 10 );

			assert.deepStrictEqual( await promise, [ 'delayed' ] );
		} );
	} );

	describe( '.clear()', () => {
		it( 'should remove all listeners', () => {
			const emitter = createEmitter<TestEvents>();
			let count = 0;

			emitter.on( 'flag', () => count++ );
			emitter.on( 'message', () => count++ );
			emitter.clear();
			emitter.emit( 'flag', true );
			emitter.emit( 'message', 'test' );

			assert.strictEqual( count, 0 );
		} );
	} );

	describe( '.pick()', () => {
		it( 'should only emit picked events', () => {
			const emitter = createEmitter<TestEvents>();
			const picked = emitter.pick( 'count' );
			const counts: number[] = [];

			picked.on( 'count', ( value ) => counts.push( value ) );
			emitter.emit( 'count', 42 );
			emitter.emit( 'message', 'test' );
			emitter.emit( 'count', 99 );

			assert.deepStrictEqual( counts, [ 42, 99 ] );
		} );

		it( 'should support multiple picked events', () => {
			const emitter = createEmitter<TestEvents>();
			const picked = emitter.pick( 'count', 'flag' );
			const events: string[] = [];

			picked.on( 'count', () => events.push( 'count' ) );
			picked.on( 'flag', () => events.push( 'flag' ) );
			emitter.emit( 'count', 1 );
			emitter.emit( 'message', 'test' );
			emitter.emit( 'flag', true );

			assert.deepStrictEqual( events, [ 'count', 'flag' ] );
		} );

		it( 'should support chaining', () => {
			const emitter = createEmitter<TestEvents>();
			const picked = emitter.pick( 'count', 'flag', 'message' ).pick( 'count' );
			const counts: number[] = [];

			picked.on( 'count', ( value ) => counts.push( value ) );
			emitter.emit( 'count', 1 );
			emitter.emit( 'flag', true );
			emitter.emit( 'count', 2 );

			assert.deepStrictEqual( counts, [ 1, 2 ] );
		} );
	} );

	describe( '.omit()', () => {
		it( 'should exclude omitted events', () => {
			const emitter = createEmitter<TestEvents>();
			const filtered = emitter.omit( 'message' );
			const events: string[] = [];

			filtered.on( 'count', () => events.push( 'count' ) );
			filtered.on( 'flag', () => events.push( 'flag' ) );
			emitter.emit( 'count', 1 );
			emitter.emit( 'message', 'test' );
			emitter.emit( 'flag', true );

			assert.deepStrictEqual( events, [ 'count', 'flag' ] );
		} );

		it( 'should support multiple omitted events', () => {
			const emitter = createEmitter<TestEvents>();
			const filtered = emitter.omit( 'message', 'flag' );
			const counts: number[] = [];

			filtered.on( 'count', ( value ) => counts.push( value ) );
			emitter.emit( 'count', 1 );
			emitter.emit( 'message', 'test' );
			emitter.emit( 'flag', true );
			emitter.emit( 'count', 2 );

			assert.deepStrictEqual( counts, [ 1, 2 ] );
		} );

		it( 'should support chaining', () => {
			const emitter = createEmitter<TestEvents>();
			const filtered = emitter.omit( 'message' ).omit( 'flag' );
			const counts: number[] = [];

			filtered.on( 'count', ( value ) => counts.push( value ) );
			emitter.emit( 'count', 1 );
			emitter.emit( 'message', 'test' );
			emitter.emit( 'flag', true );
			emitter.emit( 'count', 2 );

			assert.deepStrictEqual( counts, [ 1, 2 ] );
		} );
	} );

	describe( '.derive()', () => {
		it( 'should transform events', () => {
			const emitter = createEmitter<TestEvents>();
			const derived = emitter.derive( ( emit ) => ( {
				message: ( text ) => emit.emit( 'message', text.toUpperCase() )
			} ) );
			const messages: string[] = [];

			derived.on( 'message', ( text ) => messages.push( text ) );
			emitter.emit( 'message', 'hello' );
			emitter.emit( 'message', 'world' );

			assert.deepStrictEqual( messages, [ 'HELLO', 'WORLD' ] );
		} );

		it( 'should filter events', () => {
			const emitter = createEmitter<TestEvents>();
			const derived = emitter.derive( ( emit ) => ( {
				count: ( value ) => {
					if ( value > 50 ) {
						emit.emit( 'count', value );
					}
				}
			} ) );
			const counts: number[] = [];

			derived.on( 'count', ( value ) => counts.push( value ) );
			emitter.emit( 'count', 25 );
			emitter.emit( 'count', 75 );
			emitter.emit( 'count', 99 );

			assert.deepStrictEqual( counts, [ 75, 99 ] );
		} );

		it( 'should map to different event types', () => {
			const emitter = createEmitter<TestEvents>();
			type Logs = { info: [text: string], error: [text: string] };

			const logs = emitter.derive<Logs>( ( emit ) => ( {
				message: ( text ) => {
					if ( text.startsWith( '[ERROR]' ) ) {
						emit.emit( 'error', text.slice( 8 ) );
					} else {
						emit.emit( 'info', text );
					}
				}
			} ) );
			const results: string[] = [];

			logs.on( 'info', ( text ) => results.push( `info: ${text}` ) );
			logs.on( 'error', ( text ) => results.push( `error: ${text}` ) );
			emitter.emit( 'message', 'Starting' );
			emitter.emit( 'message', '[ERROR] Failed' );

			assert.deepStrictEqual( results, [ 'info: Starting', 'error: Failed' ] );
		} );

		it( 'should support chaining', () => {
			const emitter = createEmitter<TestEvents>();
			const derived = emitter
				.derive( ( emit ) => ( {
					message: ( text ) => emit.emit( 'message', `[LOG] ${text}` )
				} ) )
				.derive( ( emit ) => ( {
					message: ( text ) => emit.emit( 'message', `[TRACE] ${text}` )
				} ) );
			const messages: string[] = [];

			derived.on( 'message', ( text ) => messages.push( text ) );
			emitter.emit( 'message', 'test' );

			assert.deepStrictEqual( messages, [ '[TRACE] [LOG] test' ] );
		} );
	} );
} );
