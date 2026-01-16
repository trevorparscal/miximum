/**
 * Type constraint for event definitions mapping event names to argument tuples.
 *
 * @example
 * type MyEvents = {
 *   click: [x: number, y: number],
 *   error: [message: string]
 * }
 */
export type EmitterEvents = Record<string, any[]>;

/**
 * Full emitter interface for typed event publishing and subscription.
 *
 * Supports event-specific callbacks, one-time listeners, promise-based event waiting,
 * and event filtering. The `emit` method is included for publishing events.
 *
 * @typeParam TEvents - Event definitions mapping event names to argument tuples
 */
export interface Emitter<TEvents extends EmitterEvents> {
	on: <TEventName extends keyof TEvents>(
		event: TEventName,
		callback: ( ...args: TEvents[ TEventName ] ) => void
	) => () => void,
	off: <TEventName extends keyof TEvents>(
		event: TEventName,
		callback?: ( ...args: TEvents[ TEventName ] ) => void
	) => void,
	once: <TEventName extends keyof TEvents>(
		event: TEventName,
		callback: ( ...args: TEvents[ TEventName ] ) => void
	) => void,
	next: <TEventName extends keyof TEvents>(
		event: TEventName
	) => Promise<TEvents[ TEventName ]>,
	clear: () => void,
	subscribe: ( callback: {
		[ K in keyof TEvents ]: ( event: K, ...args: TEvents[ K ] ) => void
	}[ keyof TEvents ] ) => () => void,
	emit: <TEventName extends keyof TEvents>(
		event: TEventName,
		...args: TEvents[ TEventName ]
	) => void,
	derive: {
		(): ReadonlyEmitter<TEvents>,
		<TDerivedEvents extends EmitterEvents = TEvents>(
			setup: ( emitter: { emit: <TEventName extends keyof TDerivedEvents>(
				event: TEventName,
				...args: TDerivedEvents[ TEventName ]
			) => void } ) => Partial<{
				[ K in keyof TEvents ]: ( ...args: TEvents[ K ] ) => void
			}>
		): ReadonlyEmitter<TDerivedEvents>
	},
	pick: <K extends keyof TEvents>( ...events: K[] ) => ReadonlyEmitter<Pick<TEvents, K>>,
	omit: <K extends keyof TEvents>( ...events: K[] ) => ReadonlyEmitter<Omit<TEvents, K>>
}

/**
 * Readonly emitter interface (omits emit method)
 *
 */
export type ReadonlyEmitter<TEvents extends EmitterEvents> = Omit<Emitter<TEvents>, 'emit'>;

// Namespace for emitter type utilities
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Emitter {
	export type infer<T> = T extends Emitter<infer E> ? E : never;
}

/**
 * Create a new emitter for publishing and subscribing to typed events.
 *
 * @typeParam TEvents - Type mapping of event names to argument tuples
 * @returns An Emitter object for managing events
 *
 * @example
 * // Define event types
 * type UserEvents = {
 *   login: [username: string],
 *   logout: [],
 *   messageReceived: [message: string, sender: string]
 * };
 *
 * // Create an emitter
 * const emitter = createEmitter<UserEvents>();
 *
 * // Subscribe to an event
 * const unsubscribe = emitter.on('login', (username) => {
 *   console.log(`${username} logged in`);
 * });
 *
 * // Emit an event
 * emitter.emit('login', 'alice');
 *
 * // Subscribe to the next occurrence of an event
 * const [message, sender] = await emitter.next('messageReceived');
 *
 * // Derive a filtered emitter
 * const derived = emitter.pick('login', 'logout');
 *
 * unsubscribe();
 */
export function createEmitter<TEvents extends EmitterEvents>(): Emitter<TEvents> {
	const topics = new Map<keyof TEvents, Set<( ...args: any[] ) => void>>();
	const subscriptions = new Set<( event: keyof TEvents, ...args: any[] ) => void>();

	/** Create a readonly emitter interface with custom pick/omit implementations. */
	function createReadonly<TFilteredEvents extends EmitterEvents>(
		pickFn: ReadonlyEmitter<TFilteredEvents>[ 'pick' ],
		omitFn: ReadonlyEmitter<TFilteredEvents>[ 'omit' ]
	): ReadonlyEmitter<TFilteredEvents> {
		return {
			on: ( event, callback ) => on( event as keyof TEvents, callback as any ),
			off: ( event, callback ) => off( event as keyof TEvents, callback as any ),
			once: ( event, callback ) => once( event as keyof TEvents, callback as any ),
			next: ( event ) => next( event as keyof TEvents ) as any,
			clear,
			subscribe: subscribe as any,
			derive: null as any,
			pick: pickFn,
			omit: omitFn
		};
	}

	/** Apply event transformations with optional filtering via predicate. */
	function applyTransform<TDerivedEvents extends EmitterEvents>(
		setup: ( emitter: {
			emit: <TEventName extends keyof TDerivedEvents>(
				event: TEventName,
				...args: TDerivedEvents[ TEventName ]
			) => void
		} ) => Partial<Record<string, ( ...args: any[] ) => void>>,
		predicate: ( event: keyof TEvents ) => boolean
	): ReadonlyEmitter<TDerivedEvents> {
		const derivedEmitter = createEmitter<TDerivedEvents>();
		const transform = setup( {
			emit: ( event, ...args ) => derivedEmitter.emit( event, ...args )
		} );

		subscribe( ( event, ...args ) => {
			if ( predicate( event ) ) {
				if ( transform && event in transform ) {
					const transformFn = transform[ event as string ];
					if ( transformFn ) {
						transformFn( ...args as any );
					}
				} else {
					derivedEmitter.emit( event as keyof TDerivedEvents, ...args as any );
				}
			}
		} );

		return derivedEmitter.derive();
	}

	/** Create a filtered derive function for a readonly emitter using a predicate. */
	function filterReadonly<TFilteredEvents extends EmitterEvents>(
		predicate: ( event: keyof TEvents ) => boolean,
		emitter: ReadonlyEmitter<TFilteredEvents>
	) {
		return function filteredDerive<TDerivedEvents extends EmitterEvents = TFilteredEvents>(
			setup?: ( emitter: {
				emit: <TEventName extends keyof TDerivedEvents>(
					event: TEventName,
					...args: TDerivedEvents[ TEventName ]
				) => void
			} ) => Partial<Record<string, ( ...args: any[] ) => void>>
		): ReadonlyEmitter<TFilteredEvents> | ReadonlyEmitter<TDerivedEvents> {
			if ( !setup ) {
				return emitter;
			}
			return applyTransform( setup, predicate );
		};
	}

	/** Register a callback for an event; returns an unsubscribe function. */
	function on<TEventName extends keyof TEvents>(
		event: TEventName,
		callback: ( ...args: TEvents[ TEventName ] ) => void
	) {
		let topic = topics.get( event );
		if ( !topic ) {
			topic = new Set();
			topics.set( event, topic );
		}
		topic.add( callback );
		return () => {
			off( event, callback );
		};
	}

	/** Remove a specific callback or all callbacks for an event. */
	function off<TEventName extends keyof TEvents>(
		event: TEventName,
		callback?: ( ...args: TEvents[ TEventName ] ) => void
	) {
		const topic = topics.get( event );
		if ( topic ) {
			if ( !callback ) {
				topics.delete( event );
				return;
			}
			topic.delete( callback );
			if ( topic.size === 0 ) {
				topics.delete( event );
			}
		}
	}

	/** Register a callback that will only be invoked once. */
	function once<TEventName extends keyof TEvents>(
		event: TEventName,
		callback: ( ...args: TEvents[ TEventName ] ) => void
	) {
		function wrapper( ...args: TEvents[ TEventName ] ) {
			callback( ...args );
			off( event, wrapper );
		}
		on( event, wrapper );
	}

	/** Return a promise that resolves when the event is next emitted. */
	function next<TEventName extends keyof TEvents>(
		event: TEventName
	) {
		return new Promise<TEvents[ TEventName ]>( ( resolve ) => {
			once( event, ( ...args ) => resolve( args as TEvents[ TEventName ] ) );
		} );
	}

	/** Emit an event with arguments, notifying all listeners and subscribers. */
	function emit<TEventName extends keyof TEvents>(
		event: TEventName,
		...args: TEvents[ TEventName ]
	) {
		const topic = topics.get( event );
		if ( topic ) {
			for ( const callback of topic ) {
				callback( ...args );
			}
		}
		// Call wildcard subscribers
		for ( const subscriber of subscriptions ) {
			subscriber( event, ...args );
		}
	}

	/** Subscribe to all events; returns an unsubscribe function. */
	function subscribe<TEventName extends keyof TEvents = keyof TEvents>(
		callback: ( event: TEventName, ...args: TEvents[ TEventName ] ) => void
	) {
		subscriptions.add( callback as any );
		return () => {
			subscriptions.delete( callback as any );
		};
	}

	/** Remove all event listeners and subscribers. */
	function clear() {
		topics.clear();
		subscriptions.clear();
	}

	/** Create a readonly emitter that only exposes specified events. */
	function pick<K extends keyof TEvents>( ...events: K[] ): ReadonlyEmitter<Pick<TEvents, K>> {
		const eventSet = new Set( events );
		type PickedEvents = Pick<TEvents, K>;

		const emitter = createReadonly<PickedEvents>(
			( ...pickedEvents ) => pick( ...pickedEvents ),
			( ...omittedEvents ) => {
				const remainingEvents = events.filter(
					( e ) => !omittedEvents.includes( e as any )
				) as Exclude<K, any>[];
				return pick( ...remainingEvents );
			}
		);

		emitter.derive = filterReadonly<PickedEvents>(
			( event ) => eventSet.has( event as K ),
			emitter
		);

		return emitter;
	}

	/** Create a readonly emitter that excludes specified events. */
	function omit<K extends keyof TEvents>( ...events: K[] ): ReadonlyEmitter<Omit<TEvents, K>> {
		type OmittedEvents = Omit<TEvents, K>;
		const eventSet = new Set( events );

		const emitter = createReadonly<OmittedEvents>(
			( ...pickedEvents ) => pick( ...pickedEvents as ( keyof TEvents )[] ) as any,
			<O extends keyof OmittedEvents>( ...omittedEvents: O[] ) => omit(
				...[ ...events, ...omittedEvents ] as ( K | O )[]
			) as any
		);

		emitter.derive = filterReadonly<OmittedEvents>(
			( event ) => !eventSet.has( event as K ),
			emitter
		);

		return emitter;
	}

	/** Create a readonly view or a transformed derived emitter. */
	function derive(): ReadonlyEmitter<TEvents>;
	function derive<TDerivedEvents extends EmitterEvents = TEvents>(
		setup: ( emitter: {
			emit: <TEventName extends keyof TDerivedEvents>(
				event: TEventName,
				...args: TDerivedEvents[ TEventName ]
			) => void
		} ) => Partial<{
			[ K in keyof TEvents ]: ( ...args: TEvents[ K ] ) => void
		}>
	): ReadonlyEmitter<TDerivedEvents>;
	function derive<TDerivedEvents extends EmitterEvents = TEvents>(
		setup?: ( emitter: {
			emit: <TEventName extends keyof TDerivedEvents>(
				event: TEventName,
				...args: TDerivedEvents[ TEventName ]
			) => void
		} ) => Partial<{
			[ K in keyof TEvents ]: ( ...args: TEvents[ K ] ) => void
		}>
	): ReadonlyEmitter<TEvents> | ReadonlyEmitter<TDerivedEvents> {
		if ( !setup ) {
			return { on, off, once, next, clear, subscribe, derive, pick, omit };
		}
		return applyTransform( setup, () => true );
	}

	return { on, off, once, next, clear, subscribe, emit, derive, pick, omit };
}
