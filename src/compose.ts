import {
	type ComponentDesign,
	type ComponentDesignList,
	type ComponentDesignMap,
	type ExtractDepsFromList,
	type ExtractDepsFromMap,
	type MappedComponentDesign,
	type MergedComponentDesign,
	makeCreate,
	makeExtendTransform,
	makeWithTransform
} from './component';

/**
 * Returns true if the value is a plain object (not null, not array, not class instance).
 *
 * @param obj - Value to check
 * @returns The value is a plain object
 */
function isPlainObject( obj: unknown ): obj is Record<string, unknown> {
	if ( typeof obj !== 'object' || obj === null ) {
		return false;
	}
	const proto = Object.getPrototypeOf( obj );
	return proto === Object.prototype || proto === null;
}

/**
 * Compose a list of designs into a single merged design.
 * Later designs overwrite conflicting keys from earlier ones.
 *
 * @example
 * const Logger = design( ( { prefix }: { prefix: string } ) => ( {
 * 	log: ( m: string ) => `[${prefix}] ${m}`
 * } ) );
 * const Timer = design( ( { prefix }: { prefix: string } ) => ( {
 * 	stamp: () => `${prefix}:${Date.now()}`
 * } ) );
 * const Utilities = compose( [ Logger, Timer ] );
 * const util = Utilities.create( { prefix: 'INFO' } );
 * console.log( util.log( 'Hello' ) ); // "[INFO] Hello"
 * console.log( util.stamp() );        // "INFO:1634234234234"
 */
export function compose<TList extends ComponentDesignList<any>>(
	list: TList
): ComponentDesign<ExtractDepsFromList<TList>, MergedComponentDesign<TList>>;

/**
 * Compose a map of designs into a nested design under their keys.
 *
 * @example
 * const Http = design( ( { port }: { port: number } ) => ( { listen: () => `http:${port}` } ) );
 * const Ws = design( ( { port }: { port: number } ) => ( { listen: () => `ws:${port + 1}` } ) );
 * const Servers = compose( { http: Http, ws: Ws } );
 * const srv = Servers.create( { port: 3000 } );
 * console.log( srv.http.listen() ); // "http:3000"
 * console.log( srv.ws.listen() );   // "ws:3001"
 */
export function compose<TMap extends ComponentDesignMap<any>>(
	map: TMap
): ComponentDesign<ExtractDepsFromMap<TMap>, MappedComponentDesign<TMap>>;
export function compose<TDeps = any>(
	designs: ComponentDesignList<TDeps> | ComponentDesignMap<TDeps>
): ComponentDesign<TDeps, any> {
	const setup = ( deps: TDeps ) => {
		if ( Array.isArray( designs ) ) {
			return createListComposedInstance( designs, deps );
		} else if ( isPlainObject( designs ) ) {
			return createMapComposedInstance( designs, deps );
		} else {
			throw new Error( 'Invalid designs argument to compose()' );
		}
	};

	type CreateFn = TDeps extends void ?
		{ (): any, ( deps: TDeps ): any } :
		keyof TDeps extends never ?
			{ (): any, ( deps: TDeps ): any } :
			{ ( deps: TDeps ): any };

	const create = makeCreate( setup ) as CreateFn;

	return {
		create,
		with: makeWithTransform( setup ),
		extend: makeExtendTransform( setup )
	} as ComponentDesign<TDeps, any>;
}

/**
 * Cache of property maps for list-composed designs.
 */
const listComposedPropertyMapCache: WeakMap<
	object,
	Map<string | symbol, { index: number, desc: PropertyDescriptor, proto?: any }>
> = new WeakMap();

/**
 * Compose a list of component designs into a single proxy instance.
 *
 * @param items List of components to compose together
 * @param deps Common dependency of all components
 * @returns Merged component instance
 */
export function createListComposedInstance<TDeps>(
	items: ComponentDesignList<TDeps>,
	deps: TDeps
) {
	// Memoize property map structure by design list identity
	let propertyMap = listComposedPropertyMapCache.get( items );
	const instances = items.map( ( item ) => item.create( deps ) );
	if ( !propertyMap ) {
		propertyMap = new Map();
		for ( let i = 0; i < instances.length; i++ ) {
			const inst = instances[ i ];
			const keys = Reflect.ownKeys( inst );
			for ( const key of keys ) {
				const desc = Object.getOwnPropertyDescriptor( inst, key );
				if ( desc ) {
					propertyMap.set( key, { index: i, desc, proto: undefined } );
				}
			}
			let proto = Object.getPrototypeOf( inst );
			while ( proto && proto !== Object.prototype ) {
				for ( const key of Reflect.ownKeys( proto ) ) {
					if ( !propertyMap.has( key ) ) {
						const desc = Object.getOwnPropertyDescriptor( proto, key );
						if ( desc ) {
							propertyMap.set( key, { index: i, desc, proto } );
						}
					}
				}
				proto = Object.getPrototypeOf( proto );
			}
		}
		listComposedPropertyMapCache.set( items, propertyMap );
	}
	return new Proxy( {}, {
		get( _target, prop, _receiver ) {
			const entry = propertyMap.get( prop );
			if ( entry ) {
				const { index, desc, proto } = entry;
				const inst = instances[ index ];
				if ( typeof desc.get === 'function' ) {
					return desc.get.call( inst );
				} else if ( typeof desc.value !== 'undefined' ) {
					if ( proto && typeof desc.value === 'function' ) {
						return desc.value.bind( inst );
					}
					return inst[ prop as keyof typeof inst ];
				}
			}
			return undefined;
		},
		set( _target, prop, value, _receiver ) {
			const entry = propertyMap.get( prop );
			if ( entry ) {
				const { index, desc } = entry;
				const inst = instances[ index ];
				if ( typeof desc.set === 'function' ) {
					desc.set.call( inst, value );
					return true;
				} else if ( desc.writable ) {
					inst[ prop as keyof typeof inst ] = value;
					return true;
				}
			}
			if ( instances.length > 0 ) {
				instances[ instances.length - 1 ][ prop as keyof typeof instances[ 0 ] ] = value;
				return true;
			}
			return false;
		},
		has( _target, prop ) {
			return propertyMap.has( prop );
		},
		ownKeys( _target ) {
			return Array.from( propertyMap.keys() );
		},
		getOwnPropertyDescriptor( _target, prop ) {
			const entry = propertyMap.get( prop );
			return entry ? entry.desc : undefined;
		}
	} );
}

/**
 * Compose a map of component designs into an object of component instances.
 * Only own properties are used.
 *
 * @param items Map of components to compose together
 * @param deps Common dependency of all components
 * @returns Object mapping keys to component instances
 */
export function createMapComposedInstance<TDeps>(
	items: ComponentDesignMap<TDeps>,
	deps: TDeps
) {
	const result: Record<string, unknown> = {};
	for ( const key of Object.keys( items ) ) {
		result[ key ] = items[ key ].create( deps );
	}
	return result;
}
