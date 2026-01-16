/**
 * Function signature for creating a component instance from an input
 * (dependencies or parent instance).
 */
export type ComponentSetup<TInput, TInstance> = ( input: TInput ) => TInstance;

/**
 * Extract the component instance type from a ComponentDesign, or return T if already an instance.
 *
 * @typeParam T - Either a ComponentDesign or a component instance type
 */
export type Component<T> = T extends ComponentDesign<any, infer C> ? C : T;

// Namespace for component type utilities
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Component {
	export type infer<T> = T extends ComponentDesign<any, infer C> ? C : T;
}

// Helper type to convert a union to an intersection
type UnionToIntersection<U> =
	( U extends any ? ( k: U ) => void : never ) extends ( k: infer I ) => void ? I : never;

/**
 * Array of component designs for composition patterns.
 *
 * @typeParam TDeps - Type of dependencies passed to each component
 */
export type ComponentDesignList<TDeps> = readonly ComponentDesign<TDeps, any>[];

/**
 * Map of component designs for named composition patterns.
 *
 * @typeParam TDeps - Type of dependencies passed to each component
 */
export type ComponentDesignMap<TDeps> = Record<string, ComponentDesign<TDeps, any>>;

/**
 * Merge multiple component designs from a list into a single intersection type.
 *
 * @typeParam TList - Array of component designs to merge
 */
export type MergedComponentDesign<TList extends ComponentDesignList<any>> =
	UnionToIntersection<Component<TList[ number ]>>;

/**
 * Map component designs to their instances, preserving the object structure.
 *
 * @typeParam TMap - Object mapping names to component designs
 */
export type MappedComponentDesign<TMap extends ComponentDesignMap<any>> =
	{ [ K in keyof TMap ]: Component<TMap[ K ]> };

/**
 * Extract dependencies type from a list of component designs.
 *
 * @typeParam TList - Array of component designs
 */
export type ExtractDepsFromList<TList extends ComponentDesignList<any>> =
	TList extends ComponentDesignList<infer TDeps> ? TDeps : never;

/**
 * Extract dependencies type from a map of component designs.
 *
 * @typeParam TMap - Object mapping names to component designs
 */
export type ExtractDepsFromMap<TMap extends ComponentDesignMap<any>> =
	TMap extends ComponentDesignMap<infer TDeps> ? TDeps : never;

/**
 * Child argument for `design(parent, child)`.
 * Either a setup function (receives parent instance) or another design.
 *
 * @typeParam TDeps - Dependencies type for the parent/child designs
 * @typeParam TParent - Parent component instance type
 * @typeParam TInstance - Child component instance type
 */
export type ChildArg<TDeps, TParent, TInstance> =
	ComponentSetup<TParent, TInstance> |
	ComponentDesign<TDeps, TInstance>;

/**
 * Component design interface for creating component instances.
 *
 * @typeParam TDeps - Type of the dependencies object passed to create the component
 * @typeParam TInstance - Type of the component instance
 */
export interface ComponentDesign<TDeps, TInstance> {
	create: TDeps extends void ?
		{
			(): TInstance,
			( deps: TDeps ): TInstance
		} :
		keyof TDeps extends never ?
			{
				(): TInstance,
				( deps: TDeps ): TInstance
			} :
			{
				( deps: TDeps ): TInstance
			},

	/**
	 * Create a new design with specific dependency values pre-filled.
	 * The provided values are removed from the required dependencies.
	 *
	 * @example
	 * const Person = design( ( dep: { name: string, color: string } ) => ( {
	 * 	name: dep.name,
	 * 	color: dep.color
	 * } ) );
	 * const RedPerson = Person.with( { color: 'red' } );
	 * RedPerson.create( { name: 'Charlie' } ); // Only requires name, color is pre-filled
	 */
	with<P extends Partial<TDeps>>(
		values: P
	): ComponentDesign<Omit<TDeps, keyof P>, TInstance>,

	/**
	 * Create a new design that adds additional dependencies to the existing ones.
	 *
	 * @example
	 * const Logger = design( ( dep: { prefix: string } ) => ( {
	 * 	log: ( m: string ) => `[${dep.prefix}] ${m}`
	 * } ) );
	 * const StampedLogger = design( Logger.extend<{ timestamp: boolean }>(), ( dep ) => ( {
	 * 	log: ( m: string ) =>
	 * 		dep.timestamp ? `${Date.now()} [${dep.prefix}] ${m}` : `[${dep.prefix}] ${m}`
	 * } ) );
	 * StampedLogger.create( { prefix: 'INFO', timestamp: true } );
	 */
	extend<E extends Record<string, any>>(): ComponentDesign<TDeps & E, TInstance>
}

/**
 * Helper to construct a polymorphic `create()` function from a setup.
 * Allows calling with no args when `TDeps` is `void`, otherwise
 * requires a dependencies object.
 */
function makeCreate<TInstance>(
	setup: ( deps: void ) => TInstance
): { (): TInstance, ( deps: void ): TInstance };
function makeCreate<TDeps, TInstance>(
	setup: ( deps: TDeps ) => TInstance
): { ( deps: TDeps ): TInstance };
function makeCreate<TDeps, TInstance>(
	setup: ( deps: TDeps ) => TInstance
) {
	const create = ( ( ...args: [ TDeps ] | [] ) => {
		const dependencies = ( args.length > 0 ? args[ 0 ] : undefined ) as TDeps;
		return setup( dependencies );
	} ) as unknown as ( ( deps: TDeps ) => TInstance );
	return create as any;
}

/**
 * Create a .with() method that pre-fills dependencies.
 */
function makeWithTransform<TDeps, TInstance>(
	setupFn: ( deps: TDeps ) => TInstance
) {
	return <P extends Partial<TDeps>>(
		values: P
	): ComponentDesign<Omit<TDeps, keyof P>, TInstance> => {
		return design( ( deps: Omit<TDeps, keyof P> ) => {
			const fullDeps = { ...values, ...deps } as TDeps;
			return setupFn( fullDeps );
		} );
	};
}

/**
 * Create an .extend() method that adds additional dependencies.
 */
function makeExtendTransform<TDeps, TInstance>(
	setupFn: ( deps: TDeps ) => TInstance
) {
	return <E extends Record<string, any>>(): ComponentDesign<TDeps & E, TInstance> => {
		return design( ( deps: TDeps & E ) => {
			return setupFn( deps as TDeps );
		} );
	};
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
 */
export function compose<TMap extends ComponentDesignMap<any>>(
	map: TMap
): ComponentDesign<ExtractDepsFromMap<TMap>, MappedComponentDesign<TMap>>;
export function compose<TDeps = any>(
	designs: ComponentDesignList<TDeps> | ComponentDesignMap<TDeps>
): ComponentDesign<TDeps, any> {
	// Helper: Execute designs (list or map) and return merged or nested result
	const createDesignResult = (
		items: ComponentDesignList<TDeps> | ComponentDesignMap<TDeps>,
		deps: TDeps,
		isListArg: boolean
	): any => {
		const result = {} as any;
		if ( isListArg ) {
			for ( const itemDesign of items as ComponentDesignList<TDeps> ) {
				Object.assign( result, itemDesign.create( deps ) );
			}
		} else {
			for ( const key in items as ComponentDesignMap<TDeps> ) {
				result[ key ] = (
					items as ComponentDesignMap<TDeps>
				)[ key ].create( deps );
			}
		}
		return result;
	};

	const isList = Array.isArray( designs );

	const setup = ( ( deps: TDeps ) => createDesignResult( designs, deps, isList ) );

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
 * Define a simple component design from a setup function.
 *
 * @example
 * const Env = design( () => ( { apiKey: process.env.API_KEY } ) );
 * const instance = Env.create();
 */
export function design<TDeps = void, TInstance = any>(
	setup: ( deps: TDeps ) => TInstance
): ComponentDesign<TDeps, TInstance>;
/**
 * Define a child design that depends on a parent design.
 * The child can be a setup function (receives parent instance) or another design.
 *
 * @example
 * const Cache = design( () => ( {
 * 	get: ( k: string ) => undefined,
 * 	set: ( k: string, v: string ) => void 0
 * } ) );
 * const Documents = design( Cache, ( store ) => ( {
 * 	get: ( id: string ) => store.get( `doc:${id}` ),
 * 	set: ( id: string, val: string ) => store.set( `doc:${id}`, val )
 * } ) );
 */
export function design<TDeps, TParent, TInstance>(
	parent: ComponentDesign<TDeps, TParent>,
	child: ChildArg<TDeps, TParent, TInstance>
): ComponentDesign<TDeps, TInstance>;
export function design<TDeps = any, TParent = any, TInstance = any>(
	setupOrParent: ( ( deps: TDeps ) => TInstance ) | ComponentDesign<TDeps, TParent>,
	child?: ChildArg<TDeps, TParent, TInstance>
): ComponentDesign<TDeps, TInstance> {
	const isComponentDesign = ( obj: unknown ): obj is ComponentDesign<any, any> => !!obj && typeof obj === 'object' && 'create' in obj && typeof obj.create === 'function';

	const isParentDesign = isComponentDesign( setupOrParent );

	let setupFn: ( deps: TDeps ) => TInstance;

	if ( !isParentDesign ) {
		// design( setup )
		setupFn = setupOrParent as ( deps: TDeps ) => TInstance;
	} else {
		// design( parent, child ) where child is either setup or ComponentDesign
		const parentDesign = setupOrParent as ComponentDesign<TDeps, TParent>;
		if ( typeof child === 'function' ) {
			setupFn = ( deps: TDeps ) => {
				const parent = parentDesign.create( deps );
				return ( child as ComponentSetup<TParent, TInstance> )( parent );
			};
		} else if ( child && isComponentDesign( child ) ) {
			const childDesign = child as ComponentDesign<TDeps, TInstance>;
			setupFn = ( deps: TDeps ) => childDesign.create( deps );
		} else {
			throw new Error( 'Invalid child argument to design()' );
		}
	}

	type CreateFn = TDeps extends void ?
		{ (): TInstance, ( deps: TDeps ): TInstance } :
		keyof TDeps extends never ?
			{ (): TInstance, ( deps: TDeps ): TInstance } :
			{ ( deps: TDeps ): TInstance };

	const create = makeCreate( setupFn ) as CreateFn;

	return {
		create,
		with: makeWithTransform( setupFn ),
		extend: makeExtendTransform( setupFn )
	} as ComponentDesign<TDeps, TInstance>;
}
