import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createState } from '../src/state';

type TestState = {
	name: string,
	age: number,
	active: boolean
};

describe( 'state', () => {
	describe( '.get() and .set()', () => {
		it( 'should get and set values', () => {
			const state = createState<TestState>( {
				name: '',
				age: 0,
				active: false
			} );

			state.set( 'name', 'Alice' );
			state.set( 'age', 30 );

			assert.strictEqual( state.get( 'name' ), 'Alice' );
			assert.strictEqual( state.get( 'age' ), 30 );
		} );

		it( 'should return undefined for non-existent keys', () => {
			const state = createState<TestState>( {
				name: '',
				age: 0,
				active: false
			} );

			assert.strictEqual( state.get( 'name' ), '' );
		} );
	} );

	describe( '.update()', () => {
		it( 'should update multiple values with object', () => {
			const state = createState<TestState>( {
				name: '',
				age: 0,
				active: false
			} );

			state.update( {
				name: 'Laura',
				age: 27,
				active: true
			} );

			assert.strictEqual( state.get( 'name' ), 'Laura' );
			assert.strictEqual( state.get( 'age' ), 27 );
			assert.strictEqual( state.get( 'active' ), true );
		} );

		it( 'should update with function updater', () => {
			const state = createState<TestState>( {
				name: '',
				age: 25,
				active: false
			} );

			state.update( ( current ) => ( {
				age: current.age + 5,
				name: 'Mike',
				active: current.active
			} ) );

			assert.strictEqual( state.get( 'age' ), 30 );
			assert.strictEqual( state.get( 'name' ), 'Mike' );
		} );
	} );

	describe( '.entries()', () => {
		it( 'should iterate entries', () => {
			const state = createState<TestState>( {
				name: 'Frank',
				age: 35,
				active: false
			} );

			const entries = Array.from( state.entries() );

			assert.strictEqual( entries.length, 3 );
			assert.ok( entries.some( ( [ key, value ] ) => key === 'name' && value === 'Frank' ) );
			assert.ok( entries.some( ( [ key, value ] ) => key === 'age' && value === 35 ) );
		} );
	} );

	describe( '.toObject()', () => {
		it( 'should convert to object', () => {
			const state = createState<TestState>( {
				name: 'Grace',
				age: 40,
				active: true
			} );

			const obj = state.toObject();

			assert.deepStrictEqual( obj, {
				name: 'Grace',
				age: 40,
				active: true
			} );
		} );
	} );

	describe( 'initialization', () => {
		it( 'should initialize from object', () => {
			const initial: TestState = {
				name: 'Henry',
				age: 45,
				active: true
			};

			const state = createState<TestState>( initial );

			assert.strictEqual( state.get( 'name' ), 'Henry' );
			assert.strictEqual( state.get( 'age' ), 45 );
			assert.strictEqual( state.get( 'active' ), true );
		} );

		it( 'should not notify subscribers during initialization', () => {
			const updates: Array<TestState> = [];

			const state = createState<TestState>( { name: 'Charlie', age: 30, active: false } );

			state.subscribe( ( update ) => {
				updates.push( update );
			} );

			// Should have initial notification only
			assert.strictEqual( updates.length, 1 );
			assert.deepStrictEqual( updates[ 0 ], { name: 'Charlie', age: 30, active: false } );
		} );
	} );

	describe( '.subscribe()', () => {
		it( 'should notify subscribers on set', () => {
			const updates: Array<TestState> = [];
			const state = createState<TestState>( {
				name: '',
				age: 0,
				active: false
			} );

			state.subscribe( ( update ) => {
				updates.push( update );
			} );

			// Clear initial notification
			updates.length = 0;

			state.set( 'name', 'Bob' );
			state.set( 'age', 25 );

			assert.strictEqual( updates.length, 2 );
			assert.strictEqual( updates[ 0 ].name, 'Bob' );
			assert.strictEqual( updates[ 1 ].name, 'Bob' );
			assert.strictEqual( updates[ 1 ].age, 25 );
		} );

		it( 'should notify subscribers once per update', () => {
			const updates: Array<TestState> = [];
			const state = createState<TestState>( {
				name: '',
				age: 0,
				active: false
			} );

			state.subscribe( ( update ) => {
				updates.push( update );
			} );

			// Clear initial notification
			updates.length = 0;

			state.update( {
				name: 'Paul',
				age: 35,
				active: false
			} );

			assert.strictEqual( updates.length, 1 );
			assert.deepStrictEqual( updates[ 0 ], {
				name: 'Paul',
				age: 35,
				active: false
			} );
		} );

		it( 'should provide current state on subscription', () => {
			const updates: Array<TestState> = [];
			const state = createState<TestState>( {
				name: '',
				age: 0,
				active: false
			} );

			const unsubscribe = state.subscribe( ( value ) => {
				updates.push( value );
			} );

			assert.strictEqual( updates.length, 1 );
			assert.deepStrictEqual( updates[ 0 ], { name: '', age: 0, active: false } );

			state.set( 'name', 'Jack' );
			assert.strictEqual( updates.length, 2 );
			assert.strictEqual( updates[ 1 ].name, 'Jack' );

			state.set( 'age', 50 );
			assert.strictEqual( updates.length, 3 );
			assert.strictEqual( updates[ 2 ].name, 'Jack' );
			assert.strictEqual( updates[ 2 ].age, 50 );

			unsubscribe();
		} );

		it( 'should stop notifying after unsubscribe', () => {
			const updates: Array<TestState> = [];
			const state = createState<TestState>( {
				name: '',
				age: 0,
				active: false
			} );

			const unsubscribe = state.subscribe( ( value ) => {
				updates.push( value );
			} );

			assert.strictEqual( updates.length, 1 );

			state.set( 'name', 'Kate' );
			assert.strictEqual( updates.length, 2 );

			unsubscribe();

			state.set( 'age', 33 );
			assert.strictEqual( updates.length, 2 );
		} );
	} );

	describe( '.derive()', () => {
		it( 'should create derived state from transform function', () => {
			const state = createState<TestState>( {
				name: 'Alice',
				age: 30,
				active: true
			} );

			const derived = state.derive( ( current ) => ( {
				displayName: `${current.name} (${current.age})`,
				isAdult: current.age >= 18
			} ) );

			assert.strictEqual( derived.get( 'displayName' ), 'Alice (30)' );
			assert.strictEqual( derived.get( 'isAdult' ), true );
		} );

		it( 'should update derived state when source changes', () => {
			const state = createState<TestState>( {
				name: 'Bob',
				age: 25,
				active: true
			} );

			const derived = state.derive( ( current ) => ( {
				summary: `${current.name} - ${current.age}`
			} ) );

			assert.strictEqual( derived.get( 'summary' ), 'Bob - 25' );

			state.set( 'age', 26 );
			assert.strictEqual( derived.get( 'summary' ), 'Bob - 26' );

			state.set( 'name', 'Robert' );
			assert.strictEqual( derived.get( 'summary' ), 'Robert - 26' );
		} );

		it( 'should return readonly interface', () => {
			const state = createState<TestState>( {
				name: 'Test',
				age: 20,
				active: false
			} );
			const derived = state.derive( ( current ) => ( {
				value: current.name
			} ) );

			// Derived should have readonly methods
			assert.ok( derived.get );
			assert.ok( derived.subscribe );
			assert.ok( derived.entries );
			assert.ok( derived.toObject );

			// Derived should not have write methods
			assert.strictEqual( ( derived as any ).set, undefined );
			assert.strictEqual( ( derived as any ).update, undefined );
		} );

		it( 'should notify subscribers of derived state', () => {
			const state = createState<TestState>( {
				name: '',
				age: 10,
				active: false
			} );

			const derived = state.derive( ( current ) => ( {
				isAdult: current.age >= 18
			} ) );

			const updates: Array<{ isAdult: boolean }> = [];
			derived.subscribe( ( update ) => {
				updates.push( update );
			} );

			// Clear initial notification
			updates.length = 0;

			state.set( 'age', 20 );

			assert.strictEqual( updates.length, 1 );
			assert.deepStrictEqual( updates[ 0 ], { isAdult: true } );
		} );

		it( 'should handle complex transformations', () => {
			const state = createState<TestState>( {
				name: 'Charlie',
				age: 15,
				active: true
			} );

			const derived = state.derive( ( current ) => ( {
				status: current.active ? 'online' : 'offline',
				category: current.age < 18 ? 'minor' : 'adult',
				fullInfo: `${current.name} is ${current.active ? 'active' : 'inactive'}`
			} ) );

			assert.strictEqual( derived.get( 'status' ), 'online' );
			assert.strictEqual( derived.get( 'category' ), 'minor' );
			assert.strictEqual( derived.get( 'fullInfo' ), 'Charlie is active' );

			state.set( 'age', 20 );
			assert.strictEqual( derived.get( 'category' ), 'adult' );

			state.set( 'active', false );
			assert.strictEqual( derived.get( 'status' ), 'offline' );
			assert.strictEqual( derived.get( 'fullInfo' ), 'Charlie is inactive' );
		} );
	} );
} );
