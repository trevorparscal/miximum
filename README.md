# Miximum

Mix your TypeScript code together with minimal explicit types.

## Installation

```bash
npm install miximum
```

## Quick Start

Miximum provides three key features for building TypeScript applications:

* **[Designing and Composing Components](#designing-and-composing-components)** - Type-safe dependency injection and composition system that eliminates boilerplate interfaces
* **[Emitting Events](#emitting-events)** - Minimal event system with strong typing per event name
* **[Reactive State](#reactive-state)** - Tiny mutable state store with subscriptions and derivations

## What are components?

Components are simple object factories: take a dependencies object, run setup, return a component instance.

```typescript
import { design } from 'miximum';

const ConsoleLogger = design( ( { name }: { name: string } ) => {
	const prefix = name.substring( 0, 5 ).toLowerCase();
	return {
		write: ( ...args: any[] ) => console.log( `[${prefix}]`, ...args )
	};
} );

const loggerA = ConsoleLogger.create( { name: 'a' } );
const loggerB = ConsoleLogger.create( { name: 'b' } );

loggerA.write( 'test' ); // outputs: [a] test
loggerB.write( 'test' ); // outputs: [b] test
```

This is more than just functions with extra steps – components give you type-safe dependency injection without hand-writing interface types.

<!-- eslint-disable no-undef -->
```typescript
import { design, compose } from 'miximum';

const MemoryStore = design( () => {
	const data = new Map<string, string>();
	return {
		set: ( key: string, value: string ) => data.set( key, value ),
		get: ( key: string ) => data.get( key ),
		remove: ( key: string ) => data.set( key, undefined )
	};
} );

const RedisStore = design( () => {
	const client = new Redis();
	return {
		set: ( key: string, value: string ) => client.set( key, value ),
		get: ( key: string ) => client.get( key ),
		remove: ( key: string ) => client.set( key, undefined )
	};
} );

// MemoryStore defines the default implementation and the interface that other stores must match
const DocumentDatabase = design( MemoryStore, ( { set, get, remove } ) => {
	return {
		add( doc: { id: string, content: string } ) {
			set( doc.id, JSON.stringify( doc ) );
		},
		get( id: string ) {
			const doc = get( id );
			return doc ? JSON.parse( doc ) : undefined;
		},
		remove
	};
} );

// Uses MemoryStore implicitly since the dependency was not provided
const memoryDb = DocumentDatabase.create();

// Uses RedisStore explicitly since the dependency was provided
const redisDb = DocumentDatabase.create( RedisStore.create() );
```

### Designing and Composing Components

Use `design()` to define components. Use `compose()` to combine multiple components with matching dependencies.

When to use which:
- `design( setup )`: Define a component with dependencies
- `design( parent, setup )`: Extend a parent design with new setup
- `design( parent, child )`: Extend a parent design with another design
- `compose( [ A, B ] )`: Merge a list of components into one instance
- `compose( { a: A, b: B } )`: Map components to named keys

Composing a list of components merges all their instance properties into a single object. If multiple components define the same property, the value from the last component in the list takes precedence ("last-one-wins"). Proxy objects are used to ensure that composed instances correctly handle getters, setters, and primitive properties.

Composing a map of components (using an object) avoids property conflicts by nesting each component under its own key. This can be useful for organizing related functionality and doesn't incure the overhead of proxy objects.

Examples:

```typescript
import { design, compose } from 'miximum';

// 1) Simple design
const Env = design( ( dep: { apiKey?: string } ) => ( {
	apiKey: dep.apiKey ?? process.env.API_KEY
} ) );

// 2) Compose list (merged component instance)
const Posts = design( Env, ( { apiKey } ) => ( {
	getPost: ( id: string ) => `post:${id}:${apiKey}`
} ) );
const Users = design( Env, ( { apiKey } ) => ( {
	getUser: ( id: string ) => `user:${id}:${apiKey}`
} ) );
const Data = compose( [ Posts, Users ] );

// 3) Compose map (nested structure)
const Cache = design( () => ( {
	set: ( k: string, v: string ) => void 0,
	get: ( k: string ) => undefined as string | undefined
} ) );
const Services = compose( { data: Data, cache: Cache } );

// 4) Use composed parents as dependency
const App = design( Env, compose( { services: Services } ) );

// Create
const app = App.create();

// app has services, services has data and cache, data has getPost and getUser
const post = app.services.data.getPost( 'post-id' );
```

## Component

Components provide methods for creating instances and modifying dependencies:

### `.create( dependency )` - Instantiate a component

Create an instance of the component design by providing required dependencies. The method signature adapts based on the dependency type. If no dependencies are needed, `create()` can be called without arguments.

<!-- eslint-disable no-undef -->
```typescript
const Logger = design( ( dep: { prefix: string } ) => ( {
	log: ( msg: string ) => `[${dep.prefix}] ${msg}`
} ) );

// With required dependencies
const logger = Logger.create( { prefix: 'INFO' } );
logger.log( 'hello' ); // outputs: [INFO] hello

// Without dependencies
const Simple = design( () => ( { value: 42 } ) );
const instance = Simple.create();
```

### `.with( values )` - Pre-fill Dependencies

Pre-fill specific dependency values and remove them from the required set:

<!-- eslint-disable no-undef -->
```typescript
const Database = design( ( dep: { host: string, port: number, ssl: boolean } ) => ( {
	connect: () => `${dep.ssl ? 'https' : 'http'}://${dep.host}:${dep.port}`
} ) );

// Production database with sensible defaults
const ProductionDb = Database.with( { ssl: true, port: 5432 } );

const db = ProductionDb.create( { host: 'prod.example.com' } );
// Only requires 'host', ssl and port are pre-filled
```

### `.extend<T>()` - Add Dependencies

Extend the dependency type with additional properties:

<!-- eslint-disable no-undef -->
```typescript
const Logger = design( ( dep: { prefix: string } ) => ( {
	log: ( msg: string ) => `[${dep.prefix}] ${msg}`
} ) );

// Add timestamp option
const ExtendedLogger = Logger.extend<{ timestamp: boolean }>();
// ExtendedLogger.create() now requires { prefix, timestamp }
```

## Emitting Events

Emitters are objects that emit events with strong typing per event name.

```typescript
import { createEmitter } from 'miximum';

// Define your event payloads
type Events = {
	log: { message: string },
	joined: { userId: string }
};

const emitter = createEmitter<Events>();

const unsubscribe = emitter.on( 'log', ( { message } ) => {
	console.log( 'LOG', message );
} );

emitter.emit( 'log', { message: 'hello' } );

// Remove a listener
unsubscribe();

// Derive a filtered emitter
const errors = emitter.pick( 'log' );
errors.emit( 'log', { message: 'only logs flow here' } );
```

**Methods:**
- `on(event, callback)` - Subscribe to an event, returns unsubscribe function
- `once(event, callback)` - Subscribe once, auto-unsubscribes after first emit
- `off(event, callback?)` - Remove specific listener or all listeners for an event
- `emit(event, payload)` - Emit an event to all subscribers
- `pick(...events)` - Create a filtered emitter accepting only specified events
- `omit(...events)` - Create a filtered emitter excluding specified events
- `derive(transform)` - Create a derived emitter with transformed payloads
- `next(event)` - Return a promise that resolves on next emit
- `clear()` - Remove all listeners

## Reactive State

States are mutable stores with subscription and derivation helpers.

```typescript
import { createState } from 'miximum';

// Initial state
const state = createState( { count: 0 } );

// Read / write
state.get( 'count' );
state.set( 'count', 1 );
state.update( { count: 2 } );
state.update( ( prev ) => ( { count: prev.count + 1 } ) );

// Subscribe
const unsubscribe = state.subscribe( ( snapshot ) => {
	console.log( snapshot.count );
} );

// Derive read-only state
const doubled = state.derive( ( prev ) => ( { value: prev.count * 2 } ) );
const value = doubled.get( 'value' );

unsubscribe();
```

**Methods:**
- `get(key)` - Read a value by key
- `set(key, value)` - Set a value (undefined only allowed if type permits)
- `update(changes)` - Merge object or call updater function
- `entries()` - Iterate all key-value pairs
- `toObject()` - Get a shallow copy of state as plain object
- `subscribe(callback)` - Listen for changes, returns unsubscribe function
- `derive(transform)` - Create read-only derived state

## Testing

Run the test suite:

```bash
npm test
```

## License

MIT
