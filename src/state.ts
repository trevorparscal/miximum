/**
 * Type constraint for state data mapping keys to their value types.
 *
 * @example
 * type UserState = {
 *   name: string,
 *   age: number,
 *   email: string
 * }
 */
export type StateData = Record<string, any>;

/**
 * Full state interface for typed key-value state management.
 *
 * Provides reactive state with subscription support, partial updates,
 * derived state computation, and filtering via `pick` and `omit`.
 * Implements Svelte-compatible store contract.
 *
 * @typeParam TData - Type mapping of keys to their values in the state
 */
export interface State<TData extends StateData = StateData> {
	get: <TKey extends keyof TData>( key: TKey ) => TData[ TKey ] | undefined,
	set: <TKey extends keyof TData>(
		key: TKey,
		value: undefined extends TData[ TKey ] ? TData[ TKey ] : Exclude<TData[ TKey ], undefined>
	) => void,
	update: (
		updater: TData | ( ( current: TData ) => TData )
	) => void,
	subscribe: ( listener: ( value: TData ) => void ) => () => void,
	entries: () => IterableIterator<[ keyof TData, TData[ keyof TData ] ]>,
	toObject: () => TData,
	pick: <K extends keyof TData>( ...keys: K[] ) => ReadonlyState<Pick<TData, K>>,
	omit: <K extends keyof TData>( ...keys: K[] ) => ReadonlyState<Omit<TData, K>>,
	derive: {
		(): ReadonlyState<TData>,
		<TDerivedData extends StateData>(
			transform: ( current: Partial<TData> ) => Partial<TDerivedData>
		): ReadonlyState<TDerivedData>
	}
}

/**
 * Readonly state interface (omits set and update methods)
 *
 * @typeParam TData - Type mapping of keys to their values in the state
 */
export type ReadonlyState<TData extends StateData> = Omit<State<TData>, 'set' | 'update'>;

// Namespace for state type utilities
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace State {
	export type infer<T> = T extends State<infer D> ? D : never;
}

/**
 * Create a new synchronized state for managing typed key-value data.
 *
 * @typeParam TData - Type mapping of keys to their values in the state
 * @param initial - Initial data to populate the state
 * @returns A State object for managing the data
 *
 * @example
 * // Create a typed state object
 * const state = createState({ count: 0, name: 'Alice' });
 *
 * // Set a value
 * state.set('count', 42);
 *
 * // Subscribe to changes
 * const unsubscribe = state.subscribe(changes => {
 *   console.log('State changed:', changes);
 * });
 *
 * // Update multiple values at once
 * state.update({ count: 10, name: 'Bob' });
 *
 * // Derive a computed state
 * const derived = state.derive(current => ({
 *   doubled: current.count * 2
 * }));
 *
 * unsubscribe();
 */
export function createState<TData extends StateData>(
	initial: TData
): State<TData> {
	const store = new Map<keyof TData, TData[ keyof TData ]>(
		Object.entries( initial ) as [ keyof TData, TData[ keyof TData ] ][]
	);
	const listeners = new Set<( value: TData ) => void>();

	/** Get the value for a specific key. */
	function get<TKey extends keyof TData>( key: TKey ) {
		return store.get( key ) as TData[ TKey ] | undefined;
	}

	/** Set a value for a key (only allows undefined if the type permits). */
	function set<TKey extends keyof TData>(
		key: TKey,
		value: undefined extends TData[ TKey ] ? TData[ TKey ] : Exclude<TData[ TKey ], undefined>
	) {
		if ( value === undefined ) {
			store.delete( key );
		} else {
			store.set( key, value );
		}
		notify();
	}

	/** Update multiple values with an object or updater function. */
	function update(
		updater: TData | ( ( current: TData ) => TData )
	) {
		const changes = typeof updater === 'function' ? updater( toObject() ) : updater;
		const keys = Object.keys( changes ) as Array<keyof TData>;

		for ( const key of keys ) {
			const value = changes[ key ];
			if ( value === undefined ) {
				store.delete( key );
			} else {
				store.set( key, value as TData[ typeof key ] );
			}
		}
		notify();
	}

	/**
	 * Subscribe to state changes; returns an unsubscribe function.
	 *
	 * Implements Svelte-compatible store contract.
	 */
	function subscribe( listener: ( value: TData ) => void ) {
		listeners.add( listener );
		listener( toObject() );
		return () => {
			listeners.delete( listener );
		};
	}

	/** Get an iterator over all key-value pairs. */
	function entries() {
		return store.entries();
	}

	/** Convert the state to a plain object. */
	function toObject() {
		return Object.fromEntries( store ) as TData;
	}

	/** Notify all listeners with current state. */
	function notify() {
		const current = toObject();
		for ( const listener of listeners ) {
			listener( current );
		}
	}

	/** Filter object keys based on predicate. */
	function filter( obj: TData, predicate: ( key: keyof TData ) => boolean ) {
		const filtered: Partial<TData> = {};
		for ( const key in obj ) {
			if ( predicate( key as keyof TData ) ) {
				filtered[ key ] = obj[ key ];
			}
		}
		return filtered;
	}

	/** Create a readonly state interface with custom implementations. */
	function createReadonly<TFilteredData extends StateData>(
		getFn: ReadonlyState<TFilteredData>[ 'get' ],
		subscribeFn: ReadonlyState<TFilteredData>[ 'subscribe' ],
		entriesFn: ReadonlyState<TFilteredData>[ 'entries' ],
		toObjectFn: ReadonlyState<TFilteredData>[ 'toObject' ],
		pickFn: ReadonlyState<TFilteredData>[ 'pick' ],
		omitFn: ReadonlyState<TFilteredData>[ 'omit' ]
	): ReadonlyState<TFilteredData> {
		return {
			get: getFn,
			subscribe: subscribeFn,
			entries: entriesFn,
			toObject: toObjectFn,
			derive: null as any,
			pick: pickFn,
			omit: omitFn
		};
	}

	/** Apply state transformations with optional filtering via predicate. */
	function applyTransform<TDerivedData extends StateData>(
		transform: ( current: TData ) => TDerivedData,
		predicate: ( key: keyof TData ) => boolean
	): ReadonlyState<TDerivedData> {
		const initialFiltered = filter( toObject(), predicate );
		const derivedState = createState<TDerivedData>( transform( initialFiltered as TData ) );

		subscribe( ( current ) => {
			const filtered = filter( current, predicate );
			const transformed = transform( filtered as TData );
			derivedState.update( transformed );
		} );

		return derivedState.derive();
	}

	/** Create a filtered derive function for a readonly state using a predicate. */
	function filterReadonly<TFilteredData extends StateData>(
		predicate: ( key: keyof TData ) => boolean,
		state: ReadonlyState<TFilteredData>
	) {
		return function filteredDerive<TDerivedData extends StateData = TFilteredData>(
			transform?: ( current: TFilteredData ) => TDerivedData
		): ReadonlyState<TFilteredData> | ReadonlyState<TDerivedData> {
			if ( !transform ) {
				return state;
			}
			return applyTransform(
				( current: TData ) => transform( current as any as TFilteredData ),
				predicate
			) as ReadonlyState<TDerivedData>;
		};
	}

	/** Create a readonly state that only exposes specified keys. */
	function pick<K extends keyof TData>( ...keys: K[] ): ReadonlyState<Pick<TData, K>> {
		const keySet = new Set( keys );
		type PickedData = Pick<TData, K>;

		const state = createReadonly<PickedData>(
			<TKey extends K>( key: TKey ) => get( key ),
			( listener: ( value: PickedData ) => void ) => {
				return subscribe( ( current ) => {
					const filtered = filter(
						current,
						( k ) => keySet.has( k as K )
					) as PickedData;
					listener( filtered );
				} );
			},
			() => {
				return ( function * () {
					for ( const [ key, value ] of store.entries() ) {
						if ( keySet.has( key as K ) ) {
							yield [ key as K, value as TData[ K ] ];
						}
					}
				}() ) as IterableIterator<[ K, TData[ K ] ]>;
			},
			() => {
				return filter( toObject(), ( k ) => keySet.has( k as K ) ) as PickedData;
			},
			<P extends K>( ...pickedKeys: P[] ) => pick( ...pickedKeys ),
			<O extends K>( ...omittedKeys: O[] ) => {
				const remaining = keys.filter(
					( k ) => !omittedKeys.includes( k as any )
				) as Exclude<K, O>[];
				return pick( ...remaining );
			}
		);

		state.derive = filterReadonly<PickedData>(
			( k ) => keySet.has( k as K ),
			state
		);

		return state;
	}

	/** Create a readonly state that excludes specified keys. */
	function omit<K extends keyof TData>( ...keys: K[] ): ReadonlyState<Omit<TData, K>> {
		const keySet = new Set( keys );
		type OmittedData = Omit<TData, K>;

		const state = createReadonly<OmittedData>(
			<TKey extends Exclude<keyof TData, K>>( key: TKey ) => get( key ),
			( listener: ( value: OmittedData ) => void ) => {
				return subscribe( ( current ) => {
					const filtered = filter(
						current,
						( k ) => !keySet.has( k as K )
					) as OmittedData;
					listener( filtered );
				} );
			},
			() => {
				return ( function * () {
					for ( const [ key, value ] of store.entries() ) {
						if ( !keySet.has( key as K ) ) {
							yield [
								key as Exclude<keyof TData, K>,
								value as TData[ Exclude<keyof TData, K> ]
							];
						}
					}
				}() ) as IterableIterator<[
					Exclude<keyof TData, K>,
					TData[ Exclude<keyof TData, K> ]
				]>;
			},
			() => {
				return filter(
					toObject(),
					( k ) => !keySet.has( k as K )
				) as OmittedData;
			},
			<P extends Exclude<keyof TData, K>>( ...pickedKeys: P[] ) => {
				return pick( ...pickedKeys as ( keyof TData )[] ) as any;
			},
			<O extends Exclude<keyof TData, K>>( ...omittedKeys: O[] ) => {
				return omit( ...[ ...keys, ...omittedKeys ] as ( K | O )[] ) as any;
			}
		);

		state.derive = filterReadonly<OmittedData>(
			( k ) => !keySet.has( k as K ),
			state
		);

		return state;
	}

	/** Create a readonly view or a transformed derived state. */
	function derive(): ReadonlyState<TData>;
	function derive<TDerivedData extends StateData>(
		transform: ( current: TData ) => TDerivedData
	): ReadonlyState<TDerivedData>;
	function derive<TDerivedData extends StateData>(
		transform?: ( current: TData ) => TDerivedData
	): ReadonlyState<TData> | ReadonlyState<TDerivedData> {
		if ( !transform ) {
			return { get, subscribe, entries, toObject, pick, omit, derive };
		}
		return applyTransform( transform, () => true );
	}

	return {
		get,
		set,
		update,
		subscribe,
		entries,
		toObject,
		pick,
		omit,
		derive
	};
}
