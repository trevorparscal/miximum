import { design } from './design';

// Helper type to convert a union to an intersection
type UnionToIntersection<U> =
	( U extends any ? ( k: U ) => void : never ) extends ( k: infer I ) => void ? I : never;

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
 * Component design interface for creating component instances.
 *
 * @typeParam TDeps - Type of the dependencies object passed to create the component
 * @typeParam TInstance - Type of the component instance
 */
export interface ComponentDesign<TDeps, TInstance> {
	/**
	 * Create a new component instance with the given dependencies.
	 *
	 * @example
	 * const Logger = design( ( { prefix }: { prefix: string } ) => ( {
	 * 	log: ( m: string ) => `[${prefix}] ${m}`
	 * } ) );
	 * const logger = Logger.create( { prefix: 'INFO' } );
	 * console.log( logger.log( 'Hello' ) ); // "[INFO] Hello"
	 */
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
 *
 * @param setup - Setup function to create component instance
 * @returns Polymorphic create function
 */
export function makeCreate<TDeps, TInstance>(
	setup: ( deps: TDeps ) => TInstance
): TDeps extends void ?
	{ (): TInstance, ( deps: void ): TInstance } :
	{ ( deps: TDeps ): TInstance } {
	return ( ( ...args: [TDeps] | [] ) => {
		const dependencies = ( args.length > 0 ? args[ 0 ] : undefined ) as TDeps;
		return setup( dependencies );
	} ) as any;
}

/**
 * Create a .with() method that pre-fills dependencies.
 *
 * @param setupFn - Setup function to create component instance
 * @returns .with() method for the design
 */
export function makeWithTransform<TDeps, TInstance>(
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
 *
 * @param setupFn - Setup function to create component instance
 * @returns .extend() method for the design
 */
export function makeExtendTransform<TDeps, TInstance>(
	setupFn: ( deps: TDeps ) => TInstance
) {
	return <E extends Record<string, any>>(): ComponentDesign<TDeps & E, TInstance> => {
		return design( ( deps: TDeps & E ) => {
			return setupFn( deps as TDeps );
		} );
	};
}
