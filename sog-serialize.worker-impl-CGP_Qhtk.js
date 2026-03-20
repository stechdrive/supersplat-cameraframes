/**
 * Logs the allocation of render targets.
 *
 * @category Debug
 */ const TRACEID_RENDER_TARGET_ALLOC = 'RenderTargetAlloc';
/**
 * Logs the allocation of textures.
 *
 * @category Debug
 */ const TRACEID_TEXTURE_ALLOC = 'TextureAlloc';
/**
 * Logs the creation of shaders.
 *
 * @category Debug
 */ const TRACEID_SHADER_ALLOC = 'ShaderAlloc';
/**
 * Logs the vram use by the textures.
 *
 * @category Debug
 */ const TRACEID_VRAM_TEXTURE = 'VRAM.Texture';
/**
 * Logs the vram use by the vertex buffers.
 *
 * @category Debug
 */ const TRACEID_VRAM_VB = 'VRAM.Vb';
/**
 * Logs the vram use by the index buffers.
 *
 * @category Debug
 */ const TRACEID_VRAM_IB = 'VRAM.Ib';
/**
 * Logs the vram use by the storage buffers.
 *
 * @category Debug
 */ const TRACEID_VRAM_SB = 'VRAM.Sb';
/**
 * Logs the creation of bind groups.
 *
 * @category Debug
 */ const TRACEID_BINDGROUP_ALLOC = 'BindGroupAlloc';
/**
 * Logs the creation of bind group formats.
 *
 * @category Debug
 */ const TRACEID_BINDGROUPFORMAT_ALLOC = 'BindGroupFormatAlloc';
/**
 * Logs the creation of render pipelines. WebGPU only.
 *
 * @category Debug
 */ const TRACEID_RENDERPIPELINE_ALLOC = 'RenderPipelineAlloc';
/**
 * Logs the creation of compute pipelines. WebGPU only.
 *
 * @category Debug
 */ const TRACEID_COMPUTEPIPELINE_ALLOC = 'ComputePipelineAlloc';
/**
 * Logs the creation of pipeline layouts. WebGPU only.
 *
 * @category Debug
 */ const TRACEID_PIPELINELAYOUT_ALLOC = 'PipelineLayoutAlloc';
/**
 * Logs the vram use by all textures in memory.
 *
 * @category Debug
 */ const TRACEID_TEXTURES = 'Textures';
/**
 * Logs the render queue commands.
 *
 * @category Debug
 */ const TRACEID_RENDER_QUEUE = 'RenderQueue';
/**
 * Logs the GPU timings.
 *
 * @category Debug
 */ const TRACEID_GPU_TIMINGS = 'GpuTimings';

/**
 * The engine version number. This is in semantic versioning format (MAJOR.MINOR.PATCH).
 */ const version$1 = '2.17.0';

// detect whether passive events are supported by the browser
const detectPassiveEvents = ()=>{
    let result = false;
    try {
        const opts = Object.defineProperty({}, 'passive', {
            get: function() {
                result = true;
                return false;
            }
        });
        window.addEventListener('testpassive', null, opts);
        window.removeEventListener('testpassive', null, opts);
    } catch (e) {}
    return result;
};
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const environment = typeof window !== 'undefined' ? 'browser' : typeof global !== 'undefined' ? 'node' : 'worker';
// detect platform
const platformName = /android/i.test(ua) ? 'android' : /ip(?:[ao]d|hone)/i.test(ua) ? 'ios' : /windows/i.test(ua) ? 'windows' : /mac os/i.test(ua) ? 'osx' : /linux/i.test(ua) ? 'linux' : /cros/i.test(ua) ? 'cros' : null;
detectPassiveEvents();
/**
 * Global namespace that stores flags regarding platform environment and features support.
 *
 * @namespace
 * @example
 * if (pc.platform.touch) {
 *     // touch is supported
 * }
 */ const platform = {
    /**
     * String identifying the current platform. Can be one of: android, ios, windows, osx, linux,
     * cros or null.
     *
     * @type {'android' | 'ios' | 'windows' | 'osx' | 'linux' | 'cros' | null}
     * @ignore
     */ name: platformName,
    /**
     * Convenience boolean indicating whether we're running in the browser.
     *
     * @type {boolean}
     */ browser: environment === 'browser',
    /**
     * True if running in a Web Worker.
     *
     * @type {boolean}
     * @ignore
     */ worker: environment === 'worker',
    /**
     * True if running on a desktop or laptop device.
     *
     * @type {boolean}
     */ desktop: [
        'windows',
        'osx',
        'linux',
        'cros'
    ].includes(platformName),
    /**
     * True if running on a mobile or tablet device.
     *
     * @type {boolean}
     */ mobile: [
        'android',
        'ios'
    ].includes(platformName),
    /**
     * True if running on an iOS device.
     *
     * @type {boolean}
     */ ios: platformName === 'ios',
    /**
     * True if running on an Android device.
     *
     * @type {boolean}
     */ android: platformName === 'android'};

/**
 * Log tracing functionality, allowing for tracing of the internal functionality of the engine.
 * Note that the trace logging only takes place in the debug build of the engine and is stripped
 * out in other builds.
 *
 * @category Debug
 */ class Tracing {
    /**
     * Enable or disable a trace channel.
     *
     * @param {string} channel - Name of the trace channel. Can be:
     *
     * - {@link TRACEID_RENDER_FRAME}
     * - {@link TRACEID_RENDER_FRAME_TIME}
     * - {@link TRACEID_RENDER_PASS}
     * - {@link TRACEID_RENDER_PASS_DETAIL}
     * - {@link TRACEID_RENDER_ACTION}
     * - {@link TRACEID_RENDER_TARGET_ALLOC}
     * - {@link TRACEID_TEXTURE_ALLOC}
     * - {@link TRACEID_SHADER_ALLOC}
     * - {@link TRACEID_SHADER_COMPILE}
     * - {@link TRACEID_VRAM_TEXTURE}
     * - {@link TRACEID_VRAM_VB}
     * - {@link TRACEID_VRAM_IB}
     * - {@link TRACEID_RENDERPIPELINE_ALLOC}
     * - {@link TRACEID_COMPUTEPIPELINE_ALLOC}
     * - {@link TRACEID_PIPELINELAYOUT_ALLOC}
     * - {@link TRACEID_TEXTURES}
     * - {@link TRACEID_ASSETS}
     * - {@link TRACEID_GPU_TIMINGS}
     *
     * @param {boolean} enabled - New enabled state for the channel.
     */ static set(channel, enabled = true) {
        if (enabled) {
            Tracing._traceChannels.add(channel);
        } else {
            Tracing._traceChannels.delete(channel);
        }
    }
    /**
     * Test if the trace channel is enabled.
     *
     * @param {string} channel - Name of the trace channel.
     * @returns {boolean} - True if the trace channel is enabled.
     */ static get(channel) {
        return Tracing._traceChannels.has(channel);
    }
}
/**
     * Set storing the names of enabled trace channels.
     *
     * @type {Set<string>}
     * @private
     */ Tracing._traceChannels = new Set();
/**
     * Enable call stack logging for trace calls. Defaults to false.
     *
     * @type {boolean}
     */ Tracing.stack = false;

/**
 * Engine debug log system. Note that the logging only executes in the debug build of the engine,
 * and is stripped out in other builds.
 */ class Debug {
    /**
     * Deprecated warning message.
     *
     * @param {string} message - The message to log.
     */ static deprecated(message) {
        if (!Debug._loggedMessages.has(message)) {
            Debug._loggedMessages.add(message);
            console.warn(`DEPRECATED: ${message}`);
        }
    }
    /**
     * Removed warning message.
     *
     * @param {string} message - The message to log.
     */ static removed(message) {
        if (!Debug._loggedMessages.has(message)) {
            Debug._loggedMessages.add(message);
            console.error(`REMOVED: ${message}`);
        }
    }
    /**
     * Assertion deprecated message. If the assertion is false, the deprecated message is written to the log.
     *
     * @param {boolean|object} assertion - The assertion to check.
     * @param {string} message - The message to log.
     */ static assertDeprecated(assertion, message) {
        if (!assertion) {
            Debug.deprecated(message);
        }
    }
    /**
     * Assertion error message. If the assertion is false, the error message is written to the log.
     *
     * @param {boolean|object} assertion - The assertion to check.
     * @param {...*} args - The values to be written to the log.
     */ static assert(assertion, ...args) {
        if (!assertion) {
            console.error('ASSERT FAILED: ', ...args);
        }
    }
    /**
     * Assertion error message that writes an error message to the log if the object has already
     * been destroyed. To be used along setDestroyed.
     *
     * @param {object} object - The object to check.
     */ static assertDestroyed(object) {
        if (object?.__alreadyDestroyed) {
            const message = `[${object.constructor?.name}] with name [${object.name}] has already been destroyed, and cannot be used.`;
            if (!Debug._loggedMessages.has(message)) {
                Debug._loggedMessages.add(message);
                console.error('ASSERT FAILED: ', message, object);
            }
        }
    }
    /**
     * Executes a function in debug mode only.
     *
     * @param {Function} func - Function to call.
     */ static call(func) {
        func();
    }
    /**
     * Info message.
     *
     * @param {...*} args - The values to be written to the log.
     */ static log(...args) {
        console.log(...args);
    }
    /**
     * Info message logged no more than once.
     *
     * @param {string} message - The message to log.
     * @param {...*} args - The values to be written to the log.
     */ static logOnce(message, ...args) {
        if (!Debug._loggedMessages.has(message)) {
            Debug._loggedMessages.add(message);
            console.log(message, ...args);
        }
    }
    /**
     * Warning message.
     *
     * @param {...*} args - The values to be written to the log.
     */ static warn(...args) {
        console.warn(...args);
    }
    /**
     * Warning message logged no more than once.
     *
     * @param {string} message - The message to log.
     * @param {...*} args - The values to be written to the log.
     */ static warnOnce(message, ...args) {
        if (!Debug._loggedMessages.has(message)) {
            Debug._loggedMessages.add(message);
            console.warn(message, ...args);
        }
    }
    /**
     * Error message.
     *
     * @param {...*} args - The values to be written to the log.
     */ static error(...args) {
        console.error(...args);
    }
    /**
     * Error message logged no more than once.
     *
     * @param {string} message - The message to log.
     * @param {...*} args - The values to be written to the log.
     */ static errorOnce(message, ...args) {
        if (!Debug._loggedMessages.has(message)) {
            Debug._loggedMessages.add(message);
            console.error(message, ...args);
        }
    }
    /**
     * Trace message, which is logged to the console if the tracing for the channel is enabled
     *
     * @param {string} channel - The trace channel
     * @param {...*} args - The values to be written to the log.
     */ static trace(channel, ...args) {
        if (Tracing.get(channel)) {
            console.groupCollapsed(`${channel.padEnd(20, ' ')}|`, ...args);
            if (Tracing.stack) {
                console.trace();
            }
            console.groupEnd();
        }
    }
}
/**
     * Set storing already logged messages, to only print each unique message one time.
     *
     * @type {Set<string>}
     * @private
     */ Debug._loggedMessages = new Set();
/**
 * A helper debug functionality.
 */ class DebugHelper {
    /**
     * Set a name to the name property of the object. Executes only in the debug build.
     *
     * @param {object} object - The object to assign the name to.
     * @param {string} name - The name to assign.
     */ static setName(object, name) {
        if (object) {
            object.name = name;
        }
    }
    /**
     * Set a label to the label property of the object. Executes only in the debug build.
     *
     * @param {object} object - The object to assign the name to.
     * @param {string} label - The label to assign.
     */ static setLabel(object, label) {
        if (object) {
            object.label = label;
        }
    }
    /**
     * Marks object as destroyed. Executes only in the debug build. To be used along assertDestroyed.
     *
     * @param {object} object - The object to mark as destroyed.
     */ static setDestroyed(object) {
        if (object) {
            object.__alreadyDestroyed = true;
        }
    }
}

/**
 * @import { EventHandler } from './event-handler.js'
 * @import { HandleEventCallback } from './event-handler.js'
 */ /**
 * Event Handle that is created by {@link EventHandler} and can be used for easier event removal
 * and management.
 *
 * @example
 * const evt = obj.on('test', (a, b) => {
 *     console.log(a + b);
 * });
 * obj.fire('test');
 *
 * evt.off(); // easy way to remove this event
 * obj.fire('test'); // this will not trigger an event
 * @example
 * // store an array of event handles
 * let events = [];
 *
 * events.push(objA.on('testA', () => {}));
 * events.push(objB.on('testB', () => {}));
 *
 * // when needed, remove all events
 * events.forEach((evt) => {
 *     evt.off();
 * });
 * events = [];
 */ class EventHandle {
    /**
     * Remove this event from its handler.
     */ off() {
        if (this._removed) return;
        this.handler.offByHandle(this);
    }
    on(name, callback, scope = this) {
        Debug.deprecated('Using chaining with EventHandler.on is deprecated, subscribe to an event from EventHandler directly instead.');
        return this.handler._addCallback(name, callback, scope, false);
    }
    once(name, callback, scope = this) {
        Debug.deprecated('Using chaining with EventHandler.once is deprecated, subscribe to an event from EventHandler directly instead.');
        return this.handler._addCallback(name, callback, scope, true);
    }
    /**
     * Mark if event has been removed.
     *
     * @type {boolean}
     * @ignore
     */ set removed(value) {
        if (!value) return;
        this._removed = true;
    }
    /**
     * True if event has been removed.
     *
     * @type {boolean}
     * @ignore
     */ get removed() {
        return this._removed;
    }
    // don't stringify EventHandle to JSON by JSON.stringify
    toJSON(key) {
        return undefined;
    }
    /**
     * @param {EventHandler} handler - source object of the event.
     * @param {string} name - Name of the event.
     * @param {HandleEventCallback} callback - Function that is called when event is fired.
     * @param {object} scope - Object that is used as `this` when event is fired.
     * @param {boolean} [once] - If this is a single event and will be removed after event is fired.
     */ constructor(handler, name, callback, scope, once = false){
        /**
     * True if event has been removed.
     * @type {boolean}
     * @private
     */ this._removed = false;
        this.handler = handler;
        this.name = name;
        this.callback = callback;
        this.scope = scope;
        this._once = once;
    }
}

/**
 * @callback HandleEventCallback
 * Callback used by {@link EventHandler} functions. Note the callback is limited to 8 arguments.
 * @param {any} [arg1] - First argument that is passed from caller.
 * @param {any} [arg2] - Second argument that is passed from caller.
 * @param {any} [arg3] - Third argument that is passed from caller.
 * @param {any} [arg4] - Fourth argument that is passed from caller.
 * @param {any} [arg5] - Fifth argument that is passed from caller.
 * @param {any} [arg6] - Sixth argument that is passed from caller.
 * @param {any} [arg7] - Seventh argument that is passed from caller.
 * @param {any} [arg8] - Eighth argument that is passed from caller.
 * @returns {void}
 */ /**
 * Abstract base class that implements functionality for event handling.
 *
 * ```javascript
 * const obj = new EventHandlerSubclass();
 *
 * // subscribe to an event
 * obj.on('hello', (str) => {
 *     console.log('event hello is fired', str);
 * });
 *
 * // fire event
 * obj.fire('hello', 'world');
 * ```
 */ class EventHandler {
    /**
     * Reinitialize the event handler.
     * @ignore
     */ initEventHandler() {
        this._callbacks = new Map();
        this._callbackActive = new Map();
    }
    /**
     * Registers a new event handler.
     *
     * @param {string} name - Name of the event to bind the callback to.
     * @param {HandleEventCallback} callback - Function that is called when event is fired. Note
     * the callback is limited to 8 arguments.
     * @param {object} scope - Object to use as 'this' when the event is fired, defaults to
     * current this.
     * @param {boolean} once - If true, the callback will be unbound after being fired once.
     * @returns {EventHandle} Created {@link EventHandle}.
     * @ignore
     */ _addCallback(name, callback, scope, once) {
        if (!name || typeof name !== 'string' || !callback) {
            console.warn(`EventHandler: subscribing to an event (${name}) with missing arguments`, callback);
        }
        if (!this._callbacks.has(name)) {
            this._callbacks.set(name, []);
        }
        // if we are adding a callback to the list that is executing right now
        // ensure we preserve initial list before modifications
        if (this._callbackActive.has(name)) {
            const callbackActive = this._callbackActive.get(name);
            if (callbackActive && callbackActive === this._callbacks.get(name)) {
                this._callbackActive.set(name, callbackActive.slice());
            }
        }
        const evt = new EventHandle(this, name, callback, scope, once);
        this._callbacks.get(name).push(evt);
        return evt;
    }
    /**
     * Attach an event handler to an event.
     *
     * @param {string} name - Name of the event to bind the callback to.
     * @param {HandleEventCallback} callback - Function that is called when event is fired. Note
     * the callback is limited to 8 arguments.
     * @param {object} [scope] - Object to use as 'this' when the event is fired, defaults to
     * current this.
     * @returns {EventHandle} Can be used for removing event in the future.
     * @example
     * obj.on('test', (a, b) => {
     *     console.log(a + b);
     * });
     * obj.fire('test', 1, 2); // prints 3 to the console
     * @example
     * const evt = obj.on('test', (a, b) => {
     *     console.log(a + b);
     * });
     * // some time later
     * evt.off();
     */ on(name, callback, scope = this) {
        return this._addCallback(name, callback, scope, false);
    }
    /**
     * Attach an event handler to an event. This handler will be removed after being fired once.
     *
     * @param {string} name - Name of the event to bind the callback to.
     * @param {HandleEventCallback} callback - Function that is called when event is fired. Note
     * the callback is limited to 8 arguments.
     * @param {object} [scope] - Object to use as 'this' when the event is fired, defaults to
     * current this.
     * @returns {EventHandle} Can be used for removing event in the future.
     * @example
     * obj.once('test', (a, b) => {
     *     console.log(a + b);
     * });
     * obj.fire('test', 1, 2); // prints 3 to the console
     * obj.fire('test', 1, 2); // not going to get handled
     */ once(name, callback, scope = this) {
        return this._addCallback(name, callback, scope, true);
    }
    /**
     * Detach an event handler from an event. If callback is not provided then all callbacks are
     * unbound from the event, if scope is not provided then all events with the callback will be
     * unbound.
     *
     * @param {string} [name] - Name of the event to unbind.
     * @param {HandleEventCallback} [callback] - Function to be unbound.
     * @param {object} [scope] - Scope that was used as the this when the event is fired.
     * @returns {EventHandler} Self for chaining.
     * @example
     * const handler = () => {};
     * obj.on('test', handler);
     *
     * obj.off(); // Removes all events
     * obj.off('test'); // Removes all events called 'test'
     * obj.off('test', handler); // Removes all handler functions, called 'test'
     * obj.off('test', handler, this); // Removes all handler functions, called 'test' with scope this
     */ off(name, callback, scope) {
        if (name) {
            // if we are removing a callback from the list that is executing right now
            // ensure we preserve initial list before modifications
            if (this._callbackActive.has(name) && this._callbackActive.get(name) === this._callbacks.get(name)) {
                this._callbackActive.set(name, this._callbackActive.get(name).slice());
            }
        } else {
            // if we are removing a callback from any list that is executing right now
            // ensure we preserve these initial lists before modifications
            for (const [key, callbacks] of this._callbackActive){
                if (!this._callbacks.has(key)) {
                    continue;
                }
                if (this._callbacks.get(key) !== callbacks) {
                    continue;
                }
                this._callbackActive.set(key, callbacks.slice());
            }
        }
        if (!name) {
            // remove all events
            for (const callbacks of this._callbacks.values()){
                for(let i = 0; i < callbacks.length; i++){
                    callbacks[i].removed = true;
                }
            }
            this._callbacks.clear();
        } else if (!callback) {
            // remove all events of a specific name
            const callbacks = this._callbacks.get(name);
            if (callbacks) {
                for(let i = 0; i < callbacks.length; i++){
                    callbacks[i].removed = true;
                }
                this._callbacks.delete(name);
            }
        } else {
            const callbacks = this._callbacks.get(name);
            if (!callbacks) {
                return this;
            }
            for(let i = 0; i < callbacks.length; i++){
                // remove all events with a specific name and a callback
                if (callbacks[i].callback !== callback) {
                    continue;
                }
                // could be a specific scope as well
                if (scope && callbacks[i].scope !== scope) {
                    continue;
                }
                callbacks[i].removed = true;
                callbacks.splice(i, 1);
                i--;
            }
            if (callbacks.length === 0) {
                this._callbacks.delete(name);
            }
        }
        return this;
    }
    /**
     * Detach an event handler from an event using EventHandle instance. More optimal remove
     * as it does not have to scan callbacks array.
     *
     * @param {EventHandle} handle - Handle of event.
     * @ignore
     */ offByHandle(handle) {
        const name = handle.name;
        handle.removed = true;
        // if we are removing a callback from the list that is executing right now
        // ensure we preserve initial list before modifications
        if (this._callbackActive.has(name) && this._callbackActive.get(name) === this._callbacks.get(name)) {
            this._callbackActive.set(name, this._callbackActive.get(name).slice());
        }
        const callbacks = this._callbacks.get(name);
        if (!callbacks) {
            return this;
        }
        const ind = callbacks.indexOf(handle);
        if (ind !== -1) {
            callbacks.splice(ind, 1);
            if (callbacks.length === 0) {
                this._callbacks.delete(name);
            }
        }
        return this;
    }
    /**
     * Fire an event, all additional arguments are passed on to the event listener.
     *
     * @param {string} name - Name of event to fire.
     * @param {any} [arg1] - First argument that is passed to the event handler.
     * @param {any} [arg2] - Second argument that is passed to the event handler.
     * @param {any} [arg3] - Third argument that is passed to the event handler.
     * @param {any} [arg4] - Fourth argument that is passed to the event handler.
     * @param {any} [arg5] - Fifth argument that is passed to the event handler.
     * @param {any} [arg6] - Sixth argument that is passed to the event handler.
     * @param {any} [arg7] - Seventh argument that is passed to the event handler.
     * @param {any} [arg8] - Eighth argument that is passed to the event handler.
     * @returns {EventHandler} Self for chaining.
     * @example
     * obj.fire('test', 'This is the message');
     */ fire(name, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
        if (!name) {
            return this;
        }
        const callbacksInitial = this._callbacks.get(name);
        if (!callbacksInitial) {
            return this;
        }
        let callbacks;
        if (!this._callbackActive.has(name)) {
            // when starting callbacks execution ensure we store a list of initial callbacks
            this._callbackActive.set(name, callbacksInitial);
        } else if (this._callbackActive.get(name) !== callbacksInitial) {
            // if we are trying to execute a callback while there is an active execution right now
            // and the active list has been already modified,
            // then we go to an unoptimized path and clone callbacks list to ensure execution consistency
            callbacks = callbacksInitial.slice();
        }
        // eslint-disable-next-line no-unmodified-loop-condition
        for(let i = 0; (callbacks || this._callbackActive.get(name)) && i < (callbacks || this._callbackActive.get(name)).length; i++){
            const evt = (callbacks || this._callbackActive.get(name))[i];
            if (!evt.callback) continue;
            evt.callback.call(evt.scope, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8);
            if (evt._once) {
                // check that callback still exists because user may have unsubscribed in the event handler
                const existingCallback = this._callbacks.get(name);
                const ind = existingCallback ? existingCallback.indexOf(evt) : -1;
                if (ind !== -1) {
                    if (this._callbackActive.get(name) === existingCallback) {
                        this._callbackActive.set(name, this._callbackActive.get(name).slice());
                    }
                    const callbacks = this._callbacks.get(name);
                    if (!callbacks) continue;
                    callbacks[ind].removed = true;
                    callbacks.splice(ind, 1);
                    if (callbacks.length === 0) {
                        this._callbacks.delete(name);
                    }
                }
            }
        }
        if (!callbacks) {
            this._callbackActive.delete(name);
        }
        return this;
    }
    /**
     * Test if there are any handlers bound to an event name.
     *
     * @param {string} name - The name of the event to test.
     * @returns {boolean} True if the object has handlers bound to the specified event name.
     * @example
     * obj.on('test', () => {}); // bind an event to 'test'
     * obj.hasEvent('test'); // returns true
     * obj.hasEvent('hello'); // returns false
     */ hasEvent(name) {
        return !!this._callbacks.get(name)?.length;
    }
    constructor(){
        /**
     * @type {Map<string,Array<EventHandle>>}
     * @private
     */ this._callbacks = new Map();
        /**
     * @type {Map<string,Array<EventHandle>>}
     * @private
     */ this._callbackActive = new Map();
    }
}

/**
 * Get current time in milliseconds. Use it to measure time difference. Reference time may differ
 * on different platforms.
 *
 * @returns {number} The time in milliseconds.
 * @ignore
 */ const now = typeof window !== 'undefined' && window.performance && window.performance.now ? performance.now.bind(performance) : Date.now;

/**
 * Math API.
 *
 * @namespace
 * @category Math
 */ const math = {
    /**
     * Conversion factor between degrees and radians.
     *
     * @type {number}
     */ DEG_TO_RAD: Math.PI / 180,
    /**
     * Conversion factor between radians and degrees.
     *
     * @type {number}
     */ RAD_TO_DEG: 180 / Math.PI,
    /**
     * Clamp a number between min and max inclusive.
     *
     * @param {number} value - Number to clamp.
     * @param {number} min - Min value.
     * @param {number} max - Max value.
     * @returns {number} The clamped value.
     * @example
     * pc.math.clamp(5, 0, 10);  // returns 5
     * pc.math.clamp(-5, 0, 10); // returns 0
     * pc.math.clamp(15, 0, 10); // returns 10
     */ clamp (value, min, max) {
        if (value >= max) return max;
        if (value <= min) return min;
        return value;
    },
    /**
     * Convert an 24 bit integer into an array of 3 bytes.
     *
     * @param {number} i - Number holding an integer value.
     * @returns {number[]} An array of 3 bytes.
     * @example
     * // Set bytes to [0x11, 0x22, 0x33]
     * const bytes = pc.math.intToBytes24(0x112233);
     */ intToBytes24 (i) {
        const r = i >> 16 & 0xff;
        const g = i >> 8 & 0xff;
        const b = i & 0xff;
        return [
            r,
            g,
            b
        ];
    },
    /**
     * Convert an 32 bit integer into an array of 4 bytes.
     *
     * @param {number} i - Number holding an integer value.
     * @returns {number[]} An array of 4 bytes.
     * @example
     * // Set bytes to [0x11, 0x22, 0x33, 0x44]
     * const bytes = pc.math.intToBytes32(0x11223344);
     */ intToBytes32 (i) {
        const r = i >> 24 & 0xff;
        const g = i >> 16 & 0xff;
        const b = i >> 8 & 0xff;
        const a = i & 0xff;
        return [
            r,
            g,
            b,
            a
        ];
    },
    /**
     * Convert 3 8 bit Numbers into a single unsigned 24 bit Number.
     *
     * @param {number} r - A single byte (0-255).
     * @param {number} g - A single byte (0-255).
     * @param {number} b - A single byte (0-255).
     * @returns {number} A single unsigned 24 bit Number.
     * @example
     * // Set result1 to 0x112233 from an array of 3 values
     * const result1 = pc.math.bytesToInt24([0x11, 0x22, 0x33]);
     *
     * // Set result2 to 0x112233 from 3 discrete values
     * const result2 = pc.math.bytesToInt24(0x11, 0x22, 0x33);
     */ bytesToInt24 (r, g, b) {
        if (r.length) {
            b = r[2];
            g = r[1];
            r = r[0];
        }
        return r << 16 | g << 8 | b;
    },
    /**
     * Convert 4 1-byte Numbers into a single unsigned 32bit Number.
     *
     * @param {number} r - A single byte (0-255).
     * @param {number} g - A single byte (0-255).
     * @param {number} b - A single byte (0-255).
     * @param {number} a - A single byte (0-255).
     * @returns {number} A single unsigned 32bit Number.
     * @example
     * // Set result1 to 0x11223344 from an array of 4 values
     * const result1 = pc.math.bytesToInt32([0x11, 0x22, 0x33, 0x44]);
     *
     * // Set result2 to 0x11223344 from 4 discrete values
     * const result2 = pc.math.bytesToInt32(0x11, 0x22, 0x33, 0x44);
     */ bytesToInt32 (r, g, b, a) {
        if (r.length) {
            a = r[3];
            b = r[2];
            g = r[1];
            r = r[0];
        }
        // Why ((r << 24)>>>0)?
        // << operator uses signed 32 bit numbers, so 128<<24 is negative.
        // >>> used unsigned so >>>0 converts back to an unsigned.
        // See https://stackoverflow.com/questions/1908492/unsigned-integer-in-javascript
        return (r << 24 | g << 16 | b << 8 | a) >>> 0;
    },
    /**
     * Calculates the linear interpolation of two numbers.
     *
     * @param {number} a - Number to linearly interpolate from.
     * @param {number} b - Number to linearly interpolate to.
     * @param {number} alpha - The value controlling the result of interpolation. When alpha is 0,
     * a is returned. When alpha is 1, b is returned. Between 0 and 1, a linear interpolation
     * between a and b is returned. alpha is clamped between 0 and 1.
     * @returns {number} The linear interpolation of two numbers.
     * @example
     * pc.math.lerp(0, 10, 0);   // returns 0
     * pc.math.lerp(0, 10, 0.5); // returns 5
     * pc.math.lerp(0, 10, 1);   // returns 10
     */ lerp (a, b, alpha) {
        return a + (b - a) * math.clamp(alpha, 0, 1);
    },
    /**
     * Calculates the linear interpolation of two angles ensuring that interpolation is correctly
     * performed across the 360 to 0 degree boundary. Angles are supplied in degrees.
     *
     * @param {number} a - Angle (in degrees) to linearly interpolate from.
     * @param {number} b - Angle (in degrees) to linearly interpolate to.
     * @param {number} alpha - The value controlling the result of interpolation. When alpha is 0,
     * a is returned. When alpha is 1, b is returned. Between 0 and 1, a linear interpolation
     * between a and b is returned. alpha is clamped between 0 and 1.
     * @returns {number} The linear interpolation of two angles.
     * @example
     * pc.math.lerpAngle(350, 10, 0.5); // returns 0 (shortest path crosses 360/0 boundary)
     * pc.math.lerpAngle(0, 90, 0.5);   // returns 45
     */ lerpAngle (a, b, alpha) {
        if (b - a > 180) {
            b -= 360;
        }
        if (b - a < -180) {
            b += 360;
        }
        return math.lerp(a, b, math.clamp(alpha, 0, 1));
    },
    /**
     * Returns true if argument is a power-of-two and false otherwise.
     *
     * @param {number} x - Number to check for power-of-two property.
     * @returns {boolean} true if power-of-two and false otherwise.
     * @example
     * pc.math.powerOfTwo(32); // returns true
     * pc.math.powerOfTwo(17); // returns false
     */ powerOfTwo (x) {
        return x !== 0 && !(x & x - 1);
    },
    /**
     * Returns the next power of 2 for the specified value.
     *
     * @param {number} val - The value for which to calculate the next power of 2.
     * @returns {number} The next power of 2.
     * @example
     * pc.math.nextPowerOfTwo(17); // returns 32
     * pc.math.nextPowerOfTwo(32); // returns 32
     */ nextPowerOfTwo (val) {
        val--;
        val |= val >> 1;
        val |= val >> 2;
        val |= val >> 4;
        val |= val >> 8;
        val |= val >> 16;
        val++;
        return val;
    },
    /**
     * Returns the nearest (smaller or larger) power of 2 for the specified value.
     *
     * @param {number} val - The value for which to calculate the nearest power of 2.
     * @returns {number} The nearest power of 2.
     * @example
     * pc.math.nearestPowerOfTwo(17); // returns 16
     * pc.math.nearestPowerOfTwo(24); // returns 32
     */ nearestPowerOfTwo (val) {
        return Math.pow(2, Math.round(Math.log2(val)));
    },
    /**
     * Return a pseudo-random number between min and max. The number generated is in the range
     * [min, max), that is inclusive of the minimum but exclusive of the maximum.
     *
     * @param {number} min - Lower bound for range.
     * @param {number} max - Upper bound for range.
     * @returns {number} Pseudo-random number between the supplied range.
     * @example
     * pc.math.random(0, 10); // returns a random number between 0 and 10
     */ random (min, max) {
        const diff = max - min;
        return Math.random() * diff + min;
    },
    /**
     * The function interpolates smoothly between two input values based on a third one that should
     * be between the first two. The returned value is clamped between 0 and 1.
     *
     * The slope (i.e. derivative) of the smoothstep function starts at 0 and ends at 0. This makes
     * it easy to create a sequence of transitions using smoothstep to interpolate each segment
     * rather than using a more sophisticated or expensive interpolation technique.
     *
     * See https://en.wikipedia.org/wiki/Smoothstep for more details.
     *
     * @param {number} min - The lower bound of the interpolation range.
     * @param {number} max - The upper bound of the interpolation range.
     * @param {number} x - The value to interpolate.
     * @returns {number} The smoothly interpolated value clamped between zero and one.
     * @example
     * pc.math.smoothstep(0, 10, 5); // returns 0.5
     */ smoothstep (min, max, x) {
        if (x <= min) return 0;
        if (x >= max) return 1;
        x = (x - min) / (max - min);
        return x * x * (3 - 2 * x);
    },
    /**
     * An improved version of the {@link math.smoothstep} function which has zero 1st and 2nd order
     * derivatives at t=0 and t=1.
     *
     * See https://en.wikipedia.org/wiki/Smoothstep#Variations for more details.
     *
     * @param {number} min - The lower bound of the interpolation range.
     * @param {number} max - The upper bound of the interpolation range.
     * @param {number} x - The value to interpolate.
     * @returns {number} The smoothly interpolated value clamped between zero and one.
     * @example
     * pc.math.smootherstep(0, 10, 5); // returns 0.5
     */ smootherstep (min, max, x) {
        if (x <= min) return 0;
        if (x >= max) return 1;
        x = (x - min) / (max - min);
        return x * x * x * (x * (x * 6 - 15) + 10);
    },
    /**
     * Rounds a number up to nearest multiple.
     *
     * @param {number} numToRound - The number to round up.
     * @param {number} multiple - The multiple to round up to.
     * @returns {number} A number rounded up to nearest multiple.
     * @example
     * pc.math.roundUp(17, 4); // returns 20
     * pc.math.roundUp(16, 4); // returns 16
     */ roundUp (numToRound, multiple) {
        if (multiple === 0) {
            return numToRound;
        }
        return Math.ceil(numToRound / multiple) * multiple;
    },
    /**
     * Checks whether a given number resides between two other given numbers.
     *
     * @param {number} num - The number to check the position of.
     * @param {number} a - The first upper or lower threshold to check between.
     * @param {number} b - The second upper or lower threshold to check between.
     * @param {boolean} inclusive - If true, a num param which is equal to a or b will return true.
     * @returns {boolean} true if between or false otherwise.
     * @ignore
     */ between (num, a, b, inclusive) {
        const min = Math.min(a, b);
        const max = Math.max(a, b);
        return inclusive ? num >= min && num <= max : num > min && num < max;
    }
};

/**
 * An RGBA color.
 *
 * Each color component is a floating point value in the range 0 to 1. The {@link r} (red),
 * {@link g} (green) and {@link b} (blue) components define a color in RGB color space. The
 * {@link a} (alpha) component defines transparency. An alpha of 1 is fully opaque. An alpha of
 * 0 is fully transparent.
 *
 * @category Math
 */ class Color {
    /**
     * Returns a clone of the specified color.
     *
     * @returns {this} A duplicate color object.
     * @example
     * const c = new pc.Color(1, 0, 0, 1);
     * const cClone = c.clone();
     * // cClone is [1, 0, 0, 1]
     */ clone() {
        /** @type {this} */ const cstr = this.constructor;
        return new cstr(this.r, this.g, this.b, this.a);
    }
    /**
     * Copies the contents of a source color to a destination color.
     *
     * @param {Color} rhs - A color to copy to the specified color.
     * @returns {Color} Self for chaining.
     * @example
     * const src = new pc.Color(1, 0, 0, 1);
     * const dst = new pc.Color();
     *
     * dst.copy(src);
     *
     * console.log("The two colors are " + (dst.equals(src) ? "equal" : "different"));
     */ copy(rhs) {
        this.r = rhs.r;
        this.g = rhs.g;
        this.b = rhs.b;
        this.a = rhs.a;
        return this;
    }
    /**
     * Reports whether two colors are equal.
     *
     * @param {Color} rhs - The color to compare to the specified color.
     * @returns {boolean} True if the colors are equal and false otherwise.
     * @example
     * const a = new pc.Color(1, 0, 0, 1);
     * const b = new pc.Color(1, 1, 0, 1);
     * console.log("The two colors are " + (a.equals(b) ? "equal" : "different"));
     */ equals(rhs) {
        return this.r === rhs.r && this.g === rhs.g && this.b === rhs.b && this.a === rhs.a;
    }
    /**
     * Assign values to the color components, including alpha.
     *
     * @param {number} r - The value for red (0-1).
     * @param {number} g - The value for green (0-1).
     * @param {number} b - The value for blue (0-1).
     * @param {number} [a] - The value for the alpha (0-1), defaults to 1.
     * @returns {Color} Self for chaining.
     * @example
     * const c = new pc.Color();
     * c.set(1, 0, 0, 1);
     * // c is now red [1, 0, 0, 1]
     */ set(r, g, b, a = 1) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
        return this;
    }
    /**
     * Returns the result of a linear interpolation between two specified colors.
     *
     * @param {Color} lhs - The color to interpolate from.
     * @param {Color} rhs - The color to interpolate to.
     * @param {number} alpha - The value controlling the point of interpolation. Between 0 and 1,
     * the linear interpolant will occur on a straight line between lhs and rhs. Outside of this
     * range, the linear interpolant will occur on a ray extrapolated from this line.
     * @returns {Color} Self for chaining.
     * @example
     * const a = new pc.Color(0, 0, 0);
     * const b = new pc.Color(1, 1, 0.5);
     * const r = new pc.Color();
     *
     * r.lerp(a, b, 0);   // r is equal to a
     * r.lerp(a, b, 0.5); // r is 0.5, 0.5, 0.25
     * r.lerp(a, b, 1);   // r is equal to b
     */ lerp(lhs, rhs, alpha) {
        this.r = lhs.r + alpha * (rhs.r - lhs.r);
        this.g = lhs.g + alpha * (rhs.g - lhs.g);
        this.b = lhs.b + alpha * (rhs.b - lhs.b);
        this.a = lhs.a + alpha * (rhs.a - lhs.a);
        return this;
    }
    /**
     * Converts the color from gamma to linear color space.
     *
     * @param {Color} [src] - The color to convert to linear color space. If not set, the operation
     * is done in place.
     * @returns {Color} Self for chaining.
     * @example
     * const c = new pc.Color(0.5, 0.5, 0.5, 1);
     * c.linear();
     * // c is now approximately [0.218, 0.218, 0.218, 1]
     */ linear(src = this) {
        this.r = Math.pow(src.r, 2.2);
        this.g = Math.pow(src.g, 2.2);
        this.b = Math.pow(src.b, 2.2);
        this.a = src.a;
        return this;
    }
    /**
     * Converts the color from linear to gamma color space.
     *
     * @param {Color} [src] - The color to convert to gamma color space. If not set, the operation is
     * done in place.
     * @returns {Color} Self for chaining.
     * @example
     * const c = new pc.Color(0.218, 0.218, 0.218, 1);
     * c.gamma();
     * // c is now approximately [0.5, 0.5, 0.5, 1]
     */ gamma(src = this) {
        this.r = Math.pow(src.r, 1 / 2.2);
        this.g = Math.pow(src.g, 1 / 2.2);
        this.b = Math.pow(src.b, 1 / 2.2);
        this.a = src.a;
        return this;
    }
    /**
     * Multiplies RGB elements of a Color by a number. Note that the alpha value is left unchanged.
     *
     * @param {number} scalar - The number to multiply by.
     * @returns {Color} Self for chaining.
     * @example
     * const c = new pc.Color(0.2, 0.4, 0.6, 1);
     * c.mulScalar(2);
     * // c is now [0.4, 0.8, 1.2, 1]
     */ mulScalar(scalar) {
        this.r *= scalar;
        this.g *= scalar;
        this.b *= scalar;
        return this;
    }
    /**
     * Set the values of the color from a string representation '#11223344' or '#112233'.
     *
     * @param {string} hex - A string representation in the format '#RRGGBBAA' or '#RRGGBB'. Where
     * RR, GG, BB, AA are red, green, blue and alpha values. This is the same format used in
     * HTML/CSS.
     * @returns {Color} Self for chaining.
     * @example
     * const c = new pc.Color();
     * c.fromString('#ff0000');
     * // c is now [1, 0, 0, 1]
     */ fromString(hex) {
        const i = parseInt(hex.replace('#', '0x'), 16);
        let bytes;
        if (hex.length > 7) {
            bytes = math.intToBytes32(i);
        } else {
            bytes = math.intToBytes24(i);
            bytes[3] = 255;
        }
        this.set(bytes[0] / 255, bytes[1] / 255, bytes[2] / 255, bytes[3] / 255);
        return this;
    }
    /**
     * Set the values of the color from an array.
     *
     * @param {number[]} arr - The array to set the color values from.
     * @param {number} [offset] - The zero-based index at which to start copying elements from the
     * array. Default is 0.
     * @returns {Color} Self for chaining.
     * @example
     * const c = new pc.Color();
     * c.fromArray([1, 0, 1, 1]);
     * // c is set to [1, 0, 1, 1]
     */ fromArray(arr, offset = 0) {
        this.r = arr[offset] ?? this.r;
        this.g = arr[offset + 1] ?? this.g;
        this.b = arr[offset + 2] ?? this.b;
        this.a = arr[offset + 3] ?? this.a;
        return this;
    }
    /**
     * Converts the color to string form. The format is '#RRGGBBAA', where RR, GG, BB, AA are the
     * red, green, blue and alpha values. When the alpha value is not included (the default), this
     * is the same format as used in HTML/CSS.
     *
     * @param {boolean} alpha - If true, the output string will include the alpha value.
     * @param {boolean} [asArray] - If true, the output will be an array of numbers. Defaults to false.
     * @returns {string} The color in string form.
     * @example
     * const c = new pc.Color(1, 1, 1);
     * // Outputs #ffffff
     * console.log(c.toString());
     */ toString(alpha, asArray) {
        const { r, g, b, a } = this;
        // If any component exceeds 1 (HDR), return the color as an array
        if (asArray || r > 1 || g > 1 || b > 1) {
            return `${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)}, ${a.toFixed(3)}`;
        }
        let s = `#${((1 << 24) + (Math.round(r * 255) << 16) + (Math.round(g * 255) << 8) + Math.round(b * 255)).toString(16).slice(1)}`;
        if (alpha === true) {
            const aa = Math.round(a * 255).toString(16);
            if (this.a < 16 / 255) {
                s += `0${aa}`;
            } else {
                s += aa;
            }
        }
        return s;
    }
    /**
     * @overload
     * @param {number[]} [arr] - The array to populate with the color's number
     * components. If not specified, a new array is created.
     * @param {number} [offset] - The zero-based index at which to start copying elements to the
     * array. Default is 0.
     * @returns {number[]} The color as an array.
     */ /**
     * @overload
     * @param {ArrayBufferView} arr - The array to populate with the color's number
     * components. If not specified, a new array is created.
     * @param {number} [offset] - The zero-based index at which to start copying elements to the
     * array. Default is 0.
     * @returns {ArrayBufferView} The color as an array.
     */ /**
     * Converts the color to an array.
     *
     * @param {number[]|ArrayBufferView} [arr] - The array to populate with the color's number
     * components. If not specified, a new array is created.
     * @param {number} [offset] - The zero-based index at which to start copying elements to the
     * array. Default is 0.
     * @param {boolean} [alpha] - If true, the output array will include the alpha value.
     * @returns {number[]|ArrayBufferView} The color as an array.
     * @example
     * const c = new pc.Color(1, 1, 1);
     * // Outputs [1, 1, 1, 1]
     * console.log(c.toArray());
     */ toArray(arr = [], offset = 0, alpha = true) {
        arr[offset] = this.r;
        arr[offset + 1] = this.g;
        arr[offset + 2] = this.b;
        if (alpha) {
            arr[offset + 3] = this.a;
        }
        return arr;
    }
    /**
     * Creates a new Color instance.
     *
     * @overload
     * @param {number} [r] - The r value. Defaults to 0.
     * @param {number} [g] - The g value. Defaults to 0.
     * @param {number} [b] - The b value. Defaults to 0.
     * @param {number} [a] - The a value. Defaults to 1.
     * @example
     * const c1 = new pc.Color(); // defaults to 0, 0, 0, 1
     * const c2 = new pc.Color(0.1, 0.2, 0.3, 0.4);
     */ /**
     * Creates a new Color instance.
     *
     * @overload
     * @param {number[]} arr - The array to set the color values from.
     * @example
     * const c = new pc.Color([0.1, 0.2, 0.3, 0.4]);
     */ /**
     * @param {number|number[]} [r] - The r value. Defaults to 0. If r is an array of length 3 or
     * 4, the array will be used to populate all components.
     * @param {number} [g] - The g value. Defaults to 0.
     * @param {number} [b] - The b value. Defaults to 0.
     * @param {number} [a] - The a value. Defaults to 1.
     */ constructor(r = 0, g = 0, b = 0, a = 1){
        const length = r.length;
        if (length === 3 || length === 4) {
            this.r = r[0];
            this.g = r[1];
            this.b = r[2];
            this.a = r[3] ?? 1;
        } else {
            this.r = r;
            this.g = g;
            this.b = b;
            this.a = a;
        }
    }
}
/**
     * A constant color set to black [0, 0, 0, 1].
     *
     * @type {Color}
     * @readonly
     */ Color.BLACK = Object.freeze(new Color(0, 0, 0, 1));
/**
     * A constant color set to blue [0, 0, 1, 1].
     *
     * @type {Color}
     * @readonly
     */ Color.BLUE = Object.freeze(new Color(0, 0, 1, 1));
/**
     * A constant color set to cyan [0, 1, 1, 1].
     *
     * @type {Color}
     * @readonly
     */ Color.CYAN = Object.freeze(new Color(0, 1, 1, 1));
/**
     * A constant color set to gray [0.5, 0.5, 0.5, 1].
     *
     * @type {Color}
     * @readonly
     */ Color.GRAY = Object.freeze(new Color(0.5, 0.5, 0.5, 1));
/**
     * A constant color set to green [0, 1, 0, 1].
     *
     * @type {Color}
     * @readonly
     */ Color.GREEN = Object.freeze(new Color(0, 1, 0, 1));
/**
     * A constant color set to magenta [1, 0, 1, 1].
     *
     * @type {Color}
     * @readonly
     */ Color.MAGENTA = Object.freeze(new Color(1, 0, 1, 1));
/**
     * A constant color set to red [1, 0, 0, 1].
     *
     * @type {Color}
     * @readonly
     */ Color.RED = Object.freeze(new Color(1, 0, 0, 1));
/**
     * A constant color set to white [1, 1, 1, 1].
     *
     * @type {Color}
     * @readonly
     */ Color.WHITE = Object.freeze(new Color(1, 1, 1, 1));
/**
     * A constant color set to yellow [1, 1, 0, 1].
     *
     * @type {Color}
     * @readonly
     */ Color.YELLOW = Object.freeze(new Color(1, 1, 0, 1));

/**
 * @import { Color } from './color.js'
 */ const floatView = new Float32Array(1);
const int32View = new Int32Array(floatView.buffer);
/**
 * Utility static class providing functionality to pack float values to various storage
 * representations.
 *
 * @category Math
 */ class FloatPacking {
    /**
     * Packs a float to a 16-bit half-float representation used by the GPU.
     *
     * @param {number} value - The float value to pack.
     * @returns {number} The 16-bit half-float representation as an integer.
     * @example
     * const half = pc.FloatPacking.float2Half(1.5);
     */ static float2Half(value) {
        // based on https://esdiscuss.org/topic/float16array
        // This method is faster than the OpenEXR implementation (very often
        // used, eg. in Ogre), with the additional benefit of rounding, inspired
        // by James Tursa?s half-precision code.
        floatView[0] = value;
        const x = int32View[0];
        let bits = x >> 16 & 0x8000; // Get the sign
        let m = x >> 12 & 0x07ff; // Keep one extra bit for rounding
        const e = x >> 23 & 0xff; // Using int is faster here
        // If zero, or denormal, or exponent underflows too much for a denormal half, return signed zero.
        if (e < 103) {
            return bits;
        }
        // If NaN, return NaN. If Inf or exponent overflow, return Inf.
        if (e > 142) {
            bits |= 0x7c00;
            // If exponent was 0xff and one mantissa bit was set, it means NaN,
            // not Inf, so make sure we set one mantissa bit too.
            bits |= (e === 255 ? 0 : 1) && x & 0x007fffff;
            return bits;
        }
        // If exponent underflows but not too much, return a denormal
        if (e < 113) {
            m |= 0x0800;
            // Extra rounding may overflow and set mantissa to 0 and exponent to 1, which is OK.
            bits |= (m >> 114 - e) + (m >> 113 - e & 1);
            return bits;
        }
        bits |= e - 112 << 10 | m >> 1;
        // Extra rounding. An overflow will set mantissa to 0 and increment the exponent, which is OK.
        bits += m & 1;
        return bits;
    }
    /**
     * Converts bits of a 32-bit float into RGBA8 format and stores the result in a provided color.
     * The float can be reconstructed in shader using the uintBitsToFloat instruction.
     *
     * @param {number} value - The float value to convert.
     * @param {Color} data - The color to store the RGBA8 packed value in.
     *
     * @ignore
     */ static float2RGBA8(value, data) {
        floatView[0] = value;
        const intBits = int32View[0];
        data.r = (intBits >> 24 & 0xFF) / 255.0;
        data.g = (intBits >> 16 & 0xFF) / 255.0;
        data.b = (intBits >> 8 & 0xFF) / 255.0;
        data.a = (intBits & 0xFF) / 255.0;
    }
}

/**
 * A 2-dimensional vector. Vec2 is commonly used to represent 2D positions, directions, texture
 * coordinates (UVs) or any pair of related numeric values.
 *
 * @category Math
 */ class Vec2 {
    /**
     * Adds a 2-dimensional vector to another in place.
     *
     * @param {Vec2} rhs - The vector to add to the specified vector.
     * @returns {Vec2} Self for chaining.
     * @example
     * const a = new pc.Vec2(10, 10);
     * const b = new pc.Vec2(20, 20);
     *
     * a.add(b);
     *
     * // Outputs [30, 30]
     * console.log("The result of the addition is: " + a.toString());
     */ add(rhs) {
        this.x += rhs.x;
        this.y += rhs.y;
        return this;
    }
    /**
     * Adds two 2-dimensional vectors together and returns the result.
     *
     * @param {Vec2} lhs - The first vector operand for the addition.
     * @param {Vec2} rhs - The second vector operand for the addition.
     * @returns {Vec2} Self for chaining.
     * @example
     * const a = new pc.Vec2(10, 10);
     * const b = new pc.Vec2(20, 20);
     * const r = new pc.Vec2();
     *
     * r.add2(a, b);
     * // Outputs [30, 30]
     *
     * console.log("The result of the addition is: " + r.toString());
     */ add2(lhs, rhs) {
        this.x = lhs.x + rhs.x;
        this.y = lhs.y + rhs.y;
        return this;
    }
    /**
     * Adds a number to each element of a vector.
     *
     * @param {number} scalar - The number to add.
     * @returns {Vec2} Self for chaining.
     * @example
     * const vec = new pc.Vec2(3, 4);
     *
     * vec.addScalar(2);
     *
     * // Outputs [5, 6]
     * console.log("The result of the addition is: " + vec.toString());
     */ addScalar(scalar) {
        this.x += scalar;
        this.y += scalar;
        return this;
    }
    /**
     * Adds a 2-dimensional vector scaled by scalar value. Does not modify the vector being added.
     *
     * @param {Vec2} rhs - The vector to add to the specified vector.
     * @param {number} scalar - The number to multiply the added vector with.
     * @returns {Vec2} Self for chaining.
     * @example
     * const vec = new pc.Vec2(1, 2);
     *
     * vec.addScaled(pc.Vec2.UP, 2);
     *
     * // Outputs [1, 4]
     * console.log("The result of the addition is: " + vec.toString());
     */ addScaled(rhs, scalar) {
        this.x += rhs.x * scalar;
        this.y += rhs.y * scalar;
        return this;
    }
    /**
     * Returns an identical copy of the specified 2-dimensional vector.
     *
     * @returns {this} A 2-dimensional vector containing the result of the cloning.
     * @example
     * const v = new pc.Vec2(10, 20);
     * const vclone = v.clone();
     * console.log("The result of the cloning is: " + vclone.toString());
     */ clone() {
        /** @type {this} */ const cstr = this.constructor;
        return new cstr(this.x, this.y);
    }
    /**
     * Copies the contents of a source 2-dimensional vector to a destination 2-dimensional vector.
     *
     * @param {Vec2} rhs - A vector to copy to the specified vector.
     * @returns {Vec2} Self for chaining.
     * @example
     * const src = new pc.Vec2(10, 20);
     * const dst = new pc.Vec2();
     *
     * dst.copy(src);
     *
     * console.log("The two vectors are " + (dst.equals(src) ? "equal" : "different"));
     */ copy(rhs) {
        this.x = rhs.x;
        this.y = rhs.y;
        return this;
    }
    /**
     * Returns the result of a cross product operation performed on the two specified 2-dimensional
     * vectors.
     *
     * @param {Vec2} rhs - The second 2-dimensional vector operand of the cross product.
     * @returns {number} The cross product of the two vectors.
     * @example
     * const right = new pc.Vec2(1, 0);
     * const up = new pc.Vec2(0, 1);
     * const crossProduct = right.cross(up);
     *
     * // Prints 1
     * console.log("The result of the cross product is: " + crossProduct);
     */ cross(rhs) {
        return this.x * rhs.y - this.y * rhs.x;
    }
    /**
     * Returns the distance between the two specified 2-dimensional vectors.
     *
     * @param {Vec2} rhs - The second 2-dimensional vector to test.
     * @returns {number} The distance between the two vectors.
     * @example
     * const v1 = new pc.Vec2(5, 10);
     * const v2 = new pc.Vec2(10, 20);
     * const d = v1.distance(v2);
     * console.log("The distance between v1 and v2 is: " + d);
     */ distance(rhs) {
        const x = this.x - rhs.x;
        const y = this.y - rhs.y;
        return Math.sqrt(x * x + y * y);
    }
    /**
     * Divides a 2-dimensional vector by another in place.
     *
     * @param {Vec2} rhs - The vector to divide the specified vector by.
     * @returns {Vec2} Self for chaining.
     * @example
     * const a = new pc.Vec2(4, 9);
     * const b = new pc.Vec2(2, 3);
     *
     * a.div(b);
     *
     * // Outputs [2, 3]
     * console.log("The result of the division is: " + a.toString());
     */ div(rhs) {
        this.x /= rhs.x;
        this.y /= rhs.y;
        return this;
    }
    /**
     * Divides one 2-dimensional vector by another and writes the result to the specified vector.
     *
     * @param {Vec2} lhs - The dividend vector (the vector being divided).
     * @param {Vec2} rhs - The divisor vector (the vector dividing the dividend).
     * @returns {Vec2} Self for chaining.
     * @example
     * const a = new pc.Vec2(4, 9);
     * const b = new pc.Vec2(2, 3);
     * const r = new pc.Vec2();
     *
     * r.div2(a, b);
     *
     * // Outputs [2, 3]
     * console.log("The result of the division is: " + r.toString());
     */ div2(lhs, rhs) {
        this.x = lhs.x / rhs.x;
        this.y = lhs.y / rhs.y;
        return this;
    }
    /**
     * Divides each element of a vector by a number.
     *
     * @param {number} scalar - The number to divide by.
     * @returns {Vec2} Self for chaining.
     * @example
     * const vec = new pc.Vec2(3, 6);
     *
     * vec.divScalar(3);
     *
     * // Outputs [1, 2]
     * console.log("The result of the division is: " + vec.toString());
     */ divScalar(scalar) {
        this.x /= scalar;
        this.y /= scalar;
        return this;
    }
    /**
     * Returns the result of a dot product operation performed on the two specified 2-dimensional
     * vectors.
     *
     * @param {Vec2} rhs - The second 2-dimensional vector operand of the dot product.
     * @returns {number} The result of the dot product operation.
     * @example
     * const v1 = new pc.Vec2(5, 10);
     * const v2 = new pc.Vec2(10, 20);
     * const v1dotv2 = v1.dot(v2);
     * console.log("The result of the dot product is: " + v1dotv2);
     */ dot(rhs) {
        return this.x * rhs.x + this.y * rhs.y;
    }
    /**
     * Reports whether two vectors are equal.
     *
     * @param {Vec2} rhs - The vector to compare to the specified vector.
     * @returns {boolean} True if the vectors are equal and false otherwise.
     * @example
     * const a = new pc.Vec2(1, 2);
     * const b = new pc.Vec2(4, 5);
     * console.log("The two vectors are " + (a.equals(b) ? "equal" : "different"));
     */ equals(rhs) {
        return this.x === rhs.x && this.y === rhs.y;
    }
    /**
     * Reports whether two vectors are equal using an absolute error tolerance.
     *
     * @param {Vec2} rhs - The vector to be compared against.
     * @param {number} [epsilon] - The maximum difference between each component of the two
     * vectors. Defaults to 1e-6.
     * @returns {boolean} True if the vectors are equal and false otherwise.
     * @example
     * const a = new pc.Vec2();
     * const b = new pc.Vec2();
     * console.log("The two vectors are approximately " + (a.equalsApprox(b, 1e-9) ? "equal" : "different"));
     */ equalsApprox(rhs, epsilon = 1e-6) {
        return Math.abs(this.x - rhs.x) < epsilon && Math.abs(this.y - rhs.y) < epsilon;
    }
    /**
     * Returns the magnitude of the specified 2-dimensional vector.
     *
     * @returns {number} The magnitude of the specified 2-dimensional vector.
     * @example
     * const vec = new pc.Vec2(3, 4);
     * const len = vec.length();
     * // Outputs 5
     * console.log("The length of the vector is: " + len);
     */ length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    /**
     * Returns the magnitude squared of the specified 2-dimensional vector.
     *
     * @returns {number} The magnitude squared of the specified 2-dimensional vector.
     * @example
     * const vec = new pc.Vec2(3, 4);
     * const len = vec.lengthSq();
     * // Outputs 25
     * console.log("The length squared of the vector is: " + len);
     */ lengthSq() {
        return this.x * this.x + this.y * this.y;
    }
    /**
     * Returns the result of a linear interpolation between two specified 2-dimensional vectors.
     *
     * @param {Vec2} lhs - The 2-dimensional vector to interpolate from.
     * @param {Vec2} rhs - The 2-dimensional vector to interpolate to.
     * @param {number} alpha - The value controlling the point of interpolation. Between 0 and 1,
     * the linear interpolant will occur on a straight line between lhs and rhs. Outside of this
     * range, the linear interpolant will occur on a ray extrapolated from this line.
     * @returns {Vec2} Self for chaining.
     * @example
     * const a = new pc.Vec2(0, 0);
     * const b = new pc.Vec2(10, 10);
     * const r = new pc.Vec2();
     *
     * r.lerp(a, b, 0);   // r is equal to a
     * r.lerp(a, b, 0.5); // r is 5, 5
     * r.lerp(a, b, 1);   // r is equal to b
     */ lerp(lhs, rhs, alpha) {
        this.x = lhs.x + alpha * (rhs.x - lhs.x);
        this.y = lhs.y + alpha * (rhs.y - lhs.y);
        return this;
    }
    /**
     * Multiplies a 2-dimensional vector to another in place.
     *
     * @param {Vec2} rhs - The 2-dimensional vector used as the second multiplicand of the operation.
     * @returns {Vec2} Self for chaining.
     * @example
     * const a = new pc.Vec2(2, 3);
     * const b = new pc.Vec2(4, 5);
     *
     * a.mul(b);
     *
     * // Outputs 8, 15
     * console.log("The result of the multiplication is: " + a.toString());
     */ mul(rhs) {
        this.x *= rhs.x;
        this.y *= rhs.y;
        return this;
    }
    /**
     * Returns the result of multiplying the specified 2-dimensional vectors together.
     *
     * @param {Vec2} lhs - The 2-dimensional vector used as the first multiplicand of the operation.
     * @param {Vec2} rhs - The 2-dimensional vector used as the second multiplicand of the operation.
     * @returns {Vec2} Self for chaining.
     * @example
     * const a = new pc.Vec2(2, 3);
     * const b = new pc.Vec2(4, 5);
     * const r = new pc.Vec2();
     *
     * r.mul2(a, b);
     *
     * // Outputs 8, 15
     * console.log("The result of the multiplication is: " + r.toString());
     */ mul2(lhs, rhs) {
        this.x = lhs.x * rhs.x;
        this.y = lhs.y * rhs.y;
        return this;
    }
    /**
     * Multiplies each element of a vector by a number.
     *
     * @param {number} scalar - The number to multiply by.
     * @returns {Vec2} Self for chaining.
     * @example
     * const vec = new pc.Vec2(3, 6);
     *
     * vec.mulScalar(3);
     *
     * // Outputs [9, 18]
     * console.log("The result of the multiplication is: " + vec.toString());
     */ mulScalar(scalar) {
        this.x *= scalar;
        this.y *= scalar;
        return this;
    }
    /**
     * Returns this 2-dimensional vector converted to a unit vector in place. If the vector has a
     * length of zero, the vector's elements will be set to zero.
     *
     * @param {Vec2} [src] - The vector to normalize. If not set, the operation is done in place.
     * @returns {Vec2} Self for chaining.
     * @example
     * const v = new pc.Vec2(25, 0);
     *
     * v.normalize();
     *
     * // Outputs 1, 0
     * console.log("The result of the vector normalization is: " + v.toString());
     */ normalize(src = this) {
        const lengthSq = src.x * src.x + src.y * src.y;
        if (lengthSq > 0) {
            const invLength = 1 / Math.sqrt(lengthSq);
            this.x = src.x * invLength;
            this.y = src.y * invLength;
        }
        return this;
    }
    /**
     * Rotate a vector by an angle in degrees.
     *
     * @param {number} degrees - The number to degrees to rotate the vector by.
     * @returns {Vec2} Self for chaining.
     * @example
     * const v = new pc.Vec2(0, 10);
     *
     * v.rotate(45); // rotates by 45 degrees
     *
     * // Outputs [7.071068.., 7.071068..]
     * console.log("Vector after rotation is: " + v.toString());
     */ rotate(degrees) {
        const angle = Math.atan2(this.x, this.y) + degrees * math.DEG_TO_RAD;
        const len = Math.sqrt(this.x * this.x + this.y * this.y);
        this.x = Math.sin(angle) * len;
        this.y = Math.cos(angle) * len;
        return this;
    }
    /**
     * Returns the angle in degrees of the specified 2-dimensional vector.
     *
     * @returns {number} The angle in degrees of the specified 2-dimensional vector.
     * @example
     * const v = new pc.Vec2(6, 0);
     * const angle = v.angle();
     * // Outputs 90..
     * console.log("The angle of the vector is: " + angle);
     */ angle() {
        return Math.atan2(this.x, this.y) * math.RAD_TO_DEG;
    }
    /**
     * Returns the shortest Euler angle between two 2-dimensional vectors.
     *
     * @param {Vec2} rhs - The 2-dimensional vector to calculate angle to.
     * @returns {number} The shortest angle in degrees between two 2-dimensional vectors.
     * @example
     * const a = new pc.Vec2(0, 10); // up
     * const b = new pc.Vec2(1, -1); // down-right
     * const angle = a.angleTo(b);
     * // Outputs 135..
     * console.log("The angle between vectors a and b: " + angle);
     */ angleTo(rhs) {
        return Math.atan2(this.x * rhs.y + this.y * rhs.x, this.x * rhs.x + this.y * rhs.y) * math.RAD_TO_DEG;
    }
    /**
     * Each element is set to the largest integer less than or equal to its value.
     *
     * @param {Vec2} [src] - The vector to floor. If not set, the operation is done in place.
     * @returns {Vec2} Self for chaining.
     * @example
     * const v = new pc.Vec2(1.2, 3.9);
     * v.floor();
     * // v is now [1, 3]
     */ floor(src = this) {
        this.x = Math.floor(src.x);
        this.y = Math.floor(src.y);
        return this;
    }
    /**
     * Each element is rounded up to the next largest integer.
     *
     * @param {Vec2} [src] - The vector to ceil. If not set, the operation is done in place.
     * @returns {Vec2} Self for chaining.
     * @example
     * const v = new pc.Vec2(1.2, 3.1);
     * v.ceil();
     * // v is now [2, 4]
     */ ceil(src = this) {
        this.x = Math.ceil(src.x);
        this.y = Math.ceil(src.y);
        return this;
    }
    /**
     * Each element is rounded up or down to the nearest integer.
     *
     * @param {Vec2} [src] - The vector to round. If not set, the operation is done in place.
     * @returns {Vec2} Self for chaining.
     * @example
     * const v = new pc.Vec2(1.4, 3.6);
     * v.round();
     * // v is now [1, 4]
     */ round(src = this) {
        this.x = Math.round(src.x);
        this.y = Math.round(src.y);
        return this;
    }
    /**
     * Each element is assigned a value from rhs parameter if it is smaller.
     *
     * @param {Vec2} rhs - The 2-dimensional vector used as the source of elements to compare to.
     * @returns {Vec2} Self for chaining.
     * @example
     * const a = new pc.Vec2(5, 1);
     * const b = new pc.Vec2(2, 8);
     * a.min(b);
     * // a is now [2, 1]
     */ min(rhs) {
        if (rhs.x < this.x) this.x = rhs.x;
        if (rhs.y < this.y) this.y = rhs.y;
        return this;
    }
    /**
     * Each element is assigned a value from rhs parameter if it is larger.
     *
     * @param {Vec2} rhs - The 2-dimensional vector used as the source of elements to compare to.
     * @returns {Vec2} Self for chaining.
     * @example
     * const a = new pc.Vec2(5, 1);
     * const b = new pc.Vec2(2, 8);
     * a.max(b);
     * // a is now [5, 8]
     */ max(rhs) {
        if (rhs.x > this.x) this.x = rhs.x;
        if (rhs.y > this.y) this.y = rhs.y;
        return this;
    }
    /**
     * Sets the specified 2-dimensional vector to the supplied numerical values.
     *
     * @param {number} x - The value to set on the first component of the vector.
     * @param {number} y - The value to set on the second component of the vector.
     * @returns {Vec2} Self for chaining.
     * @example
     * const v = new pc.Vec2();
     * v.set(5, 10);
     *
     * // Outputs 5, 10
     * console.log("The result of the vector set is: " + v.toString());
     */ set(x, y) {
        this.x = x;
        this.y = y;
        return this;
    }
    /**
     * Subtracts a 2-dimensional vector from another in place.
     *
     * @param {Vec2} rhs - The vector to subtract from the specified vector.
     * @returns {Vec2} Self for chaining.
     * @example
     * const a = new pc.Vec2(10, 10);
     * const b = new pc.Vec2(20, 20);
     *
     * a.sub(b);
     *
     * // Outputs [-10, -10]
     * console.log("The result of the subtraction is: " + a.toString());
     */ sub(rhs) {
        this.x -= rhs.x;
        this.y -= rhs.y;
        return this;
    }
    /**
     * Subtracts two 2-dimensional vectors from one another and returns the result.
     *
     * @param {Vec2} lhs - The first vector operand for the subtraction.
     * @param {Vec2} rhs - The second vector operand for the subtraction.
     * @returns {Vec2} Self for chaining.
     * @example
     * const a = new pc.Vec2(10, 10);
     * const b = new pc.Vec2(20, 20);
     * const r = new pc.Vec2();
     *
     * r.sub2(a, b);
     *
     * // Outputs [-10, -10]
     * console.log("The result of the subtraction is: " + r.toString());
     */ sub2(lhs, rhs) {
        this.x = lhs.x - rhs.x;
        this.y = lhs.y - rhs.y;
        return this;
    }
    /**
     * Subtracts a number from each element of a vector.
     *
     * @param {number} scalar - The number to subtract.
     * @returns {Vec2} Self for chaining.
     * @example
     * const vec = new pc.Vec2(3, 4);
     *
     * vec.subScalar(2);
     *
     * // Outputs [1, 2]
     * console.log("The result of the subtraction is: " + vec.toString());
     */ subScalar(scalar) {
        this.x -= scalar;
        this.y -= scalar;
        return this;
    }
    /**
     * Set the values of the vector from an array.
     *
     * @param {number[]|ArrayBufferView} arr - The array to set the vector values from.
     * @param {number} [offset] - The zero-based index at which to start copying elements from the
     * array. Default is 0.
     * @returns {Vec2} Self for chaining.
     * @example
     * const v = new pc.Vec2();
     * v.fromArray([20, 10]);
     * // v is set to [20, 10]
     */ fromArray(arr, offset = 0) {
        this.x = arr[offset] ?? this.x;
        this.y = arr[offset + 1] ?? this.y;
        return this;
    }
    /**
     * Converts the vector to string form.
     *
     * @returns {string} The vector in string form.
     * @example
     * const v = new pc.Vec2(20, 10);
     * // Outputs [20, 10]
     * console.log(v.toString());
     */ toString() {
        return `[${this.x}, ${this.y}]`;
    }
    /**
     * @overload
     * @param {number[]} [arr] - The array to populate with the vector's number
     * components. If not specified, a new array is created.
     * @param {number} [offset] - The zero-based index at which to start copying elements to the
     * array. Default is 0.
     * @returns {number[]} The vector as an array.
     */ /**
     * @overload
     * @param {ArrayBufferView} arr - The array to populate with the vector's number
     * components. If not specified, a new array is created.
     * @param {number} [offset] - The zero-based index at which to start copying elements to the
     * array. Default is 0.
     * @returns {ArrayBufferView} The vector as an array.
     */ /**
     * Converts the vector to an array.
     *
     * @param {number[]|ArrayBufferView} [arr] - The array to populate with the vector's number
     * components. If not specified, a new array is created.
     * @param {number} [offset] - The zero-based index at which to start copying elements to the
     * array. Default is 0.
     * @returns {number[]|ArrayBufferView} The vector as an array.
     * @example
     * const v = new pc.Vec2(20, 10);
     * // Outputs [20, 10]
     * console.log(v.toArray());
     */ toArray(arr = [], offset = 0) {
        arr[offset] = this.x;
        arr[offset + 1] = this.y;
        return arr;
    }
    /**
     * Calculates the angle between two Vec2's in radians.
     *
     * @param {Vec2} lhs - The first vector operand for the calculation.
     * @param {Vec2} rhs - The second vector operand for the calculation.
     * @returns {number} The calculated angle in radians.
     * @ignore
     */ static angleRad(lhs, rhs) {
        return Math.atan2(lhs.x * rhs.y - lhs.y * rhs.x, lhs.x * rhs.x + lhs.y * rhs.y);
    }
    /**
     * Creates a new Vec2 instance.
     *
     * @overload
     * @param {number} [x] - The x value. Defaults to 0.
     * @param {number} [y] - The y value. Defaults to 0.
     * @example
     * const v1 = new pc.Vec2(); // defaults to 0, 0
     * const v2 = new pc.Vec2(1, 2);
     */ /**
     * Creates a new Vec2 instance.
     *
     * @overload
     * @param {number[]} arr - The array to set the vector values from.
     * @example
     * const v = new pc.Vec2([1, 2]);
     */ /**
     * @param {number|number[]} [x] - The x value. Defaults to 0. If x is an array of length 2, the
     * array will be used to populate all components.
     * @param {number} [y] - The y value. Defaults to 0.
     */ constructor(x = 0, y = 0){
        if (x.length === 2) {
            this.x = x[0];
            this.y = x[1];
        } else {
            this.x = x;
            this.y = y;
        }
    }
}
/**
     * A constant vector set to [0, 0].
     *
     * @type {Vec2}
     * @readonly
     */ Vec2.ZERO = Object.freeze(new Vec2(0, 0));
/**
     * A constant vector set to [0.5, 0.5].
     *
     * @type {Vec2}
     * @readonly
     */ Vec2.HALF = Object.freeze(new Vec2(0.5, 0.5));
/**
     * A constant vector set to [1, 1].
     *
     * @type {Vec2}
     * @readonly
     */ Vec2.ONE = Object.freeze(new Vec2(1, 1));
/**
     * A constant vector set to [0, 1].
     *
     * @type {Vec2}
     * @readonly
     */ Vec2.UP = Object.freeze(new Vec2(0, 1));
/**
     * A constant vector set to [0, -1].
     *
     * @type {Vec2}
     * @readonly
     */ Vec2.DOWN = Object.freeze(new Vec2(0, -1));
/**
     * A constant vector set to [1, 0].
     *
     * @type {Vec2}
     * @readonly
     */ Vec2.RIGHT = Object.freeze(new Vec2(1, 0));
/**
     * A constant vector set to [-1, 0].
     *
     * @type {Vec2}
     * @readonly
     */ Vec2.LEFT = Object.freeze(new Vec2(-1, 0));

/**
 * Ignores the integer part of texture coordinates, using only the fractional part.
 *
 * @category Graphics
 */ const ADDRESS_REPEAT = 0;
/**
 * Clamps texture coordinate to the range 0 to 1.
 *
 * @category Graphics
 */ const ADDRESS_CLAMP_TO_EDGE = 1;
/**
 * Texture coordinate to be set to the fractional part if the integer part is even. If the integer
 * part is odd, then the texture coordinate is set to 1 minus the fractional part.
 *
 * @category Graphics
 */ const ADDRESS_MIRRORED_REPEAT = 2;
/**
 * Multiply all fragment components by zero.
 *
 * @category Graphics
 */ const BLENDMODE_ZERO = 0;
/**
 * Multiply all fragment components by one.
 *
 * @category Graphics
 */ const BLENDMODE_ONE = 1;
/**
 * Multiply all fragment components by the alpha value of the source fragment.
 *
 * @category Graphics
 */ const BLENDMODE_SRC_ALPHA = 6;
/**
 * Multiply all fragment components by one minus the alpha value of the source fragment.
 *
 * @category Graphics
 */ const BLENDMODE_ONE_MINUS_SRC_ALPHA = 8;
/**
 * Add the results of the source and destination fragment multiplies.
 *
 * @category Graphics
 */ const BLENDEQUATION_ADD = 0;
/**
 * A flag utilized during the construction of a {@link StorageBuffer} to make it available for read
 * access by CPU.
 *
 * @category Graphics
 */ const BUFFERUSAGE_READ = 0x0001;
/**
 * A flag utilized during the construction of a {@link StorageBuffer} to ensure its compatibility
 * when used as a source of a copy operation.
 *
 * @category Graphics
 */ const BUFFERUSAGE_COPY_SRC = 0x0004;
/**
 * A flag utilized during the construction of a {@link StorageBuffer} to ensure its compatibility
 * when used as a destination of a copy operation, or as a target of a write operation.
 *
 * @category Graphics
 */ const BUFFERUSAGE_COPY_DST = 0x0008;
/**
 * A flag utilized during the construction of a {@link StorageBuffer} to ensure its compatibility
 * when used as an index buffer.
 *
 * @category Graphics
 */ const BUFFERUSAGE_INDEX = 0x0010;
/**
 * A flag utilized during the construction of a {@link StorageBuffer} to ensure its compatibility
 * when used as a vertex buffer.
 *
 * @category Graphics
 */ const BUFFERUSAGE_VERTEX = 0x0020;
/**
 * A flag utilized during the construction of a {@link StorageBuffer} to ensure its compatibility
 * when used as an uniform buffer.
 *
 * @category Graphics
 */ const BUFFERUSAGE_UNIFORM = 0x0040;
/**
 * An internal flag utilized during the construction of a {@link StorageBuffer} to ensure its
 * compatibility when used as a storage buffer.
 * This flag is hidden as it's automatically used by the StorageBuffer constructor.
 *
 * @category Graphics
 * @ignore
 */ const BUFFERUSAGE_STORAGE = 0x0080;
/**
 * A flag utilized during the construction of a {@link StorageBuffer} to allow it to store indirect
 * command arguments.
 * TODO: This flag is hidden till the feature is implemented.
 *
 * @category Graphics
 * @ignore
 */ const BUFFERUSAGE_INDIRECT = 0x0100;
/**
 * The data store contents will be modified once and used many times.
 *
 * @category Graphics
 */ const BUFFER_STATIC = 0;
/**
 * Clear the color buffer.
 *
 * @category Graphics
 */ const CLEARFLAG_COLOR = 1;
/**
 * Clear the depth buffer.
 *
 * @category Graphics
 */ const CLEARFLAG_DEPTH = 2;
/**
 * Clear the stencil buffer.
 *
 * @category Graphics
 */ const CLEARFLAG_STENCIL = 4;
/**
 * No triangles are culled.
 *
 * @category Graphics
 */ const CULLFACE_NONE = 0;
/**
 * Triangles facing away from the view direction are culled.
 *
 * @category Graphics
 */ const CULLFACE_BACK = 1;
/**
 * The counterclockwise winding. Specifies whether polygons are front- or back-facing by setting a winding orientation.
 *
 * @category Graphics
 */ const FRONTFACE_CCW = 0;
/**
 * Point sample filtering.
 *
 * @category Graphics
 */ const FILTER_NEAREST = 0;
/**
 * Bilinear filtering.
 *
 * @category Graphics
 */ const FILTER_LINEAR = 1;
/**
 * Use the nearest neighbor in the nearest mipmap level.
 *
 * @category Graphics
 */ const FILTER_NEAREST_MIPMAP_NEAREST = 2;
/**
 * Linearly interpolate in the nearest mipmap level.
 *
 * @category Graphics
 */ const FILTER_NEAREST_MIPMAP_LINEAR = 3;
/**
 * Use the nearest neighbor after linearly interpolating between mipmap levels.
 *
 * @category Graphics
 */ const FILTER_LINEAR_MIPMAP_NEAREST = 4;
/**
 * Linearly interpolate both the mipmap levels and between texels.
 *
 * @category Graphics
 */ const FILTER_LINEAR_MIPMAP_LINEAR = 5;
/**
 * Pass if (ref & mask) < (stencil & mask).
 *
 * @category Graphics
 */ const FUNC_LESS = 1;
/**
 * Pass if (ref & mask) <= (stencil & mask).
 *
 * @category Graphics
 */ const FUNC_LESSEQUAL = 3;
/**
 * Always pass.
 *
 * @category Graphics
 */ const FUNC_ALWAYS = 7;
/**
 * 8-bit unsigned vertex indices (0 to 255).
 *
 * @category Graphics
 */ const INDEXFORMAT_UINT8 = 0;
/**
 * 16-bit unsigned vertex indices (0 to 65,535).
 *
 * @category Graphics
 */ const INDEXFORMAT_UINT16 = 1;
/**
 * 32-bit unsigned vertex indices (0 to 4,294,967,295).
 *
 * @category Graphics
 */ const INDEXFORMAT_UINT32 = 2;
const PIXELFORMAT_A8 = 0;
const PIXELFORMAT_L8 = 1;
const PIXELFORMAT_LA8 = 2;
/**
 * 16-bit RGB (5-bits for red channel, 6 for green and 5 for blue).
 *
 * @category Graphics
 */ const PIXELFORMAT_RGB565 = 3;
/**
 * 16-bit RGBA (5-bits for red channel, 5 for green, 5 for blue with 1-bit alpha).
 *
 * @category Graphics
 */ const PIXELFORMAT_RGBA5551 = 4;
/**
 * 16-bit RGBA (4-bits for red channel, 4 for green, 4 for blue with 4-bit alpha).
 *
 * @category Graphics
 */ const PIXELFORMAT_RGBA4 = 5;
/**
 * 24-bit RGB (8-bits for red channel, 8 for green and 8 for blue).
 *
 * @category Graphics
 */ const PIXELFORMAT_RGB8 = 6;
/**
 * 32-bit RGBA (8-bits for red channel, 8 for green, 8 for blue with 8-bit alpha).
 *
 * @category Graphics
 */ const PIXELFORMAT_RGBA8 = 7;
/**
 * Block compressed format storing 16 input pixels in 64 bits of output, consisting of two 16-bit
 * RGB 5:6:5 color values and a 4x4 two bit lookup table.
 *
 * @category Graphics
 */ const PIXELFORMAT_DXT1 = 8;
/**
 * Block compressed format storing 16 input pixels (corresponding to a 4x4 pixel block) into 128
 * bits of output, consisting of 64 bits of alpha channel data (4 bits for each pixel) followed by
 * 64 bits of color data; encoded the same way as DXT1.
 *
 * @category Graphics
 */ const PIXELFORMAT_DXT3 = 9;
/**
 * Block compressed format storing 16 input pixels into 128 bits of output, consisting of 64 bits
 * of alpha channel data (two 8 bit alpha values and a 4x4 3 bit lookup table) followed by 64 bits
 * of color data (encoded the same way as DXT1).
 *
 * @category Graphics
 */ const PIXELFORMAT_DXT5 = 10;
/**
 * 16-bit floating point RGB (16-bit float for each red, green and blue channels).
 *
 * @category Graphics
 */ const PIXELFORMAT_RGB16F = 11;
/**
 * 16-bit floating point RGBA (16-bit float for each red, green, blue and alpha channels).
 *
 * @category Graphics
 */ const PIXELFORMAT_RGBA16F = 12;
/**
 * 32-bit floating point RGB (32-bit float for each red, green and blue channels).
 *
 * @category Graphics
 */ const PIXELFORMAT_RGB32F = 13;
/**
 * 32-bit floating point RGBA (32-bit float for each red, green, blue and alpha channels).
 *
 * @category Graphics
 */ const PIXELFORMAT_RGBA32F = 14;
/**
 * 32-bit floating point single channel format.
 *
 * @category Graphics
 */ const PIXELFORMAT_R32F = 15;
/**
 * A readable depth buffer format.
 *
 * @category Graphics
 */ const PIXELFORMAT_DEPTH = 16;
/**
 * A readable depth/stencil buffer format.
 *
 * @category Graphics
 */ const PIXELFORMAT_DEPTHSTENCIL = 17;
/**
 * A floating-point color-only format with 11 bits for red and green channels and 10 bits for the
 * blue channel.
 *
 * @category Graphics
 */ const PIXELFORMAT_111110F = 18;
/**
 * Color-only sRGB format.
 *
 * @category Graphics
 */ const PIXELFORMAT_SRGB8 = 19;
/**
 * Color sRGB format with additional alpha channel.
 *
 * @category Graphics
 */ const PIXELFORMAT_SRGBA8 = 20;
/**
 * ETC1 compressed format.
 *
 * @category Graphics
 */ const PIXELFORMAT_ETC1 = 21;
/**
 * ETC2 (RGB) compressed format.
 *
 * @category Graphics
 */ const PIXELFORMAT_ETC2_RGB = 22;
/**
 * ETC2 (RGBA) compressed format.
 *
 * @category Graphics
 */ const PIXELFORMAT_ETC2_RGBA = 23;
/**
 * PVRTC (2BPP RGB) compressed format.
 *
 * @category Graphics
 */ const PIXELFORMAT_PVRTC_2BPP_RGB_1 = 24;
/**
 * PVRTC (2BPP RGBA) compressed format.
 *
 * @category Graphics
 */ const PIXELFORMAT_PVRTC_2BPP_RGBA_1 = 25;
/**
 * PVRTC (4BPP RGB) compressed format.
 *
 * @category Graphics
 */ const PIXELFORMAT_PVRTC_4BPP_RGB_1 = 26;
/**
 * PVRTC (4BPP RGBA) compressed format.
 *
 * @category Graphics
 */ const PIXELFORMAT_PVRTC_4BPP_RGBA_1 = 27;
/**
 * ATC compressed format with alpha channel in blocks of 4x4.
 *
 * @category Graphics
 */ const PIXELFORMAT_ASTC_4x4 = 28;
/**
 * ATC compressed format with no alpha channel.
 *
 * @category Graphics
 */ const PIXELFORMAT_ATC_RGB = 29;
/**
 * ATC compressed format with alpha channel.
 *
 * @category Graphics
 */ const PIXELFORMAT_ATC_RGBA = 30;
/**
 * 32-bit BGRA (8-bits for blue channel, 8 for green, 8 for red with 8-bit alpha). This is an
 * internal format used by the WebGPU's backbuffer only.
 *
 * @ignore
 * @category Graphics
 */ const PIXELFORMAT_BGRA8 = 31;
/**
 * 8-bit signed integer single-channel (R) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_R8I = 32;
/**
 * 8-bit unsigned integer single-channel (R) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_R8U = 33;
/**
 * 16-bit signed integer single-channel (R) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_R16I = 34;
/**
 * 16-bit unsigned integer single-channel (R) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_R16U = 35;
/**
 * 32-bit signed integer single-channel (R) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_R32I = 36;
/**
 * 32-bit unsigned integer single-channel (R) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_R32U = 37;
/**
 * 8-bit per-channel signed integer (RG) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RG8I = 38;
/**
 * 8-bit per-channel unsigned integer (RG) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RG8U = 39;
/**
 * 16-bit per-channel signed integer (RG) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RG16I = 40;
/**
 * 16-bit per-channel unsigned integer (RG) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RG16U = 41;
/**
 * 32-bit per-channel signed integer (RG) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RG32I = 42;
/**
 * 32-bit per-channel unsigned integer (RG) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RG32U = 43;
/**
 * 8-bit per-channel signed integer (RGBA) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RGBA8I = 44;
/**
 * 8-bit per-channel unsigned integer (RGBA) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RGBA8U = 45;
/**
 * 16-bit per-channel signed integer (RGBA) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RGBA16I = 46;
/**
 * 16-bit per-channel unsigned integer (RGBA) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RGBA16U = 47;
/**
 * 32-bit per-channel signed integer (RGBA) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RGBA32I = 48;
/**
 * 32-bit per-channel unsigned integer (RGBA) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RGBA32U = 49;
/**
 * 16-bit floating point R (16-bit float for red channel).
 *
 * @category Graphics
 */ const PIXELFORMAT_R16F = 50;
/**
 * 16-bit floating point RG (16-bit float for each red and green channels).
 *
 * @category Graphics
 */ const PIXELFORMAT_RG16F = 51;
/**
 * 8-bit per-channel (R) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_R8 = 52;
/**
 * 8-bit per-channel (RG) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RG8 = 53;
/**
 * Format equivalent to {@link PIXELFORMAT_DXT1} but sampled in linear color space.
 *
 * @category Graphics
 */ const PIXELFORMAT_DXT1_SRGB = 54;
/**
 * Format equivalent to {@link PIXELFORMAT_DXT3} but sampled in linear color space.
 *
 * @category Graphics
 */ const PIXELFORMAT_DXT3_SRGBA = 55;
/**
 * Format equivalent to {@link PIXELFORMAT_DXT5} but sampled in linear color space.
 *
 * @category Graphics
 */ const PIXELFORMAT_DXT5_SRGBA = 56;
/**
 * Format equivalent to {@link PIXELFORMAT_ETC2_RGB} but sampled in linear color space.
 *
 * @category Graphics
 */ const PIXELFORMAT_ETC2_SRGB = 61;
/**
 * Format equivalent to {@link PIXELFORMAT_ETC2_RGBA} but sampled in linear color space.
 *
 * @category Graphics
 */ const PIXELFORMAT_ETC2_SRGBA = 62;
/**
 * Format equivalent to {@link PIXELFORMAT_ASTC_4x4} but sampled in linear color space.
 *
 * @category Graphics
 */ const PIXELFORMAT_ASTC_4x4_SRGB = 63;
/**
 * 32-bit BGRA sRGB format. This is an internal format used by the WebGPU's backbuffer only.
 *
 * @ignore
 * @category Graphics
 */ const PIXELFORMAT_SBGRA8 = 64;
/**
 * Compressed high dynamic range signed floating point format storing RGB values.
 *
 * @category Graphics
 */ const PIXELFORMAT_BC6F = 65;
/**
 * Compressed high dynamic range unsigned floating point format storing RGB values.
 *
 * @category Graphics
 */ const PIXELFORMAT_BC6UF = 66;
/**
 * Compressed 8-bit fixed-point data. Each 4x4 block of texels consists of 128 bits of RGBA data.
 *
 * @category Graphics
 */ const PIXELFORMAT_BC7 = 67;
/**
 * Compressed 8-bit fixed-point data. Each 4x4 block of texels consists of 128 bits of SRGB_ALPHA
 * data.
 *
 * @category Graphics
 */ const PIXELFORMAT_BC7_SRGBA = 68;
/**
 * A 16-bit depth buffer format.
 *
 * @category Graphics
 */ const PIXELFORMAT_DEPTH16 = 69;
/**
 * 32-bit floating point RG (32-bit float for each red and green channels). WebGPU only.
 *
 * @category Graphics
 */ const PIXELFORMAT_RG32F = 70;
/**
 * 32-bit RGB format with shared 5-bit exponent (9 bits each for RGB mantissa). HDR format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RGB9E5 = 71;
/**
 * 8-bit per-channel signed normalized (RG) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RG8S = 72;
/**
 * 8-bit per-channel signed normalized (RGBA) format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RGBA8S = 73;
/**
 * 10-bit RGB with 2-bit alpha unsigned normalized format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RGB10A2 = 74;
/**
 * 10-bit RGB with 2-bit alpha unsigned integer format.
 *
 * @category Graphics
 */ const PIXELFORMAT_RGB10A2U = 75;
/**
 * Information about pixel formats.
 *
 * ldr: whether the format is low dynamic range (LDR), which typically means it's not HDR, and uses
 * sRGB color space to store the color values
 * srgbFormat: the corresponding sRGB format (which automatically converts the sRGB value to linear)
 *
 * @type {Map<number, { name: string, size?: number, blockSize?: number, ldr?: boolean, srgb?: boolean, srgbFormat?: number, isInt?: boolean, isUint?: boolean }>}
 * @ignore
 */ const pixelFormatInfo = new Map([
    // float formats
    [
        PIXELFORMAT_A8,
        {
            name: 'A8',
            size: 1,
            ldr: true
        }
    ],
    [
        PIXELFORMAT_R8,
        {
            name: 'R8',
            size: 1,
            ldr: true
        }
    ],
    [
        PIXELFORMAT_L8,
        {
            name: 'L8',
            size: 1,
            ldr: true
        }
    ],
    [
        PIXELFORMAT_LA8,
        {
            name: 'LA8',
            size: 2,
            ldr: true
        }
    ],
    [
        PIXELFORMAT_RG8,
        {
            name: 'RG8',
            size: 2,
            ldr: true
        }
    ],
    [
        PIXELFORMAT_RGB565,
        {
            name: 'RGB565',
            size: 2,
            ldr: true
        }
    ],
    [
        PIXELFORMAT_RGBA5551,
        {
            name: 'RGBA5551',
            size: 2,
            ldr: true
        }
    ],
    [
        PIXELFORMAT_RGBA4,
        {
            name: 'RGBA4',
            size: 2,
            ldr: true
        }
    ],
    [
        PIXELFORMAT_RGB8,
        {
            name: 'RGB8',
            size: 4,
            ldr: true
        }
    ],
    [
        PIXELFORMAT_RGBA8,
        {
            name: 'RGBA8',
            size: 4,
            ldr: true,
            srgbFormat: PIXELFORMAT_SRGBA8
        }
    ],
    [
        PIXELFORMAT_R16F,
        {
            name: 'R16F',
            size: 2
        }
    ],
    [
        PIXELFORMAT_RG16F,
        {
            name: 'RG16F',
            size: 4
        }
    ],
    [
        PIXELFORMAT_RGB16F,
        {
            name: 'RGB16F',
            size: 8
        }
    ],
    [
        PIXELFORMAT_RGBA16F,
        {
            name: 'RGBA16F',
            size: 8
        }
    ],
    [
        PIXELFORMAT_RGB32F,
        {
            name: 'RGB32F',
            size: 16
        }
    ],
    [
        PIXELFORMAT_RGBA32F,
        {
            name: 'RGBA32F',
            size: 16
        }
    ],
    [
        PIXELFORMAT_R32F,
        {
            name: 'R32F',
            size: 4
        }
    ],
    [
        PIXELFORMAT_RG32F,
        {
            name: 'RG32F',
            size: 8
        }
    ],
    [
        PIXELFORMAT_RGB9E5,
        {
            name: 'RGB9E5',
            size: 4
        }
    ],
    [
        PIXELFORMAT_RG8S,
        {
            name: 'RG8S',
            size: 2
        }
    ],
    [
        PIXELFORMAT_RGBA8S,
        {
            name: 'RGBA8S',
            size: 4
        }
    ],
    [
        PIXELFORMAT_RGB10A2,
        {
            name: 'RGB10A2',
            size: 4
        }
    ],
    [
        PIXELFORMAT_RGB10A2U,
        {
            name: 'RGB10A2U',
            size: 4,
            isUint: true
        }
    ],
    [
        PIXELFORMAT_DEPTH,
        {
            name: 'DEPTH',
            size: 4
        }
    ],
    [
        PIXELFORMAT_DEPTH16,
        {
            name: 'DEPTH16',
            size: 2
        }
    ],
    [
        PIXELFORMAT_DEPTHSTENCIL,
        {
            name: 'DEPTHSTENCIL',
            size: 4
        }
    ],
    [
        PIXELFORMAT_111110F,
        {
            name: '111110F',
            size: 4
        }
    ],
    [
        PIXELFORMAT_SRGB8,
        {
            name: 'SRGB8',
            size: 4,
            ldr: true,
            srgb: true
        }
    ],
    [
        PIXELFORMAT_SRGBA8,
        {
            name: 'SRGBA8',
            size: 4,
            ldr: true,
            srgb: true
        }
    ],
    [
        PIXELFORMAT_BGRA8,
        {
            name: 'BGRA8',
            size: 4,
            ldr: true
        }
    ],
    [
        PIXELFORMAT_SBGRA8,
        {
            name: 'SBGRA8',
            size: 4,
            ldr: true,
            srgb: true
        }
    ],
    // compressed formats
    [
        PIXELFORMAT_DXT1,
        {
            name: 'DXT1',
            blockSize: 8,
            ldr: true,
            srgbFormat: PIXELFORMAT_DXT1_SRGB
        }
    ],
    [
        PIXELFORMAT_DXT3,
        {
            name: 'DXT3',
            blockSize: 16,
            ldr: true,
            srgbFormat: PIXELFORMAT_DXT3_SRGBA
        }
    ],
    [
        PIXELFORMAT_DXT5,
        {
            name: 'DXT5',
            blockSize: 16,
            ldr: true,
            srgbFormat: PIXELFORMAT_DXT5_SRGBA
        }
    ],
    [
        PIXELFORMAT_ETC1,
        {
            name: 'ETC1',
            blockSize: 8,
            ldr: true
        }
    ],
    [
        PIXELFORMAT_ETC2_RGB,
        {
            name: 'ETC2_RGB',
            blockSize: 8,
            ldr: true,
            srgbFormat: PIXELFORMAT_ETC2_SRGB
        }
    ],
    [
        PIXELFORMAT_ETC2_RGBA,
        {
            name: 'ETC2_RGBA',
            blockSize: 16,
            ldr: true,
            srgbFormat: PIXELFORMAT_ETC2_SRGBA
        }
    ],
    [
        PIXELFORMAT_PVRTC_2BPP_RGB_1,
        {
            name: 'PVRTC_2BPP_RGB_1',
            ldr: true,
            blockSize: 8
        }
    ],
    [
        PIXELFORMAT_PVRTC_2BPP_RGBA_1,
        {
            name: 'PVRTC_2BPP_RGBA_1',
            ldr: true,
            blockSize: 8
        }
    ],
    [
        PIXELFORMAT_PVRTC_4BPP_RGB_1,
        {
            name: 'PVRTC_4BPP_RGB_1',
            ldr: true,
            blockSize: 8
        }
    ],
    [
        PIXELFORMAT_PVRTC_4BPP_RGBA_1,
        {
            name: 'PVRTC_4BPP_RGBA_1',
            ldr: true,
            blockSize: 8
        }
    ],
    [
        PIXELFORMAT_ASTC_4x4,
        {
            name: 'ASTC_4x4',
            blockSize: 16,
            ldr: true,
            srgbFormat: PIXELFORMAT_ASTC_4x4_SRGB
        }
    ],
    [
        PIXELFORMAT_ATC_RGB,
        {
            name: 'ATC_RGB',
            blockSize: 8,
            ldr: true
        }
    ],
    [
        PIXELFORMAT_ATC_RGBA,
        {
            name: 'ATC_RGBA',
            blockSize: 16,
            ldr: true
        }
    ],
    [
        PIXELFORMAT_BC6F,
        {
            name: 'BC6H_RGBF',
            blockSize: 16
        }
    ],
    [
        PIXELFORMAT_BC6UF,
        {
            name: 'BC6H_RGBUF',
            blockSize: 16
        }
    ],
    [
        PIXELFORMAT_BC7,
        {
            name: 'BC7_RGBA',
            blockSize: 16,
            ldr: true,
            srgbFormat: PIXELFORMAT_BC7_SRGBA
        }
    ],
    // compressed sRGB formats
    [
        PIXELFORMAT_DXT1_SRGB,
        {
            name: 'DXT1_SRGB',
            blockSize: 8,
            ldr: true,
            srgb: true
        }
    ],
    [
        PIXELFORMAT_DXT3_SRGBA,
        {
            name: 'DXT3_SRGBA',
            blockSize: 16,
            ldr: true,
            srgb: true
        }
    ],
    [
        PIXELFORMAT_DXT5_SRGBA,
        {
            name: 'DXT5_SRGBA',
            blockSize: 16,
            ldr: true,
            srgb: true
        }
    ],
    [
        PIXELFORMAT_ETC2_SRGB,
        {
            name: 'ETC2_SRGB',
            blockSize: 8,
            ldr: true,
            srgb: true
        }
    ],
    [
        PIXELFORMAT_ETC2_SRGBA,
        {
            name: 'ETC2_SRGBA',
            blockSize: 16,
            ldr: true,
            srgb: true
        }
    ],
    [
        PIXELFORMAT_ASTC_4x4_SRGB,
        {
            name: 'ASTC_4x4_SRGB',
            blockSize: 16,
            ldr: true,
            srgb: true
        }
    ],
    [
        PIXELFORMAT_BC7_SRGBA,
        {
            name: 'BC7_SRGBA',
            blockSize: 16,
            ldr: true,
            srgb: true
        }
    ],
    // signed integer formats
    [
        PIXELFORMAT_R8I,
        {
            name: 'R8I',
            size: 1,
            isInt: true
        }
    ],
    [
        PIXELFORMAT_R16I,
        {
            name: 'R16I',
            size: 2,
            isInt: true
        }
    ],
    [
        PIXELFORMAT_R32I,
        {
            name: 'R32I',
            size: 4,
            isInt: true
        }
    ],
    [
        PIXELFORMAT_RG8I,
        {
            name: 'RG8I',
            size: 2,
            isInt: true
        }
    ],
    [
        PIXELFORMAT_RG16I,
        {
            name: 'RG16I',
            size: 4,
            isInt: true
        }
    ],
    [
        PIXELFORMAT_RG32I,
        {
            name: 'RG32I',
            size: 8,
            isInt: true
        }
    ],
    [
        PIXELFORMAT_RGBA8I,
        {
            name: 'RGBA8I',
            size: 4,
            isInt: true
        }
    ],
    [
        PIXELFORMAT_RGBA16I,
        {
            name: 'RGBA16I',
            size: 8,
            isInt: true
        }
    ],
    [
        PIXELFORMAT_RGBA32I,
        {
            name: 'RGBA32I',
            size: 16,
            isInt: true
        }
    ],
    // unsigned integer formats
    [
        PIXELFORMAT_R8U,
        {
            name: 'R8U',
            size: 1,
            isUint: true
        }
    ],
    [
        PIXELFORMAT_R16U,
        {
            name: 'R16U',
            size: 2,
            isUint: true
        }
    ],
    [
        PIXELFORMAT_R32U,
        {
            name: 'R32U',
            size: 4,
            isUint: true
        }
    ],
    [
        PIXELFORMAT_RG8U,
        {
            name: 'RG8U',
            size: 2,
            isUint: true
        }
    ],
    [
        PIXELFORMAT_RG16U,
        {
            name: 'RG16U',
            size: 4,
            isUint: true
        }
    ],
    [
        PIXELFORMAT_RG32U,
        {
            name: 'RG32U',
            size: 8,
            isUint: true
        }
    ],
    [
        PIXELFORMAT_RGBA8U,
        {
            name: 'RGBA8U',
            size: 4,
            isUint: true
        }
    ],
    [
        PIXELFORMAT_RGBA16U,
        {
            name: 'RGBA16U',
            size: 8,
            isUint: true
        }
    ],
    [
        PIXELFORMAT_RGBA32U,
        {
            name: 'RGBA32U',
            size: 16,
            isUint: true
        }
    ]
]);
// update this function when exposing additional compressed pixel formats
const isCompressedPixelFormat = (format)=>{
    return pixelFormatInfo.get(format)?.blockSize !== undefined;
};
const isSrgbPixelFormat = (format)=>{
    return pixelFormatInfo.get(format)?.srgb === true;
};
const isIntegerPixelFormat = (format)=>{
    const info = pixelFormatInfo.get(format);
    return info?.isInt === true || info?.isUint === true;
};
/**
 * Returns the srgb equivalent format for the supplied linear format. If it does not exist, the input
 * format is returned. For example for {@link PIXELFORMAT_RGBA8} the return value is
 * {@link PIXELFORMAT_SRGBA8}.
 *
 * @param {number} format - The texture format.
 * @returns {number} The format allowing linear sampling of the texture.
 * @ignore
 */ const pixelFormatLinearToGamma = (format)=>{
    return pixelFormatInfo.get(format)?.srgbFormat || format;
};
/**
 * Returns the linear equivalent format for the supplied sRGB format. If it does not exist, the input
 * format is returned. For example for {@link PIXELFORMAT_SRGBA8} the return value is
 * {@link PIXELFORMAT_RGBA8}.
 *
 * @param {number} format - The texture format.
 * @returns {number} The equivalent format without automatic sRGB conversion.
 * @ignore
 */ const pixelFormatGammaToLinear = (format)=>{
    for (const [key, value] of pixelFormatInfo){
        if (value.srgbFormat === format) {
            return key;
        }
    }
    return format;
};
/**
 * For a pixel format that stores color information, this function returns true if the texture
 * sample is in sRGB space and needs to be decoded to linear space.
 *
 * @param {number} format - The texture format.
 * @returns {boolean} Whether sampling the texture with this format returns a sRGB value.
 * @ignore
 */ const requiresManualGamma = (format)=>{
    const info = pixelFormatInfo.get(format);
    return !!(info?.ldr && !info?.srgb);
};
// get the pixel format array type
const getPixelFormatArrayType = (format)=>{
    switch(format){
        case PIXELFORMAT_R32F:
        case PIXELFORMAT_RG32F:
        case PIXELFORMAT_RGB32F:
        case PIXELFORMAT_RGBA32F:
            return Float32Array;
        case PIXELFORMAT_R32I:
        case PIXELFORMAT_RG32I:
        case PIXELFORMAT_RGBA32I:
            return Int32Array;
        case PIXELFORMAT_R32U:
        case PIXELFORMAT_RG32U:
        case PIXELFORMAT_RGBA32U:
        case PIXELFORMAT_RGB9E5:
        case PIXELFORMAT_RGB10A2:
        case PIXELFORMAT_RGB10A2U:
            return Uint32Array;
        case PIXELFORMAT_R16I:
        case PIXELFORMAT_RG16I:
        case PIXELFORMAT_RGBA16I:
            return Int16Array;
        case PIXELFORMAT_R16U:
        case PIXELFORMAT_RG16U:
        case PIXELFORMAT_RGBA16U:
        case PIXELFORMAT_RGB565:
        case PIXELFORMAT_RGBA5551:
        case PIXELFORMAT_RGBA4:
        case PIXELFORMAT_R16F:
        case PIXELFORMAT_RG16F:
        case PIXELFORMAT_RGB16F:
        case PIXELFORMAT_RGBA16F:
            return Uint16Array;
        case PIXELFORMAT_R8I:
        case PIXELFORMAT_RG8I:
        case PIXELFORMAT_RGBA8I:
        case PIXELFORMAT_RG8S:
        case PIXELFORMAT_RGBA8S:
            return Int8Array;
        default:
            return Uint8Array;
    }
};
/**
 * List of distinct points.
 *
 * @category Graphics
 */ const PRIMITIVE_POINTS = 0;
/**
 * List of points that are linked sequentially by line segments.
 *
 * @category Graphics
 */ const PRIMITIVE_LINESTRIP = 3;
/**
 * Connected strip of triangles where a specified vertex forms a triangle using the previous two.
 *
 * @category Graphics
 */ const PRIMITIVE_TRISTRIP = 5;
/**
 * Connected fan of triangles where the first vertex forms triangles with the following pairs of vertices.
 *
 * @category Graphics
 */ const PRIMITIVE_TRIFAN = 6;
/**
 * Vertex attribute to be treated as a position.
 *
 * @category Graphics
 */ const SEMANTIC_POSITION = 'POSITION';
/**
 * Vertex attribute to be treated as a normal.
 *
 * @category Graphics
 */ const SEMANTIC_NORMAL = 'NORMAL';
/**
 * Vertex attribute to be treated as a tangent.
 *
 * @category Graphics
 */ const SEMANTIC_TANGENT = 'TANGENT';
/**
 * Vertex attribute to be treated as skin blend weights.
 *
 * @category Graphics
 */ const SEMANTIC_BLENDWEIGHT = 'BLENDWEIGHT';
/**
 * Vertex attribute to be treated as skin blend indices.
 *
 * @category Graphics
 */ const SEMANTIC_BLENDINDICES = 'BLENDINDICES';
/**
 * Vertex attribute to be treated as a color.
 *
 * @category Graphics
 */ const SEMANTIC_COLOR = 'COLOR';
/**
 * Vertex attribute to be treated as a texture coordinate (set 0).
 *
 * @category Graphics
 */ const SEMANTIC_TEXCOORD0 = 'TEXCOORD0';
/**
 * Vertex attribute to be treated as a texture coordinate (set 1).
 *
 * @category Graphics
 */ const SEMANTIC_TEXCOORD1 = 'TEXCOORD1';
/**
 * Vertex attribute to be treated as a texture coordinate (set 2).
 *
 * @category Graphics
 */ const SEMANTIC_TEXCOORD2 = 'TEXCOORD2';
/**
 * Vertex attribute to be treated as a texture coordinate (set 3).
 *
 * @category Graphics
 */ const SEMANTIC_TEXCOORD3 = 'TEXCOORD3';
/**
 * Vertex attribute to be treated as a texture coordinate (set 4).
 *
 * @category Graphics
 */ const SEMANTIC_TEXCOORD4 = 'TEXCOORD4';
/**
 * Vertex attribute to be treated as a texture coordinate (set 5).
 *
 * @category Graphics
 */ const SEMANTIC_TEXCOORD5 = 'TEXCOORD5';
/**
 * Vertex attribute to be treated as a texture coordinate (set 6).
 *
 * @category Graphics
 */ const SEMANTIC_TEXCOORD6 = 'TEXCOORD6';
/**
 * Vertex attribute to be treated as a texture coordinate (set 7).
 *
 * @category Graphics
 */ const SEMANTIC_TEXCOORD7 = 'TEXCOORD7';
/**
 * Vertex attribute with a user defined semantic.
 *
 * @category Graphics
 */ const SEMANTIC_ATTR0 = 'ATTR0';
/**
 * Vertex attribute with a user defined semantic.
 *
 * @category Graphics
 */ const SEMANTIC_ATTR1 = 'ATTR1';
/**
 * Vertex attribute with a user defined semantic.
 *
 * @category Graphics
 */ const SEMANTIC_ATTR2 = 'ATTR2';
/**
 * Vertex attribute with a user defined semantic.
 *
 * @category Graphics
 */ const SEMANTIC_ATTR3 = 'ATTR3';
/**
 * Vertex attribute with a user defined semantic.
 *
 * @category Graphics
 */ const SEMANTIC_ATTR4 = 'ATTR4';
/**
 * Vertex attribute with a user defined semantic.
 *
 * @category Graphics
 */ const SEMANTIC_ATTR5 = 'ATTR5';
/**
 * Vertex attribute with a user defined semantic.
 *
 * @category Graphics
 */ const SEMANTIC_ATTR6 = 'ATTR6';
/**
 * Vertex attribute with a user defined semantic.
 *
 * @category Graphics
 */ const SEMANTIC_ATTR7 = 'ATTR7';
/**
 * Vertex attribute with a user defined semantic.
 *
 * @category Graphics
 */ const SEMANTIC_ATTR8 = 'ATTR8';
/**
 * Vertex attribute with a user defined semantic.
 *
 * @category Graphics
 */ const SEMANTIC_ATTR9 = 'ATTR9';
/**
 * Vertex attribute with a user defined semantic.
 *
 * @category Graphics
 */ const SEMANTIC_ATTR10 = 'ATTR10';
/**
 * Vertex attribute with a user defined semantic.
 *
 * @category Graphics
 */ const SEMANTIC_ATTR11 = 'ATTR11';
/**
 * Vertex attribute with a user defined semantic.
 *
 * @category Graphics
 */ const SEMANTIC_ATTR12 = 'ATTR12';
/**
 * Vertex attribute with a user defined semantic.
 *
 * @category Graphics
 */ const SEMANTIC_ATTR13 = 'ATTR13';
/**
 * Vertex attribute with a user defined semantic.
 *
 * @category Graphics
 */ const SEMANTIC_ATTR14 = 'ATTR14';
/**
 * Vertex attribute with a user defined semantic.
 *
 * @category Graphics
 */ const SEMANTIC_ATTR15 = 'ATTR15';
/**
 * Don't change the stencil buffer value.
 *
 * @category Graphics
 */ const STENCILOP_KEEP = 0;
/**
 * The texture is not in a locked state.
 *
 * @category Graphics
 */ const TEXTURELOCK_NONE = 0;
/**
 * Read only. Any changes to the locked mip level's pixels will not update the texture.
 *
 * @category Graphics
 */ const TEXTURELOCK_READ = 1;
/**
 * Write only. The contents of the specified mip level will be entirely replaced.
 *
 * @category Graphics
 */ const TEXTURELOCK_WRITE = 2;
/**
 * Texture is a default type.
 *
 * @category Graphics
 */ const TEXTURETYPE_DEFAULT = 'default';
/**
 * Texture stores high dynamic range data in RGBM format.
 *
 * @category Graphics
 */ const TEXTURETYPE_RGBM = 'rgbm';
/**
 * Texture stores high dynamic range data in RGBE format.
 *
 * @category Graphics
 */ const TEXTURETYPE_RGBE = 'rgbe';
/**
 * Texture stores high dynamic range data in RGBP encoding.
 *
 * @category Graphics
 */ const TEXTURETYPE_RGBP = 'rgbp';
const TEXHINT_SHADOWMAP = 1;
const TEXHINT_ASSET = 2;
const TEXHINT_LIGHTMAP = 3;
/**
 * Texture data is stored in a 1-dimensional texture.
 *
 * @category Graphics
 */ const TEXTUREDIMENSION_1D = '1d';
/**
 * Texture data is stored in a 2-dimensional texture.
 *
 * @category Graphics
 */ const TEXTUREDIMENSION_2D = '2d';
/**
 * Texture data is stored in an array of 2-dimensional textures.
 *
 * @category Graphics
 */ const TEXTUREDIMENSION_2D_ARRAY = '2d-array';
/**
 * Texture data is stored in a cube texture.
 *
 * @category Graphics
 */ const TEXTUREDIMENSION_CUBE = 'cube';
/**
 * Texture data is stored in an array of cube textures.
 *
 * @category Graphics
 */ const TEXTUREDIMENSION_CUBE_ARRAY = 'cube-array';
/**
 * Texture data is stored in a 3-dimensional texture.
 *
 * @category Graphics
 */ const TEXTUREDIMENSION_3D = '3d';
/**
 * A sampler type of a texture that contains floating-point data. Typically stored for color
 * textures, where data can be filtered.
 *
 * @category Graphics
 */ const SAMPLETYPE_FLOAT = 0;
/**
 * A sampler type of a texture that contains floating-point data, but cannot be filtered. Typically
 * used for textures storing data that cannot be interpolated.
 *
 * @category Graphics
 */ const SAMPLETYPE_UNFILTERABLE_FLOAT = 1;
/**
 * A sampler type of a texture that contains depth data. Typically used for depth textures.
 *
 * @category Graphics
 */ const SAMPLETYPE_DEPTH = 2;
/**
 * A sampler type of a texture that contains signed integer data.
 *
 * @category Graphics
 */ const SAMPLETYPE_INT = 3;
/**
 * A sampler type of a texture that contains unsigned integer data.
 *
 * @category Graphics
 */ const SAMPLETYPE_UINT = 4;
/**
 * Texture data is not stored a specific projection format.
 *
 * @category Graphics
 */ const TEXTUREPROJECTION_NONE = 'none';
/**
 * Texture data is stored in cubemap projection format.
 *
 * @category Graphics
 */ const TEXTUREPROJECTION_CUBE = 'cube';
/**
 * Shader source code uses GLSL language.
 *
 * @category Graphics
 */ const SHADERLANGUAGE_GLSL = 'glsl';
/**
 * Shader source code uses WGSL language.
 *
 * @category Graphics
 */ const SHADERLANGUAGE_WGSL = 'wgsl';
/**
 * Signed byte vertex element type.
 *
 * @category Graphics
 */ const TYPE_INT8 = 0;
/**
 * Unsigned byte vertex element type.
 *
 * @category Graphics
 */ const TYPE_UINT8 = 1;
/**
 * Signed short vertex element type.
 *
 * @category Graphics
 */ const TYPE_INT16 = 2;
/**
 * Unsigned short vertex element type.
 *
 * @category Graphics
 */ const TYPE_UINT16 = 3;
/**
 * Signed integer vertex element type.
 *
 * @category Graphics
 */ const TYPE_INT32 = 4;
/**
 * Unsigned integer vertex element type.
 *
 * @category Graphics
 */ const TYPE_UINT32 = 5;
/**
 * Floating point vertex element type.
 *
 * @category Graphics
 */ const TYPE_FLOAT32 = 6;
/**
 * 16-bit floating point vertex element type.
 *
 * @category Graphics
 */ const TYPE_FLOAT16 = 7;
// ---------- Uniform types ------------
// Note: Only types which can be used in uniform buffers are exported here, others are internal.
// The arrays are exposed as a base type with number of elements, and textures are not part of the
// uniform buffers.
/**
 * Boolean uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_BOOL = 0;
/**
 * Integer uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_INT = 1;
/**
 * Float uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_FLOAT = 2;
/**
 * 2 x Float uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_VEC2 = 3;
/**
 * 3 x Float uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_VEC3 = 4;
/**
 * 4 x Float uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_VEC4 = 5;
/**
 * 2 x Integer uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_IVEC2 = 6;
/**
 * 3 x Integer uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_IVEC3 = 7;
/**
 * 4 x Integer uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_IVEC4 = 8;
/**
 * 2 x Boolean uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_BVEC2 = 9;
/**
 * 3 x Boolean uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_BVEC3 = 10;
/**
 * 4 x Boolean uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_BVEC4 = 11;
/**
 * 2 x 2 x Float uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_MAT2 = 12;
/**
 * 3 x 3 x Float uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_MAT3 = 13;
/**
 * 4 x 4 x Float uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_MAT4 = 14;
const UNIFORMTYPE_FLOATARRAY = 17;
const UNIFORMTYPE_VEC2ARRAY = 21;
const UNIFORMTYPE_VEC3ARRAY = 22;
const UNIFORMTYPE_VEC4ARRAY = 23;
const UNIFORMTYPE_MAT4ARRAY = 24;
// Unsigned uniform types
/**
 * Unsigned integer uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_UINT = 26;
/**
 * 2 x Unsigned integer uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_UVEC2 = 27;
/**
 * 3 x Unsigned integer uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_UVEC3 = 28;
/**
 * 4 x Unsigned integer uniform type.
 *
 * @category Graphics
 */ const UNIFORMTYPE_UVEC4 = 29;
// Integer uniform array types
const UNIFORMTYPE_INTARRAY = 30;
const UNIFORMTYPE_UINTARRAY = 31;
const UNIFORMTYPE_BOOLARRAY = 32;
const UNIFORMTYPE_IVEC2ARRAY = 33;
const UNIFORMTYPE_UVEC2ARRAY = 34;
const UNIFORMTYPE_BVEC2ARRAY = 35;
const UNIFORMTYPE_IVEC3ARRAY = 36;
const UNIFORMTYPE_UVEC3ARRAY = 37;
const UNIFORMTYPE_BVEC3ARRAY = 38;
const UNIFORMTYPE_IVEC4ARRAY = 39;
const UNIFORMTYPE_UVEC4ARRAY = 40;
const UNIFORMTYPE_BVEC4ARRAY = 41;
// ----------
// Uniform types in GLSL
const uniformTypeToName = [
    // Uniforms
    'bool',
    'int',
    'float',
    'vec2',
    'vec3',
    'vec4',
    'ivec2',
    'ivec3',
    'ivec4',
    'bvec2',
    'bvec3',
    'bvec4',
    'mat2',
    'mat3',
    'mat4',
    'sampler2D',
    'samplerCube',
    '',
    'sampler2DShadow',
    'samplerCubeShadow',
    'sampler3D',
    '',
    '',
    '',
    '',
    'sampler2DArray',
    'uint',
    'uvec2',
    'uvec3',
    'uvec4',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'isampler2D',
    'usampler2D',
    'isamplerCube',
    'usamplerCube',
    'isampler3D',
    'usampler3D',
    'isampler2DArray',
    'usampler2DArray'
];
// Uniform types in WGSL
const uniformTypeToNameWGSL = [
    // Uniforms
    [
        'bool'
    ],
    [
        'i32'
    ],
    [
        'f32'
    ],
    [
        'vec2f',
        'vec2<f32>'
    ],
    [
        'vec3f',
        'vec3<f32>'
    ],
    [
        'vec4f',
        'vec4<f32>'
    ],
    [
        'vec2i',
        'vec2<i32>'
    ],
    [
        'vec3i',
        'vec3<i32>'
    ],
    [
        'vec4i',
        'vec4<i32>'
    ],
    [
        'vec2<bool>'
    ],
    [
        'vec3<bool>'
    ],
    [
        'vec4<bool>'
    ],
    [
        'mat2x2f',
        'mat2x2<f32>'
    ],
    [
        'mat3x3f',
        'mat3x3<f32>'
    ],
    [
        'mat4x4f',
        'mat4x4<f32>'
    ],
    [
        'texture_2d<f32>'
    ],
    [
        'texture_cube<f32>'
    ],
    [
        'array<f32>'
    ],
    [
        'texture_depth_2d'
    ],
    [
        'texture_depth_cube'
    ],
    [
        'texture_3d<f32>'
    ],
    [
        'array<vec2<f32>>'
    ],
    [
        'array<vec3<f32>>'
    ],
    [
        'array<vec4<f32>>'
    ],
    [
        'array<mat4x4<f32>>'
    ],
    [
        'texture_2d_array<f32>'
    ],
    // Unsigned integer uniforms
    [
        'u32'
    ],
    [
        'vec2u',
        'vec2<u32>'
    ],
    [
        'vec3u',
        'vec3<u32>'
    ],
    [
        'vec4u',
        'vec4<u32>'
    ],
    // Integer array uniforms
    [
        'array<i32>'
    ],
    [
        'array<u32>'
    ],
    [
        'array<bool>'
    ],
    [
        'array<vec2i>',
        'array<vec2<i32>>'
    ],
    [
        'array<vec2u>',
        'array<vec2<u32>>'
    ],
    [
        'array<vec2b>',
        'array<vec2<bool>>'
    ],
    [
        'array<vec3i>',
        'array<vec3<i32>>'
    ],
    [
        'array<vec3u>',
        'array<vec3<u32>>'
    ],
    [
        'array<vec3b>',
        'array<vec3<bool>>'
    ],
    [
        'array<vec4i>',
        'array<vec4<i32>>'
    ],
    [
        'array<vec4u>',
        'array<vec4<u32>>'
    ],
    [
        'array<vec4b>',
        'array<vec4<bool>>'
    ],
    // Integer texture types
    [
        'texture_2d<i32>'
    ],
    [
        'texture_2d<u32>'
    ],
    [
        'texture_cube<i32>'
    ],
    [
        'texture_cube<u32>'
    ],
    [
        'texture_3d<i32>'
    ],
    [
        'texture_3d<u32>'
    ],
    [
        'texture_2d_array<i32>'
    ],
    [
        'texture_2d_array<u32>'
    ] // UNIFORMTYPE_UTEXTURE2D_ARRAY
];
// map version of uniformTypeToNameMapWGSL, allowing type name lookup by type name
const uniformTypeToNameMapWGSL = new Map();
uniformTypeToNameWGSL.forEach((names, index)=>{
    names.forEach((name)=>uniformTypeToNameMapWGSL.set(name, index));
});
/**
 * A WebGPU device type.
 *
 * @category Graphics
 */ const DEVICETYPE_WEBGPU = 'webgpu';
/**
 * The resource is visible to the vertex shader.
 *
 * @category Graphics
 */ const SHADERSTAGE_VERTEX = 1;
/**
 * The resource is visible to the fragment shader.
 *
 * @category Graphics
 */ const SHADERSTAGE_FRAGMENT = 2;
/**
 * The resource is visible to the compute shader.
 *
 * @category Graphics
 */ const SHADERSTAGE_COMPUTE = 4;
/**
 * Display format for low dynamic range data. This is always supported; however, due to the cost, it
 * does not implement linear alpha blending on the main framebuffer. Instead, alpha blending occurs
 * in sRGB space.
 *
 * @category Graphics
 */ const DISPLAYFORMAT_LDR = 'ldr';
/**
 * Display format for low dynamic range data in the sRGB color space. This format correctly
 * implements linear alpha blending on the main framebuffer, with the alpha blending occurring in
 * linear space. This is currently supported on WebGPU platform only. On unsupported platforms, it
 * silently falls back to {@link DISPLAYFORMAT_LDR}.
 *
 * @category Graphics
 */ const DISPLAYFORMAT_LDR_SRGB = 'ldr_srgb';
/**
 * Display format for high dynamic range data, using 16bit floating point values.
 * Note: This is supported on WebGPU platform only, and ignored on other platforms. On displays
 * without HDR support, it silently falls back to {@link DISPLAYFORMAT_LDR}. Use
 * {@link GraphicsDevice.isHdr} to see if the HDR format is used. When it is, it's recommended to
 * use {@link TONEMAP_NONE} for the tonemapping mode, to avoid it clipping the high dynamic range.
 *
 * @category Graphics
 */ const DISPLAYFORMAT_HDR = 'hdr';
// internal flags of the texture properties
const TEXPROPERTY_MIN_FILTER = 1;
const TEXPROPERTY_MAG_FILTER = 2;
const TEXPROPERTY_ADDRESS_U = 4;
const TEXPROPERTY_ADDRESS_V = 8;
const TEXPROPERTY_ADDRESS_W = 16;
const TEXPROPERTY_COMPARE_ON_READ = 32;
const TEXPROPERTY_COMPARE_FUNC = 64;
const TEXPROPERTY_ANISOTROPY = 128;
const TEXPROPERTY_ALL = 255; // 1 | 2 | 4 | 8 | 16 | 32 | 64 | 128
const BINDGROUP_MESH = 1; // mesh bind group - textures and samplers
const BINDGROUP_MESH_UB = 2; // mesh bind group - a single uniform buffer
// names of bind groups
const bindGroupNames = [
    'view',
    'mesh',
    'mesh_ub'
];
// name of the default uniform buffer slot in a bind group
const UNIFORM_BUFFER_DEFAULT_SLOT_NAME = 'default';
// WebGPU does not support empty uniform buffer, add a dummy uniform to avoid validation errors
const UNUSED_UNIFORM_NAME = '_unused_float_uniform';
const typedArrayTypesByteSize = [
    1,
    1,
    2,
    2,
    4,
    4,
    4,
    2
];
const vertexTypesNames = [
    'INT8',
    'UINT8',
    'INT16',
    'UINT16',
    'INT32',
    'UINT32',
    'FLOAT32',
    'FLOAT16'
];
const typedArrayIndexFormatsByteSize = [
    1,
    2,
    4
];
// map of primitive GLSL types to their corresponding WGSL types
const primitiveGlslToWgslTypeMap = new Map([
    // floating-point
    [
        'float',
        'f32'
    ],
    [
        'vec2',
        'vec2f'
    ],
    [
        'vec3',
        'vec3f'
    ],
    [
        'vec4',
        'vec4f'
    ],
    // signed integer
    [
        'int',
        'i32'
    ],
    [
        'ivec2',
        'vec2i'
    ],
    [
        'ivec3',
        'vec3i'
    ],
    [
        'ivec4',
        'vec4i'
    ],
    // unsigned integer
    [
        'uint',
        'u32'
    ],
    [
        'uvec2',
        'vec2u'
    ],
    [
        'uvec3',
        'vec3u'
    ],
    [
        'uvec4',
        'vec4u'
    ]
]);
/**
 * Map of engine semantics into location on device in range 0..15 (note - semantics mapping to the
 * same location cannot be used at the same time) organized in a way that ATTR0-ATTR7 do not
 * overlap with common important semantics.
 *
 * @type {object}
 * @ignore
 * @category Graphics
 */ const semanticToLocation = {};
semanticToLocation[SEMANTIC_POSITION] = 0;
semanticToLocation[SEMANTIC_NORMAL] = 1;
semanticToLocation[SEMANTIC_BLENDWEIGHT] = 2;
semanticToLocation[SEMANTIC_BLENDINDICES] = 3;
semanticToLocation[SEMANTIC_COLOR] = 4;
semanticToLocation[SEMANTIC_TEXCOORD0] = 5;
semanticToLocation[SEMANTIC_TEXCOORD1] = 6;
semanticToLocation[SEMANTIC_TEXCOORD2] = 7;
semanticToLocation[SEMANTIC_TEXCOORD3] = 8;
semanticToLocation[SEMANTIC_TEXCOORD4] = 9;
semanticToLocation[SEMANTIC_TEXCOORD5] = 10;
semanticToLocation[SEMANTIC_TEXCOORD6] = 11;
semanticToLocation[SEMANTIC_TEXCOORD7] = 12;
semanticToLocation[SEMANTIC_TANGENT] = 13;
semanticToLocation[SEMANTIC_ATTR0] = 0;
semanticToLocation[SEMANTIC_ATTR1] = 1;
semanticToLocation[SEMANTIC_ATTR2] = 2;
semanticToLocation[SEMANTIC_ATTR3] = 3;
semanticToLocation[SEMANTIC_ATTR4] = 4;
semanticToLocation[SEMANTIC_ATTR5] = 5;
semanticToLocation[SEMANTIC_ATTR6] = 6;
semanticToLocation[SEMANTIC_ATTR7] = 7;
semanticToLocation[SEMANTIC_ATTR8] = 8;
semanticToLocation[SEMANTIC_ATTR9] = 9;
semanticToLocation[SEMANTIC_ATTR10] = 10;
semanticToLocation[SEMANTIC_ATTR11] = 11;
semanticToLocation[SEMANTIC_ATTR12] = 12;
semanticToLocation[SEMANTIC_ATTR13] = 13;
semanticToLocation[SEMANTIC_ATTR14] = 14;
semanticToLocation[SEMANTIC_ATTR15] = 15;

/**
 * @import { GraphicsDevice } from './graphics-device.js'
 */ /**
 * Internal graphics debug system - gpu markers and similar. Note that the functions only execute
 * in the debug build, and are stripped out in other builds.
 */ class DebugGraphics {
    /**
     * Clear internal stack of the GPU markers. It should be called at the start of the frame to
     * prevent the array growing if there are exceptions during the rendering.
     */ static clearGpuMarkers() {
        DebugGraphics.markers.length = 0;
    }
    /**
     * Push GPU marker to the stack on the device.
     *
     * @param {GraphicsDevice} device - The graphics device.
     * @param {string} name - The name of the marker.
     */ static pushGpuMarker(device, name) {
        DebugGraphics.markers.push(name);
        device.pushMarker(name);
    }
    /**
     * Pop GPU marker from the stack on the device.
     *
     * @param {GraphicsDevice} device - The graphics device.
     */ static popGpuMarker(device) {
        if (DebugGraphics.markers.length) {
            DebugGraphics.markers.pop();
        }
        device.popMarker();
    }
    /**
     * Converts current markers into a single string format.
     *
     * @returns {string} String representation of current markers.
     */ static toString() {
        return DebugGraphics.markers.join(' | ');
    }
}
/**
     * An array of markers, representing a stack.
     *
     * @type {string[]}
     * @private
     */ DebugGraphics.markers = [];

/**
 * @import { GraphicsDevice } from './graphics-device.js'
 * @import { ScopeId } from './scope-id.js'
 */ let id$8 = 0;
/**
 * A base class to describe the format of the resource for {@link BindGroupFormat}.
 *
 * @category Graphics
 */ class BindBaseFormat {
    /**
     * Create a new instance.
     *
     * @param {string} name - The name of the resource.
     * @param {number} visibility - A bit-flag that specifies the shader stages in which the resource
     * is visible. Can be:
     *
     * - {@link SHADERSTAGE_VERTEX}
     * - {@link SHADERSTAGE_FRAGMENT}
     * - {@link SHADERSTAGE_COMPUTE}
     */ constructor(name, visibility){
        /**
     * @type {number}
     * @ignore
     */ this.slot = -1;
        /**
     * @type {ScopeId|null}
     * @ignore
     */ this.scopeId = null;
        /** @type {string} */ this.name = name;
        // SHADERSTAGE_VERTEX, SHADERSTAGE_FRAGMENT, SHADERSTAGE_COMPUTE
        this.visibility = visibility;
    }
}
/**
 * A class to describe the format of the uniform buffer for {@link BindGroupFormat}.
 *
 * @category Graphics
 */ class BindUniformBufferFormat extends BindBaseFormat {
}
/**
 * A class to describe the format of the storage buffer for {@link BindGroupFormat}.
 *
 * @category Graphics
 */ class BindStorageBufferFormat extends BindBaseFormat {
    /**
     * Create a new instance.
     *
     * @param {string} name - The name of the storage buffer.
     * @param {number} visibility - A bit-flag that specifies the shader stages in which the storage
     * buffer is visible. Can be:
     *
     * - {@link SHADERSTAGE_VERTEX}
     * - {@link SHADERSTAGE_FRAGMENT}
     * - {@link SHADERSTAGE_COMPUTE}
     *
     * @param {boolean} [readOnly] - Whether the storage buffer is read-only, or read-write. Defaults
     * to false. This has to be true for the storage buffer used in the vertex shader.
     */ constructor(name, visibility, readOnly = false){
        super(name, visibility), /**
     * Format, extracted from vertex and fragment shader.
     *
     * @type {string}
     * @ignore
     */ this.format = '';
        // whether the buffer is read-only
        this.readOnly = readOnly;
        Debug.assert(readOnly || !(visibility & SHADERSTAGE_VERTEX), 'Storage buffer can only be used in read-only mode in SHADERSTAGE_VERTEX.');
    }
}
/**
 * A class to describe the format of the texture for {@link BindGroupFormat}.
 *
 * @category Graphics
 */ class BindTextureFormat extends BindBaseFormat {
    /**
     * Create a new instance.
     *
     * @param {string} name - The name of the storage buffer.
     * @param {number} visibility - A bit-flag that specifies the shader stages in which the storage
     * buffer is visible. Can be:
     *
     * - {@link SHADERSTAGE_VERTEX}
     * - {@link SHADERSTAGE_FRAGMENT}
     * - {@link SHADERSTAGE_COMPUTE}
     *
     * @param {string} [textureDimension] - The dimension of the texture. Defaults to
     * {@link TEXTUREDIMENSION_2D}. Can be:
     *
     * - {@link TEXTUREDIMENSION_1D}
     * - {@link TEXTUREDIMENSION_2D}
     * - {@link TEXTUREDIMENSION_2D_ARRAY}
     * - {@link TEXTUREDIMENSION_CUBE}
     * - {@link TEXTUREDIMENSION_CUBE_ARRAY}
     * - {@link TEXTUREDIMENSION_3D}
     *
     * @param {number} [sampleType] - The type of the texture samples. Defaults to
     * {@link SAMPLETYPE_FLOAT}. Can be:
     *
     * - {@link SAMPLETYPE_FLOAT}
     * - {@link SAMPLETYPE_UNFILTERABLE_FLOAT}
     * - {@link SAMPLETYPE_DEPTH}
     * - {@link SAMPLETYPE_INT}
     * - {@link SAMPLETYPE_UINT}
     *
     * @param {boolean} [hasSampler] - True if the sampler for the texture is needed. Note that if the
     * sampler is used, it will take up an additional slot, directly following the texture slot.
     * Defaults to true.
     * @param {string|null} [samplerName] - Optional name of the sampler. Defaults to null.
     */ constructor(name, visibility, textureDimension = TEXTUREDIMENSION_2D, sampleType = SAMPLETYPE_FLOAT, hasSampler = true, samplerName = null){
        super(name, visibility);
        // TEXTUREDIMENSION_***
        this.textureDimension = textureDimension;
        // SAMPLETYPE_***
        this.sampleType = sampleType;
        // whether to use a sampler with this texture
        this.hasSampler = hasSampler;
        // optional name of the sampler (its automatically generated if not provided)
        this.samplerName = samplerName ?? `${name}_sampler`;
    }
}
/**
 * A class to describe the format of the storage texture for {@link BindGroupFormat}. Storage
 * texture is a texture created with the storage flag set to true, which allows it to be used as an
 * output of a compute shader.
 *
 * Note: At the current time, storage textures are only supported in compute shaders in a
 * write-only mode.
 *
 * @category Graphics
 */ class BindStorageTextureFormat extends BindBaseFormat {
    /**
     * Create a new instance.
     *
     * @param {string} name - The name of the storage buffer.
     * @param {number} [format] - The pixel format of the texture. Note that not all formats can be
     * used. Defaults to {@link PIXELFORMAT_RGBA8}.
     * @param {string} [textureDimension] - The dimension of the texture. Defaults to
     * {@link TEXTUREDIMENSION_2D}. Can be:
     *
     * - {@link TEXTUREDIMENSION_1D}
     * - {@link TEXTUREDIMENSION_2D}
     * - {@link TEXTUREDIMENSION_2D_ARRAY}
     * - {@link TEXTUREDIMENSION_3D}
     *
     * @param {boolean} [write] - Whether the storage texture is writeable. Defaults to true.
     * @param {boolean} [read] - Whether the storage texture is readable. Defaults to false. Note
     * that storage texture reads are only supported if
     * {@link GraphicsDevice#supportsStorageTextureRead} is true. Also note that only a subset of
     * pixel formats can be used for storage texture reads - as an example, PIXELFORMAT_RGBA8 is not
     * compatible, but PIXELFORMAT_R32U is.
     */ constructor(name, format = PIXELFORMAT_RGBA8, textureDimension = TEXTUREDIMENSION_2D, write = true, read = false){
        super(name, SHADERSTAGE_COMPUTE);
        // PIXELFORMAT_***
        this.format = format;
        // TEXTUREDIMENSION_***
        this.textureDimension = textureDimension;
        // whether the texture is writeable
        this.write = write;
        // whether the texture is readable
        this.read = read;
    }
}
/**
 * BindGroupFormat is a data structure that defines the layout of resources (buffers, textures,
 * samplers) used by rendering or compute shaders. It describes the binding points for each
 * resource type, and the visibility of these resources in the shader stages.
 * Currently this class is only used on WebGPU platform to specify the input and output resources
 * for vertex, fragment and compute shaders written in {@link SHADERLANGUAGE_WGSL} language.
 *
 * @category Graphics
 */ class BindGroupFormat {
    /**
     * Frees resources associated with this bind group.
     */ destroy() {
        this.impl.destroy();
    }
    /**
     * Returns format of texture with specified name.
     *
     * @param {string} name - The name of the texture slot.
     * @returns {BindTextureFormat|null} - The format.
     * @ignore
     */ getTexture(name) {
        const index = this.textureFormatsMap.get(name);
        if (index !== undefined) {
            return this.textureFormats[index];
        }
        return null;
    }
    /**
     * Returns format of storage texture with specified name.
     *
     * @param {string} name - The name of the texture slot.
     * @returns {BindStorageTextureFormat|null} - The format.
     * @ignore
     */ getStorageTexture(name) {
        const index = this.storageTextureFormatsMap.get(name);
        if (index !== undefined) {
            return this.storageTextureFormats[index];
        }
        return null;
    }
    loseContext() {
    // TODO: implement
    }
    /**
     * Create a new instance.
     *
     * @param {GraphicsDevice} graphicsDevice - The graphics device used to manage this vertex format.
     * @param {(BindTextureFormat|BindStorageTextureFormat|BindUniformBufferFormat|BindStorageBufferFormat)[]} formats -
     * An array of bind formats. Note that each entry in the array uses up one slot. The exception
     * is a texture format that has a sampler, which uses up two slots. The slots are allocated
     * sequentially, starting from 0.
     */ constructor(graphicsDevice, formats){
        /**
     * @type {BindUniformBufferFormat[]}
     * @private
     */ this.uniformBufferFormats = [];
        /**
     * @type {BindTextureFormat[]}
     * @private
     */ this.textureFormats = [];
        /**
     * @type {BindStorageTextureFormat[]}
     * @private
     */ this.storageTextureFormats = [];
        /**
     * @type {BindStorageBufferFormat[]}
     * @private
     */ this.storageBufferFormats = [];
        this.id = id$8++;
        DebugHelper.setName(this, `BindGroupFormat_${this.id}`);
        Debug.assert(formats);
        let slot = 0;
        formats.forEach((format)=>{
            // Assign slot. For texture format, we also need to assign a slot for its sampler.
            format.slot = slot++;
            if (format instanceof BindTextureFormat && format.hasSampler) {
                slot++;
            }
            // split the array into separate arrays
            if (format instanceof BindUniformBufferFormat) {
                this.uniformBufferFormats.push(format);
            } else if (format instanceof BindTextureFormat) {
                this.textureFormats.push(format);
            } else if (format instanceof BindStorageTextureFormat) {
                this.storageTextureFormats.push(format);
            } else if (format instanceof BindStorageBufferFormat) {
                this.storageBufferFormats.push(format);
            } else {
                Debug.assert('Invalid bind format', format);
            }
        });
        /** @type {GraphicsDevice} */ this.device = graphicsDevice;
        const scope = graphicsDevice.scope;
        // maps a buffer format name to an index
        /** @type {Map<string, number>} */ this.bufferFormatsMap = new Map();
        this.uniformBufferFormats.forEach((bf, i)=>this.bufferFormatsMap.set(bf.name, i));
        // maps a texture format name to a slot index
        /** @type {Map<string, number>} */ this.textureFormatsMap = new Map();
        this.textureFormats.forEach((tf, i)=>{
            this.textureFormatsMap.set(tf.name, i);
            // resolve scope id
            tf.scopeId = scope.resolve(tf.name);
        });
        // maps a storage texture format name to a slot index
        /** @type {Map<string, number>} */ this.storageTextureFormatsMap = new Map();
        this.storageTextureFormats.forEach((tf, i)=>{
            this.storageTextureFormatsMap.set(tf.name, i);
            // resolve scope id
            tf.scopeId = scope.resolve(tf.name);
        });
        // maps a storage buffer format name to a slot index
        /** @type {Map<string, number>} */ this.storageBufferFormatsMap = new Map();
        this.storageBufferFormats.forEach((bf, i)=>{
            this.storageBufferFormatsMap.set(bf.name, i);
            // resolve scope id
            bf.scopeId = scope.resolve(bf.name);
        });
        this.impl = graphicsDevice.createBindGroupFormatImpl(this);
        Debug.trace(TRACEID_BINDGROUPFORMAT_ALLOC, `Alloc: Id ${this.id}, while rendering [${DebugGraphics.toString()}]`, this);
    }
}

/**
 * @import { GraphicsDevice } from './graphics-device.js'
 */ /**
 * A cache storing shared resources associated with a device. The resources are removed
 * from the cache when the device is destroyed.
 */ class DeviceCache {
    /**
     * Returns the resources for the supplied device.
     *
     * @param {GraphicsDevice} device - The graphics device.
     * @param {() => any} onCreate - A function that creates the resource for the device.
     * @returns {any} The resource for the device.
     */ get(device, onCreate) {
        if (!this._cache.has(device)) {
            this._cache.set(device, onCreate());
            // when the device is destroyed, destroy and remove its entry
            device.on('destroy', ()=>{
                this.remove(device);
            });
            // when the context is lost, call optional loseContext on its entry
            device.on('devicelost', ()=>{
                this._cache.get(device)?.loseContext?.(device);
            });
        }
        return this._cache.get(device);
    }
    /**
     * Destroys and removes the content of the cache associated with the device
     *
     * @param {GraphicsDevice} device - The graphics device.
     */ remove(device) {
        this._cache.get(device)?.destroy?.(device);
        this._cache.delete(device);
    }
    constructor(){
        /**
     * Cache storing the resource for each GraphicsDevice
     *
     * @type {Map<GraphicsDevice, any>}
     */ this._cache = new Map();
    }
}

/**
 * @import { Vec2 } from '../../core/math/vec2.js'
 */ /**
 * A class providing utility functions for textures.
 *
 * @ignore
 */ class TextureUtils {
    /**
     * Calculate the dimension of a texture at a specific mip level.
     *
     * @param {number} dimension - Texture dimension at level 0.
     * @param {number} mipLevel - Mip level.
     * @returns {number} The dimension of the texture at the specified mip level.
     */ static calcLevelDimension(dimension, mipLevel) {
        return Math.max(dimension >> mipLevel, 1);
    }
    /**
     * Calculate the number of mip levels for a texture with the specified dimensions.
     *
     * @param {number} width - Texture's width.
     * @param {number} height - Texture's height.
     * @param {number} [depth] - Texture's depth. Defaults to 1.
     * @returns {number} The number of mip levels required for the texture.
     */ static calcMipLevelsCount(width, height, depth = 1) {
        return 1 + Math.floor(Math.log2(Math.max(width, height, depth)));
    }
    /**
     * Calculate the size in bytes of the texture level given its format and dimensions.
     *
     * @param {number} width - Texture's width.
     * @param {number} height - Texture's height.
     * @param {number} depth - Texture's depth.
     * @param {number} format - Texture's pixel format PIXELFORMAT_***.
     * @returns {number} The number of bytes of GPU memory required for the texture.
     */ static calcLevelGpuSize(width, height, depth, format) {
        const formatInfo = pixelFormatInfo.get(format);
        Debug.assert(formatInfo !== undefined, `Invalid pixel format ${format}`);
        const pixelSize = pixelFormatInfo.get(format)?.size ?? 0;
        if (pixelSize > 0) {
            return width * height * depth * pixelSize;
        }
        const blockSize = formatInfo.blockSize ?? 0;
        let blockWidth = Math.floor((width + 3) / 4);
        const blockHeight = Math.floor((height + 3) / 4);
        const blockDepth = Math.floor((depth + 3) / 4);
        if (format === PIXELFORMAT_PVRTC_2BPP_RGB_1 || format === PIXELFORMAT_PVRTC_2BPP_RGBA_1) {
            blockWidth = Math.max(Math.floor(blockWidth / 2), 1);
        }
        return blockWidth * blockHeight * blockDepth * blockSize;
    }
    /**
     * Calculate the GPU memory required for a texture.
     *
     * @param {number} width - Texture's width.
     * @param {number} height - Texture's height.
     * @param {number} depth - Texture's depth.
     * @param {number} format - Texture's pixel format PIXELFORMAT_***.
     * @param {boolean} mipmaps - True if the texture includes mipmaps, false otherwise.
     * @param {boolean} cubemap - True is the texture is a cubemap, false otherwise.
     * @returns {number} The number of bytes of GPU memory required for the texture.
     */ static calcGpuSize(width, height, depth, format, mipmaps, cubemap) {
        let result = 0;
        while(1){
            result += TextureUtils.calcLevelGpuSize(width, height, depth, format);
            // we're done if mipmaps aren't required or we've calculated the smallest mipmap level
            if (!mipmaps || width === 1 && height === 1 && depth === 1) {
                break;
            }
            width = Math.max(width >> 1, 1);
            height = Math.max(height >> 1, 1);
            depth = Math.max(depth >> 1, 1);
        }
        return result * (cubemap ? 6 : 1);
    }
    /**
     * Calculate roughly square texture dimensions that can hold the given number of texels.
     *
     * @param {number} count - The number of texels to fit.
     * @param {Vec2} result - Output vector to receive width (x) and height (y).
     * @param {number} [widthMultiple] - If greater than 1, the width is rounded up to the
     * nearest multiple of this value. Useful for ensuring rows align to a specific stride (e.g.
     * 4 texels per matrix row, or N lights per cell).
     * @returns {Vec2} The result vector with dimensions set.
     */ static calcTextureSize(count, result, widthMultiple = 1) {
        let width = Math.ceil(Math.sqrt(count));
        if (widthMultiple > 1) {
            width = math.roundUp(width, widthMultiple);
        }
        return result.set(width, Math.ceil(count / width));
    }
}

/**
 * A cache for assigning unique numerical ids to strings.
 */ class StringIds {
    /**
     * Get the id for the given name. If the name has not been seen before, it will be assigned a new
     * id.
     *
     * @param {string} name - The name to get the id for.
     * @returns {number} The id for the given name.
     */ get(name) {
        let value = this.map.get(name);
        if (value === undefined) {
            value = this.id++;
            this.map.set(name, value);
        }
        return value;
    }
    constructor(){
        /** @type {Map<string, number>} */ this.map = new Map();
        /** @type {number} */ this.id = 0;
    }
}

/**
 * @import { Texture } from './texture.js'
 */ const stringIds$5 = new StringIds();
/**
 * A TextureView specifies a texture and a subset of its mip levels and array layers. It is used
 * when binding textures to compute shaders to specify which portion of the texture should be
 * accessed. Create a TextureView using {@link Texture#getView}.
 *
 * Note: TextureView is only supported on WebGPU. On WebGL, the full texture is always bound and
 * this class has no effect.
 *
 * @category Graphics
 */ class TextureView {
    /**
     * Create a new TextureView instance. Use {@link Texture#getView} instead of calling this
     * constructor directly.
     *
     * @param {Texture} texture - The texture this view references.
     * @param {number} [baseMipLevel] - The first mip level accessible to the view. Defaults to 0.
     * @param {number} [mipLevelCount] - The number of mip levels accessible to the view. Defaults
     * to 1.
     * @param {number} [baseArrayLayer] - The first array layer accessible to the view. Defaults to
     * 0.
     * @param {number} [arrayLayerCount] - The number of array layers accessible to the view.
     * Defaults to 1.
     * @ignore
     */ constructor(texture, baseMipLevel = 0, mipLevelCount = 1, baseArrayLayer = 0, arrayLayerCount = 1){
        this.texture = texture;
        this.baseMipLevel = baseMipLevel;
        this.mipLevelCount = mipLevelCount;
        this.baseArrayLayer = baseArrayLayer;
        this.arrayLayerCount = arrayLayerCount;
        // Generate a unique numeric key for caching
        this.key = stringIds$5.get(`${baseMipLevel}:${mipLevelCount}:${baseArrayLayer}:${arrayLayerCount}`);
    }
}

/**
 * @import { GraphicsDevice } from './graphics-device.js'
 * @import { RenderTarget } from './render-target.js'
 */ let id$7 = 0;
/**
 * Represents a texture, which is typically an image composed of pixels (texels). Textures are
 * fundamental resources for rendering graphical objects. They are commonly used by
 * {@link Material}s and sampled in {@link Shader}s (usually fragment shaders) to define the visual
 * appearance of a 3D model's surface. Beyond storing color images, textures can hold various data
 * types like normal maps, environment maps (cubemaps), or custom data for shader computations. Key
 * properties control how the texture data is sampled, including filtering modes and coordinate
 * wrapping.
 *
 * Note on **HDR texture format** support:
 * 1. **As textures**:
 *     - float (i.e. {@link PIXELFORMAT_RGBA32F}), half-float (i.e. {@link PIXELFORMAT_RGBA16F}) and
 * small-float ({@link PIXELFORMAT_111110F}) formats are always supported on both WebGL2 and WebGPU
 * with point sampling.
 *     - half-float and small-float formats are always supported on WebGL2 and WebGPU with linear
 * sampling.
 *     - float formats are supported on WebGL2 and WebGPU with linear sampling only if
 * {@link GraphicsDevice#textureFloatFilterable} is true.
 *     - {@link PIXELFORMAT_RGB9E5} is a compact HDR format with shared exponent, supported for
 * sampling on both WebGL2 and WebGPU, but cannot be used as a render target.
 *
 * 2. **As renderable textures** that can be used as color buffers in a {@link RenderTarget}:
 *     - on WebGPU, rendering to float and half-float formats is always supported.
 *     - on WebGPU, rendering to small-float format is supported only if
 * {@link GraphicsDevice#textureRG11B10Renderable} is true.
 *     - on WebGL2, rendering to these 3 formats formats is supported only if
 * {@link GraphicsDevice#textureFloatRenderable} is true.
 *     - on WebGL2, if {@link GraphicsDevice#textureFloatRenderable} is false, but
 * {@link GraphicsDevice#textureHalfFloatRenderable} is true, rendering to half-float formats only
 * is supported. This is the case of many mobile iOS devices.
 *     - you can determine available renderable HDR format using
 * {@link GraphicsDevice#getRenderableHdrFormat}.
 *     - {@link PIXELFORMAT_RGB10A2} provides 10 bits per RGB channel with 2-bit alpha, offering
 * higher precision than {@link PIXELFORMAT_RGBA8} at the same memory cost. It is renderable on
 * both WebGL2 and WebGPU. {@link PIXELFORMAT_RGB10A2U} is the unsigned integer variant.
 * @category Graphics
 */ class Texture {
    /**
     * Creates a 2D data texture with nearest filtering, clamp-to-edge addressing and no mipmaps.
     *
     * @param {GraphicsDevice} graphicsDevice - The graphics device used to manage this texture.
     * @param {string} name - The name of the texture.
     * @param {number} width - The width of the texture in pixels.
     * @param {number} height - The height of the texture in pixels.
     * @param {number} format - The pixel format of the texture.
     * @param {Uint8Array[]|Uint16Array[]|Uint32Array[]|Float32Array[]|HTMLCanvasElement[]|HTMLImageElement[]|HTMLVideoElement[]|Uint8Array[][]} [levels]
     * - Optional initial mip level data.
     * @returns {Texture} The created texture.
     * @ignore
     */ static createDataTexture2D(graphicsDevice, name, width, height, format, levels) {
        return new Texture(graphicsDevice, {
            name,
            width,
            height,
            format,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE,
            levels
        });
    }
    /**
     * Frees resources associated with this texture.
     */ destroy() {
        Debug.trace(TRACEID_TEXTURE_ALLOC, `DeAlloc: Id ${this.id} ${this.name}`);
        const device = this.device;
        if (device) {
            device.onTextureDestroyed(this);
            // destroy implementation
            this.impl.destroy(device);
            // Update texture stats
            this.adjustVramSizeTracking(device._vram, -this._gpuSize);
            this._levels = null;
            this.device = null;
        }
    }
    recreateImpl(upload = true) {
        const { device } = this;
        // destroy existing
        this.impl?.destroy(device);
        this.impl = null;
        // create new
        this.impl = device.createTextureImpl(this);
        this.dirtyAll();
        if (upload) {
            this.upload();
        }
    }
    _clearLevels() {
        this._levels = this._cubemap ? [
            [
                null,
                null,
                null,
                null,
                null,
                null
            ]
        ] : [
            null
        ];
    }
    /**
     * Resizes the texture. This operation is supported for render target textures, and it resizes
     * the allocated buffer used for rendering, not the existing content of the texture.
     *
     * It is also supported for textures with data provided via the {@link lock} method. After
     * resizing, the appropriately sized data must be assigned by calling {@link lock} again.
     *
     * @param {number} width - The new width of the texture.
     * @param {number} height - The new height of the texture.
     * @param {number} [depth] - The new depth of the texture. Defaults to 1.
     * @ignore
     */ resize(width, height, depth = 1) {
        if (this.width !== width || this.height !== height || this.depth !== depth) {
            // destroy texture impl
            const device = this.device;
            this.adjustVramSizeTracking(device._vram, -this._gpuSize);
            this._gpuSize = 0;
            this.impl.destroy(device);
            this._clearLevels();
            this._width = Math.floor(width);
            this._height = Math.floor(height);
            this._depth = Math.floor(depth);
            this._updateNumLevels();
            // re-create the implementation
            this.impl = device.createTextureImpl(this);
            this.dirtyAll();
        }
    }
    /**
     * Called when the rendering context was lost. It releases all context related resources.
     *
     * @ignore
     */ loseContext() {
        this.impl.loseContext();
        this.dirtyAll();
    }
    /**
     * Updates vram size tracking for the texture, size can be positive to add or negative to subtract
     *
     * @ignore
     */ adjustVramSizeTracking(vram, size) {
        Debug.trace(TRACEID_VRAM_TEXTURE, `${this.id} ${this.name} size: ${size} vram.texture: ${vram.tex} => ${vram.tex + size}`);
        vram.tex += size;
        if (this.profilerHint === TEXHINT_SHADOWMAP) {
            vram.texShadow += size;
        } else if (this.profilerHint === TEXHINT_ASSET) {
            vram.texAsset += size;
        } else if (this.profilerHint === TEXHINT_LIGHTMAP) {
            vram.texLightmap += size;
        }
    }
    propertyChanged(flag) {
        this.impl.propertyChanged(flag);
        this.renderVersionDirty = this.device.renderVersion;
    }
    _updateNumLevels() {
        const maxLevels = this.mipmaps ? TextureUtils.calcMipLevelsCount(this.width, this.height) : 1;
        const requestedLevels = this._numLevelsRequested;
        if (requestedLevels !== undefined && requestedLevels > maxLevels) {
            Debug.warn('Texture#numLevels: requested mip level count is greater than the maximum possible, will be clamped to', maxLevels, this);
        }
        this._numLevels = Math.min(requestedLevels ?? maxLevels, maxLevels);
        this._mipmaps = this._numLevels > 1;
    }
    /**
     * Returns the current lock mode. One of:
     *
     * - {@link TEXTURELOCK_NONE}
     * - {@link TEXTURELOCK_READ}
     * - {@link TEXTURELOCK_WRITE}
     *
     * @ignore
     * @type {number}
     */ get lockedMode() {
        return this._lockedMode;
    }
    /**
     * Sets the minification filter to be applied to the texture. Can be:
     *
     * - {@link FILTER_NEAREST}
     * - {@link FILTER_LINEAR}
     * - {@link FILTER_NEAREST_MIPMAP_NEAREST}
     * - {@link FILTER_NEAREST_MIPMAP_LINEAR}
     * - {@link FILTER_LINEAR_MIPMAP_NEAREST}
     * - {@link FILTER_LINEAR_MIPMAP_LINEAR}
     *
     * @type {number}
     */ set minFilter(v) {
        if (this._minFilter !== v) {
            if (isIntegerPixelFormat(this._format)) {
                Debug.warn('Texture#minFilter: minFilter property cannot be changed on an integer texture, will remain FILTER_NEAREST', this);
            } else {
                this._minFilter = v;
                this.propertyChanged(TEXPROPERTY_MIN_FILTER);
            }
        }
    }
    /**
     * Gets the minification filter to be applied to the texture.
     *
     * @type {number}
     */ get minFilter() {
        return this._minFilter;
    }
    /**
     * Sets the magnification filter to be applied to the texture. Can be:
     *
     * - {@link FILTER_NEAREST}
     * - {@link FILTER_LINEAR}
     *
     * @type {number}
     */ set magFilter(v) {
        if (this._magFilter !== v) {
            if (isIntegerPixelFormat(this._format)) {
                Debug.warn('Texture#magFilter: magFilter property cannot be changed on an integer texture, will remain FILTER_NEAREST', this);
            } else {
                this._magFilter = v;
                this.propertyChanged(TEXPROPERTY_MAG_FILTER);
            }
        }
    }
    /**
     * Gets the magnification filter to be applied to the texture.
     *
     * @type {number}
     */ get magFilter() {
        return this._magFilter;
    }
    /**
     * Sets the addressing mode to be applied to the texture horizontally. Can be:
     *
     * - {@link ADDRESS_REPEAT}
     * - {@link ADDRESS_CLAMP_TO_EDGE}
     * - {@link ADDRESS_MIRRORED_REPEAT}
     *
     * @type {number}
     */ set addressU(v) {
        if (this._addressU !== v) {
            this._addressU = v;
            this.propertyChanged(TEXPROPERTY_ADDRESS_U);
        }
    }
    /**
     * Gets the addressing mode to be applied to the texture horizontally.
     *
     * @type {number}
     */ get addressU() {
        return this._addressU;
    }
    /**
     * Sets the addressing mode to be applied to the texture vertically. Can be:
     *
     * - {@link ADDRESS_REPEAT}
     * - {@link ADDRESS_CLAMP_TO_EDGE}
     * - {@link ADDRESS_MIRRORED_REPEAT}
     *
     * @type {number}
     */ set addressV(v) {
        if (this._addressV !== v) {
            this._addressV = v;
            this.propertyChanged(TEXPROPERTY_ADDRESS_V);
        }
    }
    /**
     * Gets the addressing mode to be applied to the texture vertically.
     *
     * @type {number}
     */ get addressV() {
        return this._addressV;
    }
    /**
     * Sets the addressing mode to be applied to the 3D texture depth. Can be:
     *
     * - {@link ADDRESS_REPEAT}
     * - {@link ADDRESS_CLAMP_TO_EDGE}
     * - {@link ADDRESS_MIRRORED_REPEAT}
     *
     * @type {number}
     */ set addressW(addressW) {
        if (!this._volume) {
            Debug.warn('pc.Texture#addressW: Can\'t set W addressing mode for a non-3D texture.');
            return;
        }
        if (addressW !== this._addressW) {
            this._addressW = addressW;
            this.propertyChanged(TEXPROPERTY_ADDRESS_W);
        }
    }
    /**
     * Gets the addressing mode to be applied to the 3D texture depth.
     *
     * @type {number}
     */ get addressW() {
        return this._addressW;
    }
    /**
     * When enabled, and if texture format is {@link PIXELFORMAT_DEPTH} or
     * {@link PIXELFORMAT_DEPTHSTENCIL}, hardware PCF is enabled for this texture, and you can get
     * filtered results of comparison using texture() in your shader.
     *
     * @type {boolean}
     */ set compareOnRead(v) {
        if (this._compareOnRead !== v) {
            this._compareOnRead = v;
            this.propertyChanged(TEXPROPERTY_COMPARE_ON_READ);
        }
    }
    /**
     * Gets whether you can get filtered results of comparison using texture() in your shader.
     *
     * @type {boolean}
     */ get compareOnRead() {
        return this._compareOnRead;
    }
    /**
     * Sets the comparison function when {@link compareOnRead} is enabled. Possible values:
     *
     * - {@link FUNC_LESS}
     * - {@link FUNC_LESSEQUAL}
     * - {@link FUNC_GREATER}
     * - {@link FUNC_GREATEREQUAL}
     * - {@link FUNC_EQUAL}
     * - {@link FUNC_NOTEQUAL}
     *
     * @type {number}
     */ set compareFunc(v) {
        if (this._compareFunc !== v) {
            this._compareFunc = v;
            this.propertyChanged(TEXPROPERTY_COMPARE_FUNC);
        }
    }
    /**
     * Gets the comparison function when {@link compareOnRead} is enabled.
     *
     * @type {number}
     */ get compareFunc() {
        return this._compareFunc;
    }
    /**
     * Sets the integer value specifying the level of anisotropy to apply to the texture. The value
     * ranges from 1 (no anisotropic filtering) to the maximum anisotropy supported by the graphics
     * device (see {@link GraphicsDevice#maxAnisotropy}).
     *
     * @type {number}
     */ set anisotropy(v) {
        if (this._anisotropy !== v) {
            this._anisotropy = v;
            this.propertyChanged(TEXPROPERTY_ANISOTROPY);
        }
    }
    /**
     * Gets the integer value specifying the level of anisotropy to apply to the texture.
     *
     * @type {number}
     */ get anisotropy() {
        return this._anisotropy;
    }
    /**
     * Sets whether the texture should generate/upload mipmaps.
     *
     * @type {boolean}
     */ set mipmaps(v) {
        if (this._mipmaps !== v) {
            if (this.device.isWebGPU) {
                Debug.warn('Texture#mipmaps: mipmap property is currently not allowed to be changed on WebGPU, create the texture appropriately.', this);
            } else if (isIntegerPixelFormat(this._format)) {
                Debug.warn('Texture#mipmaps: mipmap property cannot be changed on an integer texture, will remain false', this);
            } else {
                const oldMipmaps = this._mipmaps;
                const oldNumLevels = this._numLevels;
                this._mipmaps = v;
                this._updateNumLevels();
                // Changing mip count on array textures requires re-creating immutable storage.
                if (this.array && this._numLevels !== oldNumLevels) {
                    this.recreateImpl();
                } else if (this._mipmaps !== oldMipmaps) {
                    this.propertyChanged(TEXPROPERTY_MIN_FILTER);
                    if (this._mipmaps) {
                        this._needsMipmapsUpload = true;
                        this.device?.texturesToUpload?.add(this);
                    } else {
                        this._needsMipmapsUpload = false;
                    }
                }
            }
        }
    }
    /**
     * Gets whether the texture should generate/upload mipmaps.
     *
     * @type {boolean}
     */ get mipmaps() {
        return this._mipmaps;
    }
    /**
     * Gets the number of mip levels.
     *
     * @type {number}
     */ get numLevels() {
        return this._numLevels;
    }
    /**
     * Defines if texture can be used as a storage texture by a compute shader.
     *
     * @type {boolean}
     */ get storage() {
        return this._storage;
    }
    /**
     * The width of the texture in pixels.
     *
     * @type {number}
     */ get width() {
        return this._width;
    }
    /**
     * The height of the texture in pixels.
     *
     * @type {number}
     */ get height() {
        return this._height;
    }
    /**
     * The number of depth slices in a 3D texture.
     *
     * @type {number}
     */ get depth() {
        return this._depth;
    }
    /**
     * The pixel format of the texture. Can be:
     *
     * - {@link PIXELFORMAT_R8}
     * - {@link PIXELFORMAT_RG8}
     * - {@link PIXELFORMAT_RGB565}
     * - {@link PIXELFORMAT_RGBA5551}
     * - {@link PIXELFORMAT_RGBA4}
     * - {@link PIXELFORMAT_RGB8}
     * - {@link PIXELFORMAT_RGBA8}
     * - {@link PIXELFORMAT_DXT1}
     * - {@link PIXELFORMAT_DXT3}
     * - {@link PIXELFORMAT_DXT5}
     * - {@link PIXELFORMAT_RGB16F}
     * - {@link PIXELFORMAT_RGBA16F}
     * - {@link PIXELFORMAT_RGB32F}
     * - {@link PIXELFORMAT_RGBA32F}
     * - {@link PIXELFORMAT_ETC1}
     * - {@link PIXELFORMAT_PVRTC_2BPP_RGB_1}
     * - {@link PIXELFORMAT_PVRTC_2BPP_RGBA_1}
     * - {@link PIXELFORMAT_PVRTC_4BPP_RGB_1}
     * - {@link PIXELFORMAT_PVRTC_4BPP_RGBA_1}
     * - {@link PIXELFORMAT_111110F}
     * - {@link PIXELFORMAT_ASTC_4x4}
     * - {@link PIXELFORMAT_ATC_RGB}
     * - {@link PIXELFORMAT_ATC_RGBA}
     *
     * @type {number}
     */ get format() {
        return this._format;
    }
    /**
     * Returns true if this texture is a cube map and false otherwise.
     *
     * @type {boolean}
     */ get cubemap() {
        return this._cubemap;
    }
    get gpuSize() {
        const mips = this.pot && this._mipmaps && !(this._compressed && this._levels.length === 1);
        return TextureUtils.calcGpuSize(this._width, this._height, this._depth, this._format, mips, this._cubemap);
    }
    /**
     * Returns true if this texture is a 2D texture array and false otherwise.
     *
     * @type {boolean}
     */ get array() {
        return this._arrayLength > 0;
    }
    /**
     * Returns the number of textures inside this texture if this is a 2D array texture or 0 otherwise.
     *
     * @type {number}
     */ get arrayLength() {
        return this._arrayLength;
    }
    /**
     * Returns true if this texture is a 3D volume and false otherwise.
     *
     * @type {boolean}
     */ get volume() {
        return this._volume;
    }
    /**
     * Sets the texture type.
     *
     * @type {string}
     * @ignore
     */ set type(value) {
        if (this._type !== value) {
            this._type = value;
            // update all shaders to respect the encoding of the texture (needed by the standard material)
            this.device._shadersDirty = true;
        }
    }
    /**
     * Gets the texture type.
     *
     * @type {string}
     * @ignore
     */ get type() {
        return this._type;
    }
    /**
     * Sets the texture's internal format to an sRGB or linear equivalent of its current format.
     * When set to true, the texture is stored in sRGB format and automatically converted to linear
     * space when sampled. When set to false, the texture remains in a linear format. Changing this
     * property recreates the texture on the GPU, which is an expensive operation, so it is
     * preferable to create the texture with the correct format from the start. If the texture
     * format has no sRGB variant, this operation is ignored.
     * This is not a public API and is used by Editor only to update rendering when the sRGB
     * property is changed in the inspector. The higher cost is acceptable in this case.
     *
     * @type {boolean}
     * @ignore
     */ set srgb(value) {
        const currentSrgb = isSrgbPixelFormat(this.format);
        if (value !== currentSrgb) {
            if (value) {
                // switch to sRGB
                const srgbFormat = pixelFormatLinearToGamma(this.format);
                if (this._format !== srgbFormat) {
                    Debug.warn(`Switching format of texture '${this.name}' to sRGB equivalent: ${pixelFormatInfo.get(this.format)?.name} -> ${pixelFormatInfo.get(srgbFormat)?.name}. This is an expensive operation, and the texture should be created using the right format to avoid this.`, this);
                    this._format = srgbFormat;
                    this.recreateImpl();
                    // update all shaders to respect the encoding of the texture (needed by the standard material)
                    this.device._shadersDirty = true;
                }
            } else {
                // switch to linear
                const linearFormat = pixelFormatGammaToLinear(this.format);
                if (this._format !== linearFormat) {
                    Debug.warn(`Switching format of texture '${this.name}' to linear equivalent: ${pixelFormatInfo.get(this.format)?.name} -> ${pixelFormatInfo.get(linearFormat)?.name}. This is an expensive operation, and the texture should be created using the right format to avoid this.`, this);
                    this._format = linearFormat;
                    this.recreateImpl();
                    // update all shaders to respect the encoding of the texture (needed by the standard material)
                    this.device._shadersDirty = true;
                }
            }
        }
    }
    /**
     * Returns true if the texture is stored in an sRGB format, meaning it will be converted to
     * linear space when sampled. Returns false if the texture is stored in a linear format.
     *
     * @type {boolean}
     */ get srgb() {
        return isSrgbPixelFormat(this.format);
    }
    /**
     * Sets whether the texture should be flipped in the Y-direction. Only affects textures
     * with a source that is an image, canvas or video element. Does not affect cubemaps,
     * compressed textures or textures set from raw pixel data. Defaults to true.
     *
     * @type {boolean}
     */ set flipY(flipY) {
        if (this._flipY !== flipY) {
            this._flipY = flipY;
            this.markForUpload();
        }
    }
    /**
     * Gets whether the texture should be flipped in the Y-direction.
     *
     * @type {boolean}
     */ get flipY() {
        return this._flipY;
    }
    set premultiplyAlpha(premultiplyAlpha) {
        if (this._premultiplyAlpha !== premultiplyAlpha) {
            this._premultiplyAlpha = premultiplyAlpha;
            this.markForUpload();
        }
    }
    get premultiplyAlpha() {
        return this._premultiplyAlpha;
    }
    /**
     * Returns true if all dimensions of the texture are power of two, and false otherwise.
     *
     * @type {boolean}
     */ get pot() {
        return math.powerOfTwo(this._width) && math.powerOfTwo(this._height);
    }
    // get the texture's encoding type
    get encoding() {
        switch(this.type){
            case TEXTURETYPE_RGBM:
                return 'rgbm';
            case TEXTURETYPE_RGBE:
                return 'rgbe';
            case TEXTURETYPE_RGBP:
                return 'rgbp';
        }
        // note that the srgb part only makes sense for texture storing color data
        return requiresManualGamma(this.format) ? 'srgb' : 'linear';
    }
    // Force a full resubmission of the texture to the GPU (used on a context restore event)
    dirtyAll() {
        this._levelsUpdated = this._cubemap ? [
            [
                true,
                true,
                true,
                true,
                true,
                true
            ]
        ] : [
            true
        ];
        this.markForUpload();
        this._needsMipmapsUpload = this._mipmaps;
        this._mipmapsUploaded = false;
        this.propertyChanged(TEXPROPERTY_ALL);
    }
    /**
     * Locks a miplevel of the texture, returning a typed array to be filled with pixel data.
     *
     * @param {object} [options] - Optional options object. Valid properties are as follows:
     * @param {number} [options.level] - The mip level to lock with 0 being the top level. Defaults
     * to 0.
     * @param {number} [options.face] - If the texture is a cubemap, this is the index of the face
     * to lock.
     * @param {number} [options.mode] - The lock mode. Can be:
     * - {@link TEXTURELOCK_READ}
     * - {@link TEXTURELOCK_WRITE}
     * Defaults to {@link TEXTURELOCK_WRITE}.
     * @returns {Uint8Array|Uint16Array|Uint32Array|Float32Array} A typed array containing the pixel data of
     * the locked mip level.
     */ lock(options = {}) {
        var // Initialize options to some sensible defaults
        _options, _options1, _options2;
        (_options = options).level ?? (_options.level = 0);
        (_options1 = options).face ?? (_options1.face = 0);
        (_options2 = options).mode ?? (_options2.mode = TEXTURELOCK_WRITE);
        Debug.assert(this._lockedMode === TEXTURELOCK_NONE, 'The texture is already locked. Call `texture.unlock()` before attempting to lock again.', this);
        Debug.assert(options.mode === TEXTURELOCK_READ || options.mode === TEXTURELOCK_WRITE, 'Cannot lock a texture with TEXTURELOCK_NONE. To unlock a texture, call `texture.unlock()`.', this);
        this._lockedMode = options.mode;
        this._lockedLevel = options.level;
        const levels = this.cubemap ? this._levels[options.face] : this._levels;
        if (levels[options.level] === null) {
            // allocate storage for this mip level
            const width = Math.max(1, this._width >> options.level);
            const height = Math.max(1, this._height >> options.level);
            const depth = Math.max(1, this._depth >> options.level);
            const data = new ArrayBuffer(TextureUtils.calcLevelGpuSize(width, height, depth, this._format));
            levels[options.level] = new (getPixelFormatArrayType(this._format))(data);
        }
        return levels[options.level];
    }
    /**
     * Set the pixel data of the texture from a canvas, image, video DOM element. If the texture is
     * a cubemap, the supplied source must be an array of 6 canvases, images or videos.
     *
     * @param {HTMLCanvasElement|HTMLImageElement|HTMLVideoElement|HTMLCanvasElement[]|HTMLImageElement[]|HTMLVideoElement[]} source - A
     * canvas, image or video element, or an array of 6 canvas, image or video elements.
     * @param {number} [mipLevel] - A non-negative integer specifying the image level of detail.
     * Defaults to 0, which represents the base image source. A level value of N, that is greater
     * than 0, represents the image source for the Nth mipmap reduction level.
     */ setSource(source, mipLevel = 0) {
        let invalid = false;
        let width, height;
        if (this._cubemap) {
            if (source[0]) {
                // rely on first face sizes
                width = source[0].width || 0;
                height = source[0].height || 0;
                for(let i = 0; i < 6; i++){
                    const face = source[i];
                    // cubemap becomes invalid if any condition is not satisfied
                    if (!face || // face is missing
                    face.width !== width || // face is different width
                    face.height !== height || // face is different height
                    !this.device._isBrowserInterface(face)) {
                        invalid = true;
                        break;
                    }
                }
            } else {
                // first face is missing
                invalid = true;
            }
            if (!invalid) {
                // mark levels as updated
                for(let i = 0; i < 6; i++){
                    if (this._levels[mipLevel][i] !== source[i]) {
                        this._levelsUpdated[mipLevel][i] = true;
                    }
                }
            }
        } else {
            // check if source is valid type of element
            if (!this.device._isBrowserInterface(source)) {
                invalid = true;
            }
            if (!invalid) {
                // mark level as updated
                if (source !== this._levels[mipLevel]) {
                    this._levelsUpdated[mipLevel] = true;
                }
                if (source instanceof HTMLVideoElement) {
                    width = source.videoWidth;
                    height = source.videoHeight;
                } else {
                    width = source.width;
                    height = source.height;
                }
            }
        }
        if (invalid) {
            // invalid texture
            // default sizes
            this._width = 4;
            this._height = 4;
            // remove levels
            if (this._cubemap) {
                for(let i = 0; i < 6; i++){
                    this._levels[mipLevel][i] = null;
                    this._levelsUpdated[mipLevel][i] = true;
                }
            } else {
                this._levels[mipLevel] = null;
                this._levelsUpdated[mipLevel] = true;
            }
        } else {
            // valid texture
            if (mipLevel === 0) {
                this._width = width;
                this._height = height;
            }
            this._levels[mipLevel] = source;
        }
        // valid or changed state of validity
        if (this._invalid !== invalid || !invalid) {
            this._invalid = invalid;
            // reupload
            this.upload();
        }
    }
    /**
     * Get the pixel data of the texture. If this is a cubemap then an array of 6 images will be
     * returned otherwise a single image.
     *
     * @param {number} [mipLevel] - A non-negative integer specifying the image level of detail.
     * Defaults to 0, which represents the base image source. A level value of N, that is greater
     * than 0, represents the image source for the Nth mipmap reduction level.
     * @returns {HTMLImageElement} The source image of this texture. Can be null if source not
     * assigned for specific image level.
     */ getSource(mipLevel = 0) {
        return this._levels[mipLevel];
    }
    /**
     * Unlocks the currently locked mip level and uploads it to VRAM.
     */ unlock() {
        if (this._lockedMode === TEXTURELOCK_NONE) {
            Debug.warn('pc.Texture#unlock: Attempting to unlock a texture that is not locked.', this);
        }
        // Upload the new pixel data if locked in write mode (default)
        if (this._lockedMode === TEXTURELOCK_WRITE) {
            this.upload();
        }
        this._lockedLevel = -1;
        this._lockedMode = TEXTURELOCK_NONE;
    }
    /**
     * Mark this texture as needing upload to the GPU.
     *
     * @ignore
     */ markForUpload() {
        this._needsUpload = true;
        this.device?.texturesToUpload?.add(this);
    }
    /**
     * Forces a reupload of the textures pixel data to graphics memory. Ordinarily, this function
     * is called by internally by {@link setSource} and {@link unlock}. However, it still needs to
     * be called explicitly in the case where an HTMLVideoElement is set as the source of the
     * texture.  Normally, this is done once every frame before video textured geometry is
     * rendered.
     */ upload() {
        this.markForUpload();
        this._needsMipmapsUpload = this._mipmaps;
        this.impl.uploadImmediate?.(this.device, this);
    }
    /**
     * Download the textures data from the graphics memory to the local memory.
     *
     * @param {number} x - The left edge of the rectangle.
     * @param {number} y - The top edge of the rectangle.
     * @param {number} width - The width of the rectangle.
     * @param {number} height - The height of the rectangle.
     * @param {object} [options] - Object for passing optional arguments.
     * @param {RenderTarget} [options.renderTarget] - The render target using the texture as a color
     * buffer. Provide as an optimization to avoid creating a new render target. Important especially
     * when this function is called with high frequency (per frame). Note that this is only utilized
     * on the WebGL platform, and ignored on WebGPU.
     * @param {number} [options.mipLevel] - The mip level to download. Defaults to 0.
     * @param {number} [options.face] - The face to download. Defaults to 0.
     * @param {Uint8Array|Uint16Array|Uint32Array|Float32Array} [options.data] - The data buffer to
     * write the pixel data to. If not provided, a new buffer will be created. The type of the buffer
     * must match the texture's format.
     * @param {boolean} [options.immediate] - If true, the read operation will be executed as soon as
     * possible. This has a performance impact, so it should be used only when necessary. Defaults
     * to false.
     * @returns {Promise<Uint8Array|Uint16Array|Uint32Array|Float32Array>} A promise that resolves
     * with the pixel data of the texture.
     */ read(x, y, width, height, options = {}) {
        return this.impl.read?.(x, y, width, height, options);
    }
    /**
     * Upload texture data asynchronously to the GPU.
     *
     * @param {number} x - The left edge of the rectangle.
     * @param {number} y - The top edge of the rectangle.
     * @param {number} width - The width of the rectangle.
     * @param {number} height - The height of the rectangle.
     * @param {Uint8Array|Uint16Array|Uint32Array|Float32Array} data - The pixel data to upload. This should be a typed array.
     *
     * @returns {Promise<void>} A promise that resolves when the upload is complete.
     * @ignore
     */ write(x, y, width, height, data) {
        return this.impl.write?.(x, y, width, height, data);
    }
    /**
     * Creates a TextureView for this texture, specifying a subset of mip levels and array layers.
     * TextureViews can be used with compute shaders to access specific portions of a texture.
     *
     * Note: TextureView is only supported on WebGPU. On WebGL, the full texture is always bound.
     *
     * @param {number} [baseMipLevel] - The first mip level accessible to the view. Defaults to 0.
     * @param {number} [mipLevelCount] - The number of mip levels accessible to the view. Defaults
     * to 1.
     * @param {number} [baseArrayLayer] - The first array layer accessible to the view. Defaults to
     * 0.
     * @param {number} [arrayLayerCount] - The number of array layers accessible to the view.
     * Defaults to 1.
     * @returns {TextureView} A new TextureView for this texture.
     * @example
     * // Create a view for mip level 1
     * const mip1View = texture.getView(1);
     *
     * // Use with compute shader
     * compute.setParameter('outputTexture', mip1View);
     */ getView(baseMipLevel = 0, mipLevelCount = 1, baseArrayLayer = 0, arrayLayerCount = 1) {
        return new TextureView(this, baseMipLevel, mipLevelCount, baseArrayLayer, arrayLayerCount);
    }
    /**
     * Create a new Texture instance.
     *
     * @param {GraphicsDevice} graphicsDevice - The graphics device used to manage this texture.
     * @param {object} [options] - Object for passing optional arguments.
     * @param {string} [options.name] - The name of the texture. Defaults to null.
     * @param {number} [options.width] - The width of the texture in pixels. Defaults to 4.
     * @param {number} [options.height] - The height of the texture in pixels. Defaults to 4.
     * @param {number} [options.depth] - The number of depth slices in a 3D texture.
     * @param {number} [options.format] - The pixel format of the texture. Can be:
     *
     * - {@link PIXELFORMAT_R8}
     * - {@link PIXELFORMAT_RG8}
     * - {@link PIXELFORMAT_RGB565}
     * - {@link PIXELFORMAT_RGBA5551}
     * - {@link PIXELFORMAT_RGBA4}
     * - {@link PIXELFORMAT_RGB8}
     * - {@link PIXELFORMAT_RGBA8}
     * - {@link PIXELFORMAT_DXT1}
     * - {@link PIXELFORMAT_DXT3}
     * - {@link PIXELFORMAT_DXT5}
     * - {@link PIXELFORMAT_RGB16F}
     * - {@link PIXELFORMAT_RGBA16F}
     * - {@link PIXELFORMAT_RGB32F}
     * - {@link PIXELFORMAT_RGBA32F}
     * - {@link PIXELFORMAT_ETC1}
     * - {@link PIXELFORMAT_PVRTC_2BPP_RGB_1}
     * - {@link PIXELFORMAT_PVRTC_2BPP_RGBA_1}
     * - {@link PIXELFORMAT_PVRTC_4BPP_RGB_1}
     * - {@link PIXELFORMAT_PVRTC_4BPP_RGBA_1}
     * - {@link PIXELFORMAT_111110F}
     * - {@link PIXELFORMAT_ASTC_4x4}
     * - {@link PIXELFORMAT_ATC_RGB}
     * - {@link PIXELFORMAT_ATC_RGBA}
     *
     * Defaults to {@link PIXELFORMAT_RGBA8}.
     * @param {string} [options.projection] - The projection type of the texture, used when the
     * texture represents an environment. Can be:
     *
     * - {@link TEXTUREPROJECTION_NONE}
     * - {@link TEXTUREPROJECTION_CUBE}
     * - {@link TEXTUREPROJECTION_EQUIRECT}
     * - {@link TEXTUREPROJECTION_OCTAHEDRAL}
     *
     * Defaults to {@link TEXTUREPROJECTION_CUBE} if options.cubemap is true, otherwise
     * {@link TEXTUREPROJECTION_NONE}.
     * @param {number} [options.minFilter] - The minification filter type to use. Defaults to
     * {@link FILTER_LINEAR_MIPMAP_LINEAR}.
     * @param {number} [options.magFilter] - The magnification filter type to use. Defaults to
     * {@link FILTER_LINEAR}.
     * @param {number} [options.anisotropy] - The level of anisotropic filtering to use. Defaults
     * to 1.
     * @param {number} [options.addressU] - The repeat mode to use in the U direction. Defaults to
     * {@link ADDRESS_REPEAT}.
     * @param {number} [options.addressV] - The repeat mode to use in the V direction. Defaults to
     * {@link ADDRESS_REPEAT}.
     * @param {number} [options.addressW] - The repeat mode to use in the W direction. Defaults to
     * {@link ADDRESS_REPEAT}.
     * @param {boolean} [options.mipmaps] - When enabled try to generate or use mipmaps for this
     * texture. Default is true.
     * @param {number} [options.numLevels] - Specifies the number of mip levels to generate. If not
     * specified, the number is calculated based on the texture size. When this property is set,
     * the mipmaps property is ignored.
     * @param {boolean} [options.cubemap] - Specifies whether the texture is to be a cubemap.
     * Defaults to false.
     * @param {number} [options.arrayLength] - Specifies whether the texture is to be a 2D texture array.
     * When passed in as undefined or < 1, this is not an array texture. If >= 1, this is an array texture.
     * Defaults to undefined.
     * @param {boolean} [options.volume] - Specifies whether the texture is to be a 3D volume.
     * Defaults to false.
     * @param {string} [options.type] - Specifies the texture type.  Can be:
     *
     * - {@link TEXTURETYPE_DEFAULT}
     * - {@link TEXTURETYPE_RGBM}
     * - {@link TEXTURETYPE_RGBE}
     * - {@link TEXTURETYPE_RGBP}
     * - {@link TEXTURETYPE_SWIZZLEGGGR}
     *
     * Defaults to {@link TEXTURETYPE_DEFAULT}.
     * @param {boolean} [options.flipY] - Specifies whether the texture should be flipped in the
     * Y-direction. Only affects textures with a source that is an image, canvas or video element.
     * Does not affect cubemaps, compressed textures or textures set from raw pixel data. Defaults
     * to false.
     * @param {boolean} [options.premultiplyAlpha] - If true, the alpha channel of the texture (if
     * present) is multiplied into the color channels. Defaults to false.
     * @param {boolean} [options.compareOnRead] - When enabled, and if texture format is
     * {@link PIXELFORMAT_DEPTH} or {@link PIXELFORMAT_DEPTHSTENCIL}, hardware PCF is enabled for
     * this texture, and you can get filtered results of comparison using texture() in your shader.
     * Defaults to false.
     * @param {number} [options.compareFunc] - Comparison function when compareOnRead is enabled.
     * Can be:
     *
     * - {@link FUNC_LESS}
     * - {@link FUNC_LESSEQUAL}
     * - {@link FUNC_GREATER}
     * - {@link FUNC_GREATEREQUAL}
     * - {@link FUNC_EQUAL}
     * - {@link FUNC_NOTEQUAL}
     *
     * Defaults to {@link FUNC_LESS}.
     * @param {Uint8Array[]|Uint16Array[]|Uint32Array[]|Float32Array[]|HTMLCanvasElement[]|HTMLImageElement[]|HTMLVideoElement[]|Uint8Array[][]} [options.levels]
     * - Array of Uint8Array or other supported browser interface; or a two-dimensional array
     * of Uint8Array if options.arrayLength is defined and greater than zero.
     * @param {boolean} [options.storage] - Defines if texture can be used as a storage texture by
     * a compute shader. Defaults to false.
     * @example
     * // Create a 8x8x24-bit texture
     * const texture = new pc.Texture(graphicsDevice, {
     *     width: 8,
     *     height: 8,
     *     format: pc.PIXELFORMAT_RGB8
     * });
     *
     * // Fill the texture with a gradient
     * const pixels = texture.lock();
     * const count = 0;
     * for (let i = 0; i < 8; i++) {
     *     for (let j = 0; j < 8; j++) {
     *         pixels[count++] = i * 32;
     *         pixels[count++] = j * 32;
     *         pixels[count++] = 255;
     *     }
     * }
     * texture.unlock();
     */ constructor(graphicsDevice, options = {}){
        /** @ignore */ this._gpuSize = 0;
        /** @protected */ this.id = id$7++;
        /** @protected */ this._invalid = false;
        /** @protected */ this._lockedLevel = -1;
        /** @protected */ this._lockedMode = TEXTURELOCK_NONE;
        /**
     * A render version used to track the last time the texture properties requiring bind group
     * to be updated were changed.
     *
     * @type {number}
     * @ignore
     */ this.renderVersionDirty = 0;
        /** @protected */ this._storage = false;
        /** @protected */ this._numLevels = 0;
        this.device = graphicsDevice;
        Debug.assert(this.device, 'Texture constructor requires a graphicsDevice to be valid');
        Debug.assert(!options.width || Number.isInteger(options.width), 'Texture width must be an integer number, got', options);
        Debug.assert(!options.height || Number.isInteger(options.height), 'Texture height must be an integer number, got', options);
        Debug.assert(!options.depth || Number.isInteger(options.depth), 'Texture depth must be an integer number, got', options);
        this.name = options.name ?? '';
        this._width = Math.floor(options.width ?? 4);
        this._height = Math.floor(options.height ?? 4);
        this._format = options.format ?? PIXELFORMAT_RGBA8;
        this._compressed = isCompressedPixelFormat(this._format);
        this._integerFormat = isIntegerPixelFormat(this._format);
        if (this._integerFormat) {
            options.minFilter = FILTER_NEAREST;
            options.magFilter = FILTER_NEAREST;
        }
        this._volume = options.volume ?? false;
        this._depth = Math.floor(options.depth ?? 1);
        this._arrayLength = Math.floor(options.arrayLength ?? 0);
        this._storage = options.storage ?? false;
        this._cubemap = options.cubemap ?? false;
        this._flipY = options.flipY ?? false;
        this._premultiplyAlpha = options.premultiplyAlpha ?? false;
        this._mipmaps = options.mipmaps ?? true;
        this._numLevelsRequested = options.numLevels;
        if (options.numLevels !== undefined) {
            this._numLevels = options.numLevels;
        }
        this._updateNumLevels();
        this._minFilter = options.minFilter ?? FILTER_LINEAR_MIPMAP_LINEAR;
        this._magFilter = options.magFilter ?? FILTER_LINEAR;
        this._anisotropy = options.anisotropy ?? 1;
        this._addressU = options.addressU ?? ADDRESS_REPEAT;
        this._addressV = options.addressV ?? ADDRESS_REPEAT;
        this._addressW = options.addressW ?? ADDRESS_REPEAT;
        this._compareOnRead = options.compareOnRead ?? false;
        this._compareFunc = options.compareFunc ?? FUNC_LESS;
        this._type = options.type ?? TEXTURETYPE_DEFAULT;
        Debug.assert(!options.hasOwnProperty('rgbm'), 'Use options.type.');
        Debug.assert(!options.hasOwnProperty('swizzleGGGR'), 'Use options.type.');
        this.projection = TEXTUREPROJECTION_NONE;
        if (this._cubemap) {
            this.projection = TEXTUREPROJECTION_CUBE;
        } else if (options.projection && options.projection !== TEXTUREPROJECTION_CUBE) {
            this.projection = options.projection;
        }
        this.profilerHint = options.profilerHint ?? 0;
        this._levels = options.levels;
        const upload = !!options.levels;
        if (!this._levels) {
            this._clearLevels();
        }
        this.recreateImpl(upload);
        Debug.trace(TRACEID_TEXTURE_ALLOC, `Alloc: Id ${this.id} ${this.name}: ${this.width}x${this.height} [${pixelFormatInfo.get(this.format)?.name}]` + `${this.cubemap ? '[Cubemap]' : ''}` + `${this.volume ? '[Volume]' : ''}` + `${this.array ? '[Array]' : ''}` + `[MipLevels:${this.numLevels}]`, this);
    }
}

const textureData = {
    white: [
        255,
        255,
        255,
        255
    ],
    gray: [
        128,
        128,
        128,
        255
    ],
    black: [
        0,
        0,
        0,
        255
    ],
    normal: [
        128,
        128,
        255,
        255
    ],
    pink: [
        255,
        128,
        255,
        255
    ]
};
// class used to hold LUT textures in the device cache
class BuiltInTextures {
    destroy() {
        this.map.forEach((texture)=>{
            texture.destroy();
        });
    }
    constructor(){
        /** @type Map<string, Texture> */ this.map = new Map();
    }
}
// device cache storing built-in textures, taking care of their removal when the device is destroyed
const deviceCache$1 = new DeviceCache();
const getBuiltInTexture = (device, name)=>{
    const cache = deviceCache$1.get(device, ()=>{
        return new BuiltInTextures();
    });
    if (!cache.map.has(name)) {
        const texture = new Texture(device, {
            name: `built-in-texture-${name}`,
            width: 1,
            height: 1,
            format: PIXELFORMAT_RGBA8
        });
        const pixels = texture.lock();
        const data = textureData[name];
        Debug.assert(data, `Data for built-in texture '${name}' not found`);
        pixels.set(data);
        texture.unlock();
        cache.map.set(name, texture);
    }
    return cache.map.get(name);
};

/**
 * @import { BindGroupFormat } from './bind-group-format.js'
 * @import { GraphicsDevice } from './graphics-device.js'
 * @import { StorageBuffer } from './storage-buffer.js'
 * @import { Texture } from './texture.js'
 * @import { UniformBuffer } from './uniform-buffer.js'
 */ let id$6 = 0;
/**
 * Data structure to hold a bind group and its offsets. This is used by {@link UniformBuffer#update}
 * to return a dynamic bind group and offset for the uniform buffer.
 *
 * @ignore
 */ class DynamicBindGroup {
    constructor(){
        this.offsets = [];
    }
}
/**
 * A bind group represents a collection of {@link UniformBuffer}, {@link Texture} and
 * {@link StorageBuffer} instanced, which can be bind on a GPU for rendering.
 *
 * @ignore
 */ class BindGroup {
    /**
     * Frees resources associated with this bind group.
     */ destroy() {
        this.impl.destroy();
        this.impl = null;
        this.format = null;
        this.defaultUniformBuffer = null;
    }
    /**
     * Assign a uniform buffer to a slot.
     *
     * @param {string} name - The name of the uniform buffer slot
     * @param {UniformBuffer} uniformBuffer - The Uniform buffer to assign to the slot.
     */ setUniformBuffer(name, uniformBuffer) {
        const index = this.format.bufferFormatsMap.get(name);
        Debug.assert(index !== undefined, `Setting a uniform [${name}] on a bind group with id ${this.id} which does not contain it, while rendering [${DebugGraphics.toString()}]`, this);
        if (this.uniformBuffers[index] !== uniformBuffer) {
            this.uniformBuffers[index] = uniformBuffer;
            this.dirty = true;
        }
    }
    /**
     * Assign a storage buffer to a slot.
     *
     * @param {string} name - The name of the storage buffer slot.
     * @param {StorageBuffer} storageBuffer - The storage buffer to assign to the slot.
     */ setStorageBuffer(name, storageBuffer) {
        const index = this.format.storageBufferFormatsMap.get(name);
        Debug.assert(index !== undefined, `Setting a storage buffer [${name}] on a bind group with id: ${this.id} which does not contain it, while rendering [${DebugGraphics.toString()}]`, this);
        if (this.storageBuffers[index] !== storageBuffer) {
            this.storageBuffers[index] = storageBuffer;
            this.dirty = true;
        }
    }
    /**
     * Assign a texture to a named slot.
     *
     * @param {string} name - The name of the texture slot.
     * @param {Texture|TextureView} value - Texture or TextureView to assign to the slot.
     */ setTexture(name, value) {
        const index = this.format.textureFormatsMap.get(name);
        Debug.assert(index !== undefined, `Setting a texture [${name}] on a bind group with id: ${this.id} which does not contain it, while rendering [${DebugGraphics.toString()}]`, this);
        // Get the actual texture for version checking
        const texture = value instanceof TextureView ? value.texture : value;
        if (this.textures[index] !== value) {
            this.textures[index] = value;
            this.dirty = true;
        } else if (this.renderVersionUpdated < texture.renderVersionDirty) {
            // if the texture properties have changed
            this.dirty = true;
        }
    }
    /**
     * Assign a storage texture to a named slot.
     *
     * @param {string} name - The name of the texture slot.
     * @param {Texture|TextureView} value - Texture or TextureView to assign to the slot.
     */ setStorageTexture(name, value) {
        const index = this.format.storageTextureFormatsMap.get(name);
        Debug.assert(index !== undefined, `Setting a storage texture [${name}] on a bind group with id: ${this.id} which does not contain it, while rendering [${DebugGraphics.toString()}]`, this);
        // Get the actual texture for version checking
        const texture = value instanceof TextureView ? value.texture : value;
        if (this.storageTextures[index] !== value) {
            this.storageTextures[index] = value;
            this.dirty = true;
        } else if (this.renderVersionUpdated < texture.renderVersionDirty) {
            // if the texture properties have changed
            this.dirty = true;
        }
    }
    /**
     * Updates the uniform buffers in this bind group.
     */ updateUniformBuffers() {
        for(let i = 0; i < this.uniformBuffers.length; i++){
            this.uniformBuffers[i].update();
        }
    }
    /**
     * Applies any changes made to the bind group's properties. Note that the content of used
     * uniform buffers needs to be updated before calling this method.
     */ update() {
        // TODO: implement faster version of this, which does not call SetTexture, which does a map lookup
        const { textureFormats, storageTextureFormats, storageBufferFormats } = this.format;
        for(let i = 0; i < textureFormats.length; i++){
            const textureFormat = textureFormats[i];
            let value = textureFormat.scopeId.value;
            // custom error handling for known global textures
            if (!value) {
                if (textureFormat.name === 'uSceneDepthMap') {
                    Debug.errorOnce(`A uSceneDepthMap texture is used by the shader but a scene depth texture is not available. Use CameraComponent.requestSceneDepthMap / enable Depth Grabpass on the Camera Component / CameraFrame.rendering.sceneDepthMap to enable it. Rendering [${DebugGraphics.toString()}]`);
                    value = getBuiltInTexture(this.device, 'white');
                }
                if (textureFormat.name === 'uSceneColorMap') {
                    Debug.errorOnce(`A uSceneColorMap texture is used by the shader but a scene color texture is not available. Use CameraComponent.requestSceneColorMap / enable Color Grabpass on the Camera Component / CameraFrame.rendering.sceneColorMap to enable it. Rendering [${DebugGraphics.toString()}]`);
                    value = getBuiltInTexture(this.device, 'pink');
                }
                // missing generic texture
                if (!value) {
                    Debug.errorOnce(`Texture ${textureFormat.name} is required for rendering but was not set. Rendering [${DebugGraphics.toString()}]`);
                    value = getBuiltInTexture(this.device, 'pink');
                }
            }
            this.setTexture(textureFormat.name, value);
        }
        for(let i = 0; i < storageTextureFormats.length; i++){
            const storageTextureFormat = storageTextureFormats[i];
            const value = storageTextureFormat.scopeId.value;
            Debug.assert(value, `Value was not set when assigning storage texture slot [${storageTextureFormat.name}] to a bind group, while rendering [${DebugGraphics.toString()}]`, this);
            this.setStorageTexture(storageTextureFormat.name, value);
        }
        for(let i = 0; i < storageBufferFormats.length; i++){
            const storageBufferFormat = storageBufferFormats[i];
            const value = storageBufferFormat.scopeId.value;
            Debug.assert(value, `Value was not set when assigning storage buffer slot [${storageBufferFormat.name}] to a bind group, while rendering [${DebugGraphics.toString()}]`, this);
            this.setStorageBuffer(storageBufferFormat.name, value);
        }
        // update uniform buffer offsets
        this.uniformBufferOffsets.length = this.uniformBuffers.length;
        for(let i = 0; i < this.uniformBuffers.length; i++){
            const uniformBuffer = this.uniformBuffers[i];
            // offset
            this.uniformBufferOffsets[i] = uniformBuffer.offset;
            // test if any of the uniform buffers have changed (not their content, but the buffer container itself)
            if (this.renderVersionUpdated < uniformBuffer.renderVersionDirty) {
                this.dirty = true;
            }
        }
        if (this.dirty) {
            this.dirty = false;
            this.renderVersionUpdated = this.device.renderVersion;
            this.impl.update(this);
        }
    }
    /**
     * Create a new Bind Group.
     *
     * @param {GraphicsDevice} graphicsDevice - The graphics device used to manage this uniform buffer.
     * @param {BindGroupFormat} format - Format of the bind group.
     * @param {UniformBuffer} [defaultUniformBuffer] - The default uniform buffer. Typically a bind
     * group only has a single uniform buffer, and this allows easier access.
     */ constructor(graphicsDevice, format, defaultUniformBuffer){
        /**
     * A render version the bind group was last updated on.
     *
     * @type {number}
     * @private
     */ this.renderVersionUpdated = -1;
        /**
     * An array of offsets for each uniform buffer in the bind group. This is the offset in the
     * buffer where the uniform buffer data starts.
     *
     * @type {number[]}
     */ this.uniformBufferOffsets = [];
        this.id = id$6++;
        this.device = graphicsDevice;
        this.format = format;
        this.dirty = true;
        this.impl = graphicsDevice.createBindGroupImpl(this);
        /** @type {(Texture|TextureView)[]} */ this.textures = [];
        /** @type {(Texture|TextureView)[]} */ this.storageTextures = [];
        this.storageBuffers = [];
        this.uniformBuffers = [];
        /** @type {UniformBuffer} */ this.defaultUniformBuffer = defaultUniformBuffer;
        if (defaultUniformBuffer) {
            this.setUniformBuffer(UNIFORM_BUFFER_DEFAULT_SLOT_NAME, defaultUniformBuffer);
        }
        Debug.trace(TRACEID_BINDGROUP_ALLOC, `Alloc: Id ${this.id}`, this, format);
    }
}

/**
 * BitPacking API - functionality for operating on values stored as bits in a number.
 *
 * @namespace
 */ const BitPacking = {
    /**
     * Sets a value to specified bits of a number.
     *
     * @param {number} storage - Number to store the bits into.
     * @param {number} value - Value to store.
     * @param {number} shift - Number of bits to shift the value.
     * @param {number} [mask] - Mask for the value to limit the number of storage bits. Defaults to 1.
     * @returns {number} Returns the storage updated with the value.
     */ set (storage, value, shift, mask = 1) {
        // clear the space
        const data = storage & ~(mask << shift);
        // set the bits
        return data | value << shift;
    },
    /**
     * Gets the value of specified bits from a number.
     *
     * @param {number} storage - Number to extract the bits from.
     * @param {number} shift - Number of bits to shift the mask.
     * @param {number} [mask] - Mask for the value to limit the number of storage bits. Defaults to 1.
     * @returns {number} Returns the extracted value.
     */ get (storage, shift, mask = 1) {
        return storage >> shift & mask;
    },
    /**
     * Tests if all specified bits are set.
     *
     * @param {number} storage - Number to test.
     * @param {number} shift - Number of bits to shift the mask.
     * @param {number} [mask] - Mask to limit the number of storage bits. Defaults to 1.
     * @returns {boolean} Returns true if all bits in the mask are set in the storage.
     */ all (storage, shift, mask = 1) {
        const shifted = mask << shift;
        return (storage & shifted) === shifted;
    },
    /**
     * Tests if any specified bits are set.
     *
     * @param {number} storage - Number to test.
     * @param {number} shift - Number of bits to shift the mask.
     * @param {number} [mask] - Mask to limit the number of storage bits. Defaults to 1.
     * @returns {boolean} Returns true if any bits in the mask are set in the storage.
     */ any (storage, shift, mask = 1) {
        return (storage & mask << shift) !== 0;
    }
};

// masks (to only keep relevant bits)
const opMask = 0b111;
const factorMask = 0b1111;
// shifts values to where individual parts are stored
const colorOpShift = 0; // 00 - 02 (3bits)
const colorSrcFactorShift = 3; // 03 - 06 (4bits)
const colorDstFactorShift = 7; // 07 - 10 (4bits)
const alphaOpShift = 11; // 11 - 13 (3bits)
const alphaSrcFactorShift = 14; // 14 - 17 (4bits)
const alphaDstFactorShift = 18; // 18 - 21 (4bits)
const redWriteShift = 22; // 22 (1 bit)
const greenWriteShift = 23; // 23 (1 bit)
const blueWriteShift = 24; // 24 (1 bit)
const alphaWriteShift = 25; // 25 (1 bit)
const blendShift = 26; // 26 (1 bit)
// combined values access
const allWriteMasks = 0b1111;
const allWriteShift = redWriteShift;
/**
 * BlendState is a descriptor that defines how output of fragment shader is written and blended
 * into render target. A blend state can be set on a material using {@link Material#blendState},
 * or in some cases on the graphics device using {@link GraphicsDevice#setBlendState}.
 *
 * For the best performance, do not modify blend state after it has been created, but create
 * multiple blend states and assign them to the material or graphics device as needed.
 *
 * @category Graphics
 */ class BlendState {
    /**
     * Sets whether blending is enabled.
     *
     * @type {boolean}
     */ set blend(value) {
        this.target0 = BitPacking.set(this.target0, value ? 1 : 0, blendShift);
    }
    /**
     * Gets whether blending is enabled.
     *
     * @type {boolean}
     */ get blend() {
        return BitPacking.all(this.target0, blendShift);
    }
    setColorBlend(op, srcFactor, dstFactor) {
        this.target0 = BitPacking.set(this.target0, op, colorOpShift, opMask);
        this.target0 = BitPacking.set(this.target0, srcFactor, colorSrcFactorShift, factorMask);
        this.target0 = BitPacking.set(this.target0, dstFactor, colorDstFactorShift, factorMask);
    }
    setAlphaBlend(op, srcFactor, dstFactor) {
        this.target0 = BitPacking.set(this.target0, op, alphaOpShift, opMask);
        this.target0 = BitPacking.set(this.target0, srcFactor, alphaSrcFactorShift, factorMask);
        this.target0 = BitPacking.set(this.target0, dstFactor, alphaDstFactorShift, factorMask);
    }
    setColorWrite(redWrite, greenWrite, blueWrite, alphaWrite) {
        this.redWrite = redWrite;
        this.greenWrite = greenWrite;
        this.blueWrite = blueWrite;
        this.alphaWrite = alphaWrite;
    }
    get colorOp() {
        return BitPacking.get(this.target0, colorOpShift, opMask);
    }
    get colorSrcFactor() {
        return BitPacking.get(this.target0, colorSrcFactorShift, factorMask);
    }
    get colorDstFactor() {
        return BitPacking.get(this.target0, colorDstFactorShift, factorMask);
    }
    get alphaOp() {
        return BitPacking.get(this.target0, alphaOpShift, opMask);
    }
    get alphaSrcFactor() {
        return BitPacking.get(this.target0, alphaSrcFactorShift, factorMask);
    }
    get alphaDstFactor() {
        return BitPacking.get(this.target0, alphaDstFactorShift, factorMask);
    }
    set redWrite(value) {
        this.target0 = BitPacking.set(this.target0, value ? 1 : 0, redWriteShift);
    }
    get redWrite() {
        return BitPacking.all(this.target0, redWriteShift);
    }
    set greenWrite(value) {
        this.target0 = BitPacking.set(this.target0, value ? 1 : 0, greenWriteShift);
    }
    get greenWrite() {
        return BitPacking.all(this.target0, greenWriteShift);
    }
    set blueWrite(value) {
        this.target0 = BitPacking.set(this.target0, value ? 1 : 0, blueWriteShift);
    }
    get blueWrite() {
        return BitPacking.all(this.target0, blueWriteShift);
    }
    set alphaWrite(value) {
        this.target0 = BitPacking.set(this.target0, value ? 1 : 0, alphaWriteShift);
    }
    get alphaWrite() {
        return BitPacking.all(this.target0, alphaWriteShift);
    }
    get allWrite() {
        // return a number with all 4 bits, for fast compare
        return BitPacking.get(this.target0, allWriteShift, allWriteMasks);
    }
    /**
     * Copies the contents of a source blend state to this blend state.
     *
     * @param {BlendState} rhs - A blend state to copy from.
     * @returns {BlendState} Self for chaining.
     */ copy(rhs) {
        this.target0 = rhs.target0;
        return this;
    }
    /**
     * Returns an identical copy of the specified blend state.
     *
     * @returns {this} The result of the cloning.
     */ clone() {
        const clone = new this.constructor();
        return clone.copy(this);
    }
    get key() {
        return this.target0;
    }
    /**
     * Reports whether two BlendStates are equal.
     *
     * @param {BlendState} rhs - The blend state to compare to.
     * @returns {boolean} True if the blend states are equal and false otherwise.
     */ equals(rhs) {
        return this.target0 === rhs.target0;
    }
    /**
     * Create a new BlendState instance.
     *
     * All factor parameters can take the following values:
     *
     * - {@link BLENDMODE_ZERO}
     * - {@link BLENDMODE_ONE}
     * - {@link BLENDMODE_SRC_COLOR}
     * - {@link BLENDMODE_ONE_MINUS_SRC_COLOR}
     * - {@link BLENDMODE_DST_COLOR}
     * - {@link BLENDMODE_ONE_MINUS_DST_COLOR}
     * - {@link BLENDMODE_SRC_ALPHA}
     * - {@link BLENDMODE_SRC_ALPHA_SATURATE}
     * - {@link BLENDMODE_ONE_MINUS_SRC_ALPHA}
     * - {@link BLENDMODE_DST_ALPHA}
     * - {@link BLENDMODE_ONE_MINUS_DST_ALPHA}
     * - {@link BLENDMODE_CONSTANT}
     * - {@link BLENDMODE_ONE_MINUS_CONSTANT}
     *
     * All op parameters can take the following values:
     *
     * - {@link BLENDEQUATION_ADD}
     * - {@link BLENDEQUATION_SUBTRACT}
     * - {@link BLENDEQUATION_REVERSE_SUBTRACT}
     * - {@link BLENDEQUATION_MIN}
     * - {@link BLENDEQUATION_MAX}
     *
     * @param {boolean} [blend] - Enables or disables blending. Defaults to false.
     * @param {number} [colorOp] - Configures color blending operation. Defaults to
     * {@link BLENDEQUATION_ADD}.
     * @param {number} [colorSrcFactor] - Configures source color blending factor. Defaults to
     * {@link BLENDMODE_ONE}.
     * @param {number} [colorDstFactor] - Configures destination color blending factor. Defaults to
     * {@link BLENDMODE_ZERO}.
     * @param {number} [alphaOp] - Configures alpha blending operation. Defaults to
     * {@link BLENDEQUATION_ADD}.
     * @param {number} [alphaSrcFactor] - Configures source alpha blending factor. Defaults to
     * {@link BLENDMODE_ONE}.
     * @param {number} [alphaDstFactor] - Configures destination alpha blending factor. Defaults to
     * {@link BLENDMODE_ZERO}.
     * @param {boolean} [redWrite] - True to enable writing of the red channel and false otherwise.
     * Defaults to true.
     * @param {boolean} [greenWrite] - True to enable writing of the green channel and false
     * otherwise. Defaults to true.
     * @param {boolean} [blueWrite] - True to enable writing of the blue channel and false otherwise.
     * Defaults to true.
     * @param {boolean} [alphaWrite] - True to enable writing of the alpha channel and false
     * otherwise. Defaults to true.
     */ constructor(blend = false, colorOp = BLENDEQUATION_ADD, colorSrcFactor = BLENDMODE_ONE, colorDstFactor = BLENDMODE_ZERO, alphaOp, alphaSrcFactor, alphaDstFactor, redWrite = true, greenWrite = true, blueWrite = true, alphaWrite = true){
        /**
     * Bit field representing the blend state for render target 0.
     *
     * @private
     */ this.target0 = 0;
        this.setColorBlend(colorOp, colorSrcFactor, colorDstFactor);
        this.setAlphaBlend(alphaOp ?? colorOp, alphaSrcFactor ?? colorSrcFactor, alphaDstFactor ?? colorDstFactor);
        this.setColorWrite(redWrite, greenWrite, blueWrite, alphaWrite);
        this.blend = blend;
    }
}
/**
     * A blend state that has blending disabled and writes to all color channels.
     *
     * @type {BlendState}
     * @readonly
     */ BlendState.NOBLEND = Object.freeze(new BlendState());
/**
     * A blend state that does not write to color channels.
     *
     * @type {BlendState}
     * @readonly
     */ BlendState.NOWRITE = Object.freeze(new BlendState(undefined, undefined, undefined, undefined, undefined, undefined, undefined, false, false, false, false));
/**
     * A blend state that does simple translucency using alpha channel.
     *
     * @type {BlendState}
     * @readonly
     */ BlendState.ALPHABLEND = Object.freeze(new BlendState(true, BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA));
/**
     * A blend state that does simple additive blending.
     *
     * @type {BlendState}
     * @readonly
     */ BlendState.ADDBLEND = Object.freeze(new BlendState(true, BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE));

const stringIds$4 = new StringIds();
// masks (to only keep relevant bits)
const funcMask = 0b111;
// shifts values to where individual parts are stored
const funcShift = 0; // 00 - 02 (3bits)
const writeShift = 3; // 03 - 03 (1bit)
/**
 * DepthState is a descriptor that defines how the depth value of the fragment is used by the
 * rendering pipeline. A depth state can be set on a material using {@link Material#depthState},
 * or in some cases on the graphics device using {@link GraphicsDevice#setDepthState}.
 *
 * For the best performance, do not modify depth state after it has been created, but create
 * multiple depth states and assign them to the material or graphics device as needed.
 *
 * @category Graphics
 */ class DepthState {
    /**
     * Sets whether depth testing is performed. If true, a shader fragment is only written to the
     * current render target if it passes the depth test. If false, it is written regardless of
     * what is in the depth buffer. Note that when depth testing is disabled, writes to the depth
     * buffer are also disabled. Defaults to true.
     *
     * @type {boolean}
     */ set test(value) {
        this.func = value ? FUNC_LESSEQUAL : FUNC_ALWAYS;
        this.updateKey();
    }
    /**
     * Gets whether depth testing is performed.
     *
     * @type {boolean}
     */ get test() {
        return this.func !== FUNC_ALWAYS;
    }
    /**
     * Sets whether depth writing is performed. If true, shader write a depth value to the depth
     * buffer of the currently active render target. If false, no depth value is written.
     *
     * @type {boolean}
     */ set write(value) {
        this.data = BitPacking.set(this.data, value ? 1 : 0, writeShift);
        this.updateKey();
    }
    /**
     * Gets whether depth writing is performed.
     *
     * @type {boolean}
     */ get write() {
        return BitPacking.all(this.data, writeShift);
    }
    /**
     * Sets the depth testing function. Controls how the depth of the fragment is compared against
     * the current depth contained in the depth buffer. Can be:
     *
     * - {@link FUNC_NEVER}: don't draw
     * - {@link FUNC_LESS}: draw if new depth < depth buffer
     * - {@link FUNC_EQUAL}: draw if new depth == depth buffer
     * - {@link FUNC_LESSEQUAL}: draw if new depth <= depth buffer
     * - {@link FUNC_GREATER}: draw if new depth > depth buffer
     * - {@link FUNC_NOTEQUAL}: draw if new depth != depth buffer
     * - {@link FUNC_GREATEREQUAL}: draw if new depth >= depth buffer
     * - {@link FUNC_ALWAYS}: always draw
     *
     * @type {number}
     */ set func(value) {
        this.data = BitPacking.set(this.data, value, funcShift, funcMask);
        this.updateKey();
    }
    /**
     * Gets the depth testing function.
     *
     * @type {number}
     */ get func() {
        return BitPacking.get(this.data, funcShift, funcMask);
    }
    /**
     * Sets the constant depth bias added to each fragment's depth. Useful for decals to prevent
     * z-fighting. Typically a small negative value (-0.1) is used to render the mesh slightly
     * closer to the camera. Defaults to 0.
     *
     * @type {number}
     */ set depthBias(value) {
        this._depthBias = value;
        this.updateKey();
    }
    /**
     * Gets the constant depth bias added to each fragment's depth.
     *
     * @type {number}
     */ get depthBias() {
        return this._depthBias;
    }
    /**
     * Sets the depth bias that scales with the fragment's slope. Defaults to 0.
     *
     * @type {number}
     */ set depthBiasSlope(value) {
        this._depthBiasSlope = value;
        this.updateKey();
    }
    /**
     * Gets the depth bias that scales with the fragment's slope.
     *
     * @type {number}
     */ get depthBiasSlope() {
        return this._depthBiasSlope;
    }
    /**
     * Copies the contents of a source depth state to this depth state.
     *
     * @param {DepthState} rhs - A depth state to copy from.
     * @returns {DepthState} Self for chaining.
     */ copy(rhs) {
        this.data = rhs.data;
        this._depthBias = rhs._depthBias;
        this._depthBiasSlope = rhs._depthBiasSlope;
        this.key = rhs.key;
        return this;
    }
    /**
     * Returns an identical copy of the specified depth state.
     *
     * @returns {this} The result of the cloning.
     */ clone() {
        const clone = new this.constructor();
        return clone.copy(this);
    }
    updateKey() {
        const { data, _depthBias, _depthBiasSlope } = this;
        const key = `${data}-${_depthBias}-${_depthBiasSlope}`;
        // convert string to a unique number
        this.key = stringIds$4.get(key);
    }
    /**
     * Reports whether two DepthStates are equal.
     *
     * @param {DepthState} rhs - The depth state to compare to.
     * @returns {boolean} True if the depth states are equal and false otherwise.
     */ equals(rhs) {
        return this.key === rhs.key;
    }
    /**
     * Create a new Depth State instance.
     *
     * @param {number} func - Controls how the depth of the fragment is compared against the
     * current depth contained in the depth buffer. See {@link DepthState#func} for details.
     * Defaults to {@link FUNC_LESSEQUAL}.
     * @param {boolean} write - If true, depth values are written to the depth buffer of the
     * currently active render target. Defaults to true.
     */ constructor(func = FUNC_LESSEQUAL, write = true){
        /**
     * Bit field representing the depth state.
     *
     * @private
     */ this.data = 0;
        this._depthBias = 0;
        this._depthBiasSlope = 0;
        /**
     * A unique number representing the depth state. You can use this number to quickly compare
     * two depth states for equality. The key is always maintained valid without a dirty flag,
     * to avoid condition check at runtime, considering these change rarely.
     *
     * @type {number}
     */ this.key = 0;
        this.func = func;
        this.write = write;
    }
}
/**
     * A default depth state that has the depth testing function set to {@link FUNC_LESSEQUAL} and
     * depth writes enabled.
     *
     * @type {DepthState}
     * @readonly
     */ DepthState.DEFAULT = Object.freeze(new DepthState());
/**
     * A depth state that always passes the fragment but does not write depth to the depth buffer.
     *
     * @type {DepthState}
     * @readonly
     */ DepthState.NODEPTH = Object.freeze(new DepthState(FUNC_ALWAYS, false));
/**
     * A depth state that always passes the fragment and writes depth to the depth buffer.
     *
     * @type {DepthState}
     * @readonly
     */ DepthState.WRITEDEPTH = Object.freeze(new DepthState(FUNC_ALWAYS, true));

let id$5 = 0;
/**
 * An index buffer stores index values into a {@link VertexBuffer}. Indexed graphical primitives
 * can normally utilize less memory that unindexed primitives (if vertices are shared).
 *
 * Typically, index buffers are set on {@link Mesh} objects.
 *
 * @category Graphics
 */ class IndexBuffer {
    /**
     * Frees resources associated with this index buffer.
     */ destroy() {
        // stop tracking the index buffer
        const device = this.device;
        device.buffers.delete(this);
        if (this.device.indexBuffer === this) {
            this.device.indexBuffer = null;
        }
        if (this.impl.initialized) {
            this.impl.destroy(device);
            this.adjustVramSizeTracking(device._vram, -this.storage.byteLength);
        }
    }
    adjustVramSizeTracking(vram, size) {
        Debug.trace(TRACEID_VRAM_IB, `${this.id} size: ${size} vram.ib: ${vram.ib} => ${vram.ib + size}`);
        vram.ib += size;
    }
    /**
     * Called when the rendering context was lost. It releases all context related resources.
     *
     * @ignore
     */ loseContext() {
        this.impl.loseContext();
    }
    /**
     * Returns the data format of the specified index buffer.
     *
     * @returns {number} The data format of the specified index buffer. Can be:
     *
     * - {@link INDEXFORMAT_UINT8}
     * - {@link INDEXFORMAT_UINT16}
     * - {@link INDEXFORMAT_UINT32}
     */ getFormat() {
        return this.format;
    }
    /**
     * Returns the number of indices stored in the specified index buffer.
     *
     * @returns {number} The number of indices stored in the specified index buffer.
     */ getNumIndices() {
        return this.numIndices;
    }
    /**
     * Gives access to the block of memory that stores the buffer's indices.
     *
     * @returns {ArrayBuffer} A contiguous block of memory where index data can be written to.
     */ lock() {
        return this.storage;
    }
    /**
     * Signals that the block of memory returned by a call to the lock function is ready to be
     * given to the graphics hardware. Only unlocked index buffers can be set on the currently
     * active device.
     */ unlock() {
        // Upload the new index data
        this.impl.unlock(this);
    }
    /**
     * Set preallocated data on the index buffer.
     *
     * @param {ArrayBuffer} data - The index data to set.
     * @returns {boolean} True if the data was set successfully, false otherwise.
     * @ignore
     */ setData(data) {
        if (data.byteLength !== this.numBytes) {
            Debug.error(`IndexBuffer: wrong initial data size: expected ${this.numBytes}, got ${data.byteLength}`);
            return false;
        }
        this.storage = data;
        this.unlock();
        return true;
    }
    /**
     * Get the appropriate typed array from an index buffer.
     *
     * @returns {Uint8Array|Uint16Array|Uint32Array} The typed array containing the index data.
     * @private
     */ _lockTypedArray() {
        const lock = this.lock();
        const indices = this.format === INDEXFORMAT_UINT32 ? new Uint32Array(lock) : this.format === INDEXFORMAT_UINT16 ? new Uint16Array(lock) : new Uint8Array(lock);
        return indices;
    }
    /**
     * Copies the specified number of elements from data into index buffer. Optimized for
     * performance from both typed array as well as array.
     *
     * @param {Uint8Array|Uint16Array|Uint32Array|number[]} data - The data to write.
     * @param {number} count - The number of indices to write.
     * @ignore
     */ writeData(data, count) {
        const indices = this._lockTypedArray();
        // if data contains more indices than needed, copy from its subarray
        if (data.length > count) {
            // if data is typed array
            if (ArrayBuffer.isView(data)) {
                data = data.subarray(0, count);
                indices.set(data);
            } else {
                // data is array, copy right amount manually
                for(let i = 0; i < count; i++){
                    indices[i] = data[i];
                }
            }
        } else {
            // copy whole data
            indices.set(data);
        }
        this.unlock();
    }
    /**
     * Copies index data from index buffer into provided data array.
     *
     * @param {Uint8Array|Uint16Array|Uint32Array|number[]} data - The data array to write to.
     * @returns {number} The number of indices read.
     * @ignore
     */ readData(data) {
        // note: there is no need to unlock this buffer, as we are only reading from it
        const indices = this._lockTypedArray();
        const count = this.numIndices;
        if (ArrayBuffer.isView(data)) {
            // destination data is typed array
            data.set(indices);
        } else {
            // data is array, copy right amount manually
            data.length = 0;
            for(let i = 0; i < count; i++){
                data[i] = indices[i];
            }
        }
        return count;
    }
    /**
     * Create a new IndexBuffer instance.
     *
     * @param {GraphicsDevice} graphicsDevice - The graphics device used to manage this index buffer.
     * @param {number} format - The type of each index to be stored in the index buffer. Can be:
     *
     * - {@link INDEXFORMAT_UINT8}
     * - {@link INDEXFORMAT_UINT16}
     * - {@link INDEXFORMAT_UINT32}
     * @param {number} numIndices - The number of indices to be stored in the index buffer.
     * @param {number} [usage] - The usage type of the vertex buffer. Can be:
     *
     * - {@link BUFFER_DYNAMIC}
     * - {@link BUFFER_STATIC}
     * - {@link BUFFER_STREAM}
     *
     * Defaults to {@link BUFFER_STATIC}.
     * @param {ArrayBuffer} [initialData] - Initial data. If left unspecified, the index buffer
     * will be initialized to zeros.
     * @param {object} [options] - Object for passing optional arguments.
     * @param {boolean} [options.storage] - Defines if the index buffer can be used as a storage
     * buffer by a compute shader. Defaults to false. Only supported on WebGPU.
     * @example
     * // Create an index buffer holding 3 16-bit indices. The buffer is marked as
     * // static, hinting that the buffer will never be modified.
     * const indices = new UInt16Array([0, 1, 2]);
     * const indexBuffer = new pc.IndexBuffer(graphicsDevice,
     *                                        pc.INDEXFORMAT_UINT16,
     *                                        3,
     *                                        pc.BUFFER_STATIC,
     *                                        indices);
     */ constructor(graphicsDevice, format, numIndices, usage = BUFFER_STATIC, initialData, options){
        // By default, index buffers are static (better for performance since buffer data can be cached in VRAM)
        this.device = graphicsDevice;
        this.format = format;
        this.numIndices = numIndices;
        this.usage = usage;
        this.id = id$5++;
        this.impl = graphicsDevice.createIndexBufferImpl(this, options);
        // Allocate the storage
        const bytesPerIndex = typedArrayIndexFormatsByteSize[format];
        this.bytesPerIndex = bytesPerIndex;
        this.numBytes = this.numIndices * bytesPerIndex;
        if (initialData) {
            this.setData(initialData);
        } else {
            this.storage = new ArrayBuffer(this.numBytes);
        }
        this.adjustVramSizeTracking(graphicsDevice._vram, this.numBytes);
        this.device.buffers.add(this);
    }
}

class Version {
    equals(other) {
        return this.globalId === other.globalId && this.revision === other.revision;
    }
    copy(other) {
        this.globalId = other.globalId;
        this.revision = other.revision;
    }
    reset() {
        this.globalId = 0;
        this.revision = 0;
    }
    constructor(){
        this.globalId = 0;
        this.revision = 0;
    }
}

let idCounter = 0;
class VersionedObject {
    increment() {
        // Increment the revision number
        this.version.revision++;
    }
    constructor(){
        // Increment the global object ID counter
        idCounter++;
        // Create a version for this object
        this.version = new Version();
        // Set the unique object ID
        this.version.globalId = idCounter;
    }
}

/**
 * The scope for a variable.
 *
 * @category Graphics
 */ class ScopeId {
    // Don't stringify ScopeId to JSON by JSON.stringify, as this stores 'value'
    // which is not needed. This is used when stringifying a uniform buffer format, which
    // internally stores the scope.
    toJSON(key) {
        return undefined;
    }
    /**
     * Set variable value.
     *
     * @param {*} value - The value.
     */ setValue(value) {
        // Set the new value
        this.value = value;
        // Increment the revision
        this.versionObject.increment();
    }
    /**
     * Get variable value.
     *
     * @returns {*} The value.
     */ getValue() {
        return this.value;
    }
    /**
     * Create a new ScopeId instance.
     *
     * @param {string} name - The variable name.
     */ constructor(name){
        /**
         * The variable name.
         *
         * @type {string}
         */ this.name = name;
        // Set the default value
        this.value = null;
        // Create the version object
        this.versionObject = new VersionedObject();
    }
}

/**
 * The scope for variables.
 *
 * @category Graphics
 */ class ScopeSpace {
    /**
     * Get (or create, if it doesn't already exist) a variable in the scope.
     *
     * @param {string} name - The variable name.
     * @returns {ScopeId} The variable instance.
     */ resolve(name) {
        // add new ScopeId if it does not exist yet
        if (!this.variables.has(name)) {
            this.variables.set(name, new ScopeId(name));
        }
        // return the ScopeId instance
        return this.variables.get(name);
    }
    /**
     * Clears value for any uniform with matching value (used to remove deleted textures).
     *
     * @param {*} value - The value to clear.
     * @ignore
     */ removeValue(value) {
        for (const uniform of this.variables.values()){
            if (uniform.value === value) {
                uniform.value = null;
            }
        }
    }
    /**
     * Create a new ScopeSpace instance.
     *
     * @param {string} name - The scope name.
     */ constructor(name){
        /**
         * The scope name.
         *
         * @type {string}
         */ this.name = name;
        // Create map which maps a uniform name into ScopeId
        this.variables = new Map();
    }
}

/**
 * @import { GraphicsDevice } from './graphics-device.js'
 * @import { VertexFormat } from './vertex-format.js'
 */ let id$4 = 0;
/**
 * A vertex buffer is the mechanism via which the application specifies vertex data to the graphics
 * hardware.
 *
 * @category Graphics
 */ class VertexBuffer {
    /**
     * Frees resources associated with this vertex buffer.
     */ destroy() {
        // stop tracking the vertex buffer
        const device = this.device;
        device.buffers.delete(this);
        if (this.impl.initialized) {
            this.impl.destroy(device);
            this.adjustVramSizeTracking(device._vram, -this.storage.byteLength);
        }
    }
    adjustVramSizeTracking(vram, size) {
        Debug.trace(TRACEID_VRAM_VB, `${this.id} size: ${size} vram.vb: ${vram.vb} => ${vram.vb + size}`);
        vram.vb += size;
    }
    /**
     * Called when the rendering context was lost. It releases all context related resources.
     *
     * @ignore
     */ loseContext() {
        this.impl.loseContext();
    }
    /**
     * Returns the data format of the specified vertex buffer.
     *
     * @returns {VertexFormat} The data format of the specified vertex buffer.
     */ getFormat() {
        return this.format;
    }
    /**
     * Returns the usage type of the specified vertex buffer. This indicates whether the buffer can
     * be modified once and used many times {@link BUFFER_STATIC}, modified repeatedly and used
     * many times {@link BUFFER_DYNAMIC} or modified once and used at most a few times
     * {@link BUFFER_STREAM}.
     *
     * @returns {number} The usage type of the vertex buffer (see BUFFER_*).
     */ getUsage() {
        return this.usage;
    }
    /**
     * Returns the number of vertices stored in the specified vertex buffer.
     *
     * @returns {number} The number of vertices stored in the vertex buffer.
     */ getNumVertices() {
        return this.numVertices;
    }
    /**
     * Returns a mapped memory block representing the content of the vertex buffer.
     *
     * @returns {ArrayBuffer} An array containing the byte data stored in the vertex buffer.
     */ lock() {
        return this.storage;
    }
    /**
     * Notifies the graphics engine that the client side copy of the vertex buffer's memory can be
     * returned to the control of the graphics driver.
     */ unlock() {
        // Upload the new vertex data
        this.impl.unlock(this);
    }
    /**
     * Copies data into vertex buffer's memory.
     *
     * @param {ArrayBuffer} [data] - Source data to copy.
     * @returns {boolean} True if function finished successfully, false otherwise.
     */ setData(data) {
        if (data.byteLength !== this.numBytes) {
            Debug.error(`VertexBuffer: wrong initial data size: expected ${this.numBytes}, got ${data.byteLength}`);
            return false;
        }
        this.storage = data;
        this.unlock();
        return true;
    }
    /**
     * Create a new VertexBuffer instance.
     *
     * @param {GraphicsDevice} graphicsDevice - The graphics device used to manage this vertex
     * buffer.
     * @param {VertexFormat} format - The vertex format of this vertex buffer.
     * @param {number} numVertices - The number of vertices that this vertex buffer will hold.
     * @param {object} [options] - Object for passing optional arguments.
     * @param {number} [options.usage] - The usage type of the vertex buffer (see BUFFER_*).
     * Defaults to BUFFER_STATIC.
     * @param {ArrayBuffer} [options.data] - Initial data.
     * @param {boolean} [options.storage] - Defines if the vertex buffer can be used as a storage
     * buffer by a compute shader. Defaults to false. Only supported on WebGPU.
     */ constructor(graphicsDevice, format, numVertices, options){
        this.usage = BUFFER_STATIC;
        Debug.assert(arguments.length <= 4 && (!options || typeof options === 'object'), 'incorrect arguments');
        // By default, vertex buffers are static (better for performance since buffer data can be cached in VRAM)
        this.usage = options?.usage ?? BUFFER_STATIC;
        this.device = graphicsDevice;
        this.format = format;
        this.numVertices = numVertices;
        this.id = id$4++;
        this.impl = graphicsDevice.createVertexBufferImpl(this, format, options);
        // Calculate the size. If format contains verticesByteSize (non-interleaved format), use it
        this.numBytes = format.verticesByteSize ? format.verticesByteSize : format.size * numVertices;
        this.adjustVramSizeTracking(graphicsDevice._vram, this.numBytes);
        // Allocate the storage
        const initialData = options?.data;
        if (initialData) {
            this.setData(initialData);
        } else {
            this.storage = new ArrayBuffer(this.numBytes);
        }
        this.device.buffers.add(this);
    }
}

/**
 * Calculates simple hash value of a string. Designed for performance, not perfect.
 *
 * @param {string} str - String.
 * @returns {number} Hash value.
 */ function hashCode(str) {
    if (str === null || str === undefined) {
        return 0;
    }
    let hash = 0;
    for(let i = 0, len = str.length; i < len; i++){
        hash = (hash << 5) - hash + str.charCodeAt(i);
        // Convert to 32bit integer
        hash |= 0;
    }
    return hash;
}
/**
 * Calculates simple 32bit hash value of an array of 32bit integer numbers. Designed for
 * performance, but provides good distribution with small number of collisions. Based on
 * FNV-1a non-cryptographic hash function.
 *.
 * @param {number[]|Uint32Array} array - Array of 32bit integer numbers to hash.
 * @returns {number} 32bit unsigned integer hash value.
 */ function hash32Fnv1a(array) {
    const prime = 16777619;
    let hash = 2166136261;
    for(let i = 0; i < array.length; i++){
        hash ^= array[i];
        hash *= prime;
    }
    return hash >>> 0; // Ensure non-negative integer
}

/**
 * @import { GraphicsDevice } from './graphics-device.js'
 */ const stringIds$3 = new StringIds();
const webgpuValidElementSizes = [
    2,
    4,
    8,
    12,
    16
];
// device cache storing the default instancing format per device
const deviceCache = new DeviceCache();
/**
 * A vertex format is a descriptor that defines the layout of vertex data inside a
 * {@link VertexBuffer}.
 *
 * @property {object[]} elements The vertex attribute elements.
 * @property {string} elements[].name The meaning of the vertex element. This is used to link the
 * vertex data to a shader input. Can be:
 *
 * - {@link SEMANTIC_POSITION}
 * - {@link SEMANTIC_NORMAL}
 * - {@link SEMANTIC_TANGENT}
 * - {@link SEMANTIC_BLENDWEIGHT}
 * - {@link SEMANTIC_BLENDINDICES}
 * - {@link SEMANTIC_COLOR}
 * - {@link SEMANTIC_TEXCOORD0}
 * - {@link SEMANTIC_TEXCOORD1}
 * - {@link SEMANTIC_TEXCOORD2}
 * - {@link SEMANTIC_TEXCOORD3}
 * - {@link SEMANTIC_TEXCOORD4}
 * - {@link SEMANTIC_TEXCOORD5}
 * - {@link SEMANTIC_TEXCOORD6}
 * - {@link SEMANTIC_TEXCOORD7}
 *
 * If vertex data has a meaning other that one of those listed above, use the user-defined
 * semantics: {@link SEMANTIC_ATTR0} to {@link SEMANTIC_ATTR15}.
 * @property {number} elements[].numComponents The number of components of the vertex attribute.
 * Can be 1, 2, 3 or 4.
 * @property {number} elements[].dataType The data type of the attribute. Can be:
 *
 * - {@link TYPE_INT8}
 * - {@link TYPE_UINT8}
 * - {@link TYPE_INT16}
 * - {@link TYPE_UINT16}
 * - {@link TYPE_INT32}
 * - {@link TYPE_UINT32}
 * - {@link TYPE_FLOAT32}
 * - {@link TYPE_FLOAT16}
 * @property {boolean} elements[].normalize If true, vertex attribute data will be mapped from a 0
 * to 255 range down to 0 to 1 when fed to a shader. If false, vertex attribute data is left
 * unchanged. If this property is unspecified, false is assumed.
 * @property {number} elements[].offset The number of initial bytes at the start of a vertex that
 * are not relevant to this attribute.
 * @property {number} elements[].stride The number of total bytes that are between the start of one
 * vertex, and the start of the next.
 * @property {number} elements[].size The size of the attribute in bytes.
 * @category Graphics
 */ class VertexFormat {
    get elements() {
        return this._elements;
    }
    /**
     * The {@link VertexFormat} used to store matrices of type {@link Mat4} for hardware instancing.
     *
     * @param {GraphicsDevice} graphicsDevice - The graphics device used to create this vertex
     * format.
     * @returns {VertexFormat} The default instancing vertex format.
     */ static getDefaultInstancingFormat(graphicsDevice) {
        // get it from the device cache, or create a new one if not cached yet
        return deviceCache.get(graphicsDevice, ()=>{
            return new VertexFormat(graphicsDevice, [
                {
                    semantic: SEMANTIC_ATTR11,
                    components: 4,
                    type: TYPE_FLOAT32
                },
                {
                    semantic: SEMANTIC_ATTR12,
                    components: 4,
                    type: TYPE_FLOAT32
                },
                {
                    semantic: SEMANTIC_ATTR14,
                    components: 4,
                    type: TYPE_FLOAT32
                },
                {
                    semantic: SEMANTIC_ATTR15,
                    components: 4,
                    type: TYPE_FLOAT32
                }
            ]);
        });
    }
    static isElementValid(graphicsDevice, elementDesc) {
        const elementSize = elementDesc.components * typedArrayTypesByteSize[elementDesc.type];
        if (graphicsDevice.isWebGPU && !webgpuValidElementSizes.includes(elementSize)) {
            return false;
        }
        return true;
    }
    /**
     * Applies any changes made to the VertexFormat's properties.
     *
     * @private
     */ update() {
        // Note that this is used only by vertex attribute morphing on the WebGL.
        Debug.assert(!this.device.isWebGPU, 'VertexFormat#update is not supported on WebGPU and VertexFormat cannot be modified.');
        this._evaluateHash();
    }
    /**
     * Evaluates hash values for the format allowing fast compare of batching / rendering compatibility.
     *
     * @private
     */ _evaluateHash() {
        const stringElementsBatch = [];
        const stringElementsRender = [];
        const len = this._elements.length;
        for(let i = 0; i < len; i++){
            const { name, dataType, numComponents, normalize, offset, stride, size, asInt } = this._elements[i];
            // create string description of each element that is relevant for batching
            const stringElementBatch = name + dataType + numComponents + normalize + asInt;
            stringElementsBatch.push(stringElementBatch);
            // create string description of each element that is relevant for rendering
            const stringElementRender = stringElementBatch + offset + stride + size;
            stringElementsRender.push(stringElementRender);
        }
        // sort batching ones alphabetically to make the hash order independent
        stringElementsBatch.sort();
        const batchingString = stringElementsBatch.join();
        this.batchingHash = hashCode(batchingString);
        // shader processing hash - all elements that are used by the ShaderProcessor processing attributes
        // at the moment this matches the batching hash
        this.shaderProcessingHashString = batchingString;
        // rendering hash
        this.renderingHashString = stringElementsRender.join('_');
        this.renderingHash = stringIds$3.get(this.renderingHashString);
    }
    /**
     * @typedef {object} AttributeDescription
     * @property {string} semantic - The meaning of the vertex element. This is used to
     * link the vertex data to a shader input. Can be:
     *
     * - {@link SEMANTIC_POSITION}
     * - {@link SEMANTIC_NORMAL}
     * - {@link SEMANTIC_TANGENT}
     * - {@link SEMANTIC_BLENDWEIGHT}
     * - {@link SEMANTIC_BLENDINDICES}
     * - {@link SEMANTIC_COLOR}
     * - {@link SEMANTIC_TEXCOORD0}
     * - {@link SEMANTIC_TEXCOORD1}
     * - {@link SEMANTIC_TEXCOORD2}
     * - {@link SEMANTIC_TEXCOORD3}
     * - {@link SEMANTIC_TEXCOORD4}
     * - {@link SEMANTIC_TEXCOORD5}
     * - {@link SEMANTIC_TEXCOORD6}
     * - {@link SEMANTIC_TEXCOORD7}
     *
     * If vertex data has a meaning other that one of those listed above, use the user-defined
     * semantics: {@link SEMANTIC_ATTR0} to {@link SEMANTIC_ATTR15}.
     * @property {number} components - The number of components of the vertex attribute.
     * Can be 1, 2, 3 or 4.
     * @property {number} type - The data type of the attribute. Can be:
     *
     * - {@link TYPE_INT8}
     * - {@link TYPE_UINT8}
     * - {@link TYPE_INT16}
     * - {@link TYPE_UINT16}
     * - {@link TYPE_INT32}
     * - {@link TYPE_UINT32}
     * - {@link TYPE_FLOAT16}
     * - {@link TYPE_FLOAT32}
     *
     * @property {boolean} [normalize] - If true, vertex attribute data will be mapped
     * from a 0 to 255 range down to 0 to 1 when fed to a shader. If false, vertex attribute data
     * is left unchanged. If this property is unspecified, false is assumed. This property is
     * ignored when asInt is true.
     * @property {boolean} [asInt] - If true, vertex attribute data will be accessible
     * as integer numbers in shader code. Defaults to false, which means that vertex attribute data
     * will be accessible as floating point numbers. Can be only used with INT and UINT data types.
     */ /**
     * Create a new VertexFormat instance.
     *
     * @param {GraphicsDevice} graphicsDevice - The graphics device used to manage this vertex
     * format.
     * @param {AttributeDescription[]} description - An array of vertex attribute descriptions.
     * @param {number} [vertexCount] - When specified, vertex format will be set up for
     * non-interleaved format with a specified number of vertices. (example: PPPPNNNNCCCC), where
     * arrays of individual attributes will be stored one right after the other (subject to
     * alignment requirements). Note that in this case, the format depends on the number of
     * vertices, and needs to change when the number of vertices changes. When not specified,
     * vertex format will be interleaved. (example: PNCPNCPNCPNC).
     * @example
     * // Specify 3-component positions (x, y, z)
     * const vertexFormat = new pc.VertexFormat(graphicsDevice, [
     *     { semantic: pc.SEMANTIC_POSITION, components: 3, type: pc.TYPE_FLOAT32 }
     * ]);
     * @example
     * // Specify 2-component positions (x, y), a texture coordinate (u, v) and a vertex color (r, g, b, a)
     * const vertexFormat = new pc.VertexFormat(graphicsDevice, [
     *     { semantic: pc.SEMANTIC_POSITION, components: 2, type: pc.TYPE_FLOAT32 },
     *     { semantic: pc.SEMANTIC_TEXCOORD0, components: 2, type: pc.TYPE_FLOAT32 },
     *     { semantic: pc.SEMANTIC_COLOR, components: 4, type: pc.TYPE_UINT8, normalize: true }
     * ]);
     */ constructor(graphicsDevice, description, vertexCount){
        this.device = graphicsDevice;
        this._elements = [];
        this.hasUv0 = false;
        this.hasUv1 = false;
        this.hasColor = false;
        this.hasTangents = false;
        this.verticesByteSize = 0;
        this.vertexCount = vertexCount;
        this.interleaved = vertexCount === undefined;
        // true if the vertex format represents an instancing vertex buffer
        this.instancing = false;
        // calculate total size of the vertex
        this.size = description.reduce((total, desc)=>{
            return total + Math.ceil(desc.components * typedArrayTypesByteSize[desc.type] / 4) * 4;
        }, 0);
        let offset = 0, elementSize;
        for(let i = 0, len = description.length; i < len; i++){
            const elementDesc = description[i];
            elementSize = elementDesc.components * typedArrayTypesByteSize[elementDesc.type];
            // WebGPU has limited element size support (for example uint16x3 is not supported)
            Debug.assert(VertexFormat.isElementValid(graphicsDevice, elementDesc), `WebGPU does not support the format of vertex element ${elementDesc.semantic} : ${vertexTypesNames[elementDesc.type]} x ${elementDesc.components}`);
            // align up the offset to elementSize (when vertexCount is specified only - case of non-interleaved format)
            if (vertexCount) {
                offset = math.roundUp(offset, elementSize);
                // non-interleaved format with elementSize not multiple of 4 might be slower on some platforms - padding is recommended to align its size
                // example: use 4 x TYPE_UINT8 instead of 3 x TYPE_UINT8
                Debug.assert(elementSize % 4 === 0, `Non-interleaved vertex format with element size not multiple of 4 can have performance impact on some platforms. Element size: ${elementSize}`);
            }
            const asInt = elementDesc.asInt ?? false;
            const normalize = asInt ? false : elementDesc.normalize ?? false;
            const element = {
                name: elementDesc.semantic,
                offset: vertexCount ? offset : elementDesc.hasOwnProperty('offset') ? elementDesc.offset : offset,
                stride: vertexCount ? elementSize : elementDesc.hasOwnProperty('stride') ? elementDesc.stride : this.size,
                dataType: elementDesc.type,
                numComponents: elementDesc.components,
                normalize: normalize,
                size: elementSize,
                asInt: asInt
            };
            this._elements.push(element);
            if (vertexCount) {
                offset += elementSize * vertexCount;
            } else {
                offset += Math.ceil(elementSize / 4) * 4;
            }
            if (elementDesc.semantic === SEMANTIC_TEXCOORD0) {
                this.hasUv0 = true;
            } else if (elementDesc.semantic === SEMANTIC_TEXCOORD1) {
                this.hasUv1 = true;
            } else if (elementDesc.semantic === SEMANTIC_COLOR) {
                this.hasColor = true;
            } else if (elementDesc.semantic === SEMANTIC_TANGENT) {
                this.hasTangents = true;
            }
        }
        if (vertexCount) {
            this.verticesByteSize = offset;
        }
        this._evaluateHash();
    }
}

const stringIds$2 = new StringIds();
/**
 * Holds stencil test settings.
 *
 * @category Graphics
 */ class StencilParameters {
    /**
     * Sets the comparison function that decides if the pixel should be written, based on the
     * current stencil buffer value, reference value, and mask value. Can be:
     *
     * - {@link FUNC_NEVER}: never pass
     * - {@link FUNC_LESS}: pass if (ref & mask) < (stencil & mask)
     * - {@link FUNC_EQUAL}: pass if (ref & mask) == (stencil & mask)
     * - {@link FUNC_LESSEQUAL}: pass if (ref & mask) <= (stencil & mask)
     * - {@link FUNC_GREATER}: pass if (ref & mask) > (stencil & mask)
     * - {@link FUNC_NOTEQUAL}: pass if (ref & mask) != (stencil & mask)
     * - {@link FUNC_GREATEREQUAL}: pass if (ref & mask) >= (stencil & mask)
     * - {@link FUNC_ALWAYS}: always pass
     *
     * @type {number}
     */ set func(value) {
        this._func = value;
        this._dirty = true;
    }
    /**
     * Sets the comparison function that decides if the pixel should be written.
     *
     * @type {number}
     */ get func() {
        return this._func;
    }
    /**
     * Sets the stencil test reference value used in comparisons.
     *
     * @type {number}
     */ set ref(value) {
        this._ref = value;
        this._dirty = true;
    }
    /**
     * Gets the stencil test reference value used in comparisons.
     *
     * @type {number}
     */ get ref() {
        return this._ref;
    }
    /**
     * Sets the operation to perform if stencil test is failed. Can be:
     *
     * - {@link STENCILOP_KEEP}: don't change the stencil buffer value
     * - {@link STENCILOP_ZERO}: set value to zero
     * - {@link STENCILOP_REPLACE}: replace value with the reference value.
     * - {@link STENCILOP_INCREMENT}: increment the value
     * - {@link STENCILOP_INCREMENTWRAP}: increment the value, but wrap it to zero when it's larger
     * than a maximum representable value
     * - {@link STENCILOP_DECREMENT}: decrement the value
     * - {@link STENCILOP_DECREMENTWRAP}: decrement the value, but wrap it to a maximum
     * representable value, if the current value is 0
     * - {@link STENCILOP_INVERT}: invert the value bitwise
     *
     * @type {number}
     */ set fail(value) {
        this._fail = value;
        this._dirty = true;
    }
    /**
     * Gets the operation to perform if stencil test is failed.
     *
     * @type {number}
     */ get fail() {
        return this._fail;
    }
    /**
     * Sets the operation to perform if depth test is failed. Accepts the same values as `fail`.
     *
     * @type {number}
     */ set zfail(value) {
        this._zfail = value;
        this._dirty = true;
    }
    /**
     * Gets the operation to perform if depth test is failed.
     *
     * @type {number}
     */ get zfail() {
        return this._zfail;
    }
    /**
     * Sets the operation to perform if both stencil and depth test are passed. Accepts the same
     * values as `fail`.
     *
     * @type {number}
     */ set zpass(value) {
        this._zpass = value;
        this._dirty = true;
    }
    /**
     * Gets the operation to perform if both stencil and depth test are passed.
     *
     * @type {number}
     */ get zpass() {
        return this._zpass;
    }
    /**
     * Sets the mask applied to stencil buffer value and reference value before comparison.
     *
     * @type {number}
     */ set readMask(value) {
        this._readMask = value;
        this._dirty = true;
    }
    /**
     * Gets the mask applied to stencil buffer value and reference value before comparison.
     *
     * @type {number}
     */ get readMask() {
        return this._readMask;
    }
    /**
     * Sets the bit mask applied to the stencil value when written.
     *
     * @type {number}
     */ set writeMask(value) {
        this._writeMask = value;
        this._dirty = true;
    }
    /**
     * Gets the bit mask applied to the stencil value when written.
     *
     * @type {number}
     */ get writeMask() {
        return this._writeMask;
    }
    _evalKey() {
        const { _func, _ref, _fail, _zfail, _zpass, _readMask, _writeMask } = this;
        const key = `${_func},${_ref},${_fail},${_zfail},${_zpass},${_readMask},${_writeMask}`;
        this._key = stringIds$2.get(key);
        this._dirty = false;
    }
    get key() {
        if (this._dirty) {
            this._evalKey();
        }
        return this._key;
    }
    /**
     * Copies the contents of a source stencil parameters to this stencil parameters.
     *
     * @param {StencilParameters} rhs - A stencil parameters to copy from.
     * @returns {StencilParameters} Self for chaining.
     */ copy(rhs) {
        this._func = rhs._func;
        this._ref = rhs._ref;
        this._readMask = rhs._readMask;
        this._writeMask = rhs._writeMask;
        this._fail = rhs._fail;
        this._zfail = rhs._zfail;
        this._zpass = rhs._zpass;
        this._dirty = rhs._dirty;
        this._key = rhs._key;
        return this;
    }
    /**
     * Clone the stencil parameters.
     *
     * @returns {StencilParameters} A cloned StencilParameters object.
     */ clone() {
        const clone = new this.constructor();
        return clone.copy(this);
    }
    /**
     * Create a new StencilParameters instance.
     *
     * @param {object} [options] - Options object to configure the stencil parameters.
     */ constructor(options = {}){
        /**
     * @type {boolean}
     * @private
     */ this._dirty = true;
        this._func = options.func ?? FUNC_ALWAYS;
        this._ref = options.ref ?? 0;
        this._readMask = options.readMask ?? 0xFF;
        this._writeMask = options.writeMask ?? 0xFF;
        this._fail = options.fail ?? STENCILOP_KEEP; // keep == 0
        this._zfail = options.zfail ?? STENCILOP_KEEP;
        this._zpass = options.zpass ?? STENCILOP_KEEP;
        // Evaluate key here. This evaluates the key for the DEFAULT instance, which is important,
        // as during rendering it gets copied and the key would get evaluated each time.
        this._evalKey();
    }
}
/**
     * A default stencil state.
     *
     * @type {StencilParameters}
     * @readonly
     */ StencilParameters.DEFAULT = Object.freeze(new StencilParameters());

/**
 * @import { Compute } from './compute.js'
 * @import { DEVICETYPE_WEBGL2, DEVICETYPE_WEBGPU } from './constants.js'
 * @import { DynamicBuffers } from './dynamic-buffers.js'
 * @import { GpuProfiler } from './gpu-profiler.js'
 * @import { RenderTarget } from './render-target.js'
 * @import { Shader } from './shader.js'
 * @import { Texture } from './texture.js'
 * @import { StorageBuffer } from './storage-buffer.js';
 * @import { DrawCommands } from './draw-commands.js';
 */ const _tempSet = new Set();
/**
 * The graphics device manages the underlying graphics context. It is responsible for submitting
 * render state changes and graphics primitives to the hardware. A graphics device is tied to a
 * specific canvas HTML element. It is valid to have more than one canvas element per page and
 * create a new graphics device against each.
 *
 * @category Graphics
 */ class GraphicsDevice extends EventHandler {
    /**
     * Function that executes after the device has been created.
     */ postInit() {
        // create quad vertex buffer
        const vertexFormat = new VertexFormat(this, [
            {
                semantic: SEMANTIC_POSITION,
                components: 2,
                type: TYPE_FLOAT32
            }
        ]);
        const positions = new Float32Array([
            -1,
            -1,
            1,
            -1,
            -1,
            1,
            1,
            1
        ]);
        this.quadVertexBuffer = new VertexBuffer(this, vertexFormat, 4, {
            data: positions
        });
        // create quad index buffer for indexed triangle list (two triangles forming a quad)
        const indices = new Uint16Array([
            0,
            1,
            2,
            2,
            1,
            3
        ]);
        this.quadIndexBuffer = new IndexBuffer(this, INDEXFORMAT_UINT16, 6, BUFFER_STATIC, indices.buffer);
    }
    /**
     * Initialize the map of device capabilities, which are supplied to shaders as defines.
     *
     * @ignore
     */ initCapsDefines() {
        const { capsDefines } = this;
        capsDefines.clear();
        if (this.textureFloatFilterable) capsDefines.set('CAPS_TEXTURE_FLOAT_FILTERABLE', '');
        if (this.textureFloatRenderable) capsDefines.set('CAPS_TEXTURE_FLOAT_RENDERABLE', '');
        if (this.supportsMultiDraw) capsDefines.set('CAPS_MULTI_DRAW', '');
        if (this.supportsPrimitiveIndex) capsDefines.set('CAPS_PRIMITIVE_INDEX', '');
        if (this.supportsShaderF16) capsDefines.set('CAPS_SHADER_F16', '');
        // Platform defines
        if (platform.desktop) capsDefines.set('PLATFORM_DESKTOP', '');
        if (platform.mobile) capsDefines.set('PLATFORM_MOBILE', '');
        if (platform.android) capsDefines.set('PLATFORM_ANDROID', '');
        if (platform.ios) capsDefines.set('PLATFORM_IOS', '');
    }
    /**
     * Destroy the graphics device.
     */ destroy() {
        // fire the destroy event.
        // textures and other device resources may destroy themselves in response.
        this.fire('destroy');
        this.quadVertexBuffer?.destroy();
        this.quadVertexBuffer = null;
        this.quadIndexBuffer?.destroy();
        this.quadIndexBuffer = null;
        this.dynamicBuffers?.destroy();
        this.dynamicBuffers = null;
        this.gpuProfiler?.destroy();
        this.gpuProfiler = null;
        this._destroyed = true;
    }
    onDestroyShader(shader) {
        this.fire('destroy:shader', shader);
        const idx = this.shaders.indexOf(shader);
        if (idx !== -1) {
            this.shaders.splice(idx, 1);
        }
    }
    /**
     * Called when a texture is destroyed to remove it from internal tracking structures.
     *
     * @param {Texture} texture - The texture being destroyed.
     * @ignore
     */ onTextureDestroyed(texture) {
        this.textures.delete(texture);
        this.texturesToUpload.delete(texture);
        this.scope.removeValue(texture);
    }
    // executes after the extended classes have executed their destroy function
    postDestroy() {
        this.scope = null;
        this.canvas = null;
    }
    /**
     * Called when the device context was lost. It releases all context related resources.
     *
     * @ignore
     */ loseContext() {
        this.contextLost = true;
        // force the back-buffer to be recreated on restore
        this.backBufferSize.set(-1, -1);
        // release textures
        for (const texture of this.textures){
            texture.loseContext();
        }
        // release vertex and index buffers
        for (const buffer of this.buffers){
            buffer.loseContext();
        }
        // Reset all render targets so they'll be recreated as required.
        // TODO: a solution for the case where a render target contains something
        // that was previously generated that needs to be re-rendered.
        for (const target of this.targets){
            target.loseContext();
        }
        this.gpuProfiler?.loseContext();
    }
    /**
     * Called when the device context is restored. It reinitializes all context related resources.
     *
     * @ignore
     */ restoreContext() {
        this.contextLost = false;
        this.initializeRenderState();
        this.initializeContextCaches();
        // Recreate buffer objects and reupload buffer data to the GPU
        for (const buffer of this.buffers){
            buffer.unlock();
        }
        this.gpuProfiler?.restoreContext?.();
    }
    // don't stringify GraphicsDevice to JSON by JSON.stringify
    toJSON(key) {
        return undefined;
    }
    initializeContextCaches() {
        this.vertexBuffers = [];
        this.shader = null;
        this.shaderValid = undefined;
        this.shaderAsyncCompile = false;
        this.renderTarget = null;
    }
    initializeRenderState() {
        this.blendState = new BlendState();
        this.depthState = new DepthState();
        this.cullMode = CULLFACE_BACK;
        this.frontFace = FRONTFACE_CCW;
        // Cached viewport and scissor dimensions
        this.vx = this.vy = this.vw = this.vh = 0;
        this.sx = this.sy = this.sw = this.sh = 0;
        this.blendColor = new Color(0, 0, 0, 0);
    }
    /**
     * Sets the specified stencil state. If both stencilFront and stencilBack are null, stencil
     * operation is disabled.
     *
     * @param {StencilParameters} [stencilFront] - The front stencil parameters. Defaults to
     * {@link StencilParameters.DEFAULT} if not specified.
     * @param {StencilParameters} [stencilBack] - The back stencil parameters. Defaults to
     * {@link StencilParameters.DEFAULT} if not specified.
     */ setStencilState(stencilFront, stencilBack) {
        Debug.assert(false);
    }
    /**
     * Sets the specified blend state.
     *
     * @param {BlendState} blendState - New blend state.
     */ setBlendState(blendState) {
        Debug.assert(false);
    }
    /**
     * Sets the constant blend color and alpha values used with {@link BLENDMODE_CONSTANT} and
     * {@link BLENDMODE_ONE_MINUS_CONSTANT} factors specified in {@link BlendState}. Defaults to
     * [0, 0, 0, 0].
     *
     * @param {number} r - The value for red.
     * @param {number} g - The value for green.
     * @param {number} b - The value for blue.
     * @param {number} a - The value for alpha.
     */ setBlendColor(r, g, b, a) {
        Debug.assert(false);
    }
    /**
     * Sets the specified depth state.
     *
     * @param {DepthState} depthState - New depth state.
     */ setDepthState(depthState) {
        Debug.assert(false);
    }
    /**
     * Controls how triangles are culled based on their face direction. The default cull mode is
     * {@link CULLFACE_BACK}.
     *
     * @param {number} cullMode - The cull mode to set. Can be:
     *
     * - {@link CULLFACE_NONE}
     * - {@link CULLFACE_BACK}
     * - {@link CULLFACE_FRONT}
     */ setCullMode(cullMode) {
        Debug.assert(false);
    }
    /**
     * Controls whether polygons are front- or back-facing by setting a winding
     * orientation. The default frontFace is {@link FRONTFACE_CCW}.
     *
     * @param {number} frontFace - The front face to set. Can be:
     *
     * - {@link FRONTFACE_CW}
     * - {@link FRONTFACE_CCW}
     */ setFrontFace(frontFace) {
        Debug.assert(false);
    }
    /**
     * Sets all draw-related render states in a single call. All parameters have sensible defaults
     * for utility rendering (full-screen quads, particles, etc.), so calling `setDrawStates()` with
     * no arguments resets to a safe baseline.
     *
     * @param {BlendState} [blendState] - Blend state. Defaults to {@link BlendState.NOBLEND}.
     * @param {DepthState} [depthState] - Depth state. Defaults to {@link DepthState.NODEPTH}.
     * @param {number} [cullMode] - Cull mode. Defaults to {@link CULLFACE_NONE}.
     * @param {number} [frontFace] - Front face winding. Defaults to {@link FRONTFACE_CCW}.
     * @param {StencilParameters} [stencilFront] - Front stencil parameters.
     * @param {StencilParameters} [stencilBack] - Back stencil parameters.
     */ setDrawStates(blendState = BlendState.NOBLEND, depthState = DepthState.NODEPTH, cullMode = CULLFACE_NONE, frontFace = FRONTFACE_CCW, stencilFront, stencilBack) {
        this.setBlendState(blendState);
        this.setDepthState(depthState);
        this.setCullMode(cullMode);
        this.setFrontFace(frontFace);
        this.setStencilState(stencilFront, stencilBack);
    }
    /**
     * Sets the specified render target on the device. If null is passed as a parameter, the back
     * buffer becomes the current target for all rendering operations.
     *
     * @param {RenderTarget|null} renderTarget - The render target to activate.
     * @example
     * // Set a render target to receive all rendering output
     * device.setRenderTarget(renderTarget);
     *
     * // Set the back buffer to receive all rendering output
     * device.setRenderTarget(null);
     */ setRenderTarget(renderTarget) {
        this.renderTarget = renderTarget;
    }
    /**
     * Sets the current vertex buffer on the graphics device. For subsequent draw calls, the
     * specified vertex buffer(s) will be used to provide vertex data for any primitives.
     *
     * @param {VertexBuffer} vertexBuffer - The vertex buffer to assign to the device.
     * @ignore
     */ setVertexBuffer(vertexBuffer) {
        if (vertexBuffer) {
            this.vertexBuffers.push(vertexBuffer);
        }
    }
    /**
     * Clears the vertex buffer set on the graphics device. This is called automatically by the
     * renderer.
     * @ignore
     */ clearVertexBuffer() {
        this.vertexBuffers.length = 0;
    }
    /**
     * Retrieves the first available slot in the {@link indirectDrawBuffer} used for indirect
     * rendering, which can be utilized by a {@link Compute} shader to generate indirect draw
     * parameters and by {@link MeshInstance#setIndirect} to configure indirect draw calls.
     *
     * When reserving multiple consecutive slots, specify the optional `count` parameter.
     *
     * @param {number} [count] - Number of consecutive slots to reserve. Defaults to 1.
     * @returns {number} - The first reserved slot index used for indirect rendering.
     */ getIndirectDrawSlot(count = 1) {
        return 0;
    }
    /**
     * Returns the buffer used to store arguments for indirect draw calls. The size of the buffer is
     * controlled by the {@link maxIndirectDrawCount} property. This buffer can be passed to a
     * {@link Compute} shader along with a slot obtained by calling {@link getIndirectDrawSlot}, in
     * order to prepare indirect draw parameters. Also see {@link MeshInstance#setIndirect}.
     *
     * Only available on WebGPU, returns null on other platforms.
     *
     * @type {StorageBuffer|null}
     */ get indirectDrawBuffer() {
        return null;
    }
    /**
     * Retrieves the first available slot in the {@link indirectDispatchBuffer} used for indirect
     * compute dispatch, which can be utilized by a {@link Compute} shader to generate indirect
     * dispatch parameters for another compute shader.
     *
     * When reserving multiple consecutive slots, specify the optional `count` parameter.
     *
     * @param {number} [count] - Number of consecutive slots to reserve. Defaults to 1.
     * @returns {number} - The first reserved slot index used for indirect dispatch.
     */ getIndirectDispatchSlot(count = 1) {
        return 0;
    }
    /**
     * Returns the buffer used to store arguments for indirect compute dispatch calls. The size of
     * the buffer is controlled by the {@link maxIndirectDispatchCount} property. This buffer can
     * be passed to a {@link Compute} shader along with a slot obtained by calling
     * {@link getIndirectDispatchSlot}, in order to prepare indirect dispatch parameters.
     *
     * Only available on WebGPU, returns null on other platforms.
     *
     * @type {StorageBuffer|null}
     */ get indirectDispatchBuffer() {
        return null;
    }
    /**
     * Queries the currently set render target on the device.
     *
     * @returns {RenderTarget} The current render target.
     * @example
     * // Get the current render target
     * const renderTarget = device.getRenderTarget();
     */ getRenderTarget() {
        return this.renderTarget;
    }
    /**
     * Initialize render target before it can be used.
     *
     * @param {RenderTarget} target - The render target to be initialized.
     * @ignore
     */ initRenderTarget(target) {
        if (target.initialized) return;
        const startTime = now();
        this.fire('fbo:create', {
            timestamp: startTime,
            target: this
        });
        target.init();
        this.targets.add(target);
        this._renderTargetCreationTime += now() - startTime;
    }
    /**
     * Submits a graphical primitive to the hardware for immediate rendering.
     *
     * @param {object} primitive - Primitive object describing how to submit current vertex/index
     * buffers.
     * @param {number} primitive.type - The type of primitive to render. Can be:
     *
     * - {@link PRIMITIVE_POINTS}
     * - {@link PRIMITIVE_LINES}
     * - {@link PRIMITIVE_LINELOOP}
     * - {@link PRIMITIVE_LINESTRIP}
     * - {@link PRIMITIVE_TRIANGLES}
     * - {@link PRIMITIVE_TRISTRIP}
     * - {@link PRIMITIVE_TRIFAN}
     *
     * @param {number} primitive.base - The offset of the first index or vertex to dispatch in the
     * draw call.
     * @param {number} primitive.count - The number of indices or vertices to dispatch in the draw
     * call.
     * @param {boolean} [primitive.indexed] - True to interpret the primitive as indexed, thereby
     * using the currently set index buffer and false otherwise.
     * @param {IndexBuffer} [indexBuffer] - The index buffer to use for the draw call.
     * @param {number} [numInstances] - The number of instances to render when using instancing.
     * Defaults to 1.
     * @param {DrawCommands} [drawCommands] - The draw commands to use for the draw call.
     * @param {boolean} [first] - True if this is the first draw call in a sequence of draw calls.
     * When set to true, vertex and index buffers related state is set up. Defaults to true.
     * @param {boolean} [last] - True if this is the last draw call in a sequence of draw calls.
     * When set to true, vertex and index buffers related state is cleared. Defaults to true.
     * @example
     * // Render a single, unindexed triangle
     * device.draw({
     *     type: pc.PRIMITIVE_TRIANGLES,
     *     base: 0,
     *     count: 3,
     *     indexed: false
     * });
     *
     * @ignore
     */ draw(primitive, indexBuffer, numInstances, drawCommands, first = true, last = true) {
        Debug.assert(false);
    }
    /**
     * Reports whether a texture source is a canvas, image, video or ImageBitmap.
     *
     * @param {*} texture - Texture source data.
     * @returns {boolean} True if the texture is a canvas, image, video or ImageBitmap and false
     * otherwise.
     * @ignore
     */ _isBrowserInterface(texture) {
        return this._isImageBrowserInterface(texture) || this._isImageCanvasInterface(texture) || this._isImageVideoInterface(texture);
    }
    _isImageBrowserInterface(texture) {
        return typeof ImageBitmap !== 'undefined' && texture instanceof ImageBitmap || typeof HTMLImageElement !== 'undefined' && texture instanceof HTMLImageElement;
    }
    _isImageCanvasInterface(texture) {
        return typeof HTMLCanvasElement !== 'undefined' && texture instanceof HTMLCanvasElement;
    }
    _isImageVideoInterface(texture) {
        return typeof HTMLVideoElement !== 'undefined' && texture instanceof HTMLVideoElement;
    }
    /**
     * Sets the width and height of the canvas, then fires the `resizecanvas` event. Note that the
     * specified width and height values will be multiplied by the value of
     * {@link GraphicsDevice#maxPixelRatio} to give the final resultant width and height for the
     * canvas.
     *
     * @param {number} width - The new width of the canvas.
     * @param {number} height - The new height of the canvas.
     * @ignore
     */ resizeCanvas(width, height) {
        const pixelRatio = Math.min(this._maxPixelRatio, platform.browser ? window.devicePixelRatio : 1);
        const w = Math.floor(width * pixelRatio);
        const h = Math.floor(height * pixelRatio);
        if (w !== this.canvas.width || h !== this.canvas.height) {
            this.setResolution(w, h);
        }
    }
    /**
     * Sets the width and height of the canvas, then fires the `resizecanvas` event. Note that the
     * value of {@link GraphicsDevice#maxPixelRatio} is ignored.
     *
     * @param {number} width - The new width of the canvas.
     * @param {number} height - The new height of the canvas.
     * @ignore
     */ setResolution(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.fire(GraphicsDevice.EVENT_RESIZE, width, height);
    }
    update() {
        this.updateClientRect();
    }
    updateClientRect() {
        if (platform.worker) {
            // Web Workers don't do page layout, so getBoundingClientRect is not available
            this.clientRect.width = this.canvas.width;
            this.clientRect.height = this.canvas.height;
        } else {
            const rect = this.canvas.getBoundingClientRect();
            this.clientRect.width = rect.width;
            this.clientRect.height = rect.height;
        }
    }
    /**
     * Width of the back buffer in pixels.
     *
     * @type {number}
     */ get width() {
        return this.canvas.width;
    }
    /**
     * Height of the back buffer in pixels.
     *
     * @type {number}
     */ get height() {
        return this.canvas.height;
    }
    /**
     * Sets whether the device is currently in fullscreen mode.
     *
     * @type {boolean}
     */ set fullscreen(fullscreen) {
        Debug.error('GraphicsDevice.fullscreen is not implemented on current device.');
    }
    /**
     * Gets whether the device is currently in fullscreen mode.
     *
     * @type {boolean}
     */ get fullscreen() {
        Debug.error('GraphicsDevice.fullscreen is not implemented on current device.');
        return false;
    }
    /**
     * Sets the maximum pixel ratio.
     *
     * @type {number}
     */ set maxPixelRatio(ratio) {
        this._maxPixelRatio = ratio;
    }
    /**
     * Gets the maximum pixel ratio.
     *
     * @type {number}
     */ get maxPixelRatio() {
        return this._maxPixelRatio;
    }
    /**
     * Gets the type of the device. Can be:
     *
     * - {@link DEVICETYPE_WEBGL2}
     * - {@link DEVICETYPE_WEBGPU}
     *
     * @type {DEVICETYPE_WEBGL2|DEVICETYPE_WEBGPU}
     */ get deviceType() {
        return this._deviceType;
    }
    startRenderPass(renderPass) {}
    endRenderPass(renderPass) {}
    startComputePass(name) {}
    endComputePass() {}
    /**
     * Function which executes at the start of the frame. This should not be called manually, as
     * it is handled by the AppBase instance.
     *
     * @ignore
     */ frameStart() {
        this.renderPassIndex = 0;
        this.renderVersion++;
        Debug.call(()=>{
            // log out all loaded textures, sorted by gpu memory size
            if (Tracing.get(TRACEID_TEXTURES)) {
                const textures = [
                    ...this.textures
                ];
                textures.sort((a, b)=>b.gpuSize - a.gpuSize);
                Debug.log(`Textures: ${textures.length}`);
                let textureTotal = 0;
                textures.forEach((texture, index)=>{
                    const textureSize = texture.gpuSize;
                    textureTotal += textureSize;
                    Debug.log(`${index}. Id: ${texture.id} ${texture.name} ${texture.width}x${texture.height} VRAM: ${(textureSize / 1024 / 1024).toFixed(2)} MB`);
                });
                Debug.log(`Total: ${(textureTotal / 1024 / 1024).toFixed(2)}MB`);
            }
        });
    }
    /**
     * Function which executes at the end of the frame. This should not be called manually, as it is
     * handled by the AppBase instance.
     *
     * @ignore
     */ frameEnd() {
        // clear all maps scheduled for end of frame clearing
        this.mapsToClear.forEach((map)=>map.clear());
        this.mapsToClear.clear();
    }
    /**
     * Dispatch multiple compute shaders inside a single compute shader pass.
     *
     * @param {Array<Compute>} computes - An array of compute shaders to dispatch.
     * @param {string} [name] - The name of the dispatch, used for debugging and reporting only.
     */ computeDispatch(computes, name = 'Unnamed') {}
    /**
     * Get a renderable HDR pixel format supported by the graphics device.
     *
     * Note:
     *
     * - When the `filterable` parameter is set to false, this function returns one of the supported
     * formats on the majority of devices apart from some very old iOS and Android devices (99%).
     * - When the `filterable` parameter is set to true, the function returns a format on a
     * considerably lower number of devices (70%).
     *
     * @param {number[]} [formats] - An array of pixel formats to check for support. Can contain:
     *
     * - {@link PIXELFORMAT_111110F}
     * - {@link PIXELFORMAT_RGBA16F}
     * - {@link PIXELFORMAT_RGBA32F}
     *
     * @param {boolean} [filterable] - If true, the format also needs to be filterable. Defaults to
     * true.
     * @param {number} [samples] - The number of samples to check for. Some formats are not
     * compatible with multi-sampling, for example {@link PIXELFORMAT_RGBA32F} on WebGPU platform.
     * Defaults to 1.
     * @returns {number|undefined} The first supported renderable HDR format or undefined if none is
     * supported.
     */ getRenderableHdrFormat(formats = [
        PIXELFORMAT_111110F,
        PIXELFORMAT_RGBA16F,
        PIXELFORMAT_RGBA32F
    ], filterable = true, samples = 1) {
        for(let i = 0; i < formats.length; i++){
            const format = formats[i];
            switch(format){
                case PIXELFORMAT_111110F:
                    {
                        if (this.textureRG11B10Renderable) {
                            return format;
                        }
                        break;
                    }
                case PIXELFORMAT_RGBA16F:
                    if (this.textureHalfFloatRenderable) {
                        return format;
                    }
                    break;
                case PIXELFORMAT_RGBA32F:
                    // on WebGPU platform, RGBA32F is not compatible with multi-sampling
                    if (this.isWebGPU && samples > 1) {
                        continue;
                    }
                    if (this.textureFloatRenderable && (!filterable || this.textureFloatFilterable)) {
                        return format;
                    }
                    break;
            }
        }
        return undefined;
    }
    /**
     * Validate that all attributes required by the shader are present in the currently assigned
     * vertex buffers.
     *
     * @param {Shader} shader - The shader to validate.
     * @param {VertexFormat} vb0Format - The format of the first vertex buffer.
     * @param {VertexFormat} vb1Format - The format of the second vertex buffer.
     * @protected
     */ validateAttributes(shader, vb0Format, vb1Format) {
        Debug.call(()=>{
            // add all attribute locations from vertex formats to the set
            _tempSet.clear();
            vb0Format?.elements.forEach((element)=>_tempSet.add(semanticToLocation[element.name]));
            vb1Format?.elements.forEach((element)=>_tempSet.add(semanticToLocation[element.name]));
            // every location shader needs must be in the vertex buffer
            for (const [location, name] of shader.attributes){
                if (!_tempSet.has(location)) {
                    Debug.errorOnce(`Vertex attribute [${name}] at location ${location} required by the shader is not present in the currently assigned vertex buffers, while rendering [${DebugGraphics.toString()}]`, {
                        shader,
                        vb0Format,
                        vb1Format
                    });
                }
            }
        });
    }
    constructor(canvas, options){
        var _this_initOptions, _this_initOptions1, _this_initOptions2, _this_initOptions3, _this_initOptions4, _this_initOptions5;
        super(), /**
     * The render target representing the main back-buffer.
     *
     * @type {RenderTarget|null}
     * @ignore
     */ this.backBuffer = null, /**
     * The dimensions of the back buffer.
     *
     * @ignore
     */ this.backBufferSize = new Vec2(), /**
     * True if the back buffer should use anti-aliasing.
     *
     * @type {boolean}
     */ this.backBufferAntialias = false, /**
     * True if the deviceType is WebGPU
     *
     * @type {boolean}
     * @readonly
     */ this.isWebGPU = false, /**
     * True if the deviceType is WebGL2
     *
     * @type {boolean}
     * @readonly
     */ this.isWebGL2 = false, /**
     * True if the deviceType is Null
     *
     * @type {boolean}
     * @readonly
     */ this.isNull = false, /**
     * True if the back-buffer is using HDR format, which means that the browser will display the
     * rendered images in high dynamic range mode. This is true if the options.displayFormat is set
     * to {@link DISPLAYFORMAT_HDR} when creating the graphics device using
     * {@link createGraphicsDevice}, and HDR is supported by the device.
     */ this.isHdr = false, /**
     * The maximum number of indirect draw calls that can be used within a single frame. Used on
     * WebGPU only. This needs to be adjusted based on the maximum number of draw calls that can
     * be used within a single frame. Defaults to 1024.
     *
     * @type {number}
     */ this.maxIndirectDrawCount = 1024, /**
     * The maximum number of indirect compute dispatches that can be used within a single frame.
     * Used on WebGPU only. Defaults to 256.
     *
     * @type {number}
     */ this.maxIndirectDispatchCount = 256, /**
     * The maximum supported number of color buffers attached to a render target.
     *
     * @type {number}
     * @readonly
     */ this.maxColorAttachments = 1, /**
     * The maximum supported number of hardware anti-aliasing samples.
     *
     * @readonly
     * @type {number}
     */ this.maxSamples = 1, /**
     * True if the device supports multi-draw. This is always supported on WebGPU, and support on
     * WebGL2 is optional, but pretty common.
     *
     * @type {boolean}
     */ this.supportsMultiDraw = true, /**
     * True if the device supports compute shaders.
     *
     * @readonly
     * @type {boolean}
     */ this.supportsCompute = false, /**
     * True if the device can read from StorageTexture in the compute shader. By default, the
     * storage texture can be only used with the write operation.
     * When a shader uses this feature, it's recommended to use a `requires` directive to signal the
     * potential for non-portability at the top of the WGSL shader code:
     * ```javascript
     * requires readonly_and_readwrite_storage_textures;
     * ```
     *
     * @readonly
     * @type {boolean}
     */ this.supportsStorageTextureRead = false, /**
     * True if the device supports the WGSL subgroup_uniformity extension, which allows
     * subgroup functionality to be considered uniform in more cases during shader compilation.
     * When a shader uses this feature, use an `enable` directive at the top of the WGSL shader:
     * ```wgsl
     * enable subgroups;
     * ```
     *
     * @readonly
     * @type {boolean}
     */ this.supportsSubgroupUniformity = false, /**
     * True if the device supports the WGSL subgroup_id extension, which provides access to
     * `subgroup_id` and `num_subgroups` built-in values in workgroups.
     * When a shader uses this feature, use a `requires` directive at the top of the WGSL shader:
     * ```wgsl
     * requires subgroup_id;
     * ```
     *
     * @readonly
     * @type {boolean}
     */ this.supportsSubgroupId = false, /**
     * Currently active render target.
     *
     * @type {RenderTarget|null}
     * @ignore
     */ this.renderTarget = null, /**
     * Array of objects that need to be re-initialized after a context restore event
     *
     * @type {Shader[]}
     * @ignore
     */ this.shaders = [], /**
     * A set of currently created textures.
     *
     * @type {Set<Texture>}
     * @ignore
     */ this.textures = new Set(), /**
     * A set of textures that need to be uploaded to the GPU.
     *
     * @type {Set<Texture>}
     * @ignore
     */ this.texturesToUpload = new Set(), /**
     * A set of currently created render targets.
     *
     * @type {Set<RenderTarget>}
     * @ignore
     */ this.targets = new Set(), /**
     * A version number that is incremented every frame. This is used to detect if some object were
     * invalidated.
     *
     * @type {number}
     * @ignore
     */ this.renderVersion = 0, /** @type {boolean} */ this.insideRenderPass = false, /**
     * True if the device supports uniform buffers.
     *
     * @type {boolean}
     * @ignore
     */ this.supportsUniformBuffers = false, /**
     * True if the device supports clip distances (WebGPU only). Clip distances allow you to restrict
     * primitives' clip volume with user-defined half-spaces in the output of vertex stage.
     *
     * @type {boolean}
     */ this.supportsClipDistances = false, /**
     * True if the device supports WebGPU texture format tier 1 capabilities. When enabled, a wider
     * set of normalized texture formats can be used as render targets and storage textures.
     *
     * @type {boolean}
     * @readonly
     */ this.supportsTextureFormatTier1 = false, /**
     * True if the device supports WebGPU texture format tier 2 capabilities. This extends tier 1
     * and enables read-write storage access for selected texture formats.
     *
     * @type {boolean}
     * @readonly
     */ this.supportsTextureFormatTier2 = false, /**
     * True if the device supports primitive index in fragment shaders (WebGPU only). When
     * supported, fragment shaders can access the `pcPrimitiveIndex` built-in variable which
     * uniquely identifies the current primitive being processed.
     *
     * @type {boolean}
     * @readonly
     */ this.supportsPrimitiveIndex = false, /**
     * True if the device supports 16-bit floating-point types in shaders (WebGPU only). When
     * supported, shaders can use native WGSL types: `f16`, `vec2h`, `vec3h`, `vec4h`, `mat2x2h`,
     * `mat3x3h`, `mat4x4h`. For convenience, PlayCanvas also provides type aliases (`half`,
     * `half2`, `half3`, `half4`, `half2x2`, `half3x3`, `half4x4`) that resolve to f16 types when
     * supported, or fall back to f32 types when not supported.
     *
     * @type {boolean}
     * @readonly
     */ this.supportsShaderF16 = false, /**
     * True if small-float textures with format {@link PIXELFORMAT_111110F} can be used as a frame
     * buffer. This is always true on WebGL2, but optional on WebGPU device.
     *
     * @type {boolean}
     * @readonly
     */ this.textureRG11B10Renderable = false, /**
     * True if filtering can be applied when sampling float textures.
     *
     * @type {boolean}
     * @readonly
     */ this.textureFloatFilterable = false, /**
     * An object representing current blend state
     *
     * @ignore
     */ this.blendState = new BlendState(), /**
     * The current depth state.
     *
     * @ignore
     */ this.depthState = new DepthState(), /**
     * True if stencil is enabled and stencilFront and stencilBack are used
     *
     * @ignore
     */ this.stencilEnabled = false, /**
     * The current front stencil parameters.
     *
     * @ignore
     */ this.stencilFront = new StencilParameters(), /**
     * The current back stencil parameters.
     *
     * @ignore
     */ this.stencilBack = new StencilParameters(), /**
     * @type {boolean}
     * @ignore
     */ this._destroyed = false, this.defaultClearOptions = {
            color: [
                0,
                0,
                0,
                1
            ],
            depth: 1,
            stencil: 0,
            flags: CLEARFLAG_COLOR | CLEARFLAG_DEPTH
        }, /**
     * The current client rect.
     *
     * @type {{ width: number, height: number }}
     * @ignore
     */ this.clientRect = {
            width: 0,
            height: 0
        }, /**
     * A very heavy handed way to force all shaders to be rebuilt. Avoid using as much as possible.
     *
     * @type {boolean}
     * @ignore
     */ this._shadersDirty = false, /**
     * A list of shader defines based on the capabilities of the device.
     *
     * @type {Map<string, string>}
     * @ignore
     */ this.capsDefines = new Map(), /**
     * A set of maps to clear at the end of the frame.
     *
     * @type {Set<Map>}
     * @ignore
     */ this.mapsToClear = new Set();
        this.canvas = canvas;
        if ('setAttribute' in canvas) {
            canvas.setAttribute('data-engine', `PlayCanvas ${version$1}`);
        }
        // copy options and handle defaults
        this.initOptions = {
            ...options
        };
        (_this_initOptions = this.initOptions).alpha ?? (_this_initOptions.alpha = true);
        (_this_initOptions1 = this.initOptions).depth ?? (_this_initOptions1.depth = true);
        (_this_initOptions2 = this.initOptions).stencil ?? (_this_initOptions2.stencil = true);
        (_this_initOptions3 = this.initOptions).antialias ?? (_this_initOptions3.antialias = true);
        (_this_initOptions4 = this.initOptions).powerPreference ?? (_this_initOptions4.powerPreference = 'high-performance');
        (_this_initOptions5 = this.initOptions).displayFormat ?? (_this_initOptions5.displayFormat = DISPLAYFORMAT_LDR);
        // Some devices window.devicePixelRatio can be less than one
        // eg Oculus Quest 1 which returns a window.devicePixelRatio of 0.8
        this._maxPixelRatio = platform.browser ? Math.min(1, window.devicePixelRatio) : 1;
        this.buffers = new Set();
        this._vram = {
            texShadow: 0,
            texAsset: 0,
            texLightmap: 0,
            tex: 0,
            vb: 0,
            ib: 0,
            ub: 0,
            sb: 0
        };
        this._shaderStats = {
            vsCompiled: 0,
            fsCompiled: 0,
            linked: 0,
            materialShaders: 0,
            compileTime: 0
        };
        this.initializeContextCaches();
        // Profiler stats
        this._drawCallsPerFrame = 0;
        this._shaderSwitchesPerFrame = 0;
        this._primsPerFrame = [];
        for(let i = PRIMITIVE_POINTS; i <= PRIMITIVE_TRIFAN; i++){
            this._primsPerFrame[i] = 0;
        }
        this._renderTargetCreationTime = 0;
        // Create the ScopeNamespace for shader attributes and variables
        this.scope = new ScopeSpace('Device');
        this.textureBias = this.scope.resolve('textureBias');
        this.textureBias.setValue(0.0);
    }
}
GraphicsDevice.EVENT_RESIZE = 'resizecanvas';

/**
 * @import { Texture } from './texture.js'
 */ let id$3 = 0;
/**
 * A render target is a rectangular rendering surface.
 *
 * @category Graphics
 */ class RenderTarget {
    /**
     * Frees resources associated with this render target.
     */ destroy() {
        Debug.trace(TRACEID_RENDER_TARGET_ALLOC, `DeAlloc: Id ${this.id} ${this.name}`);
        const device = this._device;
        if (device) {
            device.targets.delete(this);
            if (device.renderTarget === this) {
                device.setRenderTarget(null);
            }
            this.destroyFrameBuffers();
        }
    }
    /**
     * Free device resources associated with this render target.
     *
     * @ignore
     */ destroyFrameBuffers() {
        const device = this._device;
        if (device) {
            this.impl.destroy(device);
        }
    }
    /**
     * Free textures associated with this render target.
     *
     * @ignore
     */ destroyTextureBuffers() {
        this._depthBuffer?.destroy();
        this._depthBuffer = null;
        this._colorBuffers?.forEach((colorBuffer)=>{
            colorBuffer.destroy();
        });
        this._colorBuffers = null;
        this._colorBuffer = null;
    }
    /**
     * Resizes the render target to the specified width and height. Internally this resizes all the
     * assigned texture color and depth buffers.
     *
     * @param {number} width - The width of the render target in pixels.
     * @param {number} height - The height of the render target in pixels.
     */ resize(width, height) {
        if (this.mipLevel > 0) {
            Debug.warn('Only a render target rendering to mipLevel 0 can be resized, ignoring.', this);
            return;
        }
        // resize textures (they handle their own change detection)
        this._depthBuffer?.resize(width, height);
        this._colorBuffers?.forEach((colorBuffer)=>{
            colorBuffer.resize(width, height);
        });
        // only rebuild framebuffers if dimensions changed
        if (this._width !== width || this._height !== height) {
            // release existing
            this.destroyFrameBuffers();
            // disconnect from the device
            const device = this._device;
            if (device.renderTarget === this) {
                device.setRenderTarget(null);
            }
            // create new
            this.evaluateDimensions();
            this.validateMrt();
            this.impl = device.createRenderTargetImpl(this);
        }
    }
    validateMrt() {
        Debug.call(()=>{
            if (this._colorBuffers) {
                const { width, height, cubemap, volume } = this._colorBuffers[0];
                for(let i = 1; i < this._colorBuffers.length; i++){
                    const colorBuffer = this._colorBuffers[i];
                    Debug.assert(colorBuffer.width === width, 'All render target color buffers must have the same width', this);
                    Debug.assert(colorBuffer.height === height, 'All render target color buffers must have the same height', this);
                    Debug.assert(colorBuffer.cubemap === cubemap, 'All render target color buffers must have the same cubemap setting', this);
                    Debug.assert(colorBuffer.volume === volume, 'All render target color buffers must have the same volume setting', this);
                }
            }
        });
    }
    /**
     * Evaluates and stores the width and height of the render target based on the color/depth
     * buffers and mip level.
     *
     * @private
     */ evaluateDimensions() {
        // If we have buffers, calculate dimensions from them
        const buffer = this._colorBuffer ?? this._depthBuffer;
        if (buffer) {
            this._width = buffer.width;
            this._height = buffer.height;
            // Apply mip level adjustment
            if (this._mipLevel > 0) {
                this._width = TextureUtils.calcLevelDimension(this._width, this._mipLevel);
                this._height = TextureUtils.calcLevelDimension(this._height, this._mipLevel);
            }
        }
    }
    /**
     * Initializes the resources associated with this render target.
     *
     * @ignore
     */ init() {
        this.impl.init(this._device, this);
    }
    /** @ignore */ get initialized() {
        return this.impl.initialized;
    }
    /** @ignore */ get device() {
        return this._device;
    }
    /**
     * Called when the device context was lost. It releases all context related resources.
     *
     * @ignore
     */ loseContext() {
        this.impl.loseContext();
    }
    /**
     * If samples > 1, resolves the anti-aliased render target (WebGL2 only). When you're rendering
     * to an anti-aliased render target, pixels aren't written directly to the readable texture.
     * Instead, they're first written to a MSAA buffer, where each sample for each pixel is stored
     * independently. In order to read the results, you first need to 'resolve' the buffer - to
     * average all samples and create a simple texture with one color per pixel. This function
     * performs this averaging and updates the colorBuffer and the depthBuffer. If autoResolve is
     * set to true, the resolve will happen after every rendering to this render target, otherwise
     * you can do it manually, during the app update or similar.
     *
     * @param {boolean} [color] - Resolve color buffer. Defaults to true.
     * @param {boolean} [depth] - Resolve depth buffer. Defaults to true if the render target has a
     * depth buffer.
     */ resolve(color = true, depth = !!this._depthBuffer) {
        // TODO: consider adding support for MRT to this function.
        if (this._device && this._samples > 1) {
            DebugGraphics.pushGpuMarker(this._device, `RESOLVE-RT:${this.name}:${color ? '[color]' : ''}:${depth ? '[depth]' : ''}`);
            this.impl.resolve(this._device, this, color, depth);
            DebugGraphics.popGpuMarker(this._device);
        }
    }
    /**
     * Copies color and/or depth contents of source render target to this one. Formats, sizes and
     * anti-aliasing samples must match. Depth buffer can only be copied on WebGL 2.0.
     *
     * @param {RenderTarget} source - Source render target to copy from.
     * @param {boolean} [color] - If true, will copy the color buffer. Defaults to false.
     * @param {boolean} [depth] - If true, will copy the depth buffer. Defaults to false.
     * @returns {boolean} True if the copy was successful, false otherwise.
     */ copy(source, color, depth) {
        // TODO: consider adding support for MRT to this function.
        if (!this._device) {
            if (source._device) {
                this._device = source._device;
            } else {
                Debug.error('Render targets are not initialized');
                return false;
            }
        }
        DebugGraphics.pushGpuMarker(this._device, `COPY-RT:${source.name}->${this.name}`);
        const success = this._device.copyRenderTarget(source, this, color, depth);
        DebugGraphics.popGpuMarker(this._device);
        return success;
    }
    /**
     * Number of antialiasing samples the render target uses.
     *
     * @type {number}
     */ get samples() {
        return this._samples;
    }
    /**
     * True if the render target contains the depth attachment.
     *
     * @type {boolean}
     */ get depth() {
        return this._depth;
    }
    /**
     * True if the render target contains the stencil attachment.
     *
     * @type {boolean}
     */ get stencil() {
        return this._stencil;
    }
    /**
     * Color buffer set up on the render target.
     *
     * @type {Texture}
     */ get colorBuffer() {
        return this._colorBuffer;
    }
    /**
     * Accessor for multiple render target color buffers.
     *
     * @param {*} index - Index of the color buffer to get.
     * @returns {Texture} - Color buffer at the specified index.
     */ getColorBuffer(index) {
        return this._colorBuffers?.[index];
    }
    /**
     * Depth buffer set up on the render target. Only available, if depthBuffer was set in
     * constructor. Not available if depth property was used instead.
     *
     * @type {Texture}
     */ get depthBuffer() {
        return this._depthBuffer;
    }
    /**
     * If the render target is bound to a cubemap, this property specifies which face of the
     * cubemap is rendered to. Can be:
     *
     * - {@link CUBEFACE_POSX}
     * - {@link CUBEFACE_NEGX}
     * - {@link CUBEFACE_POSY}
     * - {@link CUBEFACE_NEGY}
     * - {@link CUBEFACE_POSZ}
     * - {@link CUBEFACE_NEGZ}
     *
     * @type {number}
     */ get face() {
        return this._face;
    }
    /**
     * Mip level of the render target.
     *
     * @type {number}
     */ get mipLevel() {
        return this._mipLevel;
    }
    /**
     * True if the mipmaps are automatically generated for the color buffer(s) if it contains
     * a mip chain.
     *
     * @type {boolean}
     */ get mipmaps() {
        return this._mipmaps;
    }
    /**
     * Width of the render target in pixels.
     *
     * @type {number}
     */ get width() {
        return this._width ?? this._device.width;
    }
    /**
     * Height of the render target in pixels.
     *
     * @type {number}
     */ get height() {
        return this._height ?? this._device.height;
    }
    /**
     * Gets whether the format of the specified color buffer is sRGB.
     *
     * @param {number} index - The index of the color buffer.
     * @returns {boolean} True if the color buffer is sRGB, false otherwise.
     * @ignore
     */ isColorBufferSrgb(index = 0) {
        if (this.device.backBuffer === this) {
            return isSrgbPixelFormat(this.device.backBufferFormat);
        }
        const colorBuffer = this.getColorBuffer(index);
        return colorBuffer ? isSrgbPixelFormat(colorBuffer.format) : false;
    }
    /**
     * Creates a new RenderTarget instance. A color buffer or a depth buffer must be set.
     *
     * @param {object} [options] - Object for passing optional arguments.
     * @param {boolean} [options.autoResolve] - If samples > 1, enables or disables automatic MSAA
     * resolve after rendering to this RT (see {@link RenderTarget#resolve}). Defaults to true.
     * @param {Texture} [options.colorBuffer] - The texture that this render target will treat as a
     * rendering surface.
     * @param {Texture[]} [options.colorBuffers] - The textures that this render target will treat
     * as a rendering surfaces. If this option is set, the colorBuffer option is ignored.
     * @param {boolean} [options.depth] - If set to true, depth buffer will be created. Defaults to
     * true. Ignored if depthBuffer is defined.
     * @param {Texture} [options.depthBuffer] - The texture that this render target will treat as a
     * depth/stencil surface (WebGL2 only). If set, the 'depth' and 'stencil' properties are
     * ignored. Texture must have {@link PIXELFORMAT_DEPTH} or {@link PIXELFORMAT_DEPTHSTENCIL}
     * format.
     * @param {number} [options.mipLevel] - If set to a number greater than 0, the render target
     * will render to the specified mip level of the color buffer. Defaults to 0.
     * @param {number} [options.face] - If the colorBuffer parameter is a cubemap, use this option
     * to specify the face of the cubemap to render to. Can be:
     *
     * - {@link CUBEFACE_POSX}
     * - {@link CUBEFACE_NEGX}
     * - {@link CUBEFACE_POSY}
     * - {@link CUBEFACE_NEGY}
     * - {@link CUBEFACE_POSZ}
     * - {@link CUBEFACE_NEGZ}
     *
     * Defaults to {@link CUBEFACE_POSX}.
     * @param {boolean} [options.flipY] - When set to true the image will be flipped in Y. Default
     * is false.
     * @param {string} [options.name] - The name of the render target.
     * @param {number} [options.samples] - Number of hardware anti-aliasing samples. Default is 1.
     * @param {boolean} [options.stencil] - If set to true, depth buffer will include stencil.
     * Defaults to false. Ignored if depthBuffer is defined or depth is false.
     * @example
     * // Create a 512x512x24-bit render target with a depth buffer
     * const colorBuffer = new pc.Texture(graphicsDevice, {
     *     width: 512,
     *     height: 512,
     *     format: pc.PIXELFORMAT_RGB8
     * });
     * const renderTarget = new pc.RenderTarget({
     *     colorBuffer: colorBuffer,
     *     depth: true
     * });
     *
     * // Set the render target on a camera component
     * camera.renderTarget = renderTarget;
     *
     * // Destroy render target at a later stage. Note that the color buffer needs
     * // to be destroyed separately.
     * renderTarget.colorBuffer.destroy();
     * renderTarget.destroy();
     * camera.renderTarget = null;
     */ constructor(options = {}){
        Debug.assert(!(options instanceof GraphicsDevice), 'pc.RenderTarget constructor no longer accepts GraphicsDevice parameter.');
        this.id = id$3++;
        // device, from one of the buffers
        const device = options.colorBuffer?.device ?? options.colorBuffers?.[0].device ?? options.depthBuffer?.device ?? options.graphicsDevice;
        Debug.assert(device, 'Failed to obtain the device, colorBuffer nor depthBuffer store it.');
        this._device = device;
        // samples
        const { maxSamples } = this._device;
        this._samples = Math.min(options.samples ?? 1, maxSamples);
        if (device.isWebGPU) {
            // WebGPU only supports values of 1 or 4 for samples
            this._samples = this._samples > 1 ? maxSamples : 1;
        }
        // Use the single colorBuffer in the colorBuffers array. This allows us to always just use the array internally.
        this._colorBuffer = options.colorBuffer;
        if (options.colorBuffer) {
            this._colorBuffers = [
                options.colorBuffer
            ];
        }
        // Process optional arguments
        this._depthBuffer = options.depthBuffer;
        this._face = options.face ?? 0;
        if (this._depthBuffer) {
            const format = this._depthBuffer._format;
            if (format === PIXELFORMAT_DEPTH || format === PIXELFORMAT_DEPTH16) {
                this._depth = true;
                this._stencil = false;
            } else if (format === PIXELFORMAT_DEPTHSTENCIL) {
                this._depth = true;
                this._stencil = true;
            } else if (format === PIXELFORMAT_R32F && this._depthBuffer.device.isWebGPU && this._samples > 1) {
                // on WebGPU, when multisampling is enabled, we use R32F format for the specified buffer,
                // which we can resolve depth to using a shader
                this._depth = true;
                this._stencil = false;
            } else {
                Debug.warn('Incorrect depthBuffer format. Must be pc.PIXELFORMAT_DEPTH or pc.PIXELFORMAT_DEPTHSTENCIL');
                this._depth = false;
                this._stencil = false;
            }
        } else {
            this._depth = options.depth ?? true;
            this._stencil = options.stencil ?? false;
        }
        // MRT
        if (options.colorBuffers) {
            Debug.assert(!this._colorBuffers, 'When constructing RenderTarget and options.colorBuffers is used, options.colorBuffer must not be used.');
            if (!this._colorBuffers) {
                this._colorBuffers = [
                    ...options.colorBuffers
                ];
                // set the main color buffer to point to 0 index
                this._colorBuffer = options.colorBuffers[0];
            }
        }
        this.autoResolve = options.autoResolve ?? true;
        // use specified name, otherwise get one from color or depth buffer
        this.name = options.name;
        if (!this.name) {
            this.name = this._colorBuffer?.name;
        }
        if (!this.name) {
            this.name = this._depthBuffer?.name;
        }
        if (!this.name) {
            this.name = 'Untitled';
        }
        // render image flipped in Y
        this.flipY = options.flipY ?? false;
        this._mipLevel = options.mipLevel ?? 0;
        if (this._mipLevel > 0 && this._depth) {
            Debug.error(`Rendering to a mipLevel is not supported when render target uses a depth buffer. Ignoring mipLevel ${this._mipLevel} for render target ${this.name}`, {
                renderTarget: this,
                options
            });
            this._mipLevel = 0;
        }
        // if we render to a specific mipmap (even 0), do not generate mipmaps
        this._mipmaps = options.mipLevel === undefined;
        // evaluate and cache dimensions
        this.evaluateDimensions();
        this.validateMrt();
        // device specific implementation
        this.impl = device.createRenderTargetImpl(this);
        Debug.trace(TRACEID_RENDER_TARGET_ALLOC, `Alloc: Id ${this.id} ${this.name}: ${this.width}x${this.height} ` + `[samples: ${this.samples}]` + `${this._colorBuffers?.length ? `[MRT: ${this._colorBuffers.length}]` : ''}` + `${this.colorBuffer ? '[Color]' : ''}` + `${this.depth ? '[Depth]' : ''}` + `${this.stencil ? '[Stencil]' : ''}` + `[Face:${this.face}]`);
    }
}

/**
 * @import { WebgpuGraphicsDevice } from './webgpu-graphics-device.js'
 */ // Maximum number of times a duplicate error message is logged.
const MAX_DUPLICATES = 5;
/**
 * Internal WebGPU debug system. Note that the functions only execute in the debug build, and are
 * stripped out in other builds.
 */ class WebgpuDebug {
    /**
     * Start a validation error scope.
     *
     * @param {WebgpuGraphicsDevice} device - The graphics device.
     */ static validate(device) {
        device.wgpu.pushErrorScope('validation');
        WebgpuDebug._scopes.push('validation');
        WebgpuDebug._markers.push(DebugGraphics.toString());
    }
    /**
     * Start an out-of-memory error scope.
     *
     * @param {WebgpuGraphicsDevice} device - The graphics device.
     */ static memory(device) {
        device.wgpu.pushErrorScope('out-of-memory');
        WebgpuDebug._scopes.push('out-of-memory');
        WebgpuDebug._markers.push(DebugGraphics.toString());
    }
    /**
     * Start an internal error scope.
     *
     * @param {WebgpuGraphicsDevice} device - The graphics device.
     */ static internal(device) {
        device.wgpu.pushErrorScope('internal');
        WebgpuDebug._scopes.push('internal');
        WebgpuDebug._markers.push(DebugGraphics.toString());
    }
    /**
     * End the previous error scope, and print errors if any.
     *
     * @param {WebgpuGraphicsDevice} device - The graphics device.
     * @param {string} label - The label for the error scope.
     * @param {...any} args - Additional parameters that form the error message.
     */ static async end(device, label, ...args) {
        const header = WebgpuDebug._scopes.pop();
        const marker = WebgpuDebug._markers.pop();
        Debug.assert(header, 'Non matching end.');
        const error = await device.wgpu.popErrorScope();
        if (error) {
            const count = WebgpuDebug._loggedMessages.get(error.message) ?? 0;
            if (count < MAX_DUPLICATES) {
                const tooMany = count === MAX_DUPLICATES - 1 ? ' (Too many errors, ignoring this one from now)' : '';
                WebgpuDebug._loggedMessages.set(error.message, count + 1);
                console.error(`WebGPU ${label} ${header} error: ${error.message}`, tooMany, 'while rendering', marker, ...args);
            }
        }
    }
    /**
     * Ends the shader validation scope by retrieving and logging any compilation errors
     * or warnings from the shader module. Also handles WebGPU validation errors, while
     * avoiding duplicate error messages.
     *
     * @param {WebgpuGraphicsDevice} device - The WebGPU graphics device.
     * @param {GPUShaderModule} shaderModule - The compiled WebGPU shader module.
     * @param {string} source - The original shader source code.
     * @param {number} [contextLines] - The number of lines before and after the error to log.
     * @param {...any} args - Additional parameters providing context about the shader.
     */ static async endShader(device, shaderModule, source, contextLines = 2, ...args) {
        const header = WebgpuDebug._scopes.pop();
        const marker = WebgpuDebug._markers.pop();
        Debug.assert(header, 'Non-matching error scope end.');
        // Capture popErrorScope error (if any)
        const error = await device.wgpu.popErrorScope();
        let errorMessage = '';
        if (error) {
            errorMessage += `WebGPU ShaderModule creation ${header} error: ${error.message}`;
            errorMessage += ` - While rendering ${marker}\n`;
        }
        // Get shader compilation errors
        const compilationInfo = await shaderModule.getCompilationInfo();
        if (compilationInfo.messages.length > 0) {
            // split source into lines
            const sourceLines = source.split('\n');
            compilationInfo.messages.forEach((message, index)=>{
                const { type, lineNum, linePos, message: msg } = message;
                const lineIndex = lineNum - 1; // Convert to zero-based index
                errorMessage += `\n----- ${type.toUpperCase()} ${index + 1} context: :${lineNum}:${linePos} ${type}: ${msg}\n`;
                // Extract surrounding lines for context
                const startLine = Math.max(0, lineIndex - contextLines);
                const endLine = Math.min(sourceLines.length, lineIndex + contextLines + 1);
                for(let i = startLine; i < endLine; i++){
                    const linePrefix = i === lineIndex ? '> ' : '  ';
                    errorMessage += `${linePrefix}${i + 1}: ${sourceLines[i]}\n`;
                }
            });
        }
        // only log if there are errors or messages
        if (errorMessage) {
            console.error(errorMessage, ...args);
        }
    }
}
WebgpuDebug._scopes = [];
WebgpuDebug._markers = [];
/** @type {Map<string,number>} */ WebgpuDebug._loggedMessages = new Map();

/**
 * @import { BindGroup } from '../bind-group.js'
 * @import { WebgpuGraphicsDevice } from './webgpu-graphics-device.js'
 * @import { WebgpuTexture } from './webgpu-texture.js'
 */ /**
 * A WebGPU implementation of the BindGroup, which is a wrapper over GPUBindGroup.
 *
 * @ignore
 */ class WebgpuBindGroup {
    update(bindGroup) {
        this.destroy();
        const device = bindGroup.device;
        /** @type {GPUBindGroupDescriptor} */ const desc = this.createDescriptor(device, bindGroup);
        WebgpuDebug.validate(device);
        this.bindGroup = device.wgpu.createBindGroup(desc);
        WebgpuDebug.end(device, 'BindGroup creation', {
            debugFormat: this.debugFormat,
            desc: desc,
            format: bindGroup.format,
            bindGroup: bindGroup
        });
    }
    destroy() {
        this.bindGroup = null;
    }
    /**
     * Creates a bind group descriptor in WebGPU format
     *
     * @param {WebgpuGraphicsDevice} device - Graphics device.
     * @param {BindGroup} bindGroup - Bind group to create the
     * descriptor for.
     * @returns {object} - Returns the generated descriptor of type GPUBindGroupDescriptor, which
     * can be used to create a GPUBindGroup
     */ createDescriptor(device, bindGroup) {
        // Note: This needs to match WebgpuBindGroupFormat.createDescriptor
        const entries = [];
        const format = bindGroup.format;
        Debug.call(()=>{
            this.debugFormat = '';
        });
        // uniform buffers
        const uniformBufferFormats = bindGroup.format.uniformBufferFormats;
        bindGroup.uniformBuffers.forEach((ub, i)=>{
            const slot = uniformBufferFormats[i].slot;
            const buffer = ub.persistent ? ub.impl.buffer : ub.allocation.gpuBuffer.buffer;
            Debug.assert(buffer, 'NULL uniform buffer cannot be used by the bind group');
            Debug.call(()=>{
                this.debugFormat += `${slot}: UB\n`;
            });
            entries.push({
                binding: slot,
                resource: {
                    buffer: buffer,
                    offset: 0,
                    size: ub.format.byteSize
                }
            });
        });
        // textures
        const textureFormats = bindGroup.format.textureFormats;
        bindGroup.textures.forEach((value, textureIndex)=>{
            // Value can be a Texture or TextureView
            const isTextureView = value instanceof TextureView;
            const texture = isTextureView ? value.texture : value;
            /** @type {WebgpuTexture} */ const wgpuTexture = texture.impl;
            const textureFormat = format.textureFormats[textureIndex];
            const slot = textureFormats[textureIndex].slot;
            // texture - pass TextureView for mip level / array layer selection if provided
            const view = wgpuTexture.getView(device, isTextureView ? value : undefined);
            Debug.assert(view, `NULL texture view [${textureFormat.name}] (slot ${slot}) cannot be used by the bind group`);
            Debug.call(()=>{
                this.debugFormat += `${slot}: ${bindGroup.format.textureFormats[textureIndex].name}\n`;
            });
            entries.push({
                binding: slot,
                resource: view
            });
            // sampler
            if (textureFormat.hasSampler) {
                const sampler = wgpuTexture.getSampler(device, textureFormat.sampleType);
                Debug.assert(sampler, `NULL sampler [${textureFormat.name}] (slot ${slot + 1}) cannot be used by the bind group`);
                Debug.call(()=>{
                    this.debugFormat += `${slot + 1}: ${sampler.label}\n`;
                });
                entries.push({
                    binding: slot + 1,
                    resource: sampler
                });
            }
        });
        // storage textures
        const storageTextureFormats = bindGroup.format.storageTextureFormats;
        bindGroup.storageTextures.forEach((value, textureIndex)=>{
            // Value can be a Texture or TextureView
            const isTextureView = value instanceof TextureView;
            const texture = isTextureView ? value.texture : value;
            /** @type {WebgpuTexture} */ const wgpuTexture = texture.impl;
            const slot = storageTextureFormats[textureIndex].slot;
            // Get view - pass TextureView for mip level / array layer selection if provided
            const view = wgpuTexture.getView(device, isTextureView ? value : undefined);
            Debug.assert(view, `NULL storage texture view [${storageTextureFormats[textureIndex].name}] (slot ${slot}) cannot be used by the bind group`);
            Debug.call(()=>{
                this.debugFormat += `${slot}: ${bindGroup.format.storageTextureFormats[textureIndex].name}\n`;
            });
            entries.push({
                binding: slot,
                resource: view
            });
        });
        // storage buffers
        const storageBufferFormats = bindGroup.format.storageBufferFormats;
        bindGroup.storageBuffers.forEach((buffer, bufferIndex)=>{
            /** @type {GPUBuffer} */ const wgpuBuffer = buffer.impl.buffer;
            const slot = storageBufferFormats[bufferIndex].slot;
            Debug.assert(wgpuBuffer, `NULL storage buffer [${storageBufferFormats[bufferIndex].name}] (slot ${slot}, id ${buffer.id}, size ${buffer.byteSize}) cannot be used by the bind group`);
            Debug.call(()=>{
                this.debugFormat += `${slot}: SB\n`;
            });
            entries.push({
                binding: slot,
                resource: {
                    buffer: wgpuBuffer
                }
            });
        });
        const desc = {
            layout: bindGroup.format.impl.bindGroupLayout,
            entries: entries
        };
        DebugHelper.setLabel(desc, bindGroup.name);
        return desc;
    }
}

class WebgpuUtils {
    // converts a combination of SHADER_STAGE_* into GPUShaderStage.*
    static shaderStage(stage) {
        let ret = 0;
        if (stage & SHADERSTAGE_VERTEX) ret |= GPUShaderStage.VERTEX;
        if (stage & SHADERSTAGE_FRAGMENT) ret |= GPUShaderStage.FRAGMENT;
        if (stage & SHADERSTAGE_COMPUTE) ret |= GPUShaderStage.COMPUTE;
        return ret;
    }
}

// map of PIXELFORMAT_*** to GPUTextureFormat
const gpuTextureFormats = [];
gpuTextureFormats[PIXELFORMAT_A8] = '';
gpuTextureFormats[PIXELFORMAT_L8] = '';
gpuTextureFormats[PIXELFORMAT_LA8] = '';
gpuTextureFormats[PIXELFORMAT_R8] = 'r8unorm';
gpuTextureFormats[PIXELFORMAT_RG8] = 'rg8unorm';
gpuTextureFormats[PIXELFORMAT_RGB565] = '';
gpuTextureFormats[PIXELFORMAT_RGBA5551] = '';
gpuTextureFormats[PIXELFORMAT_RGBA4] = '';
gpuTextureFormats[PIXELFORMAT_RGB8] = 'rgba8unorm';
gpuTextureFormats[PIXELFORMAT_RGBA8] = 'rgba8unorm';
gpuTextureFormats[PIXELFORMAT_DXT1] = 'bc1-rgba-unorm';
gpuTextureFormats[PIXELFORMAT_DXT3] = 'bc2-rgba-unorm';
gpuTextureFormats[PIXELFORMAT_DXT5] = 'bc3-rgba-unorm';
gpuTextureFormats[PIXELFORMAT_RGB16F] = '';
gpuTextureFormats[PIXELFORMAT_RGBA16F] = 'rgba16float';
gpuTextureFormats[PIXELFORMAT_R16F] = 'r16float';
gpuTextureFormats[PIXELFORMAT_RG16F] = 'rg16float';
gpuTextureFormats[PIXELFORMAT_RGB32F] = '';
gpuTextureFormats[PIXELFORMAT_RGBA32F] = 'rgba32float';
gpuTextureFormats[PIXELFORMAT_R32F] = 'r32float';
gpuTextureFormats[PIXELFORMAT_RG32F] = 'rg32float';
gpuTextureFormats[PIXELFORMAT_DEPTH] = 'depth32float';
gpuTextureFormats[PIXELFORMAT_DEPTH16] = 'depth16unorm';
gpuTextureFormats[PIXELFORMAT_DEPTHSTENCIL] = 'depth24plus-stencil8';
gpuTextureFormats[PIXELFORMAT_111110F] = 'rg11b10ufloat';
gpuTextureFormats[PIXELFORMAT_SRGB8] = '';
gpuTextureFormats[PIXELFORMAT_SRGBA8] = 'rgba8unorm-srgb';
gpuTextureFormats[PIXELFORMAT_ETC1] = '';
gpuTextureFormats[PIXELFORMAT_ETC2_RGB] = 'etc2-rgb8unorm';
gpuTextureFormats[PIXELFORMAT_ETC2_RGBA] = 'etc2-rgba8unorm';
gpuTextureFormats[PIXELFORMAT_PVRTC_2BPP_RGB_1] = '';
gpuTextureFormats[PIXELFORMAT_PVRTC_2BPP_RGBA_1] = '';
gpuTextureFormats[PIXELFORMAT_PVRTC_4BPP_RGB_1] = '';
gpuTextureFormats[PIXELFORMAT_PVRTC_4BPP_RGBA_1] = '';
gpuTextureFormats[PIXELFORMAT_ASTC_4x4] = 'astc-4x4-unorm';
gpuTextureFormats[PIXELFORMAT_ATC_RGB] = '';
gpuTextureFormats[PIXELFORMAT_ATC_RGBA] = '';
gpuTextureFormats[PIXELFORMAT_BGRA8] = 'bgra8unorm';
gpuTextureFormats[PIXELFORMAT_SBGRA8] = 'bgra8unorm-srgb';
gpuTextureFormats[PIXELFORMAT_R8I] = 'r8sint';
gpuTextureFormats[PIXELFORMAT_R8U] = 'r8uint';
gpuTextureFormats[PIXELFORMAT_R16I] = 'r16sint';
gpuTextureFormats[PIXELFORMAT_R16U] = 'r16uint';
gpuTextureFormats[PIXELFORMAT_R32I] = 'r32sint';
gpuTextureFormats[PIXELFORMAT_R32U] = 'r32uint';
gpuTextureFormats[PIXELFORMAT_RG8I] = 'rg8sint';
gpuTextureFormats[PIXELFORMAT_RG8U] = 'rg8uint';
gpuTextureFormats[PIXELFORMAT_RG16I] = 'rg16sint';
gpuTextureFormats[PIXELFORMAT_RG16U] = 'rg16uint';
gpuTextureFormats[PIXELFORMAT_RG32I] = 'rg32sint';
gpuTextureFormats[PIXELFORMAT_RG32U] = 'rg32uint';
gpuTextureFormats[PIXELFORMAT_RGBA8I] = 'rgba8sint';
gpuTextureFormats[PIXELFORMAT_RGBA8U] = 'rgba8uint';
gpuTextureFormats[PIXELFORMAT_RGBA16I] = 'rgba16sint';
gpuTextureFormats[PIXELFORMAT_RGBA16U] = 'rgba16uint';
gpuTextureFormats[PIXELFORMAT_RGBA32I] = 'rgba32sint';
gpuTextureFormats[PIXELFORMAT_RGBA32U] = 'rgba32uint';
gpuTextureFormats[PIXELFORMAT_BC6F] = 'bc6h-rgb-float';
gpuTextureFormats[PIXELFORMAT_BC6UF] = 'bc6h-rgb-ufloat';
gpuTextureFormats[PIXELFORMAT_BC7] = 'bc7-rgba-unorm';
gpuTextureFormats[PIXELFORMAT_RGB9E5] = 'rgb9e5ufloat';
gpuTextureFormats[PIXELFORMAT_RG8S] = 'rg8snorm';
gpuTextureFormats[PIXELFORMAT_RGBA8S] = 'rgba8snorm';
gpuTextureFormats[PIXELFORMAT_RGB10A2] = 'rgb10a2unorm';
gpuTextureFormats[PIXELFORMAT_RGB10A2U] = 'rgb10a2uint';
// compressed sRGB formats ----
gpuTextureFormats[PIXELFORMAT_DXT1_SRGB] = 'bc1-rgba-unorm-srgb';
gpuTextureFormats[PIXELFORMAT_DXT3_SRGBA] = 'bc2-rgba-unorm-srgb';
gpuTextureFormats[PIXELFORMAT_DXT5_SRGBA] = 'bc3-rgba-unorm-srgb';
gpuTextureFormats[PIXELFORMAT_ETC2_SRGB] = 'etc2-rgb8unorm-srgb';
gpuTextureFormats[PIXELFORMAT_ETC2_SRGBA] = 'etc2-rgba8unorm-srgb';
gpuTextureFormats[PIXELFORMAT_BC7_SRGBA] = 'bc7-rgba-unorm-srgb';
gpuTextureFormats[PIXELFORMAT_ASTC_4x4_SRGB] = 'astc-4x4-unorm-srgb';

/**
 * @import { BindGroupFormat } from '../bind-group-format.js'
 * @import { WebgpuGraphicsDevice } from './webgpu-graphics-device.js'
 */ const samplerTypes = [];
samplerTypes[SAMPLETYPE_FLOAT] = 'filtering';
samplerTypes[SAMPLETYPE_UNFILTERABLE_FLOAT] = 'non-filtering';
samplerTypes[SAMPLETYPE_DEPTH] = 'comparison';
// Using 'comparison' instead of 'non-filtering' may seem unusual, but currently we will get a
// validation error if we use 'non-filtering' along with texelFetch/textureLoad. 'comparison' works
// very well for the most common use-case of integer textures, texelFetch. We may be able to change
// how we initialize the sampler elsewhere to support 'non-filtering' in the future.
samplerTypes[SAMPLETYPE_INT] = 'comparison';
samplerTypes[SAMPLETYPE_UINT] = 'comparison';
const sampleTypes = [];
sampleTypes[SAMPLETYPE_FLOAT] = 'float';
sampleTypes[SAMPLETYPE_UNFILTERABLE_FLOAT] = 'unfilterable-float';
sampleTypes[SAMPLETYPE_DEPTH] = 'depth';
sampleTypes[SAMPLETYPE_INT] = 'sint';
sampleTypes[SAMPLETYPE_UINT] = 'uint';
const stringIds$1 = new StringIds();
/**
 * A WebGPU implementation of the BindGroupFormat, which is a wrapper over GPUBindGroupLayout.
 *
 * @ignore
 */ class WebgpuBindGroupFormat {
    destroy() {
        this.bindGroupLayout = null;
    }
    loseContext() {
    // this.bindGroupLayout = null;
    }
    /**
     * @param {any} bindGroupFormat - The format of the bind group.
     * @returns {any} Returns the bind group descriptor.
     */ createDescriptor(bindGroupFormat) {
        // all WebGPU bindings:
        // - buffer: GPUBufferBindingLayout, resource type is GPUBufferBinding
        // - sampler: GPUSamplerBindingLayout, resource type is GPUSampler
        // - texture: GPUTextureBindingLayout, resource type is GPUTextureView
        // - storageTexture: GPUStorageTextureBindingLayout, resource type is GPUTextureView
        // - externalTexture: GPUExternalTextureBindingLayout, resource type is GPUExternalTexture
        const entries = [];
        // generate unique key
        let key = '';
        // buffers
        bindGroupFormat.uniformBufferFormats.forEach((bufferFormat)=>{
            const visibility = WebgpuUtils.shaderStage(bufferFormat.visibility);
            key += `#${bufferFormat.slot}U:${visibility}`;
            entries.push({
                binding: bufferFormat.slot,
                visibility: visibility,
                buffer: {
                    type: 'uniform',
                    // whether this binding requires a dynamic offset
                    // currently all UBs are dynamic and need the offset
                    hasDynamicOffset: true
                }
            });
        });
        // textures
        bindGroupFormat.textureFormats.forEach((textureFormat)=>{
            const visibility = WebgpuUtils.shaderStage(textureFormat.visibility);
            // texture
            const sampleType = textureFormat.sampleType;
            const viewDimension = textureFormat.textureDimension;
            const multisampled = false;
            const gpuSampleType = sampleTypes[sampleType];
            Debug.assert(gpuSampleType);
            key += `#${textureFormat.slot}T:${visibility}-${gpuSampleType}-${viewDimension}-${multisampled}`;
            // texture
            entries.push({
                binding: textureFormat.slot,
                visibility: visibility,
                texture: {
                    // Indicates the type required for texture views bound to this binding.
                    // "float", "unfilterable-float", "depth", "sint", "uint",
                    sampleType: gpuSampleType,
                    // Indicates the required dimension for texture views bound to this binding.
                    // "1d", "2d", "2d-array", "cube", "cube-array", "3d"
                    viewDimension: viewDimension,
                    // Indicates whether or not texture views bound to this binding must be multisampled
                    multisampled: multisampled
                }
            });
            // sampler
            if (textureFormat.hasSampler) {
                const gpuSamplerType = samplerTypes[sampleType];
                Debug.assert(gpuSamplerType);
                key += `#${textureFormat.slot + 1}S:${visibility}-${gpuSamplerType}`;
                entries.push({
                    binding: textureFormat.slot + 1,
                    visibility: visibility,
                    sampler: {
                        // Indicates the required type of a sampler bound to this bindings
                        // 'filtering', 'non-filtering', 'comparison'
                        type: gpuSamplerType
                    }
                });
            }
        });
        // storage textures
        bindGroupFormat.storageTextureFormats.forEach((textureFormat)=>{
            const { format, textureDimension } = textureFormat;
            const { read, write } = textureFormat;
            key += `#${textureFormat.slot}ST:${format}-${textureDimension}-${read ? 'r1' : 'r0'}-${write ? 'w1' : 'w0'}`;
            // storage texture
            entries.push({
                binding: textureFormat.slot,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    // The access mode for this binding, indicating readability and writability.
                    // 'write-only' is always support, 'read-write' and 'read-only' optionally
                    access: read ? write ? 'read-write' : 'read-only' : 'write-only',
                    // The required format of texture views bound to this binding.
                    format: gpuTextureFormats[format],
                    // Indicates the required dimension for texture views bound to this binding.
                    // "1d", "2d", "2d-array", "cube", "cube-array", "3d"
                    viewDimension: textureDimension
                }
            });
        });
        // storage buffers
        bindGroupFormat.storageBufferFormats.forEach((bufferFormat)=>{
            const readOnly = bufferFormat.readOnly;
            const visibility = WebgpuUtils.shaderStage(bufferFormat.visibility);
            key += `#${bufferFormat.slot}SB:${visibility}-${readOnly ? 'ro' : 'rw'}`;
            entries.push({
                binding: bufferFormat.slot,
                visibility: visibility,
                buffer: {
                    // "storage", "read-only-storage"
                    type: readOnly ? 'read-only-storage' : 'storage'
                }
            });
        });
        /** @type {GPUBindGroupLayoutDescriptor} */ const desc = {
            entries: entries
        };
        return {
            key,
            desc
        };
    }
    /**
     * @param {BindGroupFormat} bindGroupFormat - Bind group format.
     */ constructor(bindGroupFormat){
        /** @type {WebgpuGraphicsDevice} */ const device = bindGroupFormat.device;
        const { key, desc } = this.createDescriptor(bindGroupFormat);
        /**
         * Unique key, used for caching
         *
         * @type {number}
         */ this.key = stringIds$1.get(key);
        // keep desc in debug mode
        Debug.call(()=>{
            this.desc = desc;
        });
        /**
         * @type {GPUBindGroupLayout}
         * @private
         */ this.bindGroupLayout = device.wgpu.createBindGroupLayout(desc);
        DebugHelper.setLabel(this.bindGroupLayout, bindGroupFormat.name);
    }
}

/**
 * @import { WebgpuGraphicsDevice } from './webgpu-graphics-device.js'
 */ /**
 * A WebGPU implementation of the Buffer.
 *
 * @ignore
 */ class WebgpuBuffer {
    destroy(device) {
        if (this.buffer) {
            this.buffer.destroy();
            this.buffer = null;
        }
    }
    get initialized() {
        return !!this.buffer;
    }
    loseContext() {}
    allocate(device, size) {
        Debug.assert(!this.buffer, 'Buffer already allocated');
        this.buffer = device.wgpu.createBuffer({
            size,
            usage: this.usageFlags
        });
    }
    /**
     * @param {WebgpuGraphicsDevice} device - Graphics device.
     * @param {*} storage -
     */ unlock(device, storage) {
        const wgpu = device.wgpu;
        // offset of getMappedRange must me a multiple of 8
        // size of getMappedRange must be a multiple of 4
        if (!this.buffer) {
            // size needs to be a multiple of 4
            // note: based on specs, descriptor.size must be a multiple of 4 if descriptor.mappedAtCreation is true
            const size = storage.byteLength + 3 & -4;
            this.usageFlags |= GPUBufferUsage.COPY_DST;
            this.allocate(device, size);
            DebugHelper.setLabel(this.buffer, this.usageFlags & GPUBufferUsage.VERTEX ? 'VertexBuffer' : this.usageFlags & GPUBufferUsage.INDEX ? 'IndexBuffer' : this.usageFlags & GPUBufferUsage.UNIFORM ? 'UniformBuffer' : this.usageFlags & GPUBufferUsage.STORAGE ? 'StorageBuffer' : '');
        // mappedAtCreation path - this could be used when the data is provided
        // this.buffer = device.wgpu.createBuffer({
        //     size: size,
        //     usage: target,
        //     mappedAtCreation: true
        // });
        // const dest = new Uint8Array(this.buffer.getMappedRange());
        // const src = new Uint8Array(storage.buffer ? storage.buffer : storage);
        // dest.set(src);
        // this.buffer.unmap();
        }
        // src size needs to be a multiple of 4 as well
        const srcOffset = storage.byteOffset ?? 0;
        const srcData = new Uint8Array(storage.buffer ?? storage, srcOffset, storage.byteLength);
        const data = new Uint8Array(this.buffer.size);
        data.set(srcData);
        // copy data to the gpu buffer
        Debug.trace(TRACEID_RENDER_QUEUE, `writeBuffer: ${this.buffer.label}`);
        wgpu.queue.writeBuffer(this.buffer, 0, data, 0, data.length);
    }
    read(device, offset, size, data, immediate) {
        return device.readStorageBuffer(this, offset, size, data, immediate);
    }
    write(device, bufferOffset, data, dataOffset, size) {
        device.writeStorageBuffer(this, bufferOffset, data, dataOffset, size);
    }
    clear(device, offset, size) {
        device.clearStorageBuffer(this, offset, size);
    }
    constructor(usageFlags = 0){
        /**
     * @type {GPUBuffer|null}
     * @private
     */ this.buffer = null;
        this.usageFlags = 0;
        this.usageFlags = usageFlags;
    }
}

/**
 * A WebGPU implementation of the IndexBuffer.
 *
 * @ignore
 */ class WebgpuIndexBuffer extends WebgpuBuffer {
    unlock(indexBuffer) {
        const device = indexBuffer.device;
        super.unlock(device, indexBuffer.storage);
    }
    constructor(indexBuffer, options){
        super(BUFFERUSAGE_INDEX | (options?.storage ? BUFFERUSAGE_STORAGE : 0)), this.format = null;
        Debug.assert(indexBuffer.format !== INDEXFORMAT_UINT8, 'WebGPU does not support 8-bit index buffer format');
        this.format = indexBuffer.format === INDEXFORMAT_UINT16 ? 'uint16' : 'uint32';
    }
}

const array = {
    // helper function to compare two arrays for equality
    equals (arr1, arr2) {
        if (arr1.length !== arr2.length) {
            return false;
        }
        for(let i = 0; i < arr1.length; i++){
            if (arr1[i] !== arr2[i]) {
                return false;
            }
        }
        return true;
    }
};

/**
 * @import { VertexFormat } from '../vertex-format.js'
 */ // map of TYPE_*** to GPUVertexFormat
const gpuVertexFormats = [];
gpuVertexFormats[TYPE_INT8] = 'sint8';
gpuVertexFormats[TYPE_UINT8] = 'uint8';
gpuVertexFormats[TYPE_INT16] = 'sint16';
gpuVertexFormats[TYPE_UINT16] = 'uint16';
gpuVertexFormats[TYPE_INT32] = 'sint32';
gpuVertexFormats[TYPE_UINT32] = 'uint32';
gpuVertexFormats[TYPE_FLOAT32] = 'float32';
gpuVertexFormats[TYPE_FLOAT16] = 'float16';
const gpuVertexFormatsNormalized = [];
gpuVertexFormatsNormalized[TYPE_INT8] = 'snorm8';
gpuVertexFormatsNormalized[TYPE_UINT8] = 'unorm8';
gpuVertexFormatsNormalized[TYPE_INT16] = 'snorm16';
gpuVertexFormatsNormalized[TYPE_UINT16] = 'unorm16';
gpuVertexFormatsNormalized[TYPE_INT32] = 'sint32'; // there is no 32bit normalized signed int
gpuVertexFormatsNormalized[TYPE_UINT32] = 'uint32'; // there is no 32bit normalized unsigned int
gpuVertexFormatsNormalized[TYPE_FLOAT32] = 'float32'; // there is no 32bit normalized float
gpuVertexFormatsNormalized[TYPE_FLOAT16] = 'float16'; // there is no 16bit normalized half-float
class WebgpuVertexBufferLayout {
    /**
     * Obtain a vertex layout of one or two vertex formats.
     *
     * @param {VertexFormat} vertexFormat0 - The first vertex format.
     * @param {VertexFormat} [vertexFormat1] - The second vertex format.
     * @returns {any[]} - The vertex layout.
     */ get(vertexFormat0, vertexFormat1 = null) {
        const key = this.getKey(vertexFormat0, vertexFormat1);
        let layout = this.cache.get(key);
        if (!layout) {
            layout = this.create(vertexFormat0, vertexFormat1);
            this.cache.set(key, layout);
        }
        return layout;
    }
    getKey(vertexFormat0, vertexFormat1 = null) {
        return `${vertexFormat0?.renderingHashString}-${vertexFormat1?.renderingHashString}`;
    }
    /**
     * @param {VertexFormat} vertexFormat0 - The first vertex format.
     * @param {VertexFormat} vertexFormat1 - The second vertex format.
     * @returns {any[]} - The vertex buffer layout.
     */ create(vertexFormat0, vertexFormat1) {
        // type {GPUVertexBufferLayout[]}
        const layout = [];
        // Note: If the VertexFormat is interleaved, we use a single vertex buffer with multiple
        // attributes. This uses a smaller number of vertex buffers (1), which has performance
        // benefits when setting it up on the device.
        // If the VertexFormat is not interleaved, we use multiple vertex buffers, one per
        // attribute. This is less efficient, but is required as there is a pretty small
        // limit on the attribute offsets in the vertex buffer layout.
        const addFormat = (format)=>{
            const interleaved = format.interleaved;
            const stepMode = format.instancing ? 'instance' : 'vertex';
            let attributes = [];
            const elementCount = format.elements.length;
            for(let i = 0; i < elementCount; i++){
                const element = format.elements[i];
                const location = semanticToLocation[element.name];
                const formatTable = element.normalize ? gpuVertexFormatsNormalized : gpuVertexFormats;
                attributes.push({
                    shaderLocation: location,
                    offset: interleaved ? element.offset : 0,
                    format: `${formatTable[element.dataType]}${element.numComponents > 1 ? `x${element.numComponents}` : ''}`
                });
                if (!interleaved || i === elementCount - 1) {
                    layout.push({
                        attributes: attributes,
                        arrayStride: element.stride,
                        stepMode: stepMode
                    });
                    attributes = [];
                }
            }
        };
        if (vertexFormat0) {
            addFormat(vertexFormat0);
        }
        if (vertexFormat1) {
            addFormat(vertexFormat1);
        }
        return layout;
    }
    constructor(){
        /**
     * @type {Map<string, GPUVertexBufferLayout[]>}
     * @private
     */ this.cache = new Map();
    }
}

/**
 * @import { BindGroupFormat } from '../bind-group-format.js'
 * @import { WebgpuGraphicsDevice } from './webgpu-graphics-device.js'
 */ let _layoutId = 0;
/**
 * Base class for render and compute pipelines.
 *
 * @ignore
 */ class WebgpuPipeline {
    // TODO: this could be cached using bindGroupKey
    /**
     * @param {BindGroupFormat[]} bindGroupFormats - An array of bind group formats.
     * @returns {any} Returns the pipeline layout.
     */ getPipelineLayout(bindGroupFormats) {
        const bindGroupLayouts = [];
        bindGroupFormats.forEach((format)=>{
            bindGroupLayouts.push(format.bindGroupLayout);
        });
        const desc = {
            bindGroupLayouts: bindGroupLayouts
        };
        _layoutId++;
        DebugHelper.setLabel(desc, `PipelineLayoutDescr-${_layoutId}`);
        /** @type {GPUPipelineLayout} */ const pipelineLayout = this.device.wgpu.createPipelineLayout(desc);
        DebugHelper.setLabel(pipelineLayout, `PipelineLayout-${_layoutId}`);
        Debug.trace(TRACEID_PIPELINELAYOUT_ALLOC, `Alloc: Id ${_layoutId}`, {
            desc: desc,
            bindGroupFormats
        });
        return pipelineLayout;
    }
    constructor(device){
        /** @type {WebgpuGraphicsDevice} */ this.device = device;
    }
}

/**
 * @import { BindGroupFormat } from '../bind-group-format.js'
 * @import { BlendState } from '../blend-state.js'
 * @import { DepthState } from '../depth-state.js'
 * @import { RenderTarget } from '../render-target.js'
 * @import { Shader } from '../shader.js'
 * @import { StencilParameters } from '../stencil-parameters.js'
 * @import { VertexFormat } from '../vertex-format.js'
 * @import { WebgpuShader } from './webgpu-shader.js'
 */ let _pipelineId$1 = 0;
const _primitiveTopology = [
    'point-list',
    'line-list',
    undefined,
    'line-strip',
    'triangle-list',
    'triangle-strip',
    undefined // PRIMITIVE_TRIFAN
];
const _blendOperation = [
    'add',
    'subtract',
    'reverse-subtract',
    'min',
    'max' // BLENDEQUATION_MAX
];
const _blendFactor = [
    'zero',
    'one',
    'src',
    'one-minus-src',
    'dst',
    'one-minus-dst',
    'src-alpha',
    'src-alpha-saturated',
    'one-minus-src-alpha',
    'dst-alpha',
    'one-minus-dst-alpha',
    'constant',
    'one-minus-constant' // BLENDMODE_ONE_MINUS_CONSTANT
];
const _compareFunction = [
    'never',
    'less',
    'equal',
    'less-equal',
    'greater',
    'not-equal',
    'greater-equal',
    'always' // FUNC_ALWAYS
];
const _cullModes = [
    'none',
    'back',
    'front' // CULLFACE_FRONT
];
const _frontFace = [
    'ccw',
    'cw' // FRONTFACE_CW
];
const _stencilOps = [
    'keep',
    'zero',
    'replace',
    'increment-clamp',
    'increment-wrap',
    'decrement-clamp',
    'decrement-wrap',
    'invert' // STENCILOP_INVERT
];
const _indexFormat = [
    '',
    'uint16',
    'uint32' // INDEXFORMAT_UINT32
];
let CacheEntry$1 = class CacheEntry {
};
class WebgpuRenderPipeline extends WebgpuPipeline {
    /**
     * @param {object} primitive - The primitive.
     * @param {VertexFormat} vertexFormat0 - The first vertex format.
     * @param {VertexFormat} vertexFormat1 - The second vertex format.
     * @param {number|undefined} ibFormat - The index buffer format.
     * @param {Shader} shader - The shader.
     * @param {RenderTarget} renderTarget - The render target.
     * @param {BindGroupFormat[]} bindGroupFormats - An array of bind group formats.
     * @param {BlendState} blendState - The blend state.
     * @param {DepthState} depthState - The depth state.
     * @param {number} cullMode - The cull mode.
     * @param {boolean} stencilEnabled - Whether stencil is enabled.
     * @param {StencilParameters} stencilFront - The stencil state for front faces.
     * @param {StencilParameters} stencilBack - The stencil state for back faces.
     * @param {number} frontFace - The front face.
     * @returns {GPURenderPipeline} Returns the render pipeline.
     * @private
     */ get(primitive, vertexFormat0, vertexFormat1, ibFormat, shader, renderTarget, bindGroupFormats, blendState, depthState, cullMode, stencilEnabled, stencilFront, stencilBack, frontFace) {
        Debug.assert(bindGroupFormats.length <= 3);
        // ibFormat is used only for stripped primitives, clear it otherwise to avoid additional render pipelines
        const primitiveType = primitive.type;
        if (ibFormat && primitiveType !== PRIMITIVE_LINESTRIP && primitiveType !== PRIMITIVE_TRISTRIP) {
            ibFormat = undefined;
        }
        // all bind groups must be set as the WebGPU layout cannot have skipped indices. Not having a bind
        // group would assign incorrect slots to the following bind groups, causing a validation errors.
        Debug.assert(bindGroupFormats[0], `BindGroup with index 0 [${bindGroupNames[0]}] is not set.`);
        Debug.assert(bindGroupFormats[1], `BindGroup with index 1 [${bindGroupNames[1]}] is not set.`);
        Debug.assert(bindGroupFormats[2], `BindGroup with index 2 [${bindGroupNames[2]}] is not set.`);
        // render pipeline unique hash
        const lookupHashes = this.lookupHashes;
        lookupHashes[0] = primitiveType;
        lookupHashes[1] = shader.id;
        lookupHashes[2] = cullMode;
        lookupHashes[3] = depthState.key;
        lookupHashes[4] = blendState.key;
        lookupHashes[5] = vertexFormat0?.renderingHash ?? 0;
        lookupHashes[6] = vertexFormat1?.renderingHash ?? 0;
        lookupHashes[7] = renderTarget.impl.key;
        lookupHashes[8] = bindGroupFormats[0]?.key ?? 0;
        lookupHashes[9] = bindGroupFormats[1]?.key ?? 0;
        lookupHashes[10] = bindGroupFormats[2]?.key ?? 0;
        lookupHashes[11] = stencilEnabled ? stencilFront.key : 0;
        lookupHashes[12] = stencilEnabled ? stencilBack.key : 0;
        lookupHashes[13] = ibFormat ?? 0;
        lookupHashes[14] = frontFace;
        const hash = hash32Fnv1a(lookupHashes);
        // cached pipeline
        let cacheEntries = this.cache.get(hash);
        // if we have cache entries, find the exact match, as hash collision can occur
        if (cacheEntries) {
            for(let i = 0; i < cacheEntries.length; i++){
                const entry = cacheEntries[i];
                if (array.equals(entry.hashes, lookupHashes)) {
                    return entry.pipeline;
                }
            }
        }
        // no match or a hash collision, so create a new pipeline
        const primitiveTopology = _primitiveTopology[primitiveType];
        Debug.assert(primitiveTopology, 'Unsupported primitive topology', primitive);
        // pipeline layout
        const pipelineLayout = this.getPipelineLayout(bindGroupFormats);
        // vertex buffer layout
        const vertexBufferLayout = this.vertexBufferLayout.get(vertexFormat0, vertexFormat1);
        // pipeline
        const cacheEntry = new CacheEntry$1();
        cacheEntry.hashes = new Uint32Array(lookupHashes);
        cacheEntry.pipeline = this.create(primitiveTopology, ibFormat, shader, renderTarget, pipelineLayout, blendState, depthState, vertexBufferLayout, cullMode, stencilEnabled, stencilFront, stencilBack, frontFace);
        // add to cache
        if (cacheEntries) {
            cacheEntries.push(cacheEntry);
        } else {
            cacheEntries = [
                cacheEntry
            ];
        }
        this.cache.set(hash, cacheEntries);
        return cacheEntry.pipeline;
    }
    getBlend(blendState) {
        // blend needs to be undefined when blending is disabled
        let blend;
        if (blendState.blend) {
            /** @type {GPUBlendState} */ blend = {
                color: {
                    operation: _blendOperation[blendState.colorOp],
                    srcFactor: _blendFactor[blendState.colorSrcFactor],
                    dstFactor: _blendFactor[blendState.colorDstFactor]
                },
                alpha: {
                    operation: _blendOperation[blendState.alphaOp],
                    srcFactor: _blendFactor[blendState.alphaSrcFactor],
                    dstFactor: _blendFactor[blendState.alphaDstFactor]
                }
            };
            // unsupported blend factors
            Debug.assert(blend.color.srcFactor !== undefined);
            Debug.assert(blend.color.dstFactor !== undefined);
            Debug.assert(blend.alpha.srcFactor !== undefined);
            Debug.assert(blend.alpha.dstFactor !== undefined);
        }
        return blend;
    }
    /**
     * @param {DepthState} depthState - The depth state.
     * @param {RenderTarget} renderTarget - The render target.
     * @param {boolean} stencilEnabled - Whether stencil is enabled.
     * @param {StencilParameters} stencilFront - The stencil state for front faces.
     * @param {StencilParameters} stencilBack - The stencil state for back faces.
     * @param {string} primitiveTopology - The primitive topology.
     * @returns {object} Returns the depth stencil state.
     * @private
     */ getDepthStencil(depthState, renderTarget, stencilEnabled, stencilFront, stencilBack, primitiveTopology) {
        /** @type {GPUDepthStencilState} */ let depthStencil;
        const { depth, stencil } = renderTarget;
        if (depth || stencil) {
            // format of depth-stencil attachment
            depthStencil = {
                format: renderTarget.impl.depthAttachment.format
            };
            // depth
            if (depth) {
                depthStencil.depthWriteEnabled = depthState.write;
                depthStencil.depthCompare = _compareFunction[depthState.func];
                const biasAllowed = primitiveTopology === 'triangle-list' || primitiveTopology === 'triangle-strip';
                depthStencil.depthBias = biasAllowed ? depthState.depthBias : 0;
                depthStencil.depthBiasSlopeScale = biasAllowed ? depthState.depthBiasSlope : 0;
            } else {
                // if render target does not have depth buffer
                depthStencil.depthWriteEnabled = false;
                depthStencil.depthCompare = 'always';
            }
            // stencil
            if (stencil && stencilEnabled) {
                // Note that WebGPU only supports a single mask, we use the one from front, but not from back.
                depthStencil.stencilReadMas = stencilFront.readMask;
                depthStencil.stencilWriteMask = stencilFront.writeMask;
                depthStencil.stencilFront = {
                    compare: _compareFunction[stencilFront.func],
                    failOp: _stencilOps[stencilFront.fail],
                    passOp: _stencilOps[stencilFront.zpass],
                    depthFailOp: _stencilOps[stencilFront.zfail]
                };
                depthStencil.stencilBack = {
                    compare: _compareFunction[stencilBack.func],
                    failOp: _stencilOps[stencilBack.fail],
                    passOp: _stencilOps[stencilBack.zpass],
                    depthFailOp: _stencilOps[stencilBack.zfail]
                };
            }
        }
        return depthStencil;
    }
    create(primitiveTopology, ibFormat, shader, renderTarget, pipelineLayout, blendState, depthState, vertexBufferLayout, cullMode, stencilEnabled, stencilFront, stencilBack, frontFace) {
        const wgpu = this.device.wgpu;
        /** @type {WebgpuShader} */ const webgpuShader = shader.impl;
        /** @type {GPURenderPipelineDescriptor} */ const desc = {
            vertex: {
                module: webgpuShader.getVertexShaderModule(),
                entryPoint: webgpuShader.vertexEntryPoint,
                buffers: vertexBufferLayout
            },
            primitive: {
                topology: primitiveTopology,
                frontFace: _frontFace[frontFace],
                cullMode: _cullModes[cullMode]
            },
            depthStencil: this.getDepthStencil(depthState, renderTarget, stencilEnabled, stencilFront, stencilBack, primitiveTopology),
            multisample: {
                count: renderTarget.samples
            },
            // uniform / texture binding layout
            layout: pipelineLayout
        };
        if (ibFormat) {
            desc.primitive.stripIndexFormat = _indexFormat[ibFormat];
        }
        desc.fragment = {
            module: webgpuShader.getFragmentShaderModule(),
            entryPoint: webgpuShader.fragmentEntryPoint,
            targets: []
        };
        const colorAttachments = renderTarget.impl.colorAttachments;
        if (colorAttachments.length > 0) {
            // the same write mask is used by all color buffers, to match the WebGL behavior
            let writeMask = 0;
            if (blendState.redWrite) writeMask |= GPUColorWrite.RED;
            if (blendState.greenWrite) writeMask |= GPUColorWrite.GREEN;
            if (blendState.blueWrite) writeMask |= GPUColorWrite.BLUE;
            if (blendState.alphaWrite) writeMask |= GPUColorWrite.ALPHA;
            // the same blend state is used by all color buffers, to match the WebGL behavior
            const blend = this.getBlend(blendState);
            colorAttachments.forEach((attachment)=>{
                desc.fragment.targets.push({
                    format: attachment.format,
                    writeMask: writeMask,
                    blend: blend
                });
            });
        }
        WebgpuDebug.validate(this.device);
        _pipelineId$1++;
        DebugHelper.setLabel(desc, `RenderPipelineDescr-${_pipelineId$1}`);
        const pipeline = wgpu.createRenderPipeline(desc);
        DebugHelper.setLabel(pipeline, `RenderPipeline-${_pipelineId$1}`);
        Debug.trace(TRACEID_RENDERPIPELINE_ALLOC, `Alloc: Id ${_pipelineId$1}, stack: ${DebugGraphics.toString()}`, desc);
        WebgpuDebug.end(this.device, 'RenderPipeline creation', {
            renderPipeline: this,
            desc: desc,
            shader
        });
        return pipeline;
    }
    constructor(device){
        super(device), this.lookupHashes = new Uint32Array(15);
        /**
         * The cache of vertex buffer layouts
         *
         * @type {WebgpuVertexBufferLayout}
         */ this.vertexBufferLayout = new WebgpuVertexBufferLayout();
        /**
         * The cache of render pipelines
         *
         * @type {Map<number, CacheEntry[]>}
         */ this.cache = new Map();
    }
}

/**
 * @import { WebgpuShader } from './webgpu-shader.js'
 */ let _pipelineId = 0;
class CacheEntry {
    constructor(){
        /**
     * Compute pipeline
     *
     * @type {GPUComputePipeline|null}
     * @private
     */ this.pipeline = null;
        /**
     * The full array of hashes used to lookup the pipeline, used in case of hash collision.
     *
     * @type {Uint32Array|null}
     */ this.hashes = null;
    }
}
class WebgpuComputePipeline extends WebgpuPipeline {
    get(shader, bindGroupFormat) {
        // unique hash for the pipeline
        const lookupHashes = this.lookupHashes;
        lookupHashes[0] = shader.impl.computeKey;
        lookupHashes[1] = bindGroupFormat.impl.key;
        const hash = hash32Fnv1a(lookupHashes);
        // Check cache
        let cacheEntries = this.cache.get(hash);
        if (cacheEntries) {
            // Handle hash collisions by checking actual values
            for(let i = 0; i < cacheEntries.length; i++){
                const entry = cacheEntries[i];
                if (array.equals(entry.hashes, lookupHashes)) {
                    return entry.pipeline;
                }
            }
        }
        // Cache miss - create new pipeline
        const pipelineLayout = this.getPipelineLayout([
            bindGroupFormat.impl
        ]);
        const cacheEntry = new CacheEntry();
        cacheEntry.hashes = new Uint32Array(lookupHashes);
        cacheEntry.pipeline = this.create(shader, pipelineLayout);
        // Add to cache
        if (cacheEntries) {
            cacheEntries.push(cacheEntry);
        } else {
            cacheEntries = [
                cacheEntry
            ];
        }
        this.cache.set(hash, cacheEntries);
        return cacheEntry.pipeline;
    }
    create(shader, pipelineLayout) {
        const wgpu = this.device.wgpu;
        /** @type {WebgpuShader} */ const webgpuShader = shader.impl;
        /** @type {GPUComputePipelineDescriptor} */ const desc = {
            compute: {
                module: webgpuShader.getComputeShaderModule(),
                entryPoint: webgpuShader.computeEntryPoint
            },
            // uniform / texture binding layout
            layout: pipelineLayout
        };
        WebgpuDebug.validate(this.device);
        _pipelineId++;
        DebugHelper.setLabel(desc, `ComputePipelineDescr-${_pipelineId}`);
        const pipeline = wgpu.createComputePipeline(desc);
        DebugHelper.setLabel(pipeline, `ComputePipeline-${_pipelineId}`);
        Debug.trace(TRACEID_COMPUTEPIPELINE_ALLOC, `Alloc: Id ${_pipelineId}`, desc);
        WebgpuDebug.end(this.device, 'ComputePipeline creation', {
            computePipeline: this,
            desc: desc,
            shader
        });
        return pipeline;
    }
    constructor(...args){
        super(...args), this.lookupHashes = new Uint32Array(2), /**
     * The cache of compute pipelines
     *
     * @type {Map<number, CacheEntry[]>}
     */ this.cache = new Map();
    }
}

/**
 * Base class that implements reference counting for objects.
 */ class RefCountedObject {
    /**
     * Increments the reference counter.
     */ incRefCount() {
        this._refCount++;
    }
    /**
     * Decrements the reference counter.
     */ decRefCount() {
        this._refCount--;
    }
    /**
     * Gets the current reference count.
     *
     * @type {number}
     */ get refCount() {
        return this._refCount;
    }
    constructor(){
        /**
     * @type {number}
     * @private
     */ this._refCount = 0;
    }
}

/**
 * An entry in the RefCountedKeyCache cache, which wraps the object with a reference count.
 */ class Entry extends RefCountedObject {
    constructor(obj){
        super();
        this.object = obj;
        this.incRefCount();
    }
}
/**
 * Class implementing reference counting cache for objects accessed by a key. Reference counting is
 * separate from the stored object.
 */ class RefCountedKeyCache {
    /**
     * Destroy all stored objects.
     */ destroy() {
        this.cache.forEach((entry)=>{
            entry.object?.destroy();
        });
        this.cache.clear();
    }
    /**
     * Clear the cache, without destroying the objects.
     */ clear() {
        this.cache.clear();
    }
    /**
     * Get the object from the cache with the given key, while incrementing the reference count. If
     * the object is not in the cache, returns null.
     *
     * @param {object} key - The key to look up the object.
     * @returns {object} The object, or null if not found.
     */ get(key) {
        const entry = this.cache.get(key);
        if (entry) {
            entry.incRefCount();
            return entry.object;
        }
        return null;
    }
    /**
     * Put the object in the cache with the given key. The object cannot be in the cache already.
     * This sets its reference count to 1.
     *
     * @param {object} key - The key to store the object under.
     * @param {object} object - The object to store.
     */ set(key, object) {
        Debug.assert(!this.cache.has(key), 'RefCountedKeyCache: Trying to put object with key that already exists in the cache', {
            key,
            object
        });
        this.cache.set(key, new Entry(object));
    }
    /**
     * Remove the object reference from the cache with the given key. If the reference count reaches
     * zero, the object is destroyed.
     *
     * @param {object} key - The key to remove the object under.
     */ release(key) {
        const entry = this.cache.get(key);
        if (entry) {
            entry.decRefCount();
            // last reference removed, destroy the object
            if (entry.refCount === 0) {
                this.cache.delete(key); // remove the entry from the cache
                entry.object?.destroy(); // destroy the object
            }
        } else {
            Debug.warn('RefCountedKeyCache: Trying to release object that is not in the cache', {
                key
            });
        }
    }
    constructor(){
        /**
     * Map storing the cache. They key is a look up key for the object, the value is an instance
     * of the Entry class, which wraps the object with a reference count.
     *
     * {@type <object, Entry>}
     * @private
     */ this.cache = new Map();
    }
}

/**
 * Reference counted cache storing multi-sampled versions of depth buffers, which are reference
 * counted and shared between render targets using the same user-specified depth-buffer. This is
 * needed for the cases where the user provided depth buffer is used for depth-pre-pass and then
 * the main render pass - those need to share the same multi-sampled depth buffer.
 */ class MultisampledTextureCache extends RefCountedKeyCache {
    loseContext(device) {
        this.clear(); // just clear the cache when the context is lost
    }
}
// a device cache storing per device instance of MultisampledTextureCache
const multisampledTextureCache = new DeviceCache();
const getMultisampledTextureCache = (device)=>{
    return multisampledTextureCache.get(device, ()=>{
        return new MultisampledTextureCache();
    });
};

/**
 * @import { RenderPass } from '../render-pass.js'
 * @import { RenderTarget } from '../render-target.js'
 * @import { WebgpuGraphicsDevice } from '../webgpu/webgpu-graphics-device.js'
 */ const stringIds = new StringIds();
/**
 * Private class storing info about color buffer.
 *
 * @private
 */ class ColorAttachment {
    destroy() {
        this.multisampledBuffer?.destroy();
        this.multisampledBuffer = null;
    }
}
/**
 * Private class storing info about depth-stencil buffer.
 *
 * @private
 */ class DepthAttachment {
    destroy(device) {
        if (this.depthTextureInternal) {
            this.depthTexture?.destroy();
            this.depthTexture = null;
        }
        // release multi-sampled depth buffer
        if (this.multisampledDepthBuffer) {
            this.multisampledDepthBuffer = null;
            // release reference to the texture, as its ref-counted
            getMultisampledTextureCache(device).release(this.multisampledDepthBufferKey);
        }
    }
    /**
     * @param {string} gpuFormat - The WebGPU format (GPUTextureFormat).
     */ constructor(gpuFormat){
        /**
     * @type {GPUTexture|null}
     * @private
     */ this.depthTexture = null;
        /**
     * True if the depthTexture is internally allocated / owned
     *
     * @type {boolean}
     */ this.depthTextureInternal = false;
        /**
     * Multi-sampled depth buffer allocated over the user provided depth buffer.
     *
     * @type {GPUTexture|null}
     * @private
     */ this.multisampledDepthBuffer = null;
        Debug.assert(gpuFormat);
        this.format = gpuFormat;
        this.hasStencil = gpuFormat === 'depth24plus-stencil8';
    }
}
/**
 * A WebGPU implementation of the RenderTarget.
 *
 * @ignore
 */ class WebgpuRenderTarget {
    /**
     * Release associated resources. Note that this needs to leave this instance in a state where
     * it can be re-initialized again, which is used by render target resizing.
     *
     * @param {WebgpuGraphicsDevice} device - The graphics device.
     */ destroy(device) {
        this.initialized = false;
        this.assignedColorTexture = null;
        this.colorAttachments.forEach((colorAttachment)=>{
            colorAttachment.destroy();
        });
        this.colorAttachments.length = 0;
        this.depthAttachment?.destroy(device);
        this.depthAttachment = null;
    }
    updateKey() {
        const rt = this.renderTarget;
        // key used by render pipeline creation
        let key = `${rt.samples}:${this.depthAttachment ? this.depthAttachment.format : 'nodepth'}`;
        this.colorAttachments.forEach((colorAttachment)=>{
            key += `:${colorAttachment.format}`;
        });
        // convert string to a unique number
        this.key = stringIds.get(key);
    }
    /**
     * Assign a color buffer. This allows the color buffer of the main framebuffer
     * to be swapped each frame to a buffer provided by the context.
     *
     * @param {WebgpuGraphicsDevice} device - The WebGPU graphics device.
     * @param {any} gpuTexture - The color buffer.
     */ assignColorTexture(device, gpuTexture) {
        Debug.assert(gpuTexture);
        this.assignedColorTexture = gpuTexture;
        // create view (optionally handles srgb conversion)
        const view = gpuTexture.createView({
            format: device.backBufferViewFormat
        });
        DebugHelper.setLabel(view, 'Framebuffer.assignedColor');
        // use it as render buffer or resolve target
        const colorAttachment = this.renderPassDescriptor.colorAttachments[0];
        const samples = this.renderTarget.samples;
        if (samples > 1) {
            colorAttachment.resolveTarget = view;
        } else {
            colorAttachment.view = view;
        }
        // for main framebuffer, this is how the format is obtained
        this.setColorAttachment(0, undefined, device.backBufferViewFormat);
        this.updateKey();
    }
    setColorAttachment(index, multisampledBuffer, format) {
        if (!this.colorAttachments[index]) {
            this.colorAttachments[index] = new ColorAttachment();
        }
        if (multisampledBuffer) {
            this.colorAttachments[index].multisampledBuffer = multisampledBuffer;
        }
        if (format) {
            this.colorAttachments[index].format = format;
        }
    }
    /**
     * Initialize render target for rendering one time.
     *
     * @param {WebgpuGraphicsDevice} device - The graphics device.
     * @param {RenderTarget} renderTarget - The render target.
     */ init(device, renderTarget) {
        const wgpu = device.wgpu;
        Debug.assert(!this.initialized);
        WebgpuDebug.memory(device);
        WebgpuDebug.validate(device);
        // initialize depth/stencil
        this.initDepthStencil(device, wgpu, renderTarget);
        // initialize color attachments
        // color formats are based on the textures
        if (renderTarget._colorBuffers) {
            renderTarget._colorBuffers.forEach((colorBuffer, index)=>{
                this.setColorAttachment(index, undefined, colorBuffer.impl.format);
            });
        }
        this.renderPassDescriptor.colorAttachments = [];
        const count = this.isBackbuffer ? 1 : renderTarget._colorBuffers?.length ?? 0;
        for(let i = 0; i < count; ++i){
            const colorAttachment = this.initColor(device, wgpu, renderTarget, i);
            // default framebuffer, buffer gets assigned later
            const isDefaultFramebuffer = i === 0 && this.colorAttachments[0]?.format;
            // if we have a color buffer, or is the default framebuffer
            if (colorAttachment.view || isDefaultFramebuffer) {
                this.renderPassDescriptor.colorAttachments.push(colorAttachment);
            }
        }
        this.updateKey();
        this.initialized = true;
        WebgpuDebug.end(device, 'RenderTarget initialization', {
            renderTarget
        });
        WebgpuDebug.end(device, 'RenderTarget initialization', {
            renderTarget
        });
    }
    initDepthStencil(device, wgpu, renderTarget) {
        const { samples, width, height, depth, depthBuffer } = renderTarget;
        // depth buffer that we render to (single or multi-sampled). We don't create resolve
        // depth buffer as we don't currently resolve it. This might need to change in the future.
        if (depth || depthBuffer) {
            // the depth texture view the rendering will write to
            let renderingView;
            // allocate depth buffer if not provided
            if (!depthBuffer) {
                // TODO: support rendering to 32bit depth without a stencil as well
                this.depthAttachment = new DepthAttachment('depth24plus-stencil8');
                /** @type {GPUTextureDescriptor} */ const depthTextureDesc = {
                    size: [
                        width,
                        height,
                        1
                    ],
                    dimension: '2d',
                    sampleCount: samples,
                    format: this.depthAttachment.format,
                    usage: GPUTextureUsage.RENDER_ATTACHMENT
                };
                if (samples > 1) {
                    // enable multi-sampled depth texture to be a source of our shader based resolver in WebgpuResolver
                    // TODO: we do not always need to resolve it, and so might consider this flag to be optional
                    depthTextureDesc.usage |= GPUTextureUsage.TEXTURE_BINDING;
                } else {
                    // single sampled depth buffer can be copied out (grab pass)
                    // TODO: we should not enable this for shadow maps, as it is not needed
                    depthTextureDesc.usage |= GPUTextureUsage.COPY_SRC;
                }
                // allocate depth buffer
                const depthTexture = wgpu.createTexture(depthTextureDesc);
                DebugHelper.setLabel(depthTexture, `${renderTarget.name}.autoDepthTexture`);
                this.depthAttachment.depthTexture = depthTexture;
                this.depthAttachment.depthTextureInternal = true;
                renderingView = depthTexture.createView();
                DebugHelper.setLabel(renderingView, `${renderTarget.name}.autoDepthView`);
            } else {
                this.depthAttachment = new DepthAttachment(depthBuffer.impl.format);
                if (samples > 1) {
                    // single-sampled depthBuffer.impl.format can be R32F in some cases, but that cannot be used as a depth
                    // buffer, only as a texture to resolve it to. We always use depth24plus-stencil8 for msaa depth buffers.
                    const depthFormat = 'depth24plus-stencil8';
                    this.depthAttachment.format = depthFormat;
                    this.depthAttachment.hasStencil = depthFormat === 'depth24plus-stencil8';
                    // key for matching multi-sampled depth buffer
                    const key = `${depthBuffer.id}:${width}:${height}:${samples}:${depthFormat}`;
                    // check if we have already allocated a multi-sampled depth buffer for the depth buffer
                    const msTextures = getMultisampledTextureCache(device);
                    let msDepthTexture = msTextures.get(key); // this incRefs it if found
                    if (!msDepthTexture) {
                        /** @type {GPUTextureDescriptor} */ const multisampledDepthDesc = {
                            size: [
                                width,
                                height,
                                1
                            ],
                            dimension: '2d',
                            sampleCount: samples,
                            format: depthFormat,
                            usage: GPUTextureUsage.RENDER_ATTACHMENT | // if msaa and resolve targets are different formats, we need to be able to bind the msaa target as a texture for manual shader resolve
                            (depthFormat !== depthBuffer.impl.format ? GPUTextureUsage.TEXTURE_BINDING : 0)
                        };
                        // allocate multi-sampled depth buffer
                        msDepthTexture = wgpu.createTexture(multisampledDepthDesc);
                        DebugHelper.setLabel(msDepthTexture, `${renderTarget.name}.multisampledDepth`);
                        // store it in the cache
                        msTextures.set(key, msDepthTexture);
                    }
                    this.depthAttachment.multisampledDepthBuffer = msDepthTexture;
                    this.depthAttachment.multisampledDepthBufferKey = key;
                    renderingView = msDepthTexture.createView();
                    DebugHelper.setLabel(renderingView, `${renderTarget.name}.multisampledDepthView`);
                } else {
                    // use provided depth buffer
                    const depthTexture = depthBuffer.impl.gpuTexture;
                    this.depthAttachment.depthTexture = depthTexture;
                    renderingView = depthTexture.createView();
                    DebugHelper.setLabel(renderingView, `${renderTarget.name}.depthView`);
                }
            }
            Debug.assert(renderingView);
            this.renderPassDescriptor.depthStencilAttachment = {
                view: renderingView
            };
        }
    }
    /**
     * @param {WebgpuGraphicsDevice} device - The graphics device.
     * @param {GPUDevice} wgpu - The WebGPU device.
     * @param {RenderTarget} renderTarget - The render target.
     * @param {number} index - The color buffer index.
     * @returns {GPURenderPassColorAttachment} The color attachment.
     * @private
     */ initColor(device, wgpu, renderTarget, index) {
        // Single-sampled color buffer gets passed in:
        // - for normal render target, constructor takes the color buffer as an option
        // - for the main framebuffer, the device supplies the buffer each frame
        // And so we only need to create multi-sampled color buffer if needed here.
        /** @type {GPURenderPassColorAttachment} */ const colorAttachment = {};
        const { samples, width, height, mipLevel } = renderTarget;
        const colorBuffer = renderTarget.getColorBuffer(index);
        // view used to write to the color buffer (either by rendering to it, or resolving to it)
        let colorView = null;
        if (colorBuffer) {
            // render to a single mip level
            const mipLevelCount = 1;
            // cubemap face view - face is a single 2d array layer in order [+X, -X, +Y, -Y, +Z, -Z]
            if (colorBuffer.cubemap) {
                colorView = colorBuffer.impl.createView({
                    dimension: '2d',
                    baseArrayLayer: renderTarget.face,
                    arrayLayerCount: 1,
                    mipLevelCount,
                    baseMipLevel: mipLevel
                });
            } else {
                colorView = colorBuffer.impl.createView({
                    mipLevelCount,
                    baseMipLevel: mipLevel
                });
            }
        }
        // multi-sampled color buffer
        if (samples > 1) {
            const format = this.isBackbuffer ? device.backBufferViewFormat : colorBuffer.impl.format;
            /** @type {GPUTextureDescriptor} */ const multisampledTextureDesc = {
                size: [
                    width,
                    height,
                    1
                ],
                dimension: '2d',
                sampleCount: samples,
                format: format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT
            };
            // allocate multi-sampled color buffer
            const multisampledColorBuffer = wgpu.createTexture(multisampledTextureDesc);
            DebugHelper.setLabel(multisampledColorBuffer, `${renderTarget.name}.multisampledColor`);
            this.setColorAttachment(index, multisampledColorBuffer, multisampledTextureDesc.format);
            colorAttachment.view = multisampledColorBuffer.createView();
            DebugHelper.setLabel(colorAttachment.view, `${renderTarget.name}.multisampledColorView`);
            colorAttachment.resolveTarget = colorView;
        } else {
            colorAttachment.view = colorView;
        }
        return colorAttachment;
    }
    /**
     * Update WebGPU render pass descriptor by RenderPass settings.
     *
     * @param {RenderPass} renderPass - The render pass to start.
     * @param {RenderTarget} renderTarget - The render target to render to.
     */ setupForRenderPass(renderPass, renderTarget) {
        Debug.assert(this.renderPassDescriptor);
        const count = this.renderPassDescriptor.colorAttachments?.length ?? 0;
        for(let i = 0; i < count; ++i){
            const colorAttachment = this.renderPassDescriptor.colorAttachments[i];
            const colorOps = renderPass.colorArrayOps[i];
            const srgb = renderTarget.isColorBufferSrgb(i);
            colorAttachment.clearValue = srgb ? colorOps.clearValueLinear : colorOps.clearValue;
            colorAttachment.loadOp = colorOps.clear ? 'clear' : 'load';
            colorAttachment.storeOp = colorOps.store ? 'store' : 'discard';
        }
        const depthAttachment = this.renderPassDescriptor.depthStencilAttachment;
        if (depthAttachment) {
            depthAttachment.depthClearValue = renderPass.depthStencilOps.clearDepthValue;
            depthAttachment.depthLoadOp = renderPass.depthStencilOps.clearDepth ? 'clear' : 'load';
            depthAttachment.depthStoreOp = renderPass.depthStencilOps.storeDepth ? 'store' : 'discard';
            depthAttachment.depthReadOnly = false;
            if (this.depthAttachment.hasStencil) {
                depthAttachment.stencilClearValue = renderPass.depthStencilOps.clearStencilValue;
                depthAttachment.stencilLoadOp = renderPass.depthStencilOps.clearStencil ? 'clear' : 'load';
                depthAttachment.stencilStoreOp = renderPass.depthStencilOps.storeStencil ? 'store' : 'discard';
                depthAttachment.stencilReadOnly = false;
            }
        }
    }
    loseContext() {
        this.initialized = false;
    }
    resolve(device, target, color, depth) {}
    /**
     * @param {RenderTarget} renderTarget - The render target owning this implementation.
     */ constructor(renderTarget){
        /** @type {boolean} */ this.initialized = false;
        /** @type {ColorAttachment[]} */ this.colorAttachments = [];
        /** @type {DepthAttachment|null} */ this.depthAttachment = null;
        /**
     * Texture assigned each frame, and not owned by this render target. This is used on the
     * framebuffer to assign per frame texture obtained from the context.
     *
     * @type {GPUTexture}
     * @private
     */ this.assignedColorTexture = null;
        /**
     * Render pass descriptor used when starting a render pass for this render target.
     *
     * @type {GPURenderPassDescriptor}
     * @private
     */ this.renderPassDescriptor = {};
        /**
     * True if this is the backbuffer of the device.
     *
     * @type {boolean}
     */ this.isBackbuffer = false;
        this.renderTarget = renderTarget;
    }
}

/**
 * @import { GraphicsDevice } from './graphics-device.js'
 * @import { ScopeId } from './scope-id.js'
 */ // map of UNIFORMTYPE_*** to number of 32bit components
const uniformTypeToNumComponents = [];
uniformTypeToNumComponents[UNIFORMTYPE_FLOAT] = 1;
uniformTypeToNumComponents[UNIFORMTYPE_VEC2] = 2;
uniformTypeToNumComponents[UNIFORMTYPE_VEC3] = 3;
uniformTypeToNumComponents[UNIFORMTYPE_VEC4] = 4;
uniformTypeToNumComponents[UNIFORMTYPE_INT] = 1;
uniformTypeToNumComponents[UNIFORMTYPE_IVEC2] = 2;
uniformTypeToNumComponents[UNIFORMTYPE_IVEC3] = 3;
uniformTypeToNumComponents[UNIFORMTYPE_IVEC4] = 4;
uniformTypeToNumComponents[UNIFORMTYPE_BOOL] = 1;
uniformTypeToNumComponents[UNIFORMTYPE_BVEC2] = 2;
uniformTypeToNumComponents[UNIFORMTYPE_BVEC3] = 3;
uniformTypeToNumComponents[UNIFORMTYPE_BVEC4] = 4;
uniformTypeToNumComponents[UNIFORMTYPE_MAT2] = 8; // 2 x vec4
uniformTypeToNumComponents[UNIFORMTYPE_MAT3] = 12; // 3 x vec4
uniformTypeToNumComponents[UNIFORMTYPE_MAT4] = 16; // 4 x vec4
uniformTypeToNumComponents[UNIFORMTYPE_UINT] = 1;
uniformTypeToNumComponents[UNIFORMTYPE_UVEC2] = 2;
uniformTypeToNumComponents[UNIFORMTYPE_UVEC3] = 3;
uniformTypeToNumComponents[UNIFORMTYPE_UVEC4] = 4;
/**
 * A class storing description of an individual uniform, stored inside a uniform buffer.
 *
 * @category Graphics
 */ class UniformFormat {
    /**
     * True if this is an array of elements (i.e. count > 0)
     *
     * @type {boolean}
     */ get isArrayType() {
        return this.count > 0;
    }
    // std140 rules: https://registry.khronos.org/OpenGL/specs/gl/glspec45.core.pdf#page=159
    // TODO: this supports limited subset of functionality, arrays and arrays of structs are not supported.
    calculateOffset(offset) {
        // Note: vec3 has the same alignment as vec4
        let alignment = this.byteSize <= 8 ? this.byteSize : 16;
        // arrays have vec4 alignments
        if (this.count) {
            alignment = 16;
        }
        // align the start offset
        offset = math.roundUp(offset, alignment);
        this.offset = offset / 4;
    }
    /**
     * Create a new UniformFormat instance.
     *
     * @param {string} name - The name of the uniform.
     * @param {number} type - The type of the uniform. One of the UNIFORMTYPE_*** constants.
     * @param {number} count - The number of elements in the array. Defaults to 0, which represents
     * a single element (not an array).
     */ constructor(name, type, count = 0){
        // just a name
        this.shortName = name;
        // name with [0] if this is an array
        this.name = count ? `${name}[0]` : name;
        this.type = type;
        this.numComponents = uniformTypeToNumComponents[type];
        Debug.assert(this.numComponents, `Unhandled uniform format ${type} used for ${name}`);
        this.updateType = type;
        if (count > 0) {
            switch(type){
                case UNIFORMTYPE_FLOAT:
                    this.updateType = UNIFORMTYPE_FLOATARRAY;
                    break;
                case UNIFORMTYPE_INT:
                    this.updateType = UNIFORMTYPE_INTARRAY;
                    break;
                case UNIFORMTYPE_UINT:
                    this.updateType = UNIFORMTYPE_UINTARRAY;
                    break;
                case UNIFORMTYPE_BOOL:
                    this.updateType = UNIFORMTYPE_BOOLARRAY;
                    break;
                case UNIFORMTYPE_VEC2:
                    this.updateType = UNIFORMTYPE_VEC2ARRAY;
                    break;
                case UNIFORMTYPE_IVEC2:
                    this.updateType = UNIFORMTYPE_IVEC2ARRAY;
                    break;
                case UNIFORMTYPE_UVEC2:
                    this.updateType = UNIFORMTYPE_UVEC2ARRAY;
                    break;
                case UNIFORMTYPE_BVEC2:
                    this.updateType = UNIFORMTYPE_BVEC2ARRAY;
                    break;
                case UNIFORMTYPE_VEC3:
                    this.updateType = UNIFORMTYPE_VEC3ARRAY;
                    break;
                case UNIFORMTYPE_IVEC3:
                    this.updateType = UNIFORMTYPE_IVEC3ARRAY;
                    break;
                case UNIFORMTYPE_UVEC3:
                    this.updateType = UNIFORMTYPE_UVEC3ARRAY;
                    break;
                case UNIFORMTYPE_BVEC3:
                    this.updateType = UNIFORMTYPE_BVEC3ARRAY;
                    break;
                case UNIFORMTYPE_VEC4:
                    this.updateType = UNIFORMTYPE_VEC4ARRAY;
                    break;
                case UNIFORMTYPE_IVEC4:
                    this.updateType = UNIFORMTYPE_IVEC4ARRAY;
                    break;
                case UNIFORMTYPE_UVEC4:
                    this.updateType = UNIFORMTYPE_UVEC4ARRAY;
                    break;
                case UNIFORMTYPE_BVEC4:
                    this.updateType = UNIFORMTYPE_BVEC4ARRAY;
                    break;
                case UNIFORMTYPE_MAT4:
                    this.updateType = UNIFORMTYPE_MAT4ARRAY;
                    break;
                default:
                    Debug.error(`Uniform array of type ${uniformTypeToName[type]} is not supported when processing uniform '${name}'.`);
                    Debug.call(()=>{
                        this.invalid = true;
                    });
                    break;
            }
        }
        this.count = count;
        Debug.assert(!isNaN(count), `Unsupported uniform: ${name}[${count}]`);
        Debug.call(()=>{
            if (isNaN(count)) {
                this.invalid = true;
            }
        });
        let componentSize = this.numComponents;
        // component size for arrays is aligned up to vec4
        if (count) {
            componentSize = math.roundUp(componentSize, 4);
        }
        this.byteSize = componentSize * 4;
        if (count) {
            this.byteSize *= count;
        }
        Debug.assert(this.byteSize, `Unknown byte size for uniform format ${type} used for ${name}`);
    }
}
/**
 * A descriptor that defines the layout of of data inside the uniform buffer.
 *
 * @category Graphics
 */ class UniformBufferFormat {
    /**
     * Returns format of a uniform with specified name. Returns undefined if the uniform is not found.
     *
     * @param {string} name - The name of the uniform.
     * @returns {UniformFormat|undefined} - The format of the uniform.
     */ get(name) {
        return this.map.get(name);
    }
    /**
     * Create a new UniformBufferFormat instance.
     *
     * @param {GraphicsDevice} graphicsDevice - The graphics device.
     * @param {UniformFormat[]} uniforms - An array of uniforms to be stored in the buffer
     */ constructor(graphicsDevice, uniforms){
        /**
     * @type {number}
     * @ignore
     */ this.byteSize = 0;
        /**
     * @type {Map<string,UniformFormat>}
     * @ignore
     */ this.map = new Map();
        this.scope = graphicsDevice.scope;
        /** @type {UniformFormat[]} */ this.uniforms = uniforms;
        // TODO: optimize uniforms ordering
        let offset = 0;
        for(let i = 0; i < uniforms.length; i++){
            const uniform = uniforms[i];
            uniform.calculateOffset(offset);
            offset = uniform.offset * 4 + uniform.byteSize;
            uniform.scopeId = this.scope.resolve(uniform.name);
            this.map.set(uniform.name, uniform);
        }
        // round up buffer size
        this.byteSize = math.roundUp(offset, 16);
    }
}

/**
 * @import { GraphicsDevice } from './graphics-device.js'
 * @import { ShaderProcessorOptions } from './shader-processor-options.js'
 * @import { Shader } from './shader.js'
 */ // accepted keywords
// TODO: 'out' keyword is not in the list, as handling it is more complicated due
// to 'out' keyword also being used to mark output only function parameters.
const KEYWORD$2 = /[ \t]*(\battribute\b|\bvarying\b|\buniform\b)/g;
// match 'attribute' and anything else till ';'
// eslint-disable-next-line regexp/no-unused-capturing-group, regexp/no-super-linear-backtracking
const KEYWORD_LINE$1 = /(\battribute\b|\bvarying\b|\bout\b|\buniform\b)[ \t]*([^;]+)(;+)/g;
// marker for a place in the source code to be replaced by code
const MARKER$1 = '@@@';
// an array identifier, for example 'data[4]' - group 1 is 'data', group 2 is everything in brackets: '4'
const ARRAY_IDENTIFIER = /([\w-]+)\[(.*?)\]/;
const precisionQualifiers = new Set([
    'highp',
    'mediump',
    'lowp'
]);
const shadowSamplers = new Set([
    'sampler2DShadow',
    'samplerCubeShadow',
    'sampler2DArrayShadow'
]);
const textureDimensions = {
    sampler2D: TEXTUREDIMENSION_2D,
    sampler3D: TEXTUREDIMENSION_3D,
    samplerCube: TEXTUREDIMENSION_CUBE,
    samplerCubeShadow: TEXTUREDIMENSION_CUBE,
    sampler2DShadow: TEXTUREDIMENSION_2D,
    sampler2DArray: TEXTUREDIMENSION_2D_ARRAY,
    sampler2DArrayShadow: TEXTUREDIMENSION_2D_ARRAY,
    isampler2D: TEXTUREDIMENSION_2D,
    usampler2D: TEXTUREDIMENSION_2D,
    isampler3D: TEXTUREDIMENSION_3D,
    usampler3D: TEXTUREDIMENSION_3D,
    isamplerCube: TEXTUREDIMENSION_CUBE,
    usamplerCube: TEXTUREDIMENSION_CUBE,
    isampler2DArray: TEXTUREDIMENSION_2D_ARRAY,
    usampler2DArray: TEXTUREDIMENSION_2D_ARRAY
};
const textureDimensionInfo = {
    [TEXTUREDIMENSION_2D]: 'texture2D',
    [TEXTUREDIMENSION_CUBE]: 'textureCube',
    [TEXTUREDIMENSION_3D]: 'texture3D',
    [TEXTUREDIMENSION_2D_ARRAY]: 'texture2DArray'
};
let UniformLine$1 = class UniformLine {
    constructor(line, shader){
        // example: `lowp vec4 tints[2 * 4]`
        this.line = line;
        // split to words handling any number of spaces
        const words = line.trim().split(/\s+/);
        // optional precision
        if (precisionQualifiers.has(words[0])) {
            this.precision = words.shift();
        }
        // type
        this.type = words.shift();
        if (line.includes(',')) {
            Debug.error(`A comma on a uniform line is not supported, split it into multiple uniforms: ${line}`, shader);
        }
        // array of uniforms
        if (line.includes('[')) {
            const rest = words.join(' ');
            const match = ARRAY_IDENTIFIER.exec(rest);
            Debug.assert(match);
            this.name = match[1];
            this.arraySize = Number(match[2]);
            if (isNaN(this.arraySize)) {
                shader.failed = true;
                Debug.error(`Only numerically specified uniform array sizes are supported, this uniform is not supported: '${line}'`, shader);
            }
        } else {
            // simple uniform
            this.name = words.shift();
            this.arraySize = 0;
        }
        this.isSampler = this.type.indexOf('sampler') !== -1;
        this.isSignedInt = this.type.indexOf('isampler') !== -1;
        this.isUnsignedInt = this.type.indexOf('usampler') !== -1;
    }
};
/**
 * Pure static class implementing processing of GLSL shaders. It allocates fixed locations for
 * attributes, and handles conversion of uniforms to uniform buffers.
 */ class ShaderProcessorGLSL {
    /**
     * Process the shader.
     *
     * @param {GraphicsDevice} device - The graphics device.
     * @param {object} shaderDefinition - The shader definition.
     * @param {Shader} shader - The shader.
     * @returns {object} - The processed shader data.
     */ static run(device, shaderDefinition, shader) {
        /** @type {Map<string, number>} */ const varyingMap = new Map();
        // extract lines of interests from both shaders
        const vertexExtracted = ShaderProcessorGLSL.extract(shaderDefinition.vshader);
        const fragmentExtracted = ShaderProcessorGLSL.extract(shaderDefinition.fshader);
        // VS - convert a list of attributes to a shader block with fixed locations
        const attributesMap = new Map();
        const attributesBlock = ShaderProcessorGLSL.processAttributes(vertexExtracted.attributes, shaderDefinition.attributes, attributesMap, shaderDefinition.processingOptions);
        // VS - convert a list of varyings to a shader block
        const vertexVaryingsBlock = ShaderProcessorGLSL.processVaryings(vertexExtracted.varyings, varyingMap, true);
        // FS - convert a list of varyings to a shader block
        const fragmentVaryingsBlock = ShaderProcessorGLSL.processVaryings(fragmentExtracted.varyings, varyingMap, false);
        // FS - convert a list of outputs to a shader block
        const outBlock = ShaderProcessorGLSL.processOuts(fragmentExtracted.outs);
        // uniforms - merge vertex and fragment uniforms, and create shared uniform buffers
        // Note that as both vertex and fragment can declare the same uniform, we need to remove duplicates
        const concatUniforms = vertexExtracted.uniforms.concat(fragmentExtracted.uniforms);
        const uniforms = Array.from(new Set(concatUniforms));
        // parse uniform lines
        const parsedUniforms = uniforms.map((line)=>new UniformLine$1(line, shader));
        // validation - as uniforms go to a shared uniform buffer, vertex and fragment versions need to match
        Debug.call(()=>{
            const map = new Map();
            parsedUniforms.forEach((uni)=>{
                const existing = map.get(uni.name);
                Debug.assert(!existing, `Vertex and fragment shaders cannot use the same uniform name with different types: '${existing}' and '${uni.line}'`, shader);
                map.set(uni.name, uni.line);
            });
        });
        const uniformsData = ShaderProcessorGLSL.processUniforms(device, parsedUniforms, shaderDefinition.processingOptions, shader);
        // VS - insert the blocks to the source
        const vBlock = `${attributesBlock}\n${vertexVaryingsBlock}\n${uniformsData.code}`;
        const vshader = vertexExtracted.src.replace(MARKER$1, vBlock);
        // FS - insert the blocks to the source
        const fBlock = `${fragmentVaryingsBlock}\n${outBlock}\n${uniformsData.code}`;
        const fshader = fragmentExtracted.src.replace(MARKER$1, fBlock);
        return {
            vshader: vshader,
            fshader: fshader,
            attributes: attributesMap,
            meshUniformBufferFormat: uniformsData.meshUniformBufferFormat,
            meshBindGroupFormat: uniformsData.meshBindGroupFormat
        };
    }
    // Extract required information from the shader source code.
    static extract(src) {
        // collected data
        const attributes = [];
        const varyings = [];
        const outs = [];
        const uniforms = [];
        // replacement marker - mark a first replacement place, this is where code
        // blocks are injected later
        let replacement = `${MARKER$1}\n`;
        // extract relevant parts of the shader
        let match;
        while((match = KEYWORD$2.exec(src)) !== null){
            const keyword = match[1];
            switch(keyword){
                case 'attribute':
                case 'varying':
                case 'uniform':
                case 'out':
                    {
                        // read the line
                        KEYWORD_LINE$1.lastIndex = match.index;
                        const lineMatch = KEYWORD_LINE$1.exec(src);
                        if (keyword === 'attribute') {
                            attributes.push(lineMatch[2]);
                        } else if (keyword === 'varying') {
                            varyings.push(lineMatch[2]);
                        } else if (keyword === 'out') {
                            outs.push(lineMatch[2]);
                        } else if (keyword === 'uniform') {
                            uniforms.push(lineMatch[2]);
                        }
                        // cut it out
                        src = ShaderProcessorGLSL.cutOut(src, match.index, KEYWORD_LINE$1.lastIndex, replacement);
                        KEYWORD$2.lastIndex = match.index + replacement.length;
                        // only place a single replacement marker
                        replacement = '';
                        break;
                    }
            }
        }
        return {
            src,
            attributes,
            varyings,
            outs,
            uniforms
        };
    }
    /**
     * Process the lines with uniforms. The function receives the lines containing all uniforms,
     * both numerical as well as textures/samplers. The function also receives the format of uniform
     * buffers (numerical) and bind groups (textures) for view and material level. All uniforms that
     * match any of those are ignored, as those would be supplied by view / material level buffers.
     * All leftover uniforms create uniform buffer and bind group for the mesh itself, containing
     * uniforms that change on the level of the mesh.
     *
     * @param {GraphicsDevice} device - The graphics device.
     * @param {Array<UniformLine>} uniforms - Lines containing uniforms.
     * @param {ShaderProcessorOptions} processingOptions - Uniform formats.
     * @param {Shader} shader - The shader definition.
     * @returns {object} - The uniform data. Returns a shader code block containing uniforms, to be
     * inserted into the shader, as well as generated uniform format structures for the mesh level.
     */ static processUniforms(device, uniforms, processingOptions, shader) {
        // split uniform lines into samplers and the rest
        /** @type {Array<UniformLine>} */ const uniformLinesSamplers = [];
        /** @type {Array<UniformLine>} */ const uniformLinesNonSamplers = [];
        uniforms.forEach((uniform)=>{
            if (uniform.isSampler) {
                uniformLinesSamplers.push(uniform);
            } else {
                uniformLinesNonSamplers.push(uniform);
            }
        });
        // build mesh uniform buffer format
        const meshUniforms = [];
        uniformLinesNonSamplers.forEach((uniform)=>{
            // uniforms not already in supplied uniform buffers go to the mesh buffer
            if (!processingOptions.hasUniform(uniform.name)) {
                const uniformType = uniformTypeToName.indexOf(uniform.type);
                Debug.assert(uniformType >= 0, `Uniform type ${uniform.type} is not recognized on line [${uniform.line}]`);
                const uniformFormat = new UniformFormat(uniform.name, uniformType, uniform.arraySize);
                Debug.assert(!uniformFormat.invalid, `Invalid uniform line: ${uniform.line}`, shader);
                meshUniforms.push(uniformFormat);
            }
        // validate types in else
        });
        // if we don't have any uniform, add a dummy uniform to avoid empty uniform buffer - WebGPU rendering does not
        // support rendering will NULL bind group as binding a null buffer changes placement of other bindings
        if (meshUniforms.length === 0) {
            meshUniforms.push(new UniformFormat(UNUSED_UNIFORM_NAME, UNIFORMTYPE_FLOAT));
        }
        const meshUniformBufferFormat = meshUniforms.length ? new UniformBufferFormat(device, meshUniforms) : null;
        // build mesh bind group format - this contains the textures, but not the uniform buffer as that is a separate binding
        const textureFormats = [];
        uniformLinesSamplers.forEach((uniform)=>{
            // unmatched texture uniforms go to mesh block
            if (!processingOptions.hasTexture(uniform.name)) {
                // sample type
                // WebGpu does not currently support filtered float format textures, and so we map them to unfilterable type
                // as we sample them without filtering anyways
                let sampleType = SAMPLETYPE_FLOAT;
                if (uniform.isSignedInt) {
                    sampleType = SAMPLETYPE_INT;
                } else if (uniform.isUnsignedInt) {
                    sampleType = SAMPLETYPE_UINT;
                } else {
                    if (uniform.precision === 'highp') {
                        sampleType = SAMPLETYPE_UNFILTERABLE_FLOAT;
                    }
                    if (shadowSamplers.has(uniform.type)) {
                        sampleType = SAMPLETYPE_DEPTH;
                    }
                }
                // dimension
                const dimension = textureDimensions[uniform.type];
                // TODO: we could optimize visibility to only stages that use any of the data
                textureFormats.push(new BindTextureFormat(uniform.name, SHADERSTAGE_VERTEX | SHADERSTAGE_FRAGMENT, dimension, sampleType));
            }
        // validate types in else
        });
        const meshBindGroupFormat = new BindGroupFormat(device, textureFormats);
        // generate code for uniform buffers
        let code = '';
        processingOptions.uniformFormats.forEach((format, bindGroupIndex)=>{
            if (format) {
                code += ShaderProcessorGLSL.getUniformShaderDeclaration(format, bindGroupIndex, 0);
            }
        });
        // and also for generated mesh format, which is at the slot 0 of the bind group
        if (meshUniformBufferFormat) {
            code += ShaderProcessorGLSL.getUniformShaderDeclaration(meshUniformBufferFormat, BINDGROUP_MESH_UB, 0);
        }
        // generate code for textures
        processingOptions.bindGroupFormats.forEach((format, bindGroupIndex)=>{
            if (format) {
                code += ShaderProcessorGLSL.getTexturesShaderDeclaration(format, bindGroupIndex);
            }
        });
        // and also for generated mesh format
        code += ShaderProcessorGLSL.getTexturesShaderDeclaration(meshBindGroupFormat, BINDGROUP_MESH);
        return {
            code,
            meshUniformBufferFormat,
            meshBindGroupFormat
        };
    }
    static processVaryings(varyingLines, varyingMap, isVertex) {
        let block = '';
        const op = isVertex ? 'out' : 'in';
        varyingLines.forEach((line, index)=>{
            const words = ShaderProcessorGLSL.splitToWords(line);
            const type = words.slice(0, -1).join(' ');
            const name = words[words.length - 1];
            if (isVertex) {
                // store it in the map
                varyingMap.set(name, index);
            } else {
                Debug.assert(varyingMap.has(name), `Fragment shader requires varying [${name}] but vertex shader does not generate it.`);
                index = varyingMap.get(name);
            }
            // generates: 'layout(location = 0) in vec4 position;'
            block += `layout(location = ${index}) ${op} ${type} ${name};\n`;
        });
        return block;
    }
    static processOuts(outsLines) {
        let block = '';
        outsLines.forEach((line, index)=>{
            // generates: 'layout(location = 0) out vec4 gl_FragColor;'
            block += `layout(location = ${index}) out ${line};\n`;
        });
        return block;
    }
    // extract count from type ('vec3' => 3, 'float' => 1)
    static getTypeCount(type) {
        const lastChar = type.substring(type.length - 1);
        const num = parseInt(lastChar, 10);
        return isNaN(num) ? 1 : num;
    }
    static processAttributes(attributeLines, shaderDefinitionAttributes, attributesMap, processingOptions) {
        let block = '';
        const usedLocations = {};
        attributeLines.forEach((line)=>{
            const words = ShaderProcessorGLSL.splitToWords(line);
            let type = words[0];
            let name = words[1];
            if (shaderDefinitionAttributes.hasOwnProperty(name)) {
                const semantic = shaderDefinitionAttributes[name];
                const location = semanticToLocation[semantic];
                Debug.assert(location !== undefined, `Semantic ${semantic} used by the attribute ${name} is not known - make sure it's one of the supported semantics.`);
                Debug.assert(!usedLocations.hasOwnProperty(location), `WARNING: Two vertex attributes are mapped to the same location in a shader: ${usedLocations[location]} and ${semantic}`);
                usedLocations[location] = semantic;
                // build a map of used attributes
                attributesMap.set(location, name);
                // if vertex format for this attribute is not of a float type, we need to adjust the attribute format, for example we convert
                //      attribute vec4 vertex_position;
                // to
                //      attribute ivec4 _private_vertex_position;
                //      vec4 vertex_position = vec4(_private_vertex_position);
                // Note that we skip normalized elements, as shader receives them as floats already.
                let copyCode;
                const element = processingOptions.getVertexElement(semantic);
                if (element) {
                    const dataType = element.dataType;
                    if (dataType !== TYPE_FLOAT32 && dataType !== TYPE_FLOAT16 && !element.normalize && !element.asInt) {
                        const attribNumElements = ShaderProcessorGLSL.getTypeCount(type);
                        const newName = `_private_${name}`;
                        // second line of new code, copy private (u)int type into vec type
                        copyCode = `vec${attribNumElements} ${name} = vec${attribNumElements}(${newName});\n`;
                        name = newName;
                        // new attribute type, based on the vertex format element type, example: vec3 -> ivec3
                        const isSignedType = dataType === TYPE_INT8 || dataType === TYPE_INT16 || dataType === TYPE_INT32;
                        if (attribNumElements === 1) {
                            type = isSignedType ? 'int' : 'uint';
                        } else {
                            type = isSignedType ? `ivec${attribNumElements}` : `uvec${attribNumElements}`;
                        }
                    }
                }
                // generates: 'layout(location = 0) in vec4 position;'
                block += `layout(location = ${location}) in ${type} ${name};\n`;
                if (copyCode) {
                    block += copyCode;
                }
            }
        });
        return block;
    }
    static splitToWords(line) {
        // remove any double spaces
        line = line.replace(/\s+/g, ' ').trim();
        return line.split(' ');
    }
    static cutOut(src, start, end, replacement) {
        return src.substring(0, start) + replacement + src.substring(end);
    }
    static getUniformShaderDeclaration(format, bindGroup, bindIndex) {
        const name = bindGroupNames[bindGroup];
        let code = `layout(set = ${bindGroup}, binding = ${bindIndex}, std140) uniform ub_${name} {\n`;
        format.uniforms.forEach((uniform)=>{
            const typeString = uniformTypeToName[uniform.type];
            Debug.assert(typeString.length > 0, `Uniform type ${uniform.type} is not handled.`);
            code += `    ${typeString} ${uniform.shortName}${uniform.count ? `[${uniform.count}]` : ''};\n`;
        });
        return `${code}};\n`;
    }
    static getTexturesShaderDeclaration(bindGroupFormat, bindGroup) {
        let code = '';
        bindGroupFormat.textureFormats.forEach((format)=>{
            let textureType = textureDimensionInfo[format.textureDimension];
            Debug.assert(textureType, 'Unsupported texture type', format.textureDimension);
            const isArray = textureType === 'texture2DArray';
            const sampleTypePrefix = format.sampleType === SAMPLETYPE_UINT ? 'u' : format.sampleType === SAMPLETYPE_INT ? 'i' : '';
            textureType = `${sampleTypePrefix}${textureType}`;
            // handle texture2DArray by renaming the texture object and defining a replacement macro
            let namePostfix = '';
            let extraCode = '';
            if (isArray) {
                namePostfix = '_texture';
                extraCode = `#define ${format.name} ${sampleTypePrefix}sampler2DArray(${format.name}${namePostfix}, ${format.name}_sampler)\n`;
            }
            code += `layout(set = ${bindGroup}, binding = ${format.slot}) uniform ${textureType} ${format.name}${namePostfix};\n`;
            if (format.hasSampler) {
                code += `layout(set = ${bindGroup}, binding = ${format.slot + 1}) uniform sampler ${format.name}_sampler;\n`;
            }
            code += extraCode;
        });
        return code;
    }
}

/**
 * @import { GraphicsDevice } from '../graphics-device.js'
 * @import { ShaderProcessorOptions } from '../shader-processor-options.js'
 * @import { Shader } from '../shader.js'
 */ // matches lines where the keyword is the first non-whitespace content, followed by a whitespace
const KEYWORD$1 = /^[ \t]*(attribute|varying|uniform)[\t ]+/gm;
// match 'attribute' and anything else till ';'
// eslint-disable-next-line
const KEYWORD_LINE = /^[ \t]*(attribute|varying|uniform)[ \t]*([^;]+)(;+)/gm;
// match global variables
//   branch A matches: var<storage,...>
//   branch B matches: texture, storage buffer, storage texture or external texture
// eslint-disable-next-line
const KEYWORD_RESOURCE = /^[ \t]*var\s*(?:(<storage,[^>]*>)\s*([\w\d_]+)\s*:\s*(.*?)\s*;|(<(?!storage,)[^>]*>)?\s*([\w\d_]+)\s*:\s*(texture_.*|storage_texture_.*|storage\w.*|external_texture|sampler(?:_comparison)?)\s*;)\s*$/gm;
// match varying name from string like: '@interpolate(perspective, centroid) smoothColor : vec3f;'
// eslint-disable-next-line
const VARYING = /(?:@interpolate\([^)]*\)\s*)?([\w]+)\s*:\s*([\w<>]+)/;
// marker for a place in the source code to be replaced by code
const MARKER = '@@@';
// matches vertex of fragment entry function, extracts the input name. Ends at the start of the function body '{'.
const ENTRY_FUNCTION = /(@vertex|@fragment)\s*fn\s+\w+\s*\(\s*(\w+)\s*:[\s\S]*?\{/;
const textureBaseInfo = {
    'texture_1d': {
        viewDimension: TEXTUREDIMENSION_1D,
        baseSampleType: SAMPLETYPE_FLOAT
    },
    'texture_2d': {
        viewDimension: TEXTUREDIMENSION_2D,
        baseSampleType: SAMPLETYPE_FLOAT
    },
    'texture_2d_array': {
        viewDimension: TEXTUREDIMENSION_2D_ARRAY,
        baseSampleType: SAMPLETYPE_FLOAT
    },
    'texture_3d': {
        viewDimension: TEXTUREDIMENSION_3D,
        baseSampleType: SAMPLETYPE_FLOAT
    },
    'texture_cube': {
        viewDimension: TEXTUREDIMENSION_CUBE,
        baseSampleType: SAMPLETYPE_FLOAT
    },
    'texture_cube_array': {
        viewDimension: TEXTUREDIMENSION_CUBE_ARRAY,
        baseSampleType: SAMPLETYPE_FLOAT
    },
    'texture_multisampled_2d': {
        viewDimension: TEXTUREDIMENSION_2D,
        baseSampleType: SAMPLETYPE_FLOAT
    },
    'texture_depth_2d': {
        viewDimension: TEXTUREDIMENSION_2D,
        baseSampleType: SAMPLETYPE_DEPTH
    },
    'texture_depth_2d_array': {
        viewDimension: TEXTUREDIMENSION_2D_ARRAY,
        baseSampleType: SAMPLETYPE_DEPTH
    },
    'texture_depth_cube': {
        viewDimension: TEXTUREDIMENSION_CUBE,
        baseSampleType: SAMPLETYPE_DEPTH
    },
    'texture_depth_cube_array': {
        viewDimension: TEXTUREDIMENSION_CUBE_ARRAY,
        baseSampleType: SAMPLETYPE_DEPTH
    },
    'texture_external': {
        viewDimension: TEXTUREDIMENSION_2D,
        baseSampleType: SAMPLETYPE_UNFILTERABLE_FLOAT
    }
};
// get the view dimension and sample type for a given texture type
// example: texture_2d_array<u32> -> 2d_array & uint
const getTextureInfo = (baseType, componentType)=>{
    const baseInfo = textureBaseInfo[baseType];
    Debug.assert(baseInfo);
    let finalSampleType = baseInfo.baseSampleType;
    if (baseInfo.baseSampleType === SAMPLETYPE_FLOAT && baseType !== 'texture_multisampled_2d') {
        switch(componentType){
            case 'u32':
                finalSampleType = SAMPLETYPE_UINT;
                break;
            case 'i32':
                finalSampleType = SAMPLETYPE_INT;
                break;
            case 'f32':
                finalSampleType = SAMPLETYPE_FLOAT;
                break;
            // custom 'uff' type for unfilterable float, allowing us to create correct bind, which is automatically generated based on the shader
            case 'uff':
                finalSampleType = SAMPLETYPE_UNFILTERABLE_FLOAT;
                break;
        }
    }
    return {
        viewDimension: baseInfo.viewDimension,
        sampleType: finalSampleType
    };
};
// reverse to getTextureInfo, convert view dimension and sample type to texture declaration
// example: 2d_array & float -> texture_2d_array<f32>
const getTextureDeclarationType = (viewDimension, sampleType)=>{
    // types without template specifiers
    if (sampleType === SAMPLETYPE_DEPTH) {
        switch(viewDimension){
            case TEXTUREDIMENSION_2D:
                return 'texture_depth_2d';
            case TEXTUREDIMENSION_2D_ARRAY:
                return 'texture_depth_2d_array';
            case TEXTUREDIMENSION_CUBE:
                return 'texture_depth_cube';
            case TEXTUREDIMENSION_CUBE_ARRAY:
                return 'texture_depth_cube_array';
            default:
                Debug.assert(false);
        }
    }
    // the base texture type string based on dimension
    let baseTypeString;
    switch(viewDimension){
        case TEXTUREDIMENSION_1D:
            baseTypeString = 'texture_1d';
            break;
        case TEXTUREDIMENSION_2D:
            baseTypeString = 'texture_2d';
            break;
        case TEXTUREDIMENSION_2D_ARRAY:
            baseTypeString = 'texture_2d_array';
            break;
        case TEXTUREDIMENSION_3D:
            baseTypeString = 'texture_3d';
            break;
        case TEXTUREDIMENSION_CUBE:
            baseTypeString = 'texture_cube';
            break;
        case TEXTUREDIMENSION_CUBE_ARRAY:
            baseTypeString = 'texture_cube_array';
            break;
        default:
            Debug.assert(false);
    }
    // component format string ('f32', 'u32', 'i32')
    let coreFormatString;
    switch(sampleType){
        case SAMPLETYPE_FLOAT:
        case SAMPLETYPE_UNFILTERABLE_FLOAT:
            coreFormatString = 'f32';
            break;
        case SAMPLETYPE_UINT:
            coreFormatString = 'u32';
            break;
        case SAMPLETYPE_INT:
            coreFormatString = 'i32';
            break;
        default:
            Debug.assert(false);
    }
    // final type
    return `${baseTypeString}<${coreFormatString}>`;
};
const wrappedArrayTypes = {
    'f32': 'WrappedF32',
    'i32': 'WrappedI32',
    'u32': 'WrappedU32',
    'vec2f': 'WrappedVec2F',
    'vec2i': 'WrappedVec2I',
    'vec2u': 'WrappedVec2U'
};
const splitToWords = (line)=>{
    // remove any double spaces
    line = line.replace(/\s+/g, ' ').trim();
    // Split by spaces or ':' symbol
    return line.split(/[\s:]+/);
};
// matches: array<f32, 4>;
// eslint-disable-next-line
const UNIFORM_ARRAY_REGEX = /array<([^,]+),\s*([^>]+)>/;
class UniformLine {
    constructor(line, shader){
        /**
     * A name of the ub buffer which this uniform is assigned to.
     *
     * @type {string|null}
     */ this.ubName = null;
        this.arraySize = 0;
        // Save the raw line
        this.line = line;
        // Use splitToWords to split the line into parts
        const parts = splitToWords(line);
        if (parts.length < 2) {
            Debug.error(`Invalid uniform line format: ${line}`, shader);
            shader.failed = true;
            return;
        }
        // Extract the name and type
        this.name = parts[0];
        this.type = parts.slice(1).join(' ');
        // array of uniforms (e.g. array<f32, 5>)
        if (this.type.includes('array<')) {
            const match = UNIFORM_ARRAY_REGEX.exec(this.type);
            Debug.assert(match, `Array type on line [${line}] is not supported.`);
            // array type
            this.type = match[1].trim();
            this.arraySize = Number(match[2]);
            if (isNaN(this.arraySize)) {
                shader.failed = true;
                Debug.error(`Only numerically specified uniform array sizes are supported, this uniform is not supported: '${line}'`, shader);
            }
        }
    }
}
// regex constants for resource lines, for example:
//     var diffuseTexture : texture_2d<f32>;
//     var diffuseTextures : texture_2d_array<f32>;
//     var shadowMap : texture_depth_2d;
//     var diffuseSampler : sampler;
//     var<storage, read> particles: array<Particle>;
//     var<storage, read_write> storageBuffer : Buffer;
//     var storageTexture : texture_storage_2d<rgba8unorm, write>;
//     var videoTexture : texture_external;
const TEXTURE_REGEX = /^\s*var\s+(\w+)\s*:\s*(texture_\w+)(?:<(\w+)>)?;\s*$/;
// eslint-disable-next-line
const STORAGE_TEXTURE_REGEX = /^\s*var\s+([\w\d_]+)\s*:\s*(texture_storage_2d|texture_storage_2d_array)<([\w\d_]+),\s*(\w+)>\s*;\s*$/;
// eslint-disable-next-line
const STORAGE_BUFFER_REGEX = /^\s*var\s*<storage,\s*(read|write)?>\s*([\w\d_]+)\s*:\s*(.*)\s*;\s*$/;
// eslint-disable-next-line
const EXTERNAL_TEXTURE_REGEX = /^\s*var\s+([\w\d_]+)\s*:\s*texture_external;\s*$/;
// eslint-disable-next-line
const SAMPLER_REGEX = /^\s*var\s+([\w\d_]+)\s*:\s*(sampler|sampler_comparison)\s*;\s*$/;
// ResourceLine class to parse the resource declarations
class ResourceLine {
    equals(other) {
        if (this.name !== other.name) return false;
        if (this.type !== other.type) return false;
        if (this.isTexture !== other.isTexture) return false;
        if (this.isSampler !== other.isSampler) return false;
        if (this.isStorageTexture !== other.isStorageTexture) return false;
        if (this.isStorageBuffer !== other.isStorageBuffer) return false;
        if (this.isExternalTexture !== other.isExternalTexture) return false;
        if (this.textureFormat !== other.textureFormat) return false;
        if (this.textureDimension !== other.textureDimension) return false;
        if (this.sampleType !== other.sampleType) return false;
        if (this.textureType !== other.textureType) return false;
        if (this.format !== other.format) return false;
        if (this.access !== other.access) return false;
        if (this.accessMode !== other.accessMode) return false;
        if (this.samplerType !== other.samplerType) return false;
        return true;
    }
    constructor(line, shader){
        // save the raw line
        this.originalLine = line;
        this.line = line;
        // defaults
        this.isTexture = false;
        this.isSampler = false;
        this.isStorageTexture = false;
        this.isStorageBuffer = false;
        this.isExternalTexture = false;
        this.type = '';
        this.matchedElements = [];
        // handle texture type
        const textureMatch = this.line.match(TEXTURE_REGEX);
        if (textureMatch) {
            this.name = textureMatch[1];
            this.type = textureMatch[2]; // texture type (e.g., texture_2d or texture_cube_array)
            this.textureFormat = textureMatch[3]; // texture format (e.g., f32)
            this.isTexture = true;
            this.matchedElements.push(...textureMatch);
            // get dimension and sample type
            const info = getTextureInfo(this.type, this.textureFormat);
            Debug.assert(info);
            this.textureDimension = info.viewDimension;
            this.sampleType = info.sampleType;
        }
        // storage texture (e.g., texture_storage_2d<rgba8unorm, write>)
        const storageTextureMatch = this.line.match(STORAGE_TEXTURE_REGEX);
        if (storageTextureMatch) {
            this.isStorageTexture = true;
            this.name = storageTextureMatch[1];
            this.textureType = storageTextureMatch[2]; // texture_storage_2d or texture_storage_2d_array
            this.format = storageTextureMatch[3]; // format (e.g., rgba8unorm)
            this.access = storageTextureMatch[4]; // access mode (e.g., write)
            this.matchedElements.push(...storageTextureMatch);
        }
        // storage buffer (e.g., <storage, read> particles: array<Particle>;)
        const storageBufferMatch = this.line.match(STORAGE_BUFFER_REGEX);
        if (storageBufferMatch) {
            this.isStorageBuffer = true;
            this.accessMode = storageBufferMatch[1] || 'none'; // Default to 'none' if no access mode
            this.name = storageBufferMatch[2];
            this.type = storageBufferMatch[3]; // Everything after ':' (e.g., array<Particle>)
            this.matchedElements.push(...storageBufferMatch);
        }
        // external texture (e.g., texture_external)
        const externalTextureMatch = this.line.match(EXTERNAL_TEXTURE_REGEX);
        if (externalTextureMatch) {
            this.name = externalTextureMatch[1];
            this.isExternalTexture = true;
            this.matchedElements.push(...storageBufferMatch);
        }
        // sampler
        const samplerMatch = this.line.match(SAMPLER_REGEX);
        if (samplerMatch) {
            this.name = samplerMatch[1];
            this.samplerType = samplerMatch[2]; // sampler type (e.g., sampler or sampler_comparison)
            this.isSampler = true;
            this.matchedElements.push(...samplerMatch);
        }
        if (this.matchedElements.length === 0) {
            Debug.error(`Invalid / unsupported resource line format: ${line}`, shader);
            shader.failed = true;
        }
    }
}
/**
 * Pure static class implementing processing of WGSL shaders. It allocates fixed locations for
 * attributes, and handles conversion of uniforms to uniform buffers.
 */ class WebgpuShaderProcessorWGSL {
    /**
     * Process the shader.
     *
     * @param {GraphicsDevice} device - The graphics device.
     * @param {object} shaderDefinition - The shader definition.
     * @param {Shader} shader - The shader.
     * @returns {object} - The processed shader data.
     */ static run(device, shaderDefinition, shader) {
        /** @type {Map<string, number>} */ const varyingMap = new Map();
        // extract lines of interests from both shaders
        const vertexExtracted = WebgpuShaderProcessorWGSL.extract(shaderDefinition.vshader);
        const fragmentExtracted = WebgpuShaderProcessorWGSL.extract(shaderDefinition.fshader);
        // VS - convert a list of attributes to a shader block with fixed locations
        const attributesMap = new Map();
        const attributesBlock = WebgpuShaderProcessorWGSL.processAttributes(vertexExtracted.attributes, shaderDefinition.attributes, attributesMap, shaderDefinition.processingOptions, shader);
        // VS - convert a list of varyings to a shader block
        const vertexVaryingsBlock = WebgpuShaderProcessorWGSL.processVaryings(vertexExtracted.varyings, varyingMap, true, device);
        // FS - convert a list of varyings to a shader block
        const fragmentVaryingsBlock = WebgpuShaderProcessorWGSL.processVaryings(fragmentExtracted.varyings, varyingMap, false, device);
        // uniforms - merge vertex and fragment uniforms, and create shared uniform buffers
        // Note that as both vertex and fragment can declare the same uniform, we need to remove duplicates
        const concatUniforms = vertexExtracted.uniforms.concat(fragmentExtracted.uniforms);
        const uniforms = Array.from(new Set(concatUniforms));
        // parse uniform lines
        const parsedUniforms = uniforms.map((line)=>new UniformLine(line, shader));
        // validation - as uniforms go to a shared uniform buffer, vertex and fragment versions need to match
        Debug.call(()=>{
            const map = new Map();
            parsedUniforms.forEach((uni)=>{
                const existing = map.get(uni.name);
                Debug.assert(!existing, `Vertex and fragment shaders cannot use the same uniform name with different types: '${existing}' and '${uni.line}'`, shader);
                map.set(uni.name, uni.line);
            });
        });
        const uniformsData = WebgpuShaderProcessorWGSL.processUniforms(device, parsedUniforms, shaderDefinition.processingOptions, shader);
        // rename references to uniforms to match the uniform buffer
        vertexExtracted.src = WebgpuShaderProcessorWGSL.renameUniformAccess(vertexExtracted.src, parsedUniforms);
        fragmentExtracted.src = WebgpuShaderProcessorWGSL.renameUniformAccess(fragmentExtracted.src, parsedUniforms);
        // parse resource lines
        const parsedResources = WebgpuShaderProcessorWGSL.mergeResources(vertexExtracted.resources, fragmentExtracted.resources, shader);
        const resourcesData = WebgpuShaderProcessorWGSL.processResources(device, parsedResources, shaderDefinition.processingOptions, shader);
        // generate fragment output struct
        const fOutput = WebgpuShaderProcessorWGSL.generateFragmentOutputStruct(fragmentExtracted.src, device.maxColorAttachments);
        // inject the call to the function which copies the shader input globals
        vertexExtracted.src = WebgpuShaderProcessorWGSL.copyInputs(vertexExtracted.src, shader);
        fragmentExtracted.src = WebgpuShaderProcessorWGSL.copyInputs(fragmentExtracted.src, shader);
        // VS - insert the blocks to the source
        const vBlock = `${attributesBlock}\n${vertexVaryingsBlock}\n${uniformsData.code}\n${resourcesData.code}\n`;
        const vshader = vertexExtracted.src.replace(MARKER, vBlock);
        // FS - insert the blocks to the source
        const fBlock = `${fragmentVaryingsBlock}\n${fOutput}\n${uniformsData.code}\n${resourcesData.code}\n`;
        const fshader = fragmentExtracted.src.replace(MARKER, fBlock);
        return {
            vshader: vshader,
            fshader: fshader,
            attributes: attributesMap,
            meshUniformBufferFormat: uniformsData.meshUniformBufferFormat,
            meshBindGroupFormat: resourcesData.meshBindGroupFormat
        };
    }
    // Extract required information from the shader source code.
    static extract(src) {
        // collected data
        const attributes = [];
        const varyings = [];
        const uniforms = [];
        const resources = [];
        // replacement marker - mark a first replacement place
        let replacement = `${MARKER}\n`;
        let match;
        // Extract uniforms, attributes, and varyings
        while((match = KEYWORD$1.exec(src)) !== null){
            const keyword = match[1];
            KEYWORD_LINE.lastIndex = match.index;
            const lineMatch = KEYWORD_LINE.exec(src);
            if (keyword === 'attribute') {
                attributes.push(lineMatch[2]);
            } else if (keyword === 'varying') {
                varyings.push(lineMatch[2]);
            } else if (keyword === 'uniform') {
                uniforms.push(lineMatch[2]);
            }
            // Remove the matched line from source
            src = WebgpuShaderProcessorWGSL.cutOut(src, match.index, KEYWORD_LINE.lastIndex, replacement);
            KEYWORD$1.lastIndex = match.index + replacement.length;
            replacement = ''; // Only place a single replacement marker
        }
        // Extract resource declarations
        while((match = KEYWORD_RESOURCE.exec(src)) !== null){
            resources.push(match[0]); // Store the full line
            // Remove the matched line from source
            src = WebgpuShaderProcessorWGSL.cutOut(src, match.index, KEYWORD_RESOURCE.lastIndex, replacement);
            KEYWORD_RESOURCE.lastIndex = match.index + replacement.length;
            replacement = '';
        }
        return {
            src,
            attributes,
            varyings,
            uniforms,
            resources
        };
    }
    /**
     * Process the lines with uniforms. The function receives the lines containing all numerical
     * uniforms. The function also receives the format of uniform buffers for view and material
     * level. All uniforms that match any of those are ignored, as those would be supplied by view /
     * material level buffers. All leftover uniforms create uniform buffer and bind group for the
     * mesh itself, containing uniforms that change on the level of the mesh.
     *
     * @param {GraphicsDevice} device - The graphics device.
     * @param {Array<UniformLine>} uniforms - Lines containing uniforms.
     * @param {ShaderProcessorOptions} processingOptions - Uniform formats.
     * @param {Shader} shader - The shader definition.
     * @returns {object} - The uniform data. Returns a shader code block containing uniforms, to be
     * inserted into the shader, as well as generated uniform format structures for the mesh level.
     */ static processUniforms(device, uniforms, processingOptions, shader) {
        // build mesh uniform buffer format
        const meshUniforms = [];
        uniforms.forEach((uniform)=>{
            // uniforms not already in supplied uniform buffers go to the mesh buffer
            if (!processingOptions.hasUniform(uniform.name)) {
                uniform.ubName = 'ub_mesh_ub';
                // Find the uniform type index in uniformTypeToNameWGSL
                const uniformType = uniformTypeToNameMapWGSL.get(uniform.type);
                Debug.assert(uniformType !== undefined, `Uniform type ${uniform.type} is not recognised on line [${uniform.line}]`);
                const uniformFormat = new UniformFormat(uniform.name, uniformType, uniform.arraySize);
                meshUniforms.push(uniformFormat);
            } else {
                // TODO: when we add material ub, this name will need to be updated
                uniform.ubName = 'ub_view';
                // Validate types here if needed
                Debug.assert(true, `Uniform ${uniform.name} already processed, skipping additional validation.`);
            }
        });
        // if we don't have any uniform, add a dummy uniform to avoid empty uniform buffer - WebGPU rendering does not
        // support rendering will NULL bind group as binding a null buffer changes placement of other bindings
        if (meshUniforms.length === 0) {
            meshUniforms.push(new UniformFormat(UNUSED_UNIFORM_NAME, UNIFORMTYPE_FLOAT));
        }
        const meshUniformBufferFormat = new UniformBufferFormat(device, meshUniforms);
        // generate code for uniform buffers, starts on the slot 0
        let code = '';
        processingOptions.uniformFormats.forEach((format, bindGroupIndex)=>{
            if (format) {
                code += WebgpuShaderProcessorWGSL.getUniformShaderDeclaration(format, bindGroupIndex, 0);
            }
        });
        // and also for generated mesh uniform format, which is at the slot 0 of the bind group
        if (meshUniformBufferFormat) {
            code += WebgpuShaderProcessorWGSL.getUniformShaderDeclaration(meshUniformBufferFormat, BINDGROUP_MESH_UB, 0);
        }
        return {
            code,
            meshUniformBufferFormat
        };
    }
    /**
     * Source code references uniforms as `uniform.name`, but swap those to reference the actual uniform buffer
     * the uniform was assigned to, for example `ub_view.name`.
     *
     * @param {string} source - The source code.
     * @param {Array<UniformLine>} uniforms - Lines containing uniforms.
     * @returns {string} - The source code with updated uniform references.
     */ static renameUniformAccess(source, uniforms) {
        uniforms.forEach((uniform)=>{
            const srcName = `uniform.${uniform.name}`;
            const dstName = `${uniform.ubName}.${uniform.name}`;
            // Use a regular expression to match `uniform.name` as a whole word.
            const regex = new RegExp(`\\b${srcName}\\b`, 'g');
            source = source.replace(regex, dstName);
        });
        return source;
    }
    static mergeResources(vertex, fragment, shader) {
        const resources = vertex.map((line)=>new ResourceLine(line, shader));
        const fragmentResources = fragment.map((line)=>new ResourceLine(line, shader));
        // merge fragment list to resources, removing exact duplicates
        fragmentResources.forEach((fragmentResource)=>{
            const existing = resources.find((resource)=>resource.name === fragmentResource.name);
            if (existing) {
                // if the resource is already in the list, check if it matches
                if (!existing.equals(fragmentResource)) {
                    Debug.error(`Resource '${fragmentResource.name}' is declared with different types in vertex and fragment shaders.`, {
                        vertexLine: existing.line,
                        fragmentLine: fragmentResource.line,
                        shader,
                        vertexResource: existing,
                        fragmentResource
                    });
                    shader.failed = true;
                }
            } else {
                resources.push(fragmentResource);
            }
        });
        return resources;
    }
    static processResources(device, resources, processingOptions, shader) {
        // build mesh bind group format - this contains the textures, but not the uniform buffer as that is a separate binding
        const textureFormats = [];
        for(let i = 0; i < resources.length; i++){
            const resource = resources[i];
            if (resource.isTexture) {
                // followed by optional sampler uniform
                const sampler = resources[i + 1];
                const hasSampler = sampler?.isSampler;
                // TODO: handle external, and storage types
                const sampleType = resource.sampleType;
                const dimension = resource.textureDimension;
                // TODO: we could optimize visibility to only stages that use any of the data
                textureFormats.push(new BindTextureFormat(resource.name, SHADERSTAGE_VERTEX | SHADERSTAGE_FRAGMENT, dimension, sampleType, hasSampler, hasSampler ? sampler.name : null));
                // following sampler was already handled
                if (hasSampler) i++;
            }
            if (resource.isStorageBuffer) {
                const readOnly = resource.accessMode !== 'read_write';
                const bufferFormat = new BindStorageBufferFormat(resource.name, SHADERSTAGE_VERTEX | SHADERSTAGE_FRAGMENT, readOnly);
                bufferFormat.format = resource.type;
                textureFormats.push(bufferFormat);
            }
            Debug.assert(!resource.isSampler, `Sampler uniform needs to follow a texture uniform, but does not on line [${resource.originalLine}]`);
            Debug.assert(!resource.isStorageTexture, 'TODO: add support for storage textures here');
            Debug.assert(!resource.externalTexture, 'TODO: add support for external textures here');
        }
        const meshBindGroupFormat = new BindGroupFormat(device, textureFormats);
        // generate code for textures
        let code = '';
        processingOptions.bindGroupFormats.forEach((format, bindGroupIndex)=>{
            if (format) {
                code += WebgpuShaderProcessorWGSL.getTextureShaderDeclaration(format, bindGroupIndex);
            }
        });
        // and also for generated mesh format
        code += WebgpuShaderProcessorWGSL.getTextureShaderDeclaration(meshBindGroupFormat, BINDGROUP_MESH);
        return {
            code,
            meshBindGroupFormat
        };
    }
    /**
     * Generates a shader code for a uniform buffer, something like:
     * ```
     *     struct ub_view { matrix_viewProjection : mat4x4f }
     *     @group(0) @binding(0) var<uniform> ubView : ub_view;
     * ```
     *
     * @param {UniformBufferFormat} ubFormat - Format of the uniform buffer.
     * @param {number} bindGroup - The bind group index.
     * @param {number} bindIndex - The bind index.
     * @returns {string} - The shader code for the uniform buffer.
     * @private
     */ static getUniformShaderDeclaration(ubFormat, bindGroup, bindIndex) {
        const name = bindGroupNames[bindGroup];
        const structName = `struct_ub_${name}`;
        let code = `struct ${structName} {\n`;
        ubFormat.uniforms.forEach((uniform)=>{
            let typeString = uniformTypeToNameWGSL[uniform.type][0];
            Debug.assert(typeString !== undefined, `Uniform type ${uniform.type} is not handled.`);
            // array uniforms
            if (uniform.count > 0) {
                // if the type is one of the ones that are not by default 16byte aligned, which is
                // a requirement for uniform buffers, we need to wrap them in a struct
                // for example: array<f32, 5> becomes  array<WrappedF32, 5>
                if (wrappedArrayTypes.hasOwnProperty(typeString)) {
                    typeString = wrappedArrayTypes[typeString];
                }
                code += `    ${uniform.shortName}: array<${typeString}, ${uniform.count}>,\n`;
            } else {
                code += `    ${uniform.shortName}: ${typeString},\n`;
            }
        });
        code += '};\n';
        code += `@group(${bindGroup}) @binding(${bindIndex}) var<uniform> ub_${name} : ${structName};\n\n`;
        return code;
    }
    /**
     * Generates a shader code for a bind group, something like:
     * ```
     *    @group(0) @binding(0) var diffuseTexture: texture_2d<f32>;
     *    @group(0) @binding(1) var diffuseTexture_sampler: sampler;  // optional
     * ```
     * @param {BindGroupFormat} format - The format of the bind group.
     * @param {number} bindGroup - The bind group index.
     * @returns {string} - The shader code for the bind group.
     */ static getTextureShaderDeclaration(format, bindGroup) {
        let code = '';
        format.textureFormats.forEach((format)=>{
            const textureTypeName = getTextureDeclarationType(format.textureDimension, format.sampleType);
            code += `@group(${bindGroup}) @binding(${format.slot}) var ${format.name}: ${textureTypeName};\n`;
            if (format.hasSampler) {
                // A slot should have been left empty for the sampler at format.slot+1
                const samplerName = format.sampleType === SAMPLETYPE_DEPTH ? 'sampler_comparison' : 'sampler';
                code += `@group(${bindGroup}) @binding(${format.slot + 1}) var ${format.samplerName}: ${samplerName};\n`;
            }
        });
        format.storageBufferFormats.forEach((format)=>{
            const access = format.readOnly ? 'read' : 'read_write';
            code += `@group(${bindGroup}) @binding(${format.slot}) var<storage, ${access}> ${format.name} : ${format.format};\n`;
        });
        Debug.assert(format.storageTextureFormats.length === 0, 'Implement support for storage textures here');
        // TODO: also add external texture support here
        return code;
    }
    static processVaryings(varyingLines, varyingMap, isVertex, device) {
        let block = '';
        let blockPrivates = '';
        let blockCopy = '';
        varyingLines.forEach((line, index)=>{
            const match = line.match(VARYING);
            Debug.assert(match, `Varying line is not valid: ${line}`);
            if (match) {
                const name = match[1];
                const type = match[2];
                if (isVertex) {
                    // store it in the map
                    varyingMap.set(name, index);
                } else {
                    Debug.assert(varyingMap.has(name), `Fragment shader requires varying [${name}] but vertex shader does not generate it.`);
                    index = varyingMap.get(name);
                }
                // generates: `@location(0) @interpolate(perspective, centroid) smoothColor : vec3f`
                block += `    @location(${index}) ${line},\n`;
                // fragment shader inputs (varyings)
                if (!isVertex) {
                    // private global variable for fragment varying
                    blockPrivates += `    var<private> ${name}: ${type};\n`;
                    // copy input variable to the private variable
                    blockCopy += `    ${name} = input.${name};\n`;
                }
            }
        });
        // add built-in varyings
        if (isVertex) {
            block += '    @builtin(position) position : vec4f,\n'; // output position
        } else {
            block += '    @builtin(position) position : vec4f,\n'; // interpolated fragment position
            block += '    @builtin(front_facing) frontFacing : bool,\n'; // front-facing
            block += '    @builtin(sample_index) sampleIndex : u32,\n'; // sample index for MSAA
            if (device.supportsPrimitiveIndex) {
                block += '    @builtin(primitive_index) primitiveIndex : u32,\n'; // primitive index
            }
        }
        // primitive index support
        const primitiveIndexGlobals = device.supportsPrimitiveIndex ? `
            var<private> pcPrimitiveIndex: u32;
        ` : '';
        const primitiveIndexCopy = device.supportsPrimitiveIndex ? `
                pcPrimitiveIndex = input.primitiveIndex;
        ` : '';
        // global variables for build-in input into fragment shader
        const fragmentGlobals = isVertex ? '' : `
            var<private> pcPosition: vec4f;
            var<private> pcFrontFacing: bool;
            var<private> pcSampleIndex: u32;
            ${primitiveIndexGlobals}
            ${blockPrivates}
            
            // function to copy inputs (varyings) to private global variables
            fn _pcCopyInputs(input: FragmentInput) {
                ${blockCopy}
                pcPosition = input.position;
                pcFrontFacing = input.frontFacing;
                pcSampleIndex = input.sampleIndex;
                ${primitiveIndexCopy}
            }
        `;
        const structName = isVertex ? 'VertexOutput' : 'FragmentInput';
        return `
            struct ${structName} {
                ${block}
            };
            ${fragmentGlobals}
        `;
    }
    static generateFragmentOutputStruct(src, numRenderTargets) {
        let structCode = 'struct FragmentOutput {\n';
        // only include color outputs that the shader actually writes to
        const colorName = (i)=>`color${i > 0 ? i : ''}`;
        for(let i = 0; i < numRenderTargets; i++){
            const name = colorName(i);
            if (src.search(new RegExp(`\\.${name}\\s*=`)) !== -1) {
                structCode += `    @location(${i}) ${name} : pcOutType${i},\n`;
            }
        }
        // find if the src contains `.fragDepth =`, ignoring whitespace before = sign
        const needsFragDepth = src.search(/\.fragDepth\s*=/) !== -1;
        if (needsFragDepth) {
            structCode += '    @builtin(frag_depth) fragDepth : f32\n';
        }
        return `${structCode}};\n`;
    }
    // convert a float attribute type to matching signed or unsigned int type
    // for example: vec4f -> vec4u, f32 -> u32
    static floatAttributeToInt(type, signed) {
        // convert any long-form type to short-form
        const longToShortMap = {
            'f32': 'f32',
            'vec2<f32>': 'vec2f',
            'vec3<f32>': 'vec3f',
            'vec4<f32>': 'vec4f'
        };
        const shortType = longToShortMap[type] || type;
        // map from float short type to int short type
        const floatToIntShort = {
            'f32': signed ? 'i32' : 'u32',
            'vec2f': signed ? 'vec2i' : 'vec2u',
            'vec3f': signed ? 'vec3i' : 'vec3u',
            'vec4f': signed ? 'vec4i' : 'vec4u'
        };
        return floatToIntShort[shortType] || null;
    }
    static processAttributes(attributeLines, shaderDefinitionAttributes = {}, attributesMap, processingOptions, shader) {
        let blockAttributes = '';
        let blockPrivates = '';
        let blockCopy = '';
        const usedLocations = {};
        attributeLines.forEach((line)=>{
            const words = splitToWords(line);
            const name = words[0];
            let type = words[1];
            const originalType = type;
            if (shaderDefinitionAttributes.hasOwnProperty(name)) {
                const semantic = shaderDefinitionAttributes[name];
                const location = semanticToLocation[semantic];
                Debug.assert(location !== undefined, `Semantic ${semantic} used by the attribute ${name} is not known - make sure it's one of the supported semantics.`);
                Debug.assert(!usedLocations.hasOwnProperty(location), `WARNING: Two vertex attributes are mapped to the same location in a shader: ${usedLocations[location]} and ${semantic}`);
                usedLocations[location] = semantic;
                // build a map of used attributes
                attributesMap.set(location, name);
                // if vertex format for this attribute is not of a float type, but shader specifies float type, convert the shader type
                // to match the vertex format type, for example: vec4f -> vec4u
                // Note that we skip normalized elements, as shader receives them as floats already.
                const element = processingOptions.getVertexElement(semantic);
                if (element) {
                    const dataType = element.dataType;
                    if (dataType !== TYPE_FLOAT32 && dataType !== TYPE_FLOAT16 && !element.normalize && !element.asInt) {
                        // new attribute type, based on the vertex format element type
                        const isSignedType = dataType === TYPE_INT8 || dataType === TYPE_INT16 || dataType === TYPE_INT32;
                        type = WebgpuShaderProcessorWGSL.floatAttributeToInt(type, isSignedType);
                        Debug.assert(type !== null, `Attribute ${name} has a type that cannot be converted to int: ${dataType}`);
                    }
                }
                // generates: @location(0) position : vec4f
                blockAttributes += `    @location(${location}) ${name}: ${type},\n`;
                // private global variable - this uses the original type
                blockPrivates += `    var<private> ${line};\n`;
                // copy input variable to the private variable - convert type if needed
                blockCopy += `    ${name} = ${originalType}(input.${name});\n`;
            } else {
                Debug.error(`Attribute ${name} is specified in the shader source, but is not defined in the shader definition, and so will be removed from the shader, as it cannot be used without a known semantic.`, {
                    shaderDefinitionAttributes,
                    shader
                });
            }
        });
        return `
            struct VertexInput {
                ${blockAttributes}
                @builtin(vertex_index) vertexIndex : u32,       // built-in vertex index
                @builtin(instance_index) instanceIndex : u32    // built-in instance index
            };

            ${blockPrivates}
            var<private> pcVertexIndex: u32;
            var<private> pcInstanceIndex: u32;

            fn _pcCopyInputs(input: VertexInput) {
                ${blockCopy}
                pcVertexIndex = input.vertexIndex;
                pcInstanceIndex = input.instanceIndex;
            }
        `;
    }
    /**
     * Injects a call to _pcCopyInputs with the function's input parameter right after the opening
     * brace of a WGSL function marked with `@vertex` or `@fragment`.
     *
     * @param {string} src - The source string containing the WGSL code.
     * @param {Shader} shader - The shader.
     * @returns {string} - The modified source string.
     */ static copyInputs(src, shader) {
        // find @vertex or @fragment followed by the function signature and capture the input parameter name
        const match = src.match(ENTRY_FUNCTION);
        // check if match exists AND the parameter name (Group 2) was captured
        if (!match || !match[2]) {
            Debug.warn('No entry function found or input parameter name not captured.', {
                shader,
                src
            });
            return src;
        }
        const inputName = match[2];
        const braceIndex = match.index + match[0].length - 1; // Calculate the index of the '{'
        // inject the line right after the opening brace
        const beginning = src.slice(0, braceIndex + 1);
        const end = src.slice(braceIndex + 1);
        const lineToInject = `\n    _pcCopyInputs(${inputName});`;
        return beginning + lineToInject + end;
    }
    static cutOut(src, start, end, replacement) {
        return src.substring(0, start) + replacement + src.substring(end);
    }
}

/**
 * @import { GraphicsDevice } from '../graphics-device.js'
 * @import { Shader } from '../shader.js'
 */ // Shared StringIds instance for content-based compute shader keys
const computeShaderIds = new StringIds();
/**
 * A WebGPU implementation of the Shader.
 *
 * @ignore
 */ class WebgpuShader {
    /**
     * Free the WebGPU resources associated with a shader.
     *
     * @param {Shader} shader - The shader to free.
     */ destroy(shader) {
        this._vertexCode = null;
        this._fragmentCode = null;
    }
    createShaderModule(code, shaderType) {
        const device = this.shader.device;
        const wgpu = device.wgpu;
        WebgpuDebug.validate(device);
        const shaderModule = wgpu.createShaderModule({
            code: code
        });
        DebugHelper.setLabel(shaderModule, `${shaderType}:${this.shader.label}`);
        WebgpuDebug.endShader(device, shaderModule, code, 6, {
            shaderType,
            source: code,
            shader: this.shader
        });
        return shaderModule;
    }
    getVertexShaderModule() {
        return this.createShaderModule(this._vertexCode, 'Vertex');
    }
    getFragmentShaderModule() {
        return this.createShaderModule(this._fragmentCode, 'Fragment');
    }
    getComputeShaderModule() {
        return this.createShaderModule(this._computeCode, 'Compute');
    }
    processGLSL() {
        const shader = this.shader;
        // process the shader source to allow for uniforms
        const processed = ShaderProcessorGLSL.run(shader.device, shader.definition, shader);
        // keep reference to processed shaders in debug mode
        Debug.call(()=>{
            this.processed = processed;
        });
        this._vertexCode = this.transpile(processed.vshader, 'vertex', shader.definition.vshader);
        this._fragmentCode = this.transpile(processed.fshader, 'fragment', shader.definition.fshader);
        if (!(this._vertexCode && this._fragmentCode)) {
            shader.failed = true;
        } else {
            shader.ready = true;
        }
        shader.meshUniformBufferFormat = processed.meshUniformBufferFormat;
        shader.meshBindGroupFormat = processed.meshBindGroupFormat;
        shader.attributes = processed.attributes;
    }
    processWGSL() {
        const shader = this.shader;
        // process the shader source to allow for uniforms
        const processed = WebgpuShaderProcessorWGSL.run(shader.device, shader.definition, shader);
        // keep reference to processed shaders in debug mode
        Debug.call(()=>{
            this.processed = processed;
        });
        this._vertexCode = processed.vshader;
        this._fragmentCode = processed.fshader;
        shader.meshUniformBufferFormat = processed.meshUniformBufferFormat;
        shader.meshBindGroupFormat = processed.meshBindGroupFormat;
        shader.attributes = processed.attributes;
    }
    transpile(src, shaderType, originalSrc) {
        // make sure shader transpilers are available
        const device = this.shader.device;
        if (!device.glslang || !device.twgsl) {
            console.error(`Cannot transpile shader [${this.shader.label}] - shader transpilers (glslang/twgsl) are not available. Make sure to provide glslangUrl and twgslUrl when creating the device.`, {
                shader: this.shader
            });
            return null;
        }
        // transpile
        try {
            const spirv = device.glslang.compileGLSL(src, shaderType);
            const wgsl = device.twgsl.convertSpirV2WGSL(spirv);
            return wgsl;
        } catch (err) {
            console.error(`Failed to transpile webgl ${shaderType} shader [${this.shader.label}] to WebGPU while rendering ${DebugGraphics.toString()}, error:\n [${err.stack}]`, {
                processed: src,
                original: originalSrc,
                shader: this.shader,
                error: err,
                stack: err.stack
            });
        }
    }
    get vertexCode() {
        Debug.assert(this._vertexCode);
        return this._vertexCode;
    }
    get fragmentCode() {
        Debug.assert(this._fragmentCode);
        return this._fragmentCode;
    }
    /**
     * Content-based key for compute shader caching. Returns the same key for identical
     * shader code and entry point combinations, regardless of how many Shader instances exist.
     *
     * @type {number}
     * @ignore
     */ get computeKey() {
        if (this._computeKey === undefined) {
            const keyString = `${this._computeCode}|${this.computeEntryPoint}`;
            this._computeKey = computeShaderIds.get(keyString);
        }
        return this._computeKey;
    }
    /**
     * Dispose the shader when the context has been lost.
     */ loseContext() {}
    /**
     * Restore shader after the context has been obtained.
     *
     * @param {GraphicsDevice} device - The graphics device.
     * @param {Shader} shader - The shader to restore.
     */ restoreContext(device, shader) {}
    /**
     * @param {Shader} shader - The shader.
     */ constructor(shader){
        /**
     * Transpiled vertex shader code.
     *
     * @type {string|null}
     */ this._vertexCode = null;
        /**
     * Transpiled fragment shader code.
     *
     * @type {string|null}
     */ this._fragmentCode = null;
        /**
     * Compute shader code.
     *
     * @type {string|null}
     */ this._computeCode = null;
        /**
     * Name of the vertex entry point function.
     */ this.vertexEntryPoint = 'main';
        /**
     * Name of the fragment entry point function.
     */ this.fragmentEntryPoint = 'main';
        /**
     * Name of the compute entry point function.
     */ this.computeEntryPoint = 'main';
        /** @type {Shader} */ this.shader = shader;
        const definition = shader.definition;
        Debug.assert(definition);
        if (definition.shaderLanguage === SHADERLANGUAGE_WGSL) {
            if (definition.cshader) {
                this._computeCode = definition.cshader ?? null;
                this.computeUniformBufferFormats = definition.computeUniformBufferFormats;
                this.computeBindGroupFormat = definition.computeBindGroupFormat;
                if (definition.computeEntryPoint) {
                    this.computeEntryPoint = definition.computeEntryPoint;
                }
            } else {
                this.vertexEntryPoint = 'vertexMain';
                this.fragmentEntryPoint = 'fragmentMain';
                if (definition.processingOptions) {
                    this.processWGSL();
                } else {
                    this._vertexCode = definition.vshader ?? null;
                    this._fragmentCode = definition.fshader ?? null;
                    shader.meshUniformBufferFormat = definition.meshUniformBufferFormat;
                    shader.meshBindGroupFormat = definition.meshBindGroupFormat;
                }
            }
            shader.ready = true;
        } else {
            if (definition.processingOptions) {
                this.processGLSL();
            }
        }
    }
}

/**
 * @import { Texture } from '../texture.js'
 * @import { TextureView } from '../texture-view.js'
 * @import { WebgpuGraphicsDevice } from './webgpu-graphics-device.js'
 */ // map of ADDRESS_*** to GPUAddressMode
const gpuAddressModes = [];
gpuAddressModes[ADDRESS_REPEAT] = 'repeat';
gpuAddressModes[ADDRESS_CLAMP_TO_EDGE] = 'clamp-to-edge';
gpuAddressModes[ADDRESS_MIRRORED_REPEAT] = 'mirror-repeat';
// map of FILTER_*** to GPUFilterMode for level and mip sampling
const gpuFilterModes = [];
gpuFilterModes[FILTER_NEAREST] = {
    level: 'nearest',
    mip: 'nearest'
};
gpuFilterModes[FILTER_LINEAR] = {
    level: 'linear',
    mip: 'nearest'
};
gpuFilterModes[FILTER_NEAREST_MIPMAP_NEAREST] = {
    level: 'nearest',
    mip: 'nearest'
};
gpuFilterModes[FILTER_NEAREST_MIPMAP_LINEAR] = {
    level: 'nearest',
    mip: 'linear'
};
gpuFilterModes[FILTER_LINEAR_MIPMAP_NEAREST] = {
    level: 'linear',
    mip: 'nearest'
};
gpuFilterModes[FILTER_LINEAR_MIPMAP_LINEAR] = {
    level: 'linear',
    mip: 'linear'
};
const dummyUse = (thingOne)=>{
// so lint thinks we're doing something with thingOne
};
/**
 * A WebGPU implementation of the Texture.
 *
 * @ignore
 */ class WebgpuTexture {
    create(device) {
        const texture = this.texture;
        const wgpu = device.wgpu;
        const numLevels = texture.numLevels;
        Debug.assert(texture.width > 0 && texture.height > 0, `Invalid texture dimensions ${texture.width}x${texture.height} for texture ${texture.name}`, texture);
        this.desc = {
            size: {
                width: texture.width,
                height: texture.height,
                depthOrArrayLayers: texture.cubemap ? 6 : texture.array ? texture.arrayLength : 1
            },
            format: this.format,
            mipLevelCount: numLevels,
            sampleCount: 1,
            dimension: texture.volume ? '3d' : '2d',
            // TODO: use only required usage flags
            // COPY_SRC - probably only needed on render target textures, to support copyRenderTarget (grab pass needs it)
            // RENDER_ATTACHMENT - needed for mipmap generation
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | (isCompressedPixelFormat(texture.format) ? 0 : GPUTextureUsage.RENDER_ATTACHMENT) | (texture.storage ? GPUTextureUsage.STORAGE_BINDING : 0)
        };
        WebgpuDebug.validate(device);
        this.gpuTexture = wgpu.createTexture(this.desc);
        DebugHelper.setLabel(this.gpuTexture, `${texture.name}${texture.cubemap ? '[cubemap]' : ''}${texture.volume ? '[3d]' : ''}`);
        WebgpuDebug.end(device, 'Texture creation', {
            desc: this.desc,
            texture
        });
        // default texture view descriptor
        let viewDescr;
        // some format require custom default texture view
        if (this.texture.format === PIXELFORMAT_DEPTHSTENCIL) {
            // we expose the depth part of the format
            viewDescr = {
                format: 'depth24plus',
                aspect: 'depth-only'
            };
        }
        this.view = this.createView(viewDescr);
        // Clear any cached views since the GPU texture was recreated
        this.viewCache.clear();
    }
    destroy(device) {
        // defer GPU texture destruction until after command buffer submission
        device.deferDestroy(this.gpuTexture);
        this.gpuTexture = null;
        this.view = null;
        this.viewCache.clear();
        this.samplers.length = 0;
    }
    propertyChanged(flag) {
        // samplers need to be recreated
        this.samplers.length = 0;
    }
    /**
     * Returns a texture view. If a TextureView is provided, returns a cached view for those
     * specific parameters (creating it if needed). Otherwise returns the default view.
     *
     * @param {WebgpuGraphicsDevice} device - The graphics device.
     * @param {TextureView} [textureView] - Optional TextureView specifying view parameters.
     * @returns {GPUTextureView} - Returns the view.
     * @private
     */ getView(device, textureView) {
        this.uploadImmediate(device, this.texture);
        if (textureView) {
            // Check cache for this view configuration
            let view = this.viewCache.get(textureView.key);
            if (!view) {
                // Create and cache the view
                view = this.createView({
                    baseMipLevel: textureView.baseMipLevel,
                    mipLevelCount: textureView.mipLevelCount,
                    baseArrayLayer: textureView.baseArrayLayer,
                    arrayLayerCount: textureView.arrayLayerCount
                });
                this.viewCache.set(textureView.key, view);
            }
            return view;
        }
        Debug.call(()=>{
            if (!this.view) {
                Debug.errorOnce('View failed to be created for texture, texture is possibly destroyed', this);
            }
        });
        return this.view;
    }
    createView(viewDescr) {
        const options = viewDescr ?? {};
        const textureDescr = this.desc;
        const texture = this.texture;
        // '1d', '2d', '2d-array', 'cube', 'cube-array', '3d'
        const defaultViewDimension = ()=>{
            if (texture.cubemap) return 'cube';
            if (texture.volume) return '3d';
            if (texture.array) return '2d-array';
            return '2d';
        };
        /** @type {GPUTextureViewDescriptor} */ const desc = {
            format: options.format ?? textureDescr.format,
            dimension: options.dimension ?? defaultViewDimension(),
            aspect: options.aspect ?? 'all',
            baseMipLevel: options.baseMipLevel ?? 0,
            mipLevelCount: options.mipLevelCount ?? textureDescr.mipLevelCount,
            baseArrayLayer: options.baseArrayLayer ?? 0,
            arrayLayerCount: options.arrayLayerCount ?? textureDescr.depthOrArrayLayers
        };
        const view = this.gpuTexture.createView(desc);
        DebugHelper.setLabel(view, `${viewDescr ? `CustomView${JSON.stringify(viewDescr)}` : 'DefaultView'}:${this.texture.name}`);
        return view;
    }
    // TODO: share a global map of samplers. Possibly even use shared samplers for bind group,
    // or maybe even have some attached in view bind group and use globally
    /**
     * @param {any} device - The Graphics Device.
     * @param {number} [sampleType] - A sample type for the sampler, SAMPLETYPE_*** constant. If not
     * specified, the sampler type is based on the texture format / texture sampling type.
     * @returns {any} - Returns the sampler.
     */ getSampler(device, sampleType) {
        let sampler = this.samplers[sampleType];
        if (!sampler) {
            const texture = this.texture;
            let label;
            /** @type GPUSamplerDescriptor */ const desc = {
                addressModeU: gpuAddressModes[texture.addressU],
                addressModeV: gpuAddressModes[texture.addressV],
                addressModeW: gpuAddressModes[texture.addressW]
            };
            // default for compare sampling of texture
            if (!sampleType && texture.compareOnRead) {
                sampleType = SAMPLETYPE_DEPTH;
            }
            if (sampleType === SAMPLETYPE_DEPTH || sampleType === SAMPLETYPE_INT || sampleType === SAMPLETYPE_UINT) {
                // depth compare sampling
                desc.compare = 'less';
                desc.magFilter = 'linear';
                desc.minFilter = 'linear';
                label = 'Compare';
            } else if (sampleType === SAMPLETYPE_UNFILTERABLE_FLOAT) {
                desc.magFilter = 'nearest';
                desc.minFilter = 'nearest';
                desc.mipmapFilter = 'nearest';
                label = 'Unfilterable';
            } else {
                // if the device cannot filter float textures, force nearest filtering
                const forceNearest = !device.textureFloatFilterable && (texture.format === PIXELFORMAT_RGBA32F || texture.format === PIXELFORMAT_RGBA16F);
                if (forceNearest || this.texture.format === PIXELFORMAT_DEPTHSTENCIL || isIntegerPixelFormat(this.texture.format)) {
                    desc.magFilter = 'nearest';
                    desc.minFilter = 'nearest';
                    desc.mipmapFilter = 'nearest';
                    label = 'Nearest';
                } else {
                    desc.magFilter = gpuFilterModes[texture.magFilter].level;
                    desc.minFilter = gpuFilterModes[texture.minFilter].level;
                    desc.mipmapFilter = gpuFilterModes[texture.minFilter].mip;
                    Debug.call(()=>{
                        label = `Texture:${texture.magFilter}-${texture.minFilter}-${desc.mipmapFilter}`;
                    });
                }
            }
            // ensure anisotropic filtering is only set when filtering is correctly
            // set up
            const allLinear = desc.minFilter === 'linear' && desc.magFilter === 'linear' && desc.mipmapFilter === 'linear';
            desc.maxAnisotropy = allLinear ? math.clamp(Math.round(texture._anisotropy), 1, device.maxTextureAnisotropy) : 1;
            sampler = device.wgpu.createSampler(desc);
            DebugHelper.setLabel(sampler, label);
            this.samplers[sampleType] = sampler;
        }
        return sampler;
    }
    loseContext() {}
    /**
     * @param {WebgpuGraphicsDevice} device - The graphics device.
     * @param {Texture} texture - The texture.
     */ uploadImmediate(device, texture) {
        if (texture._needsUpload || texture._needsMipmapsUpload) {
            Debug.assert(!device.insideRenderPass, `Texture.upload() for "${texture.name}" was called while inside a render pass, which is not currently supported. ` + 'Move texture updates to the before() or after() function of the RenderPass.');
            this.uploadData(device);
            texture._needsUpload = false;
            texture._needsMipmapsUpload = false;
        }
    }
    /**
     * @param {WebgpuGraphicsDevice} device - The graphics
     * device.
     */ uploadData(device) {
        const texture = this.texture;
        // If texture dimensions have changed, recreate the GPU texture (for example loading external texture
        // with different dimensions)
        if (this.desc && (this.desc.size.width !== texture.width || this.desc.size.height !== texture.height)) {
            Debug.warnOnce(`Texture '${texture.name}' is being recreated due to dimension change from ${this.desc.size.width}x${this.desc.size.height} to ${texture.width}x${texture.height}. Consider creating the texture with correct dimensions to avoid recreation.`);
            this.gpuTexture.destroy();
            this.create(device);
            // Notify bind groups that this texture has changed and needs rebinding
            texture.renderVersionDirty = device.renderVersion;
        }
        if (texture._levels) {
            // upload texture data if any
            let anyUploads = false;
            let anyLevelMissing = false;
            const requiredMipLevels = texture.numLevels;
            for(let mipLevel = 0; mipLevel < requiredMipLevels; mipLevel++){
                const mipObject = texture._levels[mipLevel];
                if (mipObject) {
                    if (texture.cubemap) {
                        for(let face = 0; face < 6; face++){
                            const faceSource = mipObject[face];
                            if (faceSource) {
                                if (this.isExternalImage(faceSource)) {
                                    this.uploadExternalImage(device, faceSource, mipLevel, face);
                                    anyUploads = true;
                                } else if (ArrayBuffer.isView(faceSource)) {
                                    this.uploadTypedArrayData(device, faceSource, mipLevel, face);
                                    anyUploads = true;
                                } else {
                                    Debug.error('Unsupported texture source data for cubemap face', faceSource);
                                }
                            } else {
                                anyLevelMissing = true;
                            }
                        }
                    } else if (texture._volume) {
                        Debug.warn('Volume texture data upload is not supported yet', this.texture);
                    } else if (texture.array) {
                        if (texture.arrayLength === mipObject.length) {
                            for(let index = 0; index < texture._arrayLength; index++){
                                const arraySource = mipObject[index];
                                if (this.isExternalImage(arraySource)) {
                                    this.uploadExternalImage(device, arraySource, mipLevel, index);
                                    anyUploads = true;
                                } else if (ArrayBuffer.isView(arraySource)) {
                                    this.uploadTypedArrayData(device, arraySource, mipLevel, index);
                                    anyUploads = true;
                                } else {
                                    Debug.error('Unsupported texture source data for texture array entry', arraySource);
                                }
                            }
                        } else {
                            anyLevelMissing = true;
                        }
                    } else {
                        if (this.isExternalImage(mipObject)) {
                            this.uploadExternalImage(device, mipObject, mipLevel, 0);
                            anyUploads = true;
                        } else if (ArrayBuffer.isView(mipObject)) {
                            this.uploadTypedArrayData(device, mipObject, mipLevel, 0);
                            anyUploads = true;
                        } else {
                            Debug.error('Unsupported texture source data', mipObject);
                        }
                    }
                } else {
                    anyLevelMissing = true;
                }
            }
            if (anyUploads && anyLevelMissing && texture.mipmaps && !isCompressedPixelFormat(texture.format) && !isIntegerPixelFormat(texture.format)) {
                device.mipmapRenderer.generate(this);
            }
            // update vram stats
            if (texture._gpuSize) {
                texture.adjustVramSizeTracking(device._vram, -texture._gpuSize);
            }
            texture._gpuSize = texture.gpuSize;
            texture.adjustVramSizeTracking(device._vram, texture._gpuSize);
        }
    }
    // image types supported by copyExternalImageToTexture
    isExternalImage(image) {
        return typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap || typeof HTMLVideoElement !== 'undefined' && image instanceof HTMLVideoElement || typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement || typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas;
    }
    uploadExternalImage(device, image, mipLevel, index) {
        Debug.assert(mipLevel < this.desc.mipLevelCount, `Accessing mip level ${mipLevel} of texture with ${this.desc.mipLevelCount} mip levels`, this);
        const src = {
            source: image,
            origin: [
                0,
                0
            ],
            flipY: false
        };
        const dst = {
            texture: this.gpuTexture,
            mipLevel: mipLevel,
            origin: [
                0,
                0,
                index
            ],
            aspect: 'all',
            premultipliedAlpha: this.texture._premultiplyAlpha
        };
        const copySize = {
            width: this.desc.size.width,
            height: this.desc.size.height,
            depthOrArrayLayers: 1 // single layer
        };
        // submit existing scheduled commands to the queue before copying to preserve the order
        device.submit();
        // create 2d context so webgpu can upload the texture
        dummyUse(image instanceof HTMLCanvasElement && image.getContext('2d'));
        Debug.trace(TRACEID_RENDER_QUEUE, `IMAGE-TO-TEX: mip:${mipLevel} index:${index} ${this.texture.name}`);
        device.wgpu.queue.copyExternalImageToTexture(src, dst, copySize);
    }
    uploadTypedArrayData(device, data, mipLevel, index) {
        const texture = this.texture;
        const wgpu = device.wgpu;
        /** @type {GPUImageCopyTexture} */ const dest = {
            texture: this.gpuTexture,
            origin: [
                0,
                0,
                index
            ],
            mipLevel: mipLevel
        };
        // texture dimensions at the specified mip level
        const width = TextureUtils.calcLevelDimension(texture.width, mipLevel);
        const height = TextureUtils.calcLevelDimension(texture.height, mipLevel);
        // data sizes
        const byteSize = TextureUtils.calcLevelGpuSize(width, height, 1, texture.format);
        Debug.assert(byteSize === data.byteLength, `Error uploading data to texture, the data byte size of ${data.byteLength} does not match required ${byteSize}`, texture);
        const formatInfo = pixelFormatInfo.get(texture.format);
        Debug.assert(formatInfo);
        /** @type {GPUImageDataLayout} */ let dataLayout;
        let size;
        if (formatInfo.size) {
            // uncompressed format
            dataLayout = {
                offset: 0,
                bytesPerRow: formatInfo.size * width,
                rowsPerImage: height
            };
            size = {
                width: width,
                height: height
            };
        } else if (formatInfo.blockSize) {
            // compressed format
            const blockDim = (size)=>{
                return Math.floor((size + 3) / 4);
            };
            dataLayout = {
                offset: 0,
                bytesPerRow: formatInfo.blockSize * blockDim(width),
                rowsPerImage: blockDim(height)
            };
            size = {
                width: Math.max(4, width),
                height: Math.max(4, height)
            };
        } else {
            Debug.assert(false, `WebGPU does not yet support texture format ${formatInfo.name} for texture ${texture.name}`, texture);
        }
        // submit existing scheduled commands to the queue before copying to preserve the order
        device.submit();
        Debug.trace(TRACEID_RENDER_QUEUE, `WRITE-TEX: mip:${mipLevel} index:${index} ${this.texture.name}`);
        wgpu.queue.writeTexture(dest, data, dataLayout, size);
    }
    read(x, y, width, height, options) {
        const mipLevel = options.mipLevel ?? 0;
        const face = options.face ?? 0;
        const data = options.data ?? null;
        const immediate = options.immediate ?? false;
        const texture = this.texture;
        const formatInfo = pixelFormatInfo.get(texture.format);
        Debug.assert(formatInfo);
        Debug.assert(formatInfo.size);
        const bytesPerRow = width * formatInfo.size;
        // bytesPerRow must be a multiple of 256
        const paddedBytesPerRow = math.roundUp(bytesPerRow, 256);
        const size = paddedBytesPerRow * height;
        // create a temporary staging buffer
        /** @type {WebgpuGraphicsDevice} */ const device = texture.device;
        const stagingBuffer = device.createBufferImpl(BUFFERUSAGE_READ | BUFFERUSAGE_COPY_DST);
        stagingBuffer.allocate(device, size);
        const src = {
            texture: this.gpuTexture,
            mipLevel: mipLevel,
            origin: [
                x,
                y,
                face
            ]
        };
        const dst = {
            buffer: stagingBuffer.buffer,
            offset: 0,
            bytesPerRow: paddedBytesPerRow
        };
        const copySize = {
            width,
            height,
            depthOrArrayLayers: 1 // single layer
        };
        // copy the GPU texture to the staging buffer
        const commandEncoder = device.getCommandEncoder();
        commandEncoder.copyTextureToBuffer(src, dst, copySize);
        // async read data from the staging buffer to a temporary array
        return device.readBuffer(stagingBuffer, size, null, immediate).then((temp)=>{
            // determine target buffer - use user's data buffer or allocate new
            const ArrayType = getPixelFormatArrayType(texture.format);
            const targetBuffer = data?.buffer ?? new ArrayBuffer(height * bytesPerRow);
            const target = new Uint8Array(targetBuffer, data?.byteOffset ?? 0, height * bytesPerRow);
            // remove the 256 alignment padding from the end of each row
            for(let i = 0; i < height; i++){
                const srcOffset = i * paddedBytesPerRow;
                const dstOffset = i * bytesPerRow;
                target.set(temp.subarray(srcOffset, srcOffset + bytesPerRow), dstOffset);
            }
            // return user's data or create correctly-typed array view
            return data ?? new ArrayType(targetBuffer);
        });
    }
    constructor(texture){
        /**
     * An array of samplers, addressed by SAMPLETYPE_*** constant, allowing texture to be sampled
     * using different samplers. Most textures are sampled as interpolated floats, but some can
     * additionally be sampled using non-interpolated floats (raw data) or compare sampling
     * (shadow maps).
     *
     * @type {GPUSampler[]}
     * @private
     */ this.samplers = [];
        /**
     * A cache of texture views keyed by TextureView.key, used for storage texture bindings.
     *
     * @type {Map<number, GPUTextureView>}
     * @private
     */ this.viewCache = new Map();
        /** @type {Texture} */ this.texture = texture;
        this.format = gpuTextureFormats[texture.format];
        Debug.assert(this.format !== '', `WebGPU does not support texture format ${texture.format} [${pixelFormatInfo.get(texture.format)?.name}] for texture ${texture.name}`, texture);
        this.create(texture.device);
    }
}

/**
 * A WebGPU implementation of the UniformBuffer.
 *
 * @ignore
 */ class WebgpuUniformBuffer extends WebgpuBuffer {
    unlock(uniformBuffer) {
        const device = uniformBuffer.device;
        super.unlock(device, uniformBuffer.storageInt32.buffer);
    }
    constructor(uniformBuffer){
        super(BUFFERUSAGE_UNIFORM);
    }
}

/**
 * A WebGPU implementation of the VertexBuffer.
 *
 * @ignore
 */ class WebgpuVertexBuffer extends WebgpuBuffer {
    unlock(vertexBuffer) {
        const device = vertexBuffer.device;
        super.unlock(device, vertexBuffer.storage);
    }
    constructor(vertexBuffer, format, options){
        super(BUFFERUSAGE_VERTEX | (options?.storage ? BUFFERUSAGE_STORAGE : 0));
    }
}

// id for debug tracing
const TRACEID = 'Preprocessor';
// accepted keywords
const KEYWORD = /[ \t]*#(ifn?def|if|endif|else|elif|define|undef|extension|include)/g;
// #define EXPRESSION
// eslint-disable-next-line regexp/no-super-linear-backtracking, regexp/optimal-quantifier-concatenation
const DEFINE = /define[ \t]+([^\n]+)\r?(?:\n|$)/g;
// #extension IDENTIFIER : enabled
const EXTENSION = /extension[ \t]+([\w-]+)[ \t]*:[ \t]*(enable|require)/g;
// #undef EXPRESSION
// eslint-disable-next-line regexp/no-super-linear-backtracking, regexp/optimal-quantifier-concatenation
const UNDEF = /undef[ \t]+([^\n]+)\r?(?:\n|$)/g;
// #ifdef/#ifndef SOMEDEFINE, #if EXPRESSION
// eslint-disable-next-line regexp/no-super-linear-backtracking, regexp/no-unused-capturing-group
const IF = /(ifdef|ifndef|if)[ \t]*([^\r\n]+)\r?\n/g;
// #endif/#else or #elif EXPRESSION
const ENDIF = /(endif|else|elif)(?:[ \t]+([^\r\n]*))?\r?\n?/g;
// identifier in form of IDENTIFIER or {IDENTIFIER}
const IDENTIFIER = /\{?[\w-]+\}?/;
// [!]defined(EXPRESSION)
const DEFINED = /(!|\s)?defined\(([\w-]+)\)/;
// Matches all defined(...) patterns for parentheses check
const DEFINED_PARENS = /!?defined\s*\([^)]*\)/g;
// Matches defined or !defined at the end of a string (for parentheses detection)
const DEFINED_BEFORE_PAREN = /!?defined\s*$/;
// Matches comparison operators like ==, !=, <, <=, >, >=
const COMPARISON = /([a-z_]\w*)\s*(==|!=|<|<=|>|>=)\s*([\w"']+)/i;
// currently unsupported characters in the expression: + -
const INVALID = /[+\-]/g;
// #include "identifier" or optional second identifier #include "identifier1, identifier2"
// Matches only up to the closing quote of the include directive
const INCLUDE = /include[ \t]+"([\w-]+)(?:\s*,\s*([\w-]+))?"/g;
// loop index to replace, in the format {i}
const LOOP_INDEX = /\{i\}/g;
// matches color attachments, for example: pcFragColor1
const FRAGCOLOR = /(pcFragColor[1-8])\b/g;
// matches a pure numeric literal (integer or decimal, no sign since - is blocked by INVALID)
const NUMERIC_LITERAL = /^\d+(?:\.\d+)?$/;
/**
 * Pure static class implementing subset of C-style preprocessor.
 * inspired by: https://github.com/dcodeIO/Preprocessor.js
 */ class Preprocessor {
    /**
     * Run c-like preprocessor on the source code, and resolves the code based on the defines and ifdefs
     *
     * @param {string} source - The source code to work on.
     * @param {Map<string, string>} [includes] - A map containing key-value pairs of include names
     * and their content. These are used for resolving #include directives in the source.
     * @param {object} [options] - Optional parameters.
     * @param {boolean} [options.stripUnusedColorAttachments] - If true, strips unused color attachments.
     * @param {boolean} [options.stripDefines] - If true, strips all defines from the source.
     * @param {string} [options.sourceName] - The name of the source file.
     * @returns {string|null} Returns preprocessed source code, or null in case of error.
     */ static run(source, includes = new Map(), options = {}) {
        Preprocessor.sourceName = options.sourceName;
        // strips comments, handles // and many cases of /*
        source = this.stripComments(source);
        // right trim each line
        source = source.split(/\r?\n/).map((line)=>line.trimEnd()).join('\n');
        // extracted defines
        const defines = new Map();
        // extracted defines with name in {} which are to be replaced with their values
        const injectDefines = new Map();
        // preprocess defines / ifdefs ..
        source = this._preprocess(source, defines, injectDefines, includes, options.stripDefines);
        if (source === null) return null;
        // extract defines that evaluate to an integer number
        const intDefines = new Map();
        defines.forEach((value, key)=>{
            if (Number.isInteger(parseFloat(value)) && !value.includes('.')) {
                intDefines.set(key, value);
            }
        });
        // strip comments again after the includes have been resolved
        source = this.stripComments(source);
        source = this.stripUnusedColorAttachments(source, options);
        // remove empty lines
        source = this.RemoveEmptyLines(source);
        // process array sizes
        source = this.processArraySize(source, intDefines);
        // inject defines
        source = this.injectDefines(source, injectDefines);
        return source;
    }
    static stripUnusedColorAttachments(source, options) {
        if (options.stripUnusedColorAttachments) {
            // find out how many times pcFragColorX is used (see gles3.js)
            const counts = new Map();
            const matches = source.match(FRAGCOLOR);
            matches?.forEach((match)=>{
                const index = parseInt(match.charAt(match.length - 1), 10);
                counts.set(index, (counts.get(index) ?? 0) + 1);
            });
            // if there's any attachment used only one time (only as a declaration, without actual use)
            const anySingleUse = Array.from(counts.values()).some((count)=>count === 1);
            if (anySingleUse) {
                // remove all lines that contains pcFragColorX with single usage
                const lines = source.split('\n');
                const keepLines = [];
                for(let i = 0; i < lines.length; i++){
                    const match = lines[i].match(FRAGCOLOR);
                    if (match) {
                        const index = parseInt(match[0].charAt(match[0].length - 1), 10);
                        if (index > 0 && counts.get(index) === 1) {
                            continue;
                        }
                    }
                    keepLines.push(lines[i]);
                }
                source = keepLines.join('\n');
            }
        }
        return source;
    }
    static stripComments(source) {
        return source.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
    }
    static processArraySize(source, intDefines) {
        if (source !== null) {
            // replace lines containing "[intDefine]" with their values, so that we know the array size for WebGPU uniform buffer
            // example: weight[SAMPLES] => float weight[11] in case there was a "define SAMPLES 11" in the source code
            intDefines.forEach((value, key)=>{
                source = source.replace(new RegExp(`\\[${key}\\]`, 'g'), `[${value}]`);
            });
        }
        return source;
    }
    static injectDefines(source, injectDefines) {
        if (source !== null && injectDefines.size > 0) {
            // replace all instances of the injected defines with the value itself
            const lines = source.split('\n');
            injectDefines.forEach((value, key)=>{
                const regex = new RegExp(key, 'g');
                for(let i = 0; i < lines.length; i++){
                    // replace them on lines that do not contain a preprocessor directive (the define itself for example)
                    if (!lines[i].includes('#')) {
                        lines[i] = lines[i].replace(regex, value);
                    }
                }
            });
            source = lines.join('\n');
        }
        return source;
    }
    static RemoveEmptyLines(source) {
        if (source !== null) {
            source = source.split(/\r?\n/)// convert lines with only white space into empty string
            .map((line)=>line.trim() === '' ? '' : line).join('\n');
            // remove more than 1 consecutive empty lines
            source = source.replace(/(\n\n){3,}/g, '\n\n');
        }
        return source;
    }
    /**
     * Process source code, and resolves the code based on the defines and ifdefs.
     *
     * @param {string} source - The source code to work on.
     * @param {Map<string, string>} defines - Supplied defines which are used in addition to those
     * defined in the source code. Maps a define name to its value. Note that the map is modified
     * by the function.
     * @param {Map<string, string>} injectDefines - An object to collect defines that are to be
     * replaced with their values.
     * @param {Map<string, string>} [includes] - An object containing key-value pairs of include names and their
     * content.
     * @param {boolean} [stripDefines] - If true, strips all defines from the source.
     * @returns {string|null} Returns preprocessed source code, or null if failed.
     */ static _preprocess(source, defines = new Map(), injectDefines, includes, stripDefines) {
        const originalSource = source;
        // stack, storing info about ifdef blocks
        const stack = [];
        // true if the function encounter a problem
        let error = false;
        let match;
        while((match = KEYWORD.exec(source)) !== null && !error){
            const keyword = match[1];
            switch(keyword){
                case 'define':
                    {
                        // read the rest of the define line
                        DEFINE.lastIndex = match.index;
                        const define = DEFINE.exec(source);
                        Debug.assert(define, `Invalid [${keyword}]: ${source.substring(match.index, match.index + 100)}...`);
                        error || (error = define === null);
                        const expression = define[1];
                        // split it to identifier name and a value
                        IDENTIFIER.lastIndex = define.index;
                        const identifierValue = IDENTIFIER.exec(expression);
                        const identifier = identifierValue[0];
                        let value = expression.substring(identifier.length).trim();
                        if (value === '') value = 'true';
                        // are we inside if-blocks that are accepted
                        const keep = Preprocessor._keep(stack);
                        let stripThisDefine = stripDefines;
                        if (keep) {
                            // replacement identifier (inside {}) - always remove it from code
                            const replacementDefine = identifier.startsWith('{') && identifier.endsWith('}');
                            if (replacementDefine) {
                                stripThisDefine = true;
                            }
                            if (replacementDefine) {
                                injectDefines.set(identifier, value);
                            } else {
                                defines.set(identifier, value);
                            }
                            if (stripThisDefine) {
                                // cut out the define line
                                source = source.substring(0, define.index - 1) + source.substring(DEFINE.lastIndex);
                                // continue processing on the next symbol
                                KEYWORD.lastIndex = define.index - 1;
                            }
                        }
                        Debug.trace(TRACEID, `${keyword}: [${identifier}] ${value} ${keep ? '' : 'IGNORED'}`);
                        // continue on the next line
                        if (!stripThisDefine) {
                            KEYWORD.lastIndex = define.index + define[0].length;
                        }
                        break;
                    }
                case 'undef':
                    {
                        // read the rest of the define line
                        UNDEF.lastIndex = match.index;
                        const undef = UNDEF.exec(source);
                        const identifier = undef[1].trim();
                        // are we inside if-blocks that are accepted
                        const keep = Preprocessor._keep(stack);
                        // remove it from defines
                        if (keep) {
                            defines.delete(identifier);
                            if (stripDefines) {
                                // cut out the undef line
                                source = source.substring(0, undef.index - 1) + source.substring(UNDEF.lastIndex);
                                // continue processing on the next symbol
                                KEYWORD.lastIndex = undef.index - 1;
                            }
                        }
                        Debug.trace(TRACEID, `${keyword}: [${identifier}] ${keep ? '' : 'IGNORED'}`);
                        // continue on the next line
                        if (!stripDefines) {
                            KEYWORD.lastIndex = undef.index + undef[0].length;
                        }
                        break;
                    }
                case 'extension':
                    {
                        EXTENSION.lastIndex = match.index;
                        const extension = EXTENSION.exec(source);
                        Debug.assert(extension, `Invalid [${keyword}]: ${source.substring(match.index, match.index + 100)}...`);
                        error || (error = extension === null);
                        if (extension) {
                            const identifier = extension[1];
                            // are we inside if-blocks that are accepted
                            const keep = Preprocessor._keep(stack);
                            if (keep) {
                                defines.set(identifier, 'true');
                            }
                            Debug.trace(TRACEID, `${keyword}: [${identifier}] ${keep ? '' : 'IGNORED'}`);
                        }
                        // continue on the next line
                        KEYWORD.lastIndex = extension.index + extension[0].length;
                        break;
                    }
                case 'ifdef':
                case 'ifndef':
                case 'if':
                    {
                        // read the if line
                        IF.lastIndex = match.index;
                        const iff = IF.exec(source);
                        const expression = iff[2];
                        // evaluate expression
                        const evaluated = Preprocessor.evaluate(expression, defines);
                        error || (error = evaluated.error);
                        let result = evaluated.result;
                        if (keyword === 'ifndef') {
                            result = !result;
                        }
                        // add info to the stack (to be handled later)
                        stack.push({
                            anyKeep: result,
                            keep: result,
                            start: match.index,
                            end: IF.lastIndex // end index of IF line
                        });
                        Debug.trace(TRACEID, `${keyword}: [${expression}] => ${result}`);
                        // continue on the next line
                        KEYWORD.lastIndex = iff.index + iff[0].length;
                        break;
                    }
                case 'endif':
                case 'else':
                case 'elif':
                    {
                        // match the endif
                        ENDIF.lastIndex = match.index;
                        const endif = ENDIF.exec(source);
                        const blockInfo = stack.pop();
                        if (!blockInfo) {
                            console.error(`Shader preprocessing encountered "#${endif[1]}" without a preceding #if #ifdef #ifndef while preprocessing ${Preprocessor.sourceName} on line:\n ${source.substring(match.index, match.index + 100)}...`, {
                                source: originalSource
                            });
                            error = true;
                            continue;
                        }
                        // code between if and endif
                        const blockCode = blockInfo.keep ? source.substring(blockInfo.end, match.index) : '';
                        Debug.trace(TRACEID, `${keyword}: [previous block] => ${blockCode !== ''}`);
                        // cut out the IF and ENDIF lines, leave block if required
                        source = source.substring(0, blockInfo.start) + blockCode + source.substring(ENDIF.lastIndex);
                        KEYWORD.lastIndex = blockInfo.start + blockCode.length;
                        // handle else if
                        const endifCommand = endif[1];
                        if (endifCommand === 'else' || endifCommand === 'elif') {
                            // if any branch was already accepted, all else branches need to fail regardless of the result
                            let result = false;
                            if (!blockInfo.anyKeep) {
                                if (endifCommand === 'else') {
                                    result = !blockInfo.keep;
                                } else {
                                    const evaluated = Preprocessor.evaluate(endif[2], defines);
                                    result = evaluated.result;
                                    error || (error = evaluated.error);
                                }
                            }
                            // add back to stack
                            stack.push({
                                anyKeep: blockInfo.anyKeep || result,
                                keep: result,
                                start: KEYWORD.lastIndex,
                                end: KEYWORD.lastIndex
                            });
                            Debug.trace(TRACEID, `${keyword}: [${endif[2]}] => ${result}`);
                        }
                        break;
                    }
                case 'include':
                    {
                        // match the include
                        INCLUDE.lastIndex = match.index;
                        const include = INCLUDE.exec(source);
                        error || (error = include === null);
                        if (!include) {
                            Debug.assert(include, `Invalid [${keyword}] while preprocessing ${Preprocessor.sourceName}:\n${source.substring(match.index, match.index + 100)}...`);
                            error = true;
                            continue;
                        }
                        const identifier = include[1].trim();
                        const countIdentifier = include[2]?.trim();
                        // are we inside if-blocks that are accepted
                        const keep = Preprocessor._keep(stack);
                        if (keep) {
                            // cut out the include line and replace it with the included string
                            let includeSource = includes?.get(identifier);
                            if (includeSource !== undefined) {
                                includeSource = this.stripComments(includeSource);
                                // handle second identifier specifying loop count
                                if (countIdentifier) {
                                    const countString = defines.get(countIdentifier);
                                    const count = parseFloat(countString);
                                    if (Number.isInteger(count)) {
                                        // add the include count times
                                        let result = '';
                                        for(let i = 0; i < count; i++){
                                            result += includeSource.replace(LOOP_INDEX, String(i));
                                        }
                                        includeSource = result;
                                    } else {
                                        console.error(`Include Count identifier "${countIdentifier}" not resolved while preprocessing ${Preprocessor.sourceName} on line:\n ${source.substring(match.index, match.index + 100)}...`, {
                                            originalSource: originalSource,
                                            source: source
                                        });
                                        error = true;
                                    }
                                }
                                // replace the include by the included string
                                source = source.substring(0, include.index - 1) + includeSource + source.substring(INCLUDE.lastIndex);
                                // process the just included test
                                KEYWORD.lastIndex = include.index - 1;
                            } else {
                                console.error(`Include "${identifier}" not resolved while preprocessing ${Preprocessor.sourceName}`, {
                                    originalSource: originalSource,
                                    source: source
                                });
                                error = true;
                                continue;
                            }
                        }
                        Debug.trace(TRACEID, `${keyword}: [${identifier}] ${keep ? '' : 'IGNORED'}`);
                        break;
                    }
            }
        }
        if (stack.length > 0) {
            console.error(`Shader preprocessing reached the end of the file without encountering the necessary #endif to close a preceding #if, #ifdef, or #ifndef block. ${Preprocessor.sourceName}`);
            error = true;
        }
        if (error) {
            console.error('Failed to preprocess shader: ', {
                source: originalSource
            });
            return null;
        }
        return source;
    }
    // function returns true if the evaluation is inside keep branches
    static _keep(stack) {
        for(let i = 0; i < stack.length; i++){
            if (!stack[i].keep) {
                return false;
            }
        }
        return true;
    }
    /**
     * Evaluates a single atomic expression, which can be:
     * - `defined(EXPRESSION)` or `!defined(EXPRESSION)`
     * - Comparisons such as `A == B`, `A != B`, `A > B`, etc.
     * - Simple checks for the existence of a define.
     *
     * @param {string} expr - The atomic expression to evaluate.
     * @param {Map<string, string>} defines - A map containing key-value pairs of defines.
     * @returns {object} Returns an object containing the result of the evaluation and an error flag.
     */ static evaluateAtomicExpression(expr, defines) {
        let error = false;
        expr = expr.trim();
        let invert = false;
        // Handle boolean literals
        if (expr === 'true') {
            return {
                result: true,
                error
            };
        }
        if (expr === 'false') {
            return {
                result: false,
                error
            };
        }
        // Handle numeric literals (0 is false, non-zero is true) - standard C preprocessor behavior
        // Only match pure numeric literals to avoid incorrectly parsing expressions like "3 == 3"
        if (NUMERIC_LITERAL.test(expr)) {
            return {
                result: parseFloat(expr) !== 0,
                error
            };
        }
        // Handle defined(expr) and !defined(expr)
        const definedMatch = DEFINED.exec(expr);
        if (definedMatch) {
            invert = definedMatch[1] === '!';
            expr = definedMatch[2].trim();
            const exists = defines.has(expr);
            return {
                result: invert ? !exists : exists,
                error
            };
        }
        // Handle comparisons
        const comparisonMatch = COMPARISON.exec(expr);
        if (comparisonMatch) {
            const left = defines.get(comparisonMatch[1].trim()) ?? comparisonMatch[1].trim();
            const right = defines.get(comparisonMatch[3].trim()) ?? comparisonMatch[3].trim();
            const operator = comparisonMatch[2].trim();
            let result = false;
            switch(operator){
                case '==':
                    result = left === right;
                    break;
                case '!=':
                    result = left !== right;
                    break;
                case '<':
                    result = left < right;
                    break;
                case '<=':
                    result = left <= right;
                    break;
                case '>':
                    result = left > right;
                    break;
                case '>=':
                    result = left >= right;
                    break;
                default:
                    error = true;
            }
            return {
                result,
                error
            };
        }
        // Default case: check if expression is defined
        const result = defines.has(expr);
        return {
            result,
            error
        };
    }
    /**
     * Processes parentheses in an expression by recursively evaluating subexpressions.
     * Ignores parentheses that are part of defined() calls.
     *
     * @param {string} expression - The expression to process.
     * @param {Map<string, string>} defines - A map containing key-value pairs of defines.
     * @returns {object} Returns an object containing the processed expression and an error flag.
     */ static processParentheses(expression, defines) {
        let error = false;
        let processed = expression.trim();
        // Remove outer parentheses that wrap the entire expression
        while(processed.startsWith('(') && processed.endsWith(')')){
            let depth = 0;
            let wrapsEntire = true;
            for(let i = 0; i < processed.length - 1; i++){
                if (processed[i] === '(') depth++;
                else if (processed[i] === ')') {
                    depth--;
                    if (depth === 0) {
                        wrapsEntire = false;
                        break;
                    }
                }
            }
            if (wrapsEntire) {
                processed = processed.slice(1, -1).trim();
            } else {
                break;
            }
        }
        // Keep processing until no more precedence parentheses exist
        while(true){
            let foundParen = false;
            let depth = 0;
            let maxDepth = 0;
            let deepestStart = -1;
            let deepestEnd = -1;
            // Find the deepest nested parentheses that aren't part of defined()
            let inDefinedParen = 0;
            for(let i = 0; i < processed.length; i++){
                if (processed[i] === '(') {
                    // Check if this is part of defined() - look back for "defined" or "!defined"
                    const beforeParen = processed.substring(0, i);
                    if (DEFINED_BEFORE_PAREN.test(beforeParen)) {
                        inDefinedParen++;
                    } else if (inDefinedParen === 0) {
                        depth++;
                        if (depth > maxDepth) {
                            maxDepth = depth;
                            deepestStart = i;
                        }
                        foundParen = true;
                    }
                } else if (processed[i] === ')') {
                    if (inDefinedParen > 0) {
                        inDefinedParen--;
                    } else if (depth > 0) {
                        if (depth === maxDepth && deepestStart !== -1) {
                            deepestEnd = i;
                        }
                        depth--;
                    }
                }
            }
            if (!foundParen || deepestStart === -1 || deepestEnd === -1) {
                break;
            }
            // Extract and evaluate the subexpression
            const subExpr = processed.substring(deepestStart + 1, deepestEnd);
            const { result, error: subError } = Preprocessor.evaluate(subExpr, defines);
            error = error || subError;
            // Replace the parentheses expression with its result
            processed = processed.substring(0, deepestStart) + (result ? 'true' : 'false') + processed.substring(deepestEnd + 1);
        }
        return {
            expression: processed,
            error
        };
    }
    /**
     * Evaluates a complex expression with support for `defined`, `!defined`, comparisons, `&&`,
     * `||`, and parentheses for precedence.
     *
     * @param {string} expression - The expression to evaluate.
     * @param {Map<string, string>} defines - A map containing key-value pairs of defines.
     * @returns {object} Returns an object containing the result of the evaluation and an error flag.
     */ static evaluate(expression, defines) {
        const correct = INVALID.exec(expression) === null;
        Debug.assert(correct, `Resolving expression like this is not supported: ${expression}`);
        // Process parentheses first (skip if no parentheses exist or only defined() parentheses)
        let processedExpr = expression;
        let parenError = false;
        // Quick check: remove all defined(...) patterns and see if any parentheses remain
        // If they do, process them recursively to handle nested parentheses
        const withoutDefined = expression.replace(DEFINED_PARENS, '');
        if (withoutDefined.indexOf('(') !== -1) {
            const processed = Preprocessor.processParentheses(expression, defines);
            processedExpr = processed.expression;
            parenError = processed.error;
        }
        if (parenError) {
            Debug.log(`Parenthesis parsing error in expression: "${expression}"`);
            return {
                result: false,
                error: true
            };
        }
        // Step 1: Split by "||" to handle OR conditions
        const orSegments = processedExpr.split('||');
        for (const orSegment of orSegments){
            // Step 2: Split each OR segment by "&&" to handle AND conditions
            const andSegments = orSegment.split('&&');
            // Step 3: Evaluate each AND segment
            let andResult = true;
            for (const andSegment of andSegments){
                const { result, error } = Preprocessor.evaluateAtomicExpression(andSegment.trim(), defines);
                if (!result || error) {
                    andResult = false;
                    break; // Short-circuit AND evaluation
                }
            }
            // Step 4: If any OR segment evaluates to true, short-circuit and return true
            if (andResult) {
                return {
                    result: true,
                    error: !correct
                };
            }
        }
        // If no OR segment is true, the whole expression is false
        return {
            result: false,
            error: !correct
        };
    }
}

var gles3PS = /* glsl */ `

#ifndef outType_0
#define outType_0 vec4
#endif

layout(location = 0) out highp outType_0 pcFragColor0;

#if COLOR_ATTACHMENT_1
layout(location = 1) out highp outType_1 pcFragColor1;
#endif

#if COLOR_ATTACHMENT_2
layout(location = 2) out highp outType_2 pcFragColor2;
#endif

#if COLOR_ATTACHMENT_3
layout(location = 3) out highp outType_3 pcFragColor3;
#endif

#if COLOR_ATTACHMENT_4
layout(location = 4) out highp outType_4 pcFragColor4;
#endif

#if COLOR_ATTACHMENT_5
layout(location = 5) out highp outType_5 pcFragColor5;
#endif

#if COLOR_ATTACHMENT_6
layout(location = 6) out highp outType_6 pcFragColor6;
#endif

#if COLOR_ATTACHMENT_7
layout(location = 7) out highp outType_7 pcFragColor7;
#endif

#define gl_FragColor pcFragColor0

#define varying in

#define texture2D texture
#define texture2DBias texture
#define textureCube texture
#define texture2DProj textureProj
#define texture2DLod textureLod
#define texture2DProjLod textureProjLod
#define textureCubeLod textureLod
#define texture2DGrad textureGrad
#define texture2DProjGrad textureProjGrad
#define textureCubeGrad textureGrad
#define utexture2D texture
#define itexture2D texture

// deprecated defines
#define texture2DLodEXT texture2DLodEXT_is_no_longer_supported_use_texture2DLod_instead
#define texture2DProjLodEXT texture2DProjLodEXT_is_no_longer_supported_use_texture2DProjLod
#define textureCubeLodEXT textureCubeLodEXT_is_no_longer_supported_use_textureCubeLod_instead
#define texture2DGradEXT texture2DGradEXT_is_no_longer_supported_use_texture2DGrad_instead
#define texture2DProjGradEXT texture2DProjGradEXT_is_no_longer_supported_use_texture2DProjGrad_instead
#define textureCubeGradEXT textureCubeGradEXT_is_no_longer_supported_use_textureCubeGrad_instead

// sample shadows using textureGrad to remove derivatives in the dynamic loops (which are used by
// clustered lighting) - as DirectX shader compiler tries to unroll the loops and takes long time
// to compile the shader. Using textureLod would be even better, but WebGl does not translate it to
// lod instruction for DirectX correctly and uses SampleCmp instead of SampleCmpLevelZero or similar.
#define textureShadow(res, uv) textureGrad(res, uv, vec2(1, 1), vec2(1, 1))

// pass / accept shadow map or texture as a function parameter, on webgl this is simply passed as is
// but this is needed for WebGPU
#define SHADOWMAP_PASS(name) name
#define SHADOWMAP_ACCEPT(name) sampler2DShadow name
#define TEXTURE_PASS(name) name
#define TEXTURE_ACCEPT(name) sampler2D name
#define TEXTURE_ACCEPT_HIGHP(name) highp sampler2D name

#define GL2
`;

var gles3VS = /* glsl */ `

// WEBGL_multi_draw
#extension GL_ANGLE_multi_draw : enable

#define attribute in
#define varying out
#define texture2D texture
#define utexture2D texture
#define itexture2D texture
#define GL2
#define VERTEXSHADER

#define TEXTURE_PASS(name) name
#define TEXTURE_ACCEPT(name) sampler2D name
#define TEXTURE_ACCEPT_HIGHP(name) highp sampler2D name
`;

var webgpuPS$1 = /* glsl */ `

// texelFetch support and others
#extension GL_EXT_samplerless_texture_functions : require

#ifndef outType_0
#define outType_0 vec4
#endif
#ifndef outType_1
#define outType_1 vec4
#endif
#ifndef outType_2
#define outType_2 vec4
#endif
#ifndef outType_3
#define outType_3 vec4
#endif
#ifndef outType_4
#define outType_4 vec4
#endif
#ifndef outType_5
#define outType_5 vec4
#endif
#ifndef outType_6
#define outType_6 vec4
#endif
#ifndef outType_7
#define outType_7 vec4
#endif

layout(location = 0) out highp outType_0 pcFragColor0;
layout(location = 1) out highp outType_1 pcFragColor1;
layout(location = 2) out highp outType_2 pcFragColor2;
layout(location = 3) out highp outType_3 pcFragColor3;
layout(location = 4) out highp outType_4 pcFragColor4;
layout(location = 5) out highp outType_5 pcFragColor5;
layout(location = 6) out highp outType_6 pcFragColor6;
layout(location = 7) out highp outType_7 pcFragColor7;

#define gl_FragColor pcFragColor0

#define texture2D(res, uv) texture(sampler2D(res, res ## _sampler), uv)
#define texture2DBias(res, uv, bias) texture(sampler2D(res, res ## _sampler), uv, bias)
#define texture2DLod(res, uv, lod) textureLod(sampler2D(res, res ## _sampler), uv, lod)
#define textureCube(res, uv) texture(samplerCube(res, res ## _sampler), uv)
#define textureCubeLod(res, uv, lod) textureLod(samplerCube(res, res ## _sampler), uv, lod)
#define textureShadow(res, uv) textureLod(sampler2DShadow(res, res ## _sampler), uv, 0.0)
#define itexture2D(res, uv) texture(isampler2D(res, res ## _sampler), uv)
#define utexture2D(res, uv) texture(usampler2D(res, res ## _sampler), uv)

// deprecated defines
#define texture2DLodEXT texture2DLodEXT_is_no_longer_supported_use_texture2DLod_instead
#define texture2DProjLodEXT texture2DProjLodEXT_is_no_longer_supported_use_texture2DProjLod
#define textureCubeLodEXT textureCubeLodEXT_is_no_longer_supported_use_textureCubeLod_instead
#define texture2DGradEXT texture2DGradEXT_is_no_longer_supported_use_texture2DGrad_instead
#define texture2DProjGradEXT texture2DProjGradEXT_is_no_longer_supported_use_texture2DProjGrad_instead
#define textureCubeGradEXT textureCubeGradEXT_is_no_longer_supported_use_textureCubeGrad_instead

// TODO: implement other texture sampling macros
// #define texture2DProj textureProj
// #define texture2DProjLod textureProjLod
// #define texture2DGrad textureGrad
// #define texture2DProjGrad textureProjGrad
// #define textureCubeGrad textureGrad

// pass / accept shadow map as a function parameter, passes both the texture as well as sampler
// as the combined sampler can be only created at a point of use
#define SHADOWMAP_PASS(name) name, name ## _sampler
#define SHADOWMAP_ACCEPT(name) texture2D name, sampler name ## _sampler
#define TEXTURE_PASS(name) name, name ## _sampler
#define TEXTURE_ACCEPT(name) texture2D name, sampler name ## _sampler
#define TEXTURE_ACCEPT_HIGHP TEXTURE_ACCEPT

#define GL2
#define WEBGPU
`;

var webgpuVS$1 = /* glsl */ `

// texelFetch support and others
#extension GL_EXT_samplerless_texture_functions : require

#define texture2D(res, uv) texture(sampler2D(res, res ## _sampler), uv)
#define itexture2D(res, uv) texture(isampler2D(res, res ## _sampler), uv)
#define utexture2D(res, uv) texture(usampler2D(res, res ## _sampler), uv)

#define TEXTURE_PASS(name) name, name ## _sampler
#define TEXTURE_ACCEPT(name) texture2D name, sampler name ## _sampler
#define TEXTURE_ACCEPT_HIGHP TEXTURE_ACCEPT

#define GL2
#define WEBGPU
#define VERTEXSHADER
#define gl_VertexID gl_VertexIndex
#define gl_InstanceID gl_InstanceIndex
`;

var webgpuPS = /* wgsl */ `
`;

var webgpuVS = /* wgsl */ `
#define VERTEXSHADER
`;

var sharedGLSL = /* glsl */ `

// convert clip space position into texture coordinates to sample scene grab textures
vec2 getGrabScreenPos(vec4 clipPos) {
    vec2 uv = (clipPos.xy / clipPos.w) * 0.5 + 0.5;

    #ifdef WEBGPU
        uv.y = 1.0 - uv.y;
    #endif

    return uv;
}

// convert uv coordinates to sample image effect texture (render target texture rendered without
// forward renderer which does the flip in the projection matrix)
vec2 getImageEffectUV(vec2 uv) {
    #ifdef WEBGPU
        uv.y = 1.0 - uv.y;
    #endif

    return uv;
}
`;

var sharedWGSL = /* glsl */ `

#define WEBGPU

// convert clip space position into texture coordinates for sampling scene grab textures
fn getGrabScreenPos(clipPos: vec4<f32>) -> vec2<f32> {
    var uv: vec2<f32> = (clipPos.xy / clipPos.w) * 0.5 + vec2<f32>(0.5);
    uv.y = 1.0 - uv.y;
    return uv;
}

// convert uv coordinates to sample image effect texture (render target texture rendered without
// forward renderer which does the flip in the projection matrix)
fn getImageEffectUV(uv: vec2<f32>) -> vec2<f32> {
    var modifiedUV: vec2<f32> = uv;
    modifiedUV.y = 1.0 - modifiedUV.y;
    return modifiedUV;
}

// types wrapped in size aligned structures to ensure correct alignment in uniform buffer arrays
struct WrappedF32 { @size(16) element: f32 }
struct WrappedI32 { @size(16) element: i32 }
struct WrappedU32 { @size(16) element: u32 }
struct WrappedVec2F { @size(16) element: vec2f }
struct WrappedVec2I { @size(16) element: vec2i }
struct WrappedVec2U { @size(16) element: vec2u }
`;

/**
 * WGSL shader chunk providing half-precision type aliases. When the device supports f16
 * (CAPS_SHADER_F16), these resolve to native f16 types. Otherwise, they fall back to f32.
 *
 * Available types: half, half2, half3, half4, half2x2, half3x3, half4x4
 *
 * Usage in WGSL shaders:
 * - Vertex/Fragment: automatically included
 * - Compute: #include "halfTypesCS"
 *
 * @ignore
 */ var halfTypes = /* wgsl */ `
#ifdef CAPS_SHADER_F16
    alias half = f16;
    alias half2 = vec2<f16>;
    alias half3 = vec3<f16>;
    alias half4 = vec4<f16>;
    alias half2x2 = mat2x2<f16>;
    alias half3x3 = mat3x3<f16>;
    alias half4x4 = mat4x4<f16>;
#else
    alias half = f32;
    alias half2 = vec2f;
    alias half3 = vec3f;
    alias half4 = vec4f;
    alias half2x2 = mat2x2f;
    alias half3x3 = mat3x3f;
    alias half4x4 = mat4x4f;
#endif
`;

/**
 * @import { GraphicsDevice } from './graphics-device.js'
 */ const _attrib2Semantic = {
    vertex_position: SEMANTIC_POSITION,
    vertex_normal: SEMANTIC_NORMAL,
    vertex_tangent: SEMANTIC_TANGENT,
    vertex_texCoord0: SEMANTIC_TEXCOORD0,
    vertex_texCoord1: SEMANTIC_TEXCOORD1,
    vertex_texCoord2: SEMANTIC_TEXCOORD2,
    vertex_texCoord3: SEMANTIC_TEXCOORD3,
    vertex_texCoord4: SEMANTIC_TEXCOORD4,
    vertex_texCoord5: SEMANTIC_TEXCOORD5,
    vertex_texCoord6: SEMANTIC_TEXCOORD6,
    vertex_texCoord7: SEMANTIC_TEXCOORD7,
    vertex_color: SEMANTIC_COLOR,
    vertex_boneIndices: SEMANTIC_BLENDINDICES,
    vertex_boneWeights: SEMANTIC_BLENDWEIGHT
};
/**
 * A class providing utility functions for shader definition creation.
 *
 * @ignore
 */ class ShaderDefinitionUtils {
    /**
     * Creates a shader definition.
     *
     * @param {GraphicsDevice} device - The graphics device.
     * @param {object} options - Object for passing optional arguments.
     * @param {string} [options.name] - A name of the shader.
     * @param {object} [options.attributes] - Attributes. Will be extracted from the vertexCode if
     * not provided.
     * @param {string} options.vertexCode - The vertex shader code.
     * @param {string} [options.fragmentCode] - The fragment shader code.
     * @param {string} [options.fragmentPreamble] - The preamble string for the fragment shader.
     * @param {string[]} [options.feedbackVaryings] - A list of shader output variable
     * names that will be captured when using transform feedback. This setting is only effective
     * if the useTransformFeedback property is enabled.
     * @param {boolean} [options.useTransformFeedback] - Whether to use transform feedback. Defaults
     * to false.
     * @param {Map<string, string>} [options.vertexIncludes] - A map containing key-value pairs of
     * include names and their content. These are used for resolving #include directives in the
     * vertex shader source.
     * @param {Map<string, string>} [options.vertexDefines] - A map containing key-value pairs of
     * define names and their values. These are used for resolving #ifdef style of directives in the
     * vertex code.
     * @param {Map<string, string>} [options.fragmentIncludes] - A map containing key-value pairs
     * of include names and their content. These are used for resolving #include directives in the
     * fragment shader source.
     * @param {Map<string, string>} [options.fragmentDefines] - A map containing key-value pairs of
     * define names and their values. These are used for resolving #ifdef style of directives in the
     * fragment code.
     * @param {string | string[]} [options.fragmentOutputTypes] - Fragment shader output types,
     * which default to vec4. Passing a string will set the output type for all color attachments.
     * Passing an array will set the output type for each color attachment.
     * @returns {object} Returns the created shader definition.
     */ static createDefinition(device, options) {
        Debug.assert(options);
        Debug.assert(!options.vertexDefines || options.vertexDefines instanceof Map);
        Debug.assert(!options.vertexIncludes || options.vertexIncludes instanceof Map);
        Debug.assert(!options.fragmentDefines || options.fragmentDefines instanceof Map);
        Debug.assert(!options.fragmentIncludes || options.fragmentIncludes instanceof Map);
        // Normalize fragmentOutputTypes to an array
        const normalizedOutputTypes = (options)=>{
            let fragmentOutputTypes = options.fragmentOutputTypes ?? 'vec4';
            if (!Array.isArray(fragmentOutputTypes)) {
                fragmentOutputTypes = [
                    fragmentOutputTypes
                ];
            }
            return fragmentOutputTypes;
        };
        const getDefines = (gpu, gl2, isVertex, options)=>{
            const deviceIntro = device.isWebGPU ? gpu : gl2;
            // a define per supported color attachment, which strips out unsupported output definitions in the deviceIntro
            let attachmentsDefine = '';
            // Define the fragment shader output type, vec4 by default
            if (!isVertex) {
                const fragmentOutputTypes = normalizedOutputTypes(options);
                for(let i = 0; i < device.maxColorAttachments; i++){
                    attachmentsDefine += `#define COLOR_ATTACHMENT_${i}\n`;
                    const outType = fragmentOutputTypes[i] ?? 'vec4';
                    attachmentsDefine += `#define outType_${i} ${outType}\n`;
                }
            }
            return attachmentsDefine + deviceIntro;
        };
        const getDefinesWgsl = (isVertex, options)=>{
            // Enable directives must come before all global declarations
            let code = ShaderDefinitionUtils.getWGSLEnables(device, isVertex ? 'vertex' : 'fragment');
            // Define the fragment shader output type, vec4 by default
            if (!isVertex) {
                const fragmentOutputTypes = normalizedOutputTypes(options);
                // create alias for each output type
                for(let i = 0; i < device.maxColorAttachments; i++){
                    const glslOutType = fragmentOutputTypes[i] ?? 'vec4';
                    const wgslOutType = primitiveGlslToWgslTypeMap.get(glslOutType);
                    Debug.assert(wgslOutType, `Unknown output type translation: ${glslOutType} -> ${wgslOutType}`);
                    code += `alias pcOutType${i} = ${wgslOutType};\n`;
                }
            }
            return code;
        };
        const name = options.name ?? 'Untitled';
        let vertCode;
        let fragCode;
        const vertexDefinesCode = ShaderDefinitionUtils.getDefinesCode(device, options.vertexDefines);
        const fragmentDefinesCode = ShaderDefinitionUtils.getDefinesCode(device, options.fragmentDefines);
        const wgsl = options.shaderLanguage === SHADERLANGUAGE_WGSL;
        if (wgsl) {
            vertCode = `
                ${getDefinesWgsl(true, options)}
                ${vertexDefinesCode}
                ${halfTypes}
                ${webgpuVS}
                ${sharedWGSL}
                ${options.vertexCode}
            `;
            fragCode = `
                ${getDefinesWgsl(false, options)}
                ${fragmentDefinesCode}
                ${halfTypes}
                ${webgpuPS}
                ${sharedWGSL}
                ${options.fragmentCode}
            `;
        } else {
            Debug.assert(options.vertexCode);
            // vertex code
            vertCode = `${ShaderDefinitionUtils.versionCode(device) + getDefines(webgpuVS$1, gles3VS, true, options) + vertexDefinesCode + ShaderDefinitionUtils.precisionCode(device)}
                ${sharedGLSL}
                ${ShaderDefinitionUtils.getShaderNameCode(name)}
                ${options.vertexCode}`;
            Debug.assert(options.fragmentCode);
            // fragment code
            fragCode = `${(options.fragmentPreamble || '') + ShaderDefinitionUtils.versionCode(device) + getDefines(webgpuPS$1, gles3PS, false, options) + fragmentDefinesCode + ShaderDefinitionUtils.precisionCode(device)}
                ${sharedGLSL}
                ${ShaderDefinitionUtils.getShaderNameCode(name)}
                ${options.fragmentCode}`;
        }
        return {
            name: name,
            shaderLanguage: options.shaderLanguage ?? SHADERLANGUAGE_GLSL,
            attributes: options.attributes,
            vshader: vertCode,
            vincludes: options.vertexIncludes,
            fincludes: options.fragmentIncludes,
            fshader: fragCode,
            feedbackVaryings: options.feedbackVaryings,
            useTransformFeedback: options.useTransformFeedback,
            meshUniformBufferFormat: options.meshUniformBufferFormat,
            meshBindGroupFormat: options.meshBindGroupFormat
        };
    }
    /**
     * Generates WGSL enable directives based on device capabilities. Enable directives must come
     * before all global declarations in WGSL shaders.
     *
     * @param {GraphicsDevice} device - The graphics device.
     * @param {'vertex'|'fragment'|'compute'} shaderType - The type of shader.
     * @returns {string} The WGSL enable directives code.
     * @ignore
     */ static getWGSLEnables(device, shaderType) {
        let code = '';
        if (device.supportsShaderF16) {
            code += 'enable f16;\n';
        }
        if (shaderType === 'fragment' && device.supportsPrimitiveIndex) {
            code += 'enable primitive_index;\n';
        }
        return code;
    }
    /**
     * @param {GraphicsDevice} device - The graphics device.
     * @param {Map<string, string>} [defines] - A map containing key-value pairs.
     * @returns {string} The shader code for the defines.
     * @ignore
     */ static getDefinesCode(device, defines) {
        let code = '';
        device.capsDefines.forEach((value, key)=>{
            code += `#define ${key} ${value}\n`;
        });
        code += '\n';
        defines?.forEach((value, key)=>{
            code += `#define ${key} ${value}\n`;
        });
        code += '\n';
        return code;
    }
    // SpectorJS integration
    static getShaderNameCode(name) {
        return `#define SHADER_NAME ${name}\n`;
    }
    static versionCode(device) {
        return device.isWebGPU ? '#version 450\n' : '#version 300 es\n';
    }
    static precisionCode(device, forcePrecision) {
        if (forcePrecision && forcePrecision !== 'highp' && forcePrecision !== 'mediump' && forcePrecision !== 'lowp') {
            forcePrecision = null;
        }
        if (forcePrecision) {
            if (forcePrecision === 'highp' && device.maxPrecision !== 'highp') {
                forcePrecision = 'mediump';
            }
            if (forcePrecision === 'mediump' && device.maxPrecision === 'lowp') {
                forcePrecision = 'lowp';
            }
        }
        const precision = forcePrecision ? forcePrecision : device.precision;
        const code = `
            precision ${precision} float;
            precision ${precision} int;
            precision ${precision} usampler2D;
            precision ${precision} isampler2D;
            precision ${precision} sampler2DShadow;
            precision ${precision} samplerCubeShadow;
            precision ${precision} sampler2DArray;
        `;
        return code;
    }
    /**
     * Extract the attributes specified in a vertex shader.
     *
     * @param {string} vsCode - The vertex shader code.
     * @returns {Object<string, string>} The attribute name to semantic map.
     * @ignore
     */ static collectAttributes(vsCode) {
        const attribs = {};
        let attrs = 0;
        let found = vsCode.indexOf('attribute');
        while(found >= 0){
            if (found > 0 && vsCode[found - 1] === '/') break;
            // skip the 'attribute' word inside the #define which we add to the shader
            let ignore = false;
            if (found > 0) {
                let startOfLine = vsCode.lastIndexOf('\n', found);
                startOfLine = startOfLine !== -1 ? startOfLine + 1 : 0;
                const lineStartString = vsCode.substring(startOfLine, found);
                if (lineStartString.includes('#')) {
                    ignore = true;
                }
            }
            if (!ignore) {
                const endOfLine = vsCode.indexOf(';', found);
                const startOfAttribName = vsCode.lastIndexOf(' ', endOfLine);
                const attribName = vsCode.substring(startOfAttribName + 1, endOfLine);
                // if the attribute already exists in the semantic map
                if (attribs[attribName]) {
                    Debug.warn(`Attribute [${attribName}] already exists when extracting the attributes from the vertex shader, ignoring.`, {
                        vsCode
                    });
                } else {
                    const semantic = _attrib2Semantic[attribName];
                    if (semantic !== undefined) {
                        attribs[attribName] = semantic;
                    } else {
                        attribs[attribName] = `ATTR${attrs}`;
                        attrs++;
                    }
                }
            }
            found = vsCode.indexOf('attribute', found + 1);
        }
        return attribs;
    }
}

/**
 * @import { BindGroupFormat } from './bind-group-format.js'
 * @import { GraphicsDevice } from './graphics-device.js'
 * @import { UniformBufferFormat } from './uniform-buffer-format.js'
 */ let id$2 = 0;
/**
 * A shader is a program that is responsible for rendering graphical primitives on a device's
 * graphics processor. The shader is generated from a shader definition. This shader definition
 * specifies the code for processing vertices and fragments processed by the GPU. The language of
 * the code is GLSL (or more specifically ESSL, the OpenGL ES Shading Language). The shader
 * definition also describes how the PlayCanvas engine should map vertex buffer elements onto the
 * attributes specified in the vertex shader code.
 *
 * @category Graphics
 */ class Shader {
    /**
     * Initialize a shader back to its default state.
     *
     * @private
     */ init() {
        this.ready = false;
        this.failed = false;
    }
    /** @ignore */ get label() {
        return `Shader Id ${this.id} (${this.definition.shaderLanguage === SHADERLANGUAGE_WGSL ? 'WGSL' : 'GLSL'}) ${this.name}`;
    }
    /**
     * Frees resources associated with this shader.
     */ destroy() {
        Debug.trace(TRACEID_SHADER_ALLOC, `DeAlloc: Id ${this.id} ${this.name}`);
        this.device.onDestroyShader(this);
        this.impl.destroy(this);
    }
    /**
     * Called when the WebGL context was lost. It releases all context related resources.
     *
     * @ignore
     */ loseContext() {
        this.init();
        this.impl.loseContext();
    }
    /** @ignore */ restoreContext() {
        this.impl.restoreContext(this.device, this);
    }
    /**
     * Creates a new Shader instance.
     *
     * Consider {@link ShaderUtils#createShader} as a simpler and more powerful way to create
     * a shader.
     *
     * @param {GraphicsDevice} graphicsDevice - The graphics device used to manage this shader.
     * @param {object} definition - The shader definition from which to build the shader.
     * @param {string} [definition.name] - The name of the shader.
     * @param {Object<string, string>} [definition.attributes] - Object detailing the mapping of
     * vertex shader attribute names to semantics SEMANTIC_*. This enables the engine to match
     * vertex buffer data as inputs to the shader. When not specified, rendering without vertex
     * buffer is assumed.
     * @param {string[]} [definition.feedbackVaryings] - A list of shader output variable
     * names that will be captured when using transform feedback. This setting is only effective
     * if the useTransformFeedback property is enabled.
     * @param {string} [definition.vshader] - Vertex shader source (GLSL code). Optional when
     * compute shader is specified.
     * @param {string} [definition.fshader] - Fragment shader source (GLSL code). Optional when
     * useTransformFeedback or compute shader is specified.
     * @param {string} [definition.cshader] - Compute shader source (WGSL code). Only supported on
     * WebGPU platform.
     * @param {string} [definition.computeEntryPoint] - The entry point function name for the compute
     * shader. Defaults to 'main'.
     * @param {Map<string, string>} [definition.vincludes] - A map containing key-value pairs of
     * include names and their content. These are used for resolving #include directives in the
     * vertex shader source.
     * @param {Map<string, string>} [definition.fincludes] - A map containing key-value pairs
     * of include names and their content. These are used for resolving #include directives in the
     * fragment shader source.
     * @param {Map<string, string>} [definition.cincludes] - A map containing key-value pairs
     * of include names and their content. These are used for resolving #include directives in the
     * compute shader source.
     * @param {Map<string, string>} [definition.cdefines] - A map containing key-value pairs of
     * define names and their values. These are used for resolving defines in the compute shader.
     * @param {boolean} [definition.useTransformFeedback] - Specifies that this shader outputs
     * post-VS data to a buffer.
     * @param {string | string[]} [definition.fragmentOutputTypes] - Fragment shader output types,
     * which default to vec4. Passing a string will set the output type for all color attachments.
     * Passing an array will set the output type for each color attachment.
     * @param {string} [definition.shaderLanguage] - Specifies the shader language of vertex and
     * fragment shaders. Defaults to {@link SHADERLANGUAGE_GLSL}.
     * @example
     * // Create a shader that renders primitives with a solid red color
     *
     * // Vertex shader
     * const vshader = `
     * attribute vec3 aPosition;
     *
     * void main(void) {
     *     gl_Position = vec4(aPosition, 1.0);
     * }
     * `;
     *
     * // Fragment shader
     * const fshader = `
     * precision ${graphicsDevice.precision} float;
     *
     * void main(void) {
     *     gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
     * }
     * `;
     *
     * const shaderDefinition = {
     *     attributes: {
     *         aPosition: pc.SEMANTIC_POSITION
     *     },
     *     vshader,
     *     fshader
     * };
     *
     * const shader = new pc.Shader(graphicsDevice, shaderDefinition);
     */ constructor(graphicsDevice, definition){
        /**
     * The attributes that this shader code uses. The location is the key, the value is the name.
     * These attributes are queried / extracted from the final shader.
     *
     * @type {Map<number, string>}
     * @ignore
     */ this.attributes = new Map();
        this.id = id$2++;
        this.device = graphicsDevice;
        this.definition = definition;
        this.name = definition.name || 'Untitled';
        this.init();
        if (definition.cshader) {
            Debug.assert(graphicsDevice.supportsCompute, 'Compute shaders are not supported on this device.');
            Debug.assert(!definition.vshader && !definition.fshader, 'Vertex and fragment shaders are not supported when creating a compute shader.');
            // keep reference to unmodified shader in debug mode
            Debug.call(()=>{
                this.cUnmodified = definition.cshader;
            });
            // Prepend enables and defines to compute shader source
            const enablesCode = ShaderDefinitionUtils.getWGSLEnables(graphicsDevice, 'compute');
            const definesCode = ShaderDefinitionUtils.getDefinesCode(graphicsDevice, definition.cdefines);
            const cshader = enablesCode + definesCode + definition.cshader;
            // Add built-in halfTypesCS include for compute shaders (if not already provided by user)
            const cincludes = definition.cincludes ?? new Map();
            if (!cincludes.has('halfTypesCS')) {
                cincludes.set('halfTypesCS', halfTypes);
            }
            // pre-process compute shader source
            definition.cshader = Preprocessor.run(cshader, cincludes, {
                sourceName: `compute shader for ${this.label}`,
                stripDefines: true
            });
        } else {
            Debug.assert(definition.vshader, 'No vertex shader has been specified when creating a shader.');
            Debug.assert(definition.fshader, 'No fragment shader has been specified when creating a shader.');
            // keep reference to unmodified shaders in debug mode
            Debug.call(()=>{
                this.vUnmodified = definition.vshader;
                this.fUnmodified = definition.fshader;
            });
            const wgsl = definition.shaderLanguage === SHADERLANGUAGE_WGSL;
            // pre-process vertex shader source
            definition.vshader = Preprocessor.run(definition.vshader, definition.vincludes, {
                sourceName: `vertex shader for ${this.label}`,
                stripDefines: wgsl
            });
            // if no attributes are specified, try to extract the default names after the shader has been pre-processed
            if (definition.shaderLanguage === SHADERLANGUAGE_GLSL) {
                var _definition;
                (_definition = definition).attributes ?? (_definition.attributes = ShaderDefinitionUtils.collectAttributes(definition.vshader));
            }
            // Strip unused color attachments from fragment shader.
            // Note: this is only needed for iOS 15 on WebGL2 where there seems to be a bug where color attachments that are not
            // written to generate metal linking errors. This is fixed on iOS 16, and iOS 14 does not support WebGL2.
            const stripUnusedColorAttachments = graphicsDevice.isWebGL2 && (platform.name === 'osx' || platform.name === 'ios');
            // pre-process fragment shader source
            definition.fshader = Preprocessor.run(definition.fshader, definition.fincludes, {
                stripUnusedColorAttachments,
                stripDefines: wgsl,
                sourceName: `fragment shader for ${this.label}`
            });
            if (!definition.vshader || !definition.fshader) {
                Debug.error(`Shader: Failed to create shader ${this.label}. Vertex or fragment shader source is empty.`, this);
                this.failed = true;
                return;
            }
        }
        this.impl = graphicsDevice.createShaderImpl(this);
        Debug.trace(TRACEID_SHADER_ALLOC, `Alloc: ${this.label}, stack: ${DebugGraphics.toString()}`, {
            instance: this
        });
    }
}

/**
 * @import { DynamicBuffer } from './dynamic-buffer.js'
 * @import { GraphicsDevice } from './graphics-device.js'
 */ /**
 * A container for storing the used areas of a pair of staging and gpu buffers.
 *
 * @ignore
 */ class UsedBuffer {
}
/**
 * A container for storing the return values of an allocation function.
 *
 * @ignore
 */ class DynamicBufferAllocation {
}
/**
 * The DynamicBuffers class provides a dynamic memory allocation system for uniform buffer data,
 * particularly for non-persistent uniform buffers. This class utilizes a bump allocator to
 * efficiently allocate aligned memory space from a set of large buffers managed internally. To
 * utilize this system, the user writes data to CPU-accessible staging buffers. When submitting
 * command buffers that require these buffers, the system automatically uploads the data to the GPU
 * buffers. This approach ensures efficient memory management and smooth data transfer between the
 * CPU and GPU.
 *
 * @ignore
 */ class DynamicBuffers {
    /**
     * Destroy the system of dynamic buffers.
     */ destroy() {
        this.gpuBuffers.forEach((gpuBuffer)=>{
            gpuBuffer.destroy(this.device);
        });
        this.gpuBuffers = null;
        this.stagingBuffers.forEach((stagingBuffer)=>{
            stagingBuffer.destroy(this.device);
        });
        this.stagingBuffers = null;
        this.usedBuffers = null;
        this.activeBuffer = null;
    }
    /**
     * Allocate an aligned space of the given size from a dynamic buffer.
     *
     * @param {DynamicBufferAllocation} allocation - The allocation info to fill.
     * @param {number} size - The size of the allocation.
     */ alloc(allocation, size) {
        // if we have active buffer without enough space
        if (this.activeBuffer) {
            const alignedStart = math.roundUp(this.activeBuffer.size, this.bufferAlignment);
            const space = this.bufferSize - alignedStart;
            if (space < size) {
                // we're done with this buffer, schedule it for submit
                this.scheduleSubmit();
            }
        }
        // if we don't have an active buffer, allocate new one
        if (!this.activeBuffer) {
            // gpu buffer
            let gpuBuffer = this.gpuBuffers.pop();
            if (!gpuBuffer) {
                gpuBuffer = this.createBuffer(this.device, this.bufferSize, false);
            }
            // staging buffer
            let stagingBuffer = this.stagingBuffers.pop();
            if (!stagingBuffer) {
                stagingBuffer = this.createBuffer(this.device, this.bufferSize, true);
            }
            this.activeBuffer = new UsedBuffer();
            this.activeBuffer.stagingBuffer = stagingBuffer;
            this.activeBuffer.gpuBuffer = gpuBuffer;
            this.activeBuffer.offset = 0;
            this.activeBuffer.size = 0;
        }
        // allocate from active buffer
        const activeBuffer = this.activeBuffer;
        const alignedStart = math.roundUp(activeBuffer.size, this.bufferAlignment);
        Debug.assert(alignedStart + size <= this.bufferSize, `The allocation size of ${size} is larger than the buffer size of ${this.bufferSize}`);
        allocation.gpuBuffer = activeBuffer.gpuBuffer;
        allocation.offset = alignedStart;
        allocation.storage = activeBuffer.stagingBuffer.alloc(alignedStart, size);
        // take the allocation from the buffer
        activeBuffer.size = alignedStart + size;
    }
    scheduleSubmit() {
        if (this.activeBuffer) {
            this.usedBuffers.push(this.activeBuffer);
            this.activeBuffer = null;
        }
    }
    submit() {
        // schedule currently active buffer for submit
        this.scheduleSubmit();
    }
    /**
     * Create the system of dynamic buffers.
     *
     * @param {GraphicsDevice} device - The graphics device.
     * @param {number} bufferSize - The size of the underlying large buffers.
     * @param {number} bufferAlignment - Alignment of each allocation.
     */ constructor(device, bufferSize, bufferAlignment){
        /**
     * Internally allocated gpu buffers.
     *
     * @type {DynamicBuffer[]}
     */ this.gpuBuffers = [];
        /**
     * Internally allocated staging buffers (CPU writable)
     *
     * @type {DynamicBuffer[]}
     */ this.stagingBuffers = [];
        /**
     * @type {UsedBuffer[]}
     */ this.usedBuffers = [];
        /**
     * @type {UsedBuffer|null}
     */ this.activeBuffer = null;
        this.device = device;
        this.bufferSize = bufferSize;
        this.bufferAlignment = bufferAlignment;
    }
}

/**
 * @import { DynamicBindGroup } from './bind-group.js'
 * @import { GraphicsDevice } from './graphics-device.js'
 * @import { UniformBufferFormat } from './uniform-buffer-format.js'
 * @import { UniformFormat } from './uniform-buffer-format.js'
 */ // Uniform buffer set functions - only implemented for types for which the default
// array to buffer copy does not work, or could be slower.
const _updateFunctions = [];
_updateFunctions[UNIFORMTYPE_FLOAT] = function(uniformBuffer, value, offset) {
    const dst = uniformBuffer.storageFloat32;
    dst[offset] = value;
};
_updateFunctions[UNIFORMTYPE_VEC2] = (uniformBuffer, value, offset)=>{
    const dst = uniformBuffer.storageFloat32;
    dst[offset] = value[0];
    dst[offset + 1] = value[1];
};
_updateFunctions[UNIFORMTYPE_VEC3] = (uniformBuffer, value, offset)=>{
    const dst = uniformBuffer.storageFloat32;
    dst[offset] = value[0];
    dst[offset + 1] = value[1];
    dst[offset + 2] = value[2];
};
_updateFunctions[UNIFORMTYPE_VEC4] = (uniformBuffer, value, offset)=>{
    const dst = uniformBuffer.storageFloat32;
    dst[offset] = value[0];
    dst[offset + 1] = value[1];
    dst[offset + 2] = value[2];
    dst[offset + 3] = value[3];
};
_updateFunctions[UNIFORMTYPE_INT] = function(uniformBuffer, value, offset) {
    const dst = uniformBuffer.storageInt32;
    dst[offset] = value;
};
_updateFunctions[UNIFORMTYPE_IVEC2] = function(uniformBuffer, value, offset) {
    const dst = uniformBuffer.storageInt32;
    dst[offset] = value[0];
    dst[offset + 1] = value[1];
};
_updateFunctions[UNIFORMTYPE_IVEC3] = function(uniformBuffer, value, offset) {
    const dst = uniformBuffer.storageInt32;
    dst[offset] = value[0];
    dst[offset + 1] = value[1];
    dst[offset + 2] = value[2];
};
_updateFunctions[UNIFORMTYPE_IVEC4] = function(uniformBuffer, value, offset) {
    const dst = uniformBuffer.storageInt32;
    dst[offset] = value[0];
    dst[offset + 1] = value[1];
    dst[offset + 2] = value[2];
    dst[offset + 3] = value[3];
};
// convert from continuous array to vec2[3] with padding to vec4[2]
_updateFunctions[UNIFORMTYPE_MAT2] = (uniformBuffer, value, offset)=>{
    const dst = uniformBuffer.storageFloat32;
    dst[offset] = value[0];
    dst[offset + 1] = value[1];
    dst[offset + 4] = value[2];
    dst[offset + 5] = value[3];
    dst[offset + 8] = value[4];
    dst[offset + 9] = value[5];
};
// convert from continuous array to vec3[3] with padding to vec4[3]
_updateFunctions[UNIFORMTYPE_MAT3] = (uniformBuffer, value, offset)=>{
    const dst = uniformBuffer.storageFloat32;
    dst[offset] = value[0];
    dst[offset + 1] = value[1];
    dst[offset + 2] = value[2];
    dst[offset + 4] = value[3];
    dst[offset + 5] = value[4];
    dst[offset + 6] = value[5];
    dst[offset + 8] = value[6];
    dst[offset + 9] = value[7];
    dst[offset + 10] = value[8];
};
_updateFunctions[UNIFORMTYPE_FLOATARRAY] = function(uniformBuffer, value, offset, count) {
    const dst = uniformBuffer.storageFloat32;
    for(let i = 0; i < count; i++){
        dst[offset + i * 4] = value[i];
    }
};
_updateFunctions[UNIFORMTYPE_VEC2ARRAY] = (uniformBuffer, value, offset, count)=>{
    const dst = uniformBuffer.storageFloat32;
    for(let i = 0; i < count; i++){
        dst[offset + i * 4] = value[i * 2];
        dst[offset + i * 4 + 1] = value[i * 2 + 1];
    }
};
_updateFunctions[UNIFORMTYPE_VEC3ARRAY] = (uniformBuffer, value, offset, count)=>{
    const dst = uniformBuffer.storageFloat32;
    for(let i = 0; i < count; i++){
        dst[offset + i * 4] = value[i * 3];
        dst[offset + i * 4 + 1] = value[i * 3 + 1];
        dst[offset + i * 4 + 2] = value[i * 3 + 2];
    }
};
_updateFunctions[UNIFORMTYPE_UINT] = (uniformBuffer, value, offset, count)=>{
    const dst = uniformBuffer.storageUint32;
    dst[offset] = value;
};
_updateFunctions[UNIFORMTYPE_UVEC2] = (uniformBuffer, value, offset, count)=>{
    const dst = uniformBuffer.storageUint32;
    dst[offset] = value[0];
    dst[offset + 1] = value[1];
};
_updateFunctions[UNIFORMTYPE_UVEC3] = (uniformBuffer, value, offset, count)=>{
    const dst = uniformBuffer.storageUint32;
    dst[offset] = value[0];
    dst[offset + 1] = value[1];
    dst[offset + 2] = value[2];
};
_updateFunctions[UNIFORMTYPE_UVEC4] = (uniformBuffer, value, offset, count)=>{
    const dst = uniformBuffer.storageUint32;
    dst[offset] = value[0];
    dst[offset + 1] = value[1];
    dst[offset + 2] = value[2];
    dst[offset + 3] = value[3];
};
_updateFunctions[UNIFORMTYPE_INTARRAY] = function(uniformBuffer, value, offset, count) {
    const dst = uniformBuffer.storageInt32;
    for(let i = 0; i < count; i++){
        dst[offset + i * 4] = value[i];
    }
};
_updateFunctions[UNIFORMTYPE_BOOLARRAY] = _updateFunctions[UNIFORMTYPE_INTARRAY];
_updateFunctions[UNIFORMTYPE_UINTARRAY] = function(uniformBuffer, value, offset, count) {
    const dst = uniformBuffer.storageUint32;
    for(let i = 0; i < count; i++){
        dst[offset + i * 4] = value[i];
    }
};
_updateFunctions[UNIFORMTYPE_IVEC2ARRAY] = (uniformBuffer, value, offset, count)=>{
    const dst = uniformBuffer.storageInt32;
    for(let i = 0; i < count; i++){
        dst[offset + i * 4] = value[i * 2];
        dst[offset + i * 4 + 1] = value[i * 2 + 1];
    }
};
_updateFunctions[UNIFORMTYPE_BVEC2ARRAY] = _updateFunctions[UNIFORMTYPE_IVEC2ARRAY];
_updateFunctions[UNIFORMTYPE_UVEC2ARRAY] = (uniformBuffer, value, offset, count)=>{
    const dst = uniformBuffer.storageUint32;
    for(let i = 0; i < count; i++){
        dst[offset + i * 4] = value[i * 2];
        dst[offset + i * 4 + 1] = value[i * 2 + 1];
    }
};
_updateFunctions[UNIFORMTYPE_IVEC3ARRAY] = (uniformBuffer, value, offset, count)=>{
    const dst = uniformBuffer.storageInt32;
    for(let i = 0; i < count; i++){
        dst[offset + i * 4] = value[i * 3];
        dst[offset + i * 4 + 1] = value[i * 3 + 1];
        dst[offset + i * 4 + 2] = value[i * 3 + 2];
    }
};
_updateFunctions[UNIFORMTYPE_BVEC3ARRAY] = _updateFunctions[UNIFORMTYPE_IVEC3ARRAY];
_updateFunctions[UNIFORMTYPE_UVEC3ARRAY] = (uniformBuffer, value, offset, count)=>{
    const dst = uniformBuffer.storageUint32;
    for(let i = 0; i < count; i++){
        dst[offset + i * 4] = value[i * 3];
        dst[offset + i * 4 + 1] = value[i * 3 + 1];
        dst[offset + i * 4 + 2] = value[i * 3 + 2];
    }
};
/**
 * A uniform buffer represents a GPU memory buffer storing the uniforms.
 *
 * @ignore
 */ class UniformBuffer {
    /**
     * Frees resources associated with this uniform buffer.
     */ destroy() {
        if (this.persistent) {
            // stop tracking the vertex buffer
            // TODO: remove the buffer from the list on the device (lost context handling)
            const device = this.device;
            this.impl.destroy(device);
            device._vram.ub -= this.format.byteSize;
        }
    }
    get offset() {
        return this.persistent ? 0 : this.allocation.offset;
    }
    /**
     * Assign a storage to this uniform buffer.
     *
     * @param {Int32Array} storage - The storage to assign to this uniform buffer.
     */ assignStorage(storage) {
        this.storageInt32 = storage;
        this.storageUint32 = new Uint32Array(storage.buffer, storage.byteOffset, storage.byteLength / 4);
        this.storageFloat32 = new Float32Array(storage.buffer, storage.byteOffset, storage.byteLength / 4);
    }
    /**
     * Called when the rendering context was lost. It releases all context related resources.
     */ loseContext() {
        this.impl?.loseContext();
    }
    /**
     * Assign a value to the uniform specified by its format. This is the fast version of assigning
     * a value to a uniform, avoiding any lookups.
     *
     * @param {UniformFormat} uniformFormat - The format of the uniform.
     * @param {any} value - The value to assign to the uniform.
     */ setUniform(uniformFormat, value) {
        Debug.assert(uniformFormat);
        const offset = uniformFormat.offset;
        if (value !== null && value !== undefined) {
            const updateFunction = _updateFunctions[uniformFormat.updateType];
            if (updateFunction) {
                updateFunction(this, value, offset, uniformFormat.count);
            } else {
                this.storageFloat32.set(value, offset);
            }
        } else {
            Debug.warnOnce(`Value was not set when assigning to uniform [${uniformFormat.name}]` + `, expected type ${uniformTypeToName[uniformFormat.type]} while rendering ${DebugGraphics.toString()}`);
        }
    }
    /**
     * Assign a value to the uniform specified by name.
     *
     * @param {string} name - The name of the uniform.
     * @param {any} value - The value to assign to the uniform.
     */ set(name, value) {
        const uniformFormat = this.format.map.get(name);
        Debug.assert(uniformFormat, `Uniform name [${name}] is not part of the Uniform buffer.`);
        if (uniformFormat) {
            this.setUniform(uniformFormat, value);
        }
    }
    startUpdate(dynamicBindGroup) {
        if (!this.persistent) {
            // allocate memory from dynamic buffer for this frame
            const allocation = this.allocation;
            const oldGpuBuffer = allocation.gpuBuffer;
            this.device.dynamicBuffers.alloc(allocation, this.format.byteSize);
            this.assignStorage(allocation.storage);
            // get info about bind group we can use for this non-persistent UB for this frame
            if (dynamicBindGroup) {
                dynamicBindGroup.bindGroup = allocation.gpuBuffer.getBindGroup(this);
                dynamicBindGroup.offsets[0] = allocation.offset;
            }
            // buffer has changed, update the render version to force bind group to be updated
            if (oldGpuBuffer !== allocation.gpuBuffer) {
                this.renderVersionDirty = this.device.renderVersion;
            }
        }
    }
    endUpdate() {
        if (this.persistent) {
            // Upload the new data
            this.impl.unlock(this);
        } else {
            this.storageFloat32 = null;
            this.storageInt32 = null;
        }
    }
    /**
     * @param {DynamicBindGroup} [dynamicBindGroup] - The function fills in the info about the
     * dynamic bind group for this frame, which uses this uniform buffer. Only used if the uniform
     * buffer is non-persistent. This allows the uniform buffer to be used without having to create
     * a bind group for it. Note that the bind group can only contains this single uniform buffer,
     * and no other resources.
     */ update(dynamicBindGroup) {
        this.startUpdate(dynamicBindGroup);
        // set new values
        const uniforms = this.format.uniforms;
        for(let i = 0; i < uniforms.length; i++){
            const value = uniforms[i].scopeId.value;
            this.setUniform(uniforms[i], value);
        }
        this.endUpdate();
    }
    /**
     * Create a new UniformBuffer instance.
     *
     * @param {GraphicsDevice} graphicsDevice - The graphics device used to manage this uniform
     * buffer.
     * @param {UniformBufferFormat} format - Format of the uniform buffer.
     * @param {boolean} [persistent] - Whether the buffer is persistent. Defaults to true.
     */ constructor(graphicsDevice, format, persistent = true){
        /**
     * A render version used to track the last time the properties requiring bind group to be
     * updated were changed.
     *
     * @type {number}
     */ this.renderVersionDirty = 0;
        this.device = graphicsDevice;
        this.format = format;
        this.persistent = persistent;
        Debug.assert(format);
        if (persistent) {
            this.impl = graphicsDevice.createUniformBufferImpl(this);
            const storage = new ArrayBuffer(format.byteSize);
            this.assignStorage(new Int32Array(storage));
            graphicsDevice._vram.ub += this.format.byteSize;
        // TODO: register with the device and handle lost context
        // this.device.buffers.push(this);
        } else {
            this.allocation = new DynamicBufferAllocation();
        }
    }
}

const primitive = {
    type: PRIMITIVE_TRISTRIP,
    base: 0,
    baseVertex: 0,
    count: 4,
    indexed: false
};
/**
 * A WebGPU helper class implementing a viewport clear operation. When rendering to a texture,
 * the whole surface can be cleared using loadOp, but if only a viewport needs to be cleared, or if
 * it needs to be cleared later during the rendering, this need to be achieved by rendering a quad.
 * This class renders a full-screen quad, and expects the viewport / scissor to be set up to clip
 * it to only required area.
 *
 * @ignore
 */ class WebgpuClearRenderer {
    destroy() {
        this.shader.destroy();
        this.shader = null;
        this.uniformBuffer.destroy();
        this.uniformBuffer = null;
    }
    clear(device, renderTarget, options, defaultOptions) {
        options = options || defaultOptions;
        const flags = options.flags ?? defaultOptions.flags;
        if (flags !== 0) {
            DebugGraphics.pushGpuMarker(device, 'CLEAR-RENDERER');
            // dynamic bind group for the UB
            const { uniformBuffer, dynamicBindGroup } = this;
            uniformBuffer.startUpdate(dynamicBindGroup);
            device.setBindGroup(BINDGROUP_MESH_UB, dynamicBindGroup.bindGroup, dynamicBindGroup.offsets);
            // not using mesh bind group
            device.setBindGroup(BINDGROUP_MESH, device.emptyBindGroup);
            // setup clear color
            let blendState;
            if (flags & CLEARFLAG_COLOR && (renderTarget.colorBuffer || renderTarget.impl.assignedColorTexture)) {
                const color = options.color ?? defaultOptions.color;
                this.colorData.set(color);
                blendState = BlendState.NOBLEND;
            } else {
                blendState = BlendState.NOWRITE;
            }
            uniformBuffer.set('color', this.colorData);
            // setup depth clear
            let depthState;
            if (flags & CLEARFLAG_DEPTH && renderTarget.depth) {
                const depth = options.depth ?? defaultOptions.depth;
                uniformBuffer.set('depth', depth);
                depthState = DepthState.WRITEDEPTH;
            } else {
                uniformBuffer.set('depth', 1);
                depthState = DepthState.NODEPTH;
            }
            // setup stencil clear
            if (flags & CLEARFLAG_STENCIL && renderTarget.stencil) {
                Debug.warnOnce('ClearRenderer does not support stencil clear at the moment');
            }
            uniformBuffer.endUpdate();
            device.setDrawStates(blendState, depthState);
            // render 4 vertices without vertex buffer
            device.setShader(this.shader);
            device.draw(primitive);
            DebugGraphics.popGpuMarker(device);
        }
    }
    constructor(device){
        // shader that can write out color and depth values
        const code = `

            struct ub_mesh {
                color : vec4f,
                depth: f32
            }

            @group(2) @binding(0) var<uniform> ubMesh : ub_mesh;

            var<private> pos : array<vec2f, 4> = array<vec2f, 4>(
                vec2(-1.0, 1.0), vec2(1.0, 1.0),
                vec2(-1.0, -1.0), vec2(1.0, -1.0)
            );

            struct VertexOutput {
                @builtin(position) position : vec4f
            }

            @vertex
            fn vertexMain(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
                var output : VertexOutput;
                output.position = vec4(pos[vertexIndex], ubMesh.depth, 1.0);
                return output;
            }

            @fragment
            fn fragmentMain() -> @location(0) vec4f {
                return ubMesh.color;
            }
        `;
        this.shader = new Shader(device, {
            name: 'WebGPUClearRendererShader',
            shaderLanguage: SHADERLANGUAGE_WGSL,
            vshader: code,
            fshader: code
        });
        // uniforms
        this.uniformBuffer = new UniformBuffer(device, new UniformBufferFormat(device, [
            new UniformFormat('color', UNIFORMTYPE_VEC4),
            new UniformFormat('depth', UNIFORMTYPE_FLOAT)
        ]), false);
        this.dynamicBindGroup = new DynamicBindGroup();
        // uniform data
        this.colorData = new Float32Array(4);
    }
}

/**
 * @import { WebgpuGraphicsDevice } from './webgpu-graphics-device.js'
 * @import { WebgpuShader } from './webgpu-shader.js'
 * @import { WebgpuTexture } from './webgpu-texture.js'
 */ /**
 * A WebGPU helper class implementing texture mipmap generation.
 *
 * @ignore
 */ class WebgpuMipmapRenderer {
    destroy() {
        this.shader.destroy();
        this.shader = null;
        this.pipelineCache.clear();
    }
    /**
     * Generates mipmaps for the specified WebGPU texture.
     *
     * @param {WebgpuTexture} webgpuTexture - The texture to generate mipmaps for.
     */ generate(webgpuTexture) {
        // ignore texture with no mipmaps
        const textureDescr = webgpuTexture.desc;
        if (textureDescr.mipLevelCount <= 1) {
            return;
        }
        // not all types are currently supported
        if (webgpuTexture.texture.volume) {
            Debug.warnOnce('WebGPU mipmap generation is not supported volume texture.', webgpuTexture.texture);
            return;
        }
        const device = this.device;
        const wgpu = device.wgpu;
        const format = textureDescr.format;
        // Get or create cached pipeline for this texture format
        let pipeline = this.pipelineCache.get(format);
        if (!pipeline) {
            /** @type {WebgpuShader} */ const webgpuShader = this.shader.impl;
            pipeline = wgpu.createRenderPipeline({
                layout: 'auto',
                vertex: {
                    module: webgpuShader.getVertexShaderModule(),
                    entryPoint: webgpuShader.vertexEntryPoint
                },
                fragment: {
                    module: webgpuShader.getFragmentShaderModule(),
                    entryPoint: webgpuShader.fragmentEntryPoint,
                    targets: [
                        {
                            format: format
                        }
                    ]
                },
                primitive: {
                    topology: 'triangle-strip'
                }
            });
            DebugHelper.setLabel(pipeline, `RenderPipeline-MipmapRenderer-${format}`);
            this.pipelineCache.set(format, pipeline);
        }
        const texture = webgpuTexture.texture;
        const numFaces = texture.cubemap ? 6 : texture.array ? texture.arrayLength : 1;
        const srcViews = [];
        for(let face = 0; face < numFaces; face++){
            srcViews.push(webgpuTexture.createView({
                dimension: '2d',
                baseMipLevel: 0,
                mipLevelCount: 1,
                baseArrayLayer: face
            }));
        }
        // loop through each mip level and render the previous level's contents into it.
        const commandEncoder = device.getCommandEncoder();
        DebugGraphics.pushGpuMarker(device, 'MIPMAP-RENDERER');
        for(let i = 1; i < textureDescr.mipLevelCount; i++){
            for(let face = 0; face < numFaces; face++){
                const dstView = webgpuTexture.createView({
                    dimension: '2d',
                    baseMipLevel: i,
                    mipLevelCount: 1,
                    baseArrayLayer: face
                });
                const passEncoder = commandEncoder.beginRenderPass({
                    colorAttachments: [
                        {
                            view: dstView,
                            loadOp: 'clear',
                            storeOp: 'store'
                        }
                    ]
                });
                DebugHelper.setLabel(passEncoder, `MipmapRenderer-PassEncoder_${i}`);
                const bindGroup = wgpu.createBindGroup({
                    layout: pipeline.getBindGroupLayout(0),
                    entries: [
                        {
                            binding: 0,
                            resource: this.minSampler
                        },
                        {
                            binding: 1,
                            resource: srcViews[face]
                        }
                    ]
                });
                passEncoder.setPipeline(pipeline);
                passEncoder.setBindGroup(0, bindGroup);
                passEncoder.draw(4);
                passEncoder.end();
                // next iteration
                srcViews[face] = dstView;
            }
        }
        DebugGraphics.popGpuMarker(device);
        // clear invalidated state
        device.pipeline = null;
    }
    constructor(device){
        /**
     * Cache of render pipelines keyed by texture format.
     *
     * @type {Map<string, GPURenderPipeline>}
     * @private
     */ this.pipelineCache = new Map();
        this.device = device;
        // Shader that renders a fullscreen textured quad
        const code = `
 
            var<private> pos : array<vec2f, 4> = array<vec2f, 4>(
                vec2(-1.0, 1.0), vec2(1.0, 1.0),
                vec2(-1.0, -1.0), vec2(1.0, -1.0)
            );

            struct VertexOutput {
                @builtin(position) position : vec4f,
                @location(0) texCoord : vec2f
            };

            @vertex
            fn vertexMain(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
              var output : VertexOutput;
              output.texCoord = pos[vertexIndex] * vec2f(0.5, -0.5) + vec2f(0.5);
              output.position = vec4f(pos[vertexIndex], 0, 1);
              return output;
            }

            @group(0) @binding(0) var imgSampler : sampler;
            @group(0) @binding(1) var img : texture_2d<f32>;

            @fragment
            fn fragmentMain(@location(0) texCoord : vec2f) -> @location(0) vec4f {
              return textureSample(img, imgSampler, texCoord);
            }
        `;
        this.shader = new Shader(device, {
            name: 'WebGPUMipmapRendererShader',
            shaderLanguage: SHADERLANGUAGE_WGSL,
            vshader: code,
            fshader: code
        });
        // using minified rendering, so that's the only filter mode we need to set.
        this.minSampler = device.wgpu.createSampler({
            minFilter: 'linear'
        });
    }
}

/**
 * @import { GraphicsDevice } from './graphics-device.js'
 */ /**
 * A base class representing a single per platform buffer.
 *
 * @ignore
 */ class DynamicBuffer {
    getBindGroup(ub) {
        const ubSize = ub.format.byteSize;
        let bindGroup = this.bindGroupCache.get(ubSize);
        if (!bindGroup) {
            // bind group
            // we pass ub to it, but internally only its size is used
            bindGroup = new BindGroup(this.device, this.bindGroupFormat, ub);
            DebugHelper.setName(bindGroup, `DynamicBuffer-BindGroup_${bindGroup.id}-${ubSize}`);
            bindGroup.update();
            this.bindGroupCache.set(ubSize, bindGroup);
        }
        return bindGroup;
    }
    constructor(device){
        /**
     * A cache of bind groups for each uniform buffer size, which is used to avoid creating a new
     * bind group for each uniform buffer.
     *
     * @type {Map<number, BindGroup>}
     */ this.bindGroupCache = new Map();
        this.device = device;
        // format of the bind group
        this.bindGroupFormat = new BindGroupFormat(this.device, [
            new BindUniformBufferFormat(UNIFORM_BUFFER_DEFAULT_SLOT_NAME, SHADERSTAGE_VERTEX | SHADERSTAGE_FRAGMENT)
        ]);
    }
}

class WebgpuDynamicBuffer extends DynamicBuffer {
    destroy(device) {
        device._vram.ub -= this.buffer.size;
        this.buffer.destroy();
        this.buffer = null;
    }
    /**
     * Called when the staging buffer is mapped for writing.
     */ onAvailable() {
        // map the whole buffer
        this.mappedRange = this.buffer.getMappedRange();
    }
    alloc(offset, size) {
        return new Int32Array(this.mappedRange, offset, size / 4);
    }
    constructor(device, size, isStaging){
        super(device), /**
     * @type {GPUBuffer}
     * @private
     */ this.buffer = null, /**
     * CPU access over the whole buffer.
     *
     * @type {ArrayBuffer}
     */ this.mappedRange = null;
        this.buffer = device.wgpu.createBuffer({
            size: size,
            usage: isStaging ? GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC : GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: isStaging
        });
        if (isStaging) {
            this.onAvailable();
        }
        // staging buffers are not stored in vram, but add them for tracking purposes anyways
        device._vram.ub += size;
        DebugHelper.setLabel(this.buffer, `DynamicBuffer-${isStaging ? 'Staging' : 'Gpu'}`);
    }
}

class WebgpuDynamicBuffers extends DynamicBuffers {
    createBuffer(device, size, isStaging) {
        return new WebgpuDynamicBuffer(device, size, isStaging);
    }
    /**
     * Submit all used buffers to the device.
     */ submit() {
        super.submit();
        // submit all used buffers
        const count = this.usedBuffers.length;
        if (count) {
            const device = this.device;
            const gpuBuffers = this.gpuBuffers;
            // new command encoder, as buffer copies need to be submitted before the currently recorded
            // rendering encoder is submitted
            const commandEncoder = device.wgpu.createCommandEncoder();
            DebugHelper.setLabel(commandEncoder, 'DynamicBuffersSubmit');
            DebugGraphics.pushGpuMarker(device, 'DynamicBuffersSubmit');
            // run this loop backwards to preserve the order of buffers in gpuBuffers array
            for(let i = count - 1; i >= 0; i--){
                const usedBuffer = this.usedBuffers[i];
                const { stagingBuffer, gpuBuffer, offset, size } = usedBuffer;
                // unmap staging buffer (we're done writing to it on CPU)
                const src = stagingBuffer.buffer;
                src.unmap();
                // schedule data copy from staging to gpu buffer
                commandEncoder.copyBufferToBuffer(src, offset, gpuBuffer.buffer, offset, size);
                // gpu buffer can be reused immediately
                gpuBuffers.push(gpuBuffer);
            }
            DebugGraphics.popGpuMarker(device);
            // schedule the command buffer to run before all currently scheduled command buffers
            const cb = commandEncoder.finish();
            DebugHelper.setLabel(cb, 'DynamicBuffers');
            device.addCommandBuffer(cb, true);
            // keep the used staging buffers in the pending list
            for(let i = 0; i < count; i++){
                const stagingBuffer = this.usedBuffers[i].stagingBuffer;
                this.pendingStagingBuffers.push(stagingBuffer);
            }
            this.usedBuffers.length = 0;
        }
    }
    /**
     * Called when all scheduled command buffers are submitted to the device.
     */ onCommandBuffersSubmitted() {
        // map the staging buffers for write to alow them to be reused - this resolves when the CBs
        // using them are done on the GPU
        const count = this.pendingStagingBuffers.length;
        if (count) {
            for(let i = 0; i < count; i++){
                const stagingBuffer = this.pendingStagingBuffers[i];
                stagingBuffer.buffer.mapAsync(GPUMapMode.WRITE).then(()=>{
                    // the buffer can be mapped after the device has been destroyed, so test for that
                    if (this.stagingBuffers) {
                        stagingBuffer.onAvailable();
                        this.stagingBuffers.push(stagingBuffer);
                    }
                });
            }
            this.pendingStagingBuffers.length = 0;
        }
    }
    constructor(...args){
        super(...args), /**
     * Staging buffers which are getting copied over to gpu buffers in the the command buffer waiting
     * to be submitted. When those command buffers are submitted, we can mapAsync these staging
     * buffers for reuse.
     *
     * @type {WebgpuDynamicBuffer[]}
     */ this.pendingStagingBuffers = [];
    }
}

/**
 * Base class of a simple GPU profiler.
 *
 * @ignore
 */ class GpuProfiler {
    loseContext() {
        this.pastFrameAllocations.clear();
    }
    /**
     * True to enable the profiler.
     *
     * @type {boolean}
     */ set enabled(value) {
        this._enableRequest = value;
    }
    get enabled() {
        return this._enableRequest;
    }
    /**
     * Get the per-pass timing data.
     *
     * @type {Map<string, number>}
     * @ignore
     */ get passTimings() {
        return this._passTimings;
    }
    processEnableRequest() {
        if (this._enableRequest !== this._enabled) {
            this._enabled = this._enableRequest;
            if (!this._enabled) {
                this._frameTime = 0;
            }
        }
    }
    request(renderVersion) {
        this.pastFrameAllocations.set(renderVersion, this.frameAllocations);
        this.frameAllocations = [];
    }
    /**
     * Parse a render pass name to a simplified form for stats.
     * Uses a cache to avoid repeated string operations.
     *
     * @param {string} name - The original pass name (e.g., "RenderPassCompose").
     * @returns {string} The parsed name (e.g., "compose").
     * @private
     */ _parsePassName(name) {
        // check cache first
        let parsedName = this._nameCache.get(name);
        if (parsedName === undefined) {
            // remove "RenderPass" prefix if present
            if (name.startsWith('RenderPass')) {
                parsedName = name.substring(10);
            } else {
                parsedName = name;
            }
            this._nameCache.set(name, parsedName);
        }
        return parsedName;
    }
    report(renderVersion, timings) {
        if (timings) {
            const allocations = this.pastFrameAllocations.get(renderVersion);
            if (!allocations) {
                return;
            }
            Debug.assert(allocations.length === timings.length);
            // store frame duration
            if (timings.length > 0) {
                this._frameTime = timings.reduce((sum, t)=>sum + t, 0);
            }
            // clear old pass timings
            this._passTimings.clear();
            // accumulate per-pass timings
            for(let i = 0; i < allocations.length; ++i){
                const name = allocations[i];
                const timing = timings[i];
                const parsedName = this._parsePassName(name);
                // accumulate timings for passes with the same name
                this._passTimings.set(parsedName, (this._passTimings.get(parsedName) || 0) + timing);
            }
            // log out timings
            if (Tracing.get(TRACEID_GPU_TIMINGS)) {
                Debug.trace(TRACEID_GPU_TIMINGS, `-- GPU timings for frame ${renderVersion} --`);
                let total = 0;
                for(let i = 0; i < allocations.length; ++i){
                    const name = allocations[i];
                    total += timings[i];
                    Debug.trace(TRACEID_GPU_TIMINGS, `${timings[i].toFixed(2)} ms ${name}`);
                }
                Debug.trace(TRACEID_GPU_TIMINGS, `${total.toFixed(2)} ms TOTAL`);
            }
        }
        // remove frame info
        this.pastFrameAllocations.delete(renderVersion);
    }
    /**
     * Allocate a slot for GPU timing during the frame. This slot is valid only for the current
     * frame. This allows multiple timers to be used during the frame, each with a unique name.
     *
     * @param {string} name - The name of the slot.
     * @returns {number} The assigned slot index, or -1 if the slot count exceeds the maximum number
     * of slots.
     *
     * @ignore
     */ getSlot(name) {
        if (this.frameAllocations.length >= this.maxCount) {
            return -1;
        }
        const slot = this.frameAllocations.length;
        this.frameAllocations.push(name);
        return slot;
    }
    /**
     * Number of slots allocated during the frame.
     *
     * @ignore
     */ get slotCount() {
        return this.frameAllocations.length;
    }
    constructor(){
        /**
     * Profiling slots allocated for the current frame, storing the names of the slots.
     *
     * @type {string[]}
     * @ignore
     */ this.frameAllocations = [];
        /**
     * Map of past frame allocations, indexed by renderVersion
     *
     * @type {Map<number, string[]>}
     * @ignore
     */ this.pastFrameAllocations = new Map();
        /**
     * True if enabled in the current frame.
     *
     * @private
     */ this._enabled = false;
        /**
     * The enable request for the next frame.
     *
     * @private
     */ this._enableRequest = false;
        /**
     * The time it took to render the last frame on GPU, or 0 if the profiler is not enabled.
     *
     * @private
     */ this._frameTime = 0;
        /**
     * Per-pass timing data, with accumulated timings for passes with the same name.
     *
     * @type {Map<string, number>}
     * @private
     */ this._passTimings = new Map();
        /**
     * Cache for parsed pass names to avoid repeated string operations.
     *
     * @type {Map<string, string>}
     * @private
     */ this._nameCache = new Map();
        /**
     * The maximum number of slots that can be allocated during the frame.
     *
     * @type {number}
     */ this.maxCount = 9999;
    }
}

/**
 * A wrapper over the GpuQuerySet object, allowing timestamp and occlusion queries. The results
 * are copied back using staging buffers to avoid blocking.
 */ class WebgpuQuerySet {
    destroy() {
        this.querySet?.destroy();
        this.querySet = null;
        this.queryBuffer?.destroy();
        this.queryBuffer = null;
        this.activeStagingBuffer = null;
        this.stagingBuffers.forEach((stagingBuffer)=>{
            stagingBuffer.destroy();
        });
        this.stagingBuffers = null;
    }
    getStagingBuffer() {
        let stagingBuffer = this.stagingBuffers.pop();
        if (!stagingBuffer) {
            stagingBuffer = this.device.wgpu.createBuffer({
                size: this.queryBuffer.size,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
            });
            DebugHelper.setLabel(this.queryBuffer, 'QueryStagingBuffer');
        }
        return stagingBuffer;
    }
    resolve(count) {
        const device = this.device;
        const commandEncoder = device.getCommandEncoder();
        // copy times to the gpu buffer
        commandEncoder.resolveQuerySet(this.querySet, 0, count, this.queryBuffer, 0);
        // copy the gpu buffer to the staging buffer
        const activeStagingBuffer = this.getStagingBuffer();
        this.activeStagingBuffer = activeStagingBuffer;
        commandEncoder.copyBufferToBuffer(this.queryBuffer, 0, activeStagingBuffer, 0, this.bytesPerSlot * count);
    }
    request(count, renderVersion) {
        const stagingBuffer = this.activeStagingBuffer;
        this.activeStagingBuffer = null;
        return stagingBuffer.mapAsync(GPUMapMode.READ).then(()=>{
            // timestamps in nanoseconds. Note that this array is valid only till we unmap the staging buffer.
            const srcTimings = new BigInt64Array(stagingBuffer.getMappedRange());
            // convert to ms per sample pair
            const timings = [];
            for(let i = 0; i < count; i++){
                timings.push(Number(srcTimings[i * 2 + 1] - srcTimings[i * 2]) * 0.000001);
            }
            stagingBuffer.unmap();
            this.stagingBuffers?.push(stagingBuffer);
            return {
                renderVersion,
                timings
            };
        });
    }
    constructor(device, isTimestamp, capacity){
        this.stagingBuffers = [];
        this.activeStagingBuffer = null;
        this.device = device;
        this.capacity = capacity;
        this.bytesPerSlot = isTimestamp ? 8 : 4;
        // query set
        const wgpu = device.wgpu;
        this.querySet = wgpu.createQuerySet({
            type: isTimestamp ? 'timestamp' : 'occlusion',
            count: capacity
        });
        DebugHelper.setLabel(this.querySet, `QuerySet-${isTimestamp ? 'Timestamp' : 'Occlusion'}`);
        // gpu buffer for query results GPU writes to
        this.queryBuffer = wgpu.createBuffer({
            size: this.bytesPerSlot * capacity,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
        });
        DebugHelper.setLabel(this.queryBuffer, 'QueryGpuBuffer');
    }
}

class WebgpuGpuProfiler extends GpuProfiler {
    destroy() {
        this.timestampQueriesSet?.destroy();
        this.timestampQueriesSet = null;
    }
    frameStart() {
        this.processEnableRequest();
    }
    frameEnd() {
        if (this._enabled) {
            // schedule command buffer where timestamps are copied to CPU
            this.timestampQueriesSet?.resolve(this.slotCount * 2);
        }
    }
    request() {
        if (this._enabled) {
            // request results
            const renderVersion = this.device.renderVersion;
            this.timestampQueriesSet?.request(this.slotCount, renderVersion).then((results)=>{
                this.report(results.renderVersion, results.timings);
            });
            super.request(renderVersion);
        }
    }
    constructor(device){
        super();
        this.device = device;
        this.maxCount = 1024;
        // gpu timing queries
        this.timestampQueriesSet = device.supportsTimestampQuery ? new WebgpuQuerySet(device, true, 2 * this.maxCount) : null;
    }
}

/**
 * @import { WebgpuGraphicsDevice } from './webgpu-graphics-device.js'
 * @import { WebgpuShader } from './webgpu-shader.js'
 */ /**
 * A WebGPU helper class implementing custom resolve of multi-sampled textures.
 *
 * @ignore
 */ class WebgpuResolver {
    destroy() {
        this.shader.destroy();
        this.shader = null;
        this.pipelineCache = null;
    }
    /**
     * @param {GPUTextureFormat} format - Texture format.
     * @returns {GPURenderPipeline} Pipeline for the given format.
     * @private
     */ getPipeline(format) {
        let pipeline = this.pipelineCache.get(format);
        if (!pipeline) {
            pipeline = this.createPipeline(format);
            this.pipelineCache.set(format, pipeline);
        }
        return pipeline;
    }
    /**
     * @param {GPUTextureFormat} format - Texture format.
     * @returns {GPURenderPipeline} Pipeline for the given format.
     * @private
     */ createPipeline(format) {
        /** @type {WebgpuShader} */ const webgpuShader = this.shader.impl;
        const pipeline = this.device.wgpu.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: webgpuShader.getVertexShaderModule(),
                entryPoint: webgpuShader.vertexEntryPoint
            },
            fragment: {
                module: webgpuShader.getFragmentShaderModule(),
                entryPoint: webgpuShader.fragmentEntryPoint,
                targets: [
                    {
                        format: format
                    }
                ]
            },
            primitive: {
                topology: 'triangle-strip'
            }
        });
        DebugHelper.setLabel(pipeline, `RenderPipeline-DepthResolver-${format}`);
        return pipeline;
    }
    /**
     * @param {GPUCommandEncoder} commandEncoder - Command encoder to use for the resolve.
     * @param {GPUTexture} sourceTexture - Source multi-sampled depth texture to resolve.
     * @param {GPUTexture} destinationTexture - Destination depth texture to resolve to.
     * @private
     */ resolveDepth(commandEncoder, sourceTexture, destinationTexture) {
        Debug.assert(sourceTexture.sampleCount > 1);
        Debug.assert(destinationTexture.sampleCount === 1);
        Debug.assert(sourceTexture.depthOrArrayLayers === destinationTexture.depthOrArrayLayers);
        const device = this.device;
        const wgpu = device.wgpu;
        // pipeline depends on the format
        const pipeline = this.getPipeline(destinationTexture.format);
        DebugGraphics.pushGpuMarker(device, 'DEPTH_RESOLVE-RENDERER');
        const numFaces = sourceTexture.depthOrArrayLayers;
        for(let face = 0; face < numFaces; face++){
            // copy depth only (not stencil)
            const srcView = sourceTexture.createView({
                dimension: '2d',
                aspect: 'depth-only',
                baseMipLevel: 0,
                mipLevelCount: 1,
                baseArrayLayer: face
            });
            const dstView = destinationTexture.createView({
                dimension: '2d',
                baseMipLevel: 0,
                mipLevelCount: 1,
                baseArrayLayer: face
            });
            const passEncoder = commandEncoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: dstView,
                        loadOp: 'clear',
                        storeOp: 'store'
                    }
                ]
            });
            DebugHelper.setLabel(passEncoder, 'DepthResolve-PassEncoder');
            // no need for a sampler when using textureLoad
            const bindGroup = wgpu.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    {
                        binding: 0,
                        resource: srcView
                    }
                ]
            });
            passEncoder.setPipeline(pipeline);
            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.draw(4);
            passEncoder.end();
        }
        DebugGraphics.popGpuMarker(device);
        // clear invalidated state
        device.pipeline = null;
    }
    constructor(device){
        /**
     * Cache of render pipelines for each texture format, to avoid their per frame creation.
     *
     * @type {Map<GPUTextureFormat, GPURenderPipeline>}
     * @private
     */ this.pipelineCache = new Map();
        this.device = device;
        // Shader that renders a fullscreen textured quad and copies the depth value from sample index 0
        // TODO: could handle all sample indices and use min/max as needed
        const code = `
 
            var<private> pos : array<vec2f, 4> = array<vec2f, 4>(
                vec2(-1.0, 1.0), vec2(1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, -1.0)
            );

            struct VertexOutput {
                @builtin(position) position : vec4f,
            };

            @vertex
            fn vertexMain(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
              var output : VertexOutput;
              output.position = vec4f(pos[vertexIndex], 0, 1);
              return output;
            }

            @group(0) @binding(0) var img : texture_depth_multisampled_2d;

            @fragment
            fn fragmentMain(@builtin(position) fragColor: vec4f) -> @location(0) vec4f {
                // load th depth value from sample index 0
                var depth = textureLoad(img, vec2i(fragColor.xy), 0u);
                return vec4f(depth, 0.0, 0.0, 0.0);
            }
        `;
        this.shader = new Shader(device, {
            name: 'WebGPUResolverDepthShader',
            shaderLanguage: SHADERLANGUAGE_WGSL,
            vshader: code,
            fshader: code
        });
    }
}

// size of indirect dispatch entry in bytes, 3 x 32bit (x, y, z workgroup counts)
const _indirectDispatchEntryByteSize$1 = 3 * 4;
/**
 * A WebGPU implementation of the Compute.
 *
 * @ignore
 */ class WebgpuCompute {
    destroy() {
        this.uniformBuffers.forEach((ub)=>ub.destroy());
        this.uniformBuffers.length = 0;
        this.bindGroup.destroy();
        this.bindGroup = null;
    }
    updateBindGroup() {
        // bind group data
        const { bindGroup } = this;
        bindGroup.updateUniformBuffers();
        bindGroup.update();
    }
    dispatch(x, y, z) {
        // bind group
        const device = this.compute.device;
        device.setBindGroup(0, this.bindGroup);
        // compute pipeline
        const passEncoder = device.passEncoder;
        passEncoder.setPipeline(this.pipeline);
        // dispatch
        const { indirectSlotIndex, indirectBuffer, indirectFrameStamp } = this.compute;
        if (indirectSlotIndex >= 0) {
            let gpuBuffer;
            if (indirectBuffer) {
                // custom buffer - user owns lifetime, no frame validation
                gpuBuffer = indirectBuffer.impl.buffer;
            } else {
                // built-in buffer - validate frame stamp
                Debug.assert(indirectFrameStamp === device.renderVersion, 'Indirect dispatch slot must be set each frame using setupIndirectDispatch()');
                gpuBuffer = device.indirectDispatchBuffer.impl.buffer;
            }
            const offset = indirectSlotIndex * _indirectDispatchEntryByteSize$1;
            passEncoder.dispatchWorkgroupsIndirect(gpuBuffer, offset);
        } else {
            passEncoder.dispatchWorkgroups(x, y, z);
        }
    }
    constructor(compute){
        /** @type {UniformBuffer[]} */ this.uniformBuffers = [];
        /** @type {BindGroup} */ this.bindGroup = null;
        this.compute = compute;
        const { device, shader } = compute;
        DebugGraphics.pushGpuMarker(device, `Compute:${compute.name}`);
        // create bind group
        const { computeBindGroupFormat, computeUniformBufferFormats } = shader.impl;
        Debug.assert(computeBindGroupFormat, 'Compute shader does not have computeBindGroupFormat specified', shader);
        // this.bindGroup = new BindGroup(device, computeBindGroupFormat, this.uniformBuffer);
        this.bindGroup = new BindGroup(device, computeBindGroupFormat);
        DebugHelper.setName(this.bindGroup, `Compute-BindGroup_${this.bindGroup.id}`);
        if (computeUniformBufferFormats) {
            for(const name in computeUniformBufferFormats){
                if (computeUniformBufferFormats.hasOwnProperty(name)) {
                    // TODO: investigate implications of using a non-persistent uniform buffer
                    const ub = new UniformBuffer(device, computeUniformBufferFormats[name], true);
                    this.uniformBuffers.push(ub);
                    this.bindGroup.setUniformBuffer(name, ub);
                }
            }
        }
        // pipeline
        this.pipeline = device.computePipeline.get(shader, computeBindGroupFormat);
        DebugGraphics.popGpuMarker(device);
    }
}

/**
 * @import { GraphicsDevice } from './graphics-device.js'
 */ let id$1 = 0;
/**
 * A storage buffer represents a memory which both the CPU and the GPU can access. Typically it is
 * used to provide data for compute shader, and to store the result of the computation.
 * Note that this class is only supported on the WebGPU platform.
 *
 * @category Graphics
 */ class StorageBuffer {
    /**
     * Frees resources associated with this storage buffer.
     */ destroy() {
        // stop tracking the buffer
        const device = this.device;
        device.buffers.delete(this);
        this.adjustVramSizeTracking(device._vram, -this.byteSize);
        this.impl.destroy(device);
    }
    adjustVramSizeTracking(vram, size) {
        Debug.trace(TRACEID_VRAM_SB, `${this.id} size: ${size} vram.sb: ${vram.sb} => ${vram.sb + size}`);
        vram.sb += size;
    }
    /**
     * Read the contents of a storage buffer.
     *
     * @param {number} [offset] - The byte offset of data to read. Defaults to 0.
     * @param {number} [size] - The byte size of data to read. Defaults to the full size of the
     * buffer minus the offset.
     * @param {ArrayBufferView|null} [data] - Typed array to populate with the data read from the
     * storage buffer. When typed array is supplied, enough space needs to be reserved, otherwise
     * only partial data is copied. If not specified, the data is returned in an Uint8Array.
     * Defaults to null.
     * @param {boolean} [immediate] - If true, the read operation will be executed as soon as
     * possible. This has a performance impact, so it should be used only when necessary. Defaults
     * to false.
     * @returns {Promise<ArrayBufferView>} A promise that resolves with the data read from the
     * storage buffer.
     * @ignore
     */ read(offset = 0, size = this.byteSize, data = null, immediate = false) {
        return this.impl.read(this.device, offset, size, data, immediate);
    }
    /**
     * Issues a write operation of the provided data into a storage buffer.
     *
     * @param {number} bufferOffset - The offset in bytes to start writing to the storage buffer.
     * @param {ArrayBufferView} data - The data to write to the storage buffer.
     * @param {number} dataOffset - Offset in data to begin writing from. Given in elements if data
     * is a TypedArray and bytes otherwise.
     * @param {number} size - Size of content to write from data to buffer. Given in elements if
     * data is a TypedArray and bytes otherwise.
     */ write(bufferOffset = 0, data, dataOffset = 0, size) {
        this.impl.write(this.device, bufferOffset, data, dataOffset, size);
    }
    /**
     * Clear the content of a storage buffer to 0.
     *
     * @param {number} [offset] - The byte offset of data to clear. Defaults to 0.
     * @param {number} [size] - The byte size of data to clear. Defaults to the full size of the
     * buffer minus the offset.
     */ clear(offset = 0, size = this.byteSize) {
        this.impl.clear(this.device, offset, size);
    }
    /**
     * Copy data from another storage buffer into this storage buffer.
     *
     * @param {StorageBuffer} srcBuffer - The source storage buffer to copy from.
     * @param {number} [srcOffset] - The byte offset in the source buffer. Defaults to 0.
     * @param {number} [dstOffset] - The byte offset in this buffer. Defaults to 0.
     * @param {number} [size] - The byte size of data to copy. Defaults to the full size of the
     * source buffer minus the source offset.
     */ copy(srcBuffer, srcOffset = 0, dstOffset = 0, size = srcBuffer.byteSize - srcOffset) {
        Debug.assert(srcOffset + size <= srcBuffer.byteSize, 'Source copy range exceeds buffer size');
        Debug.assert(dstOffset + size <= this.byteSize, 'Destination copy range exceeds buffer size');
        const commandEncoder = this.device.getCommandEncoder();
        commandEncoder.copyBufferToBuffer(srcBuffer.impl.buffer, srcOffset, this.impl.buffer, dstOffset, size);
    }
    /**
     * Create a new StorageBuffer instance.
     *
     * @param {GraphicsDevice} graphicsDevice - The graphics device used to manage this storage buffer.
     * @param {number} byteSize - The size of the storage buffer in bytes.
     * @param {number} [bufferUsage] - The usage type of the storage buffer. Can be a combination
     * of {@link BUFFERUSAGE_READ}, {@link BUFFERUSAGE_WRITE}, {@link BUFFERUSAGE_COPY_SRC} and
     * {@link BUFFERUSAGE_COPY_DST} flags. This parameter can be omitted if no special usage is
     * required.
     * @param {boolean} [addStorageUsage] - If true, automatically adds BUFFERUSAGE_STORAGE flag.
     * Set to false for staging buffers that use BUFFERUSAGE_WRITE. Defaults to true.
     */ constructor(graphicsDevice, byteSize, bufferUsage = 0, addStorageUsage = true){
        this.id = id$1++;
        this.device = graphicsDevice;
        this.byteSize = byteSize;
        this.bufferUsage = bufferUsage;
        const usage = addStorageUsage ? BUFFERUSAGE_STORAGE | bufferUsage : bufferUsage;
        this.impl = graphicsDevice.createBufferImpl(usage);
        this.impl.allocate(graphicsDevice, byteSize);
        this.device.buffers.add(this);
        this.adjustVramSizeTracking(graphicsDevice._vram, this.byteSize);
    }
}

/**
 * @import { GraphicsDevice } from '../graphics-device.js'
 */ /**
 * WebGPU implementation of DrawCommands.
 *
 * @ignore
 */ class WebgpuDrawCommands {
    /**
     * Allocate AoS buffer and backing storage buffer.
     * @param {number} maxCount - Number of sub-draws.
     */ allocate(maxCount) {
        // Skip reallocation if size matches exactly
        if (this.gpuIndirect && this.gpuIndirect.length === 5 * maxCount) {
            return;
        }
        this.storage?.destroy();
        this.gpuIndirect = new Uint32Array(5 * maxCount);
        this.gpuIndirectSigned = new Int32Array(this.gpuIndirect.buffer);
        this.storage = new StorageBuffer(this.device, this.gpuIndirect.byteLength, BUFFERUSAGE_INDIRECT | BUFFERUSAGE_COPY_DST);
    }
    /**
     * Write a single draw entry.
     * @param {number} i - Draw index.
     * @param {number} indexOrVertexCount - Count of indices/vertices.
     * @param {number} instanceCount - Instance count.
     * @param {number} firstIndexOrVertex - First index/vertex.
     * @param {number} baseVertex - Base vertex (signed).
     * @param {number} firstInstance - First instance.
     */ add(i, indexOrVertexCount, instanceCount, firstIndexOrVertex, baseVertex = 0, firstInstance = 0) {
        const o = i * 5;
        this.gpuIndirect[o + 0] = indexOrVertexCount;
        this.gpuIndirect[o + 1] = instanceCount;
        this.gpuIndirect[o + 2] = firstIndexOrVertex;
        this.gpuIndirectSigned[o + 3] = baseVertex;
        this.gpuIndirect[o + 4] = firstInstance;
    }
    /**
     * Upload AoS data to storage buffer.
     * @param {number} count - Number of active draws.
     * @returns {number} Total primitive count.
     */ update(count) {
        if (this.storage && count > 0) {
            const used = count * 5; // 5 uints per draw
            this.storage.write(0, this.gpuIndirect, 0, used);
        }
        // calculate total primitives for stats
        let totalPrimitives = 0;
        if (this.gpuIndirect && count > 0) {
            for(let d = 0; d < count; d++){
                const offset = d * 5;
                const indexOrVertexCount = this.gpuIndirect[offset + 0];
                const instanceCount = this.gpuIndirect[offset + 1];
                totalPrimitives += indexOrVertexCount * instanceCount;
            }
        }
        return totalPrimitives;
    }
    destroy() {
        this.storage?.destroy();
        this.storage = null;
    }
    /**
     * @param {GraphicsDevice} device - Graphics device.
     */ constructor(device){
        /** @type {Uint32Array|null} */ this.gpuIndirect = null;
        /** @type {Int32Array|null} */ this.gpuIndirectSigned = null;
        /**
     * @type {StorageBuffer|null}
     */ this.storage = null;
        this.device = device;
    }
}

/**
 * @import { UploadStream } from '../upload-stream.js'
 */ let id = 0;
/**
 * WebGPU implementation of UploadStream.
 * Can use either simple direct writes or optimized staging buffer strategy.
 *
 * @ignore
 */ class WebgpuUploadStream {
    /**
     * Handles device lost event.
     * TODO: Implement proper WebGPU device lost handling if needed.
     *
     * @protected
     */ _onDeviceLost() {
    // WebGPU device lost handling not yet implemented
    }
    destroy() {
        this._destroyed = true;
        this.availableStagingBuffers.forEach((buffer)=>buffer.destroy());
        this.pendingStagingBuffers.forEach((buffer)=>buffer.destroy());
    }
    /**
     * Update staging buffers: recycle completed ones and remove undersized buffers.
     *
     * @param {number} minByteSize - Minimum size for buffers to keep. Smaller buffers are destroyed.
     */ update(minByteSize) {
        // map all pending buffers
        const pending = this.pendingStagingBuffers;
        for(let i = 0; i < pending.length; i++){
            const buffer = pending[i];
            buffer.mapAsync(GPUMapMode.WRITE).then(()=>{
                if (!this._destroyed) {
                    this.availableStagingBuffers.push(buffer);
                } else {
                    buffer.destroy();
                }
            });
        }
        pending.length = 0;
        // remove any available buffers that are too small
        const available = this.availableStagingBuffers;
        for(let i = available.length - 1; i >= 0; i--){
            if (available[i].size < minByteSize) {
                available[i].destroy();
                available.splice(i, 1);
            }
        }
    }
    /**
     * Upload data to a storage buffer using staging buffers (optimized) or direct write (simple).
     *
     * @param {Uint8Array|Uint32Array|Float32Array} data - The data to upload.
     * @param {import('../storage-buffer.js').StorageBuffer} target - The target storage buffer.
     * @param {number} offset - The element offset in the target. Byte offset must be a multiple of 4.
     * @param {number} size - The number of elements to upload. Byte size must be a multiple of 4.
     */ upload(data, target, offset, size) {
        if (this.useSingleBuffer) {
            // simple path: direct write (blocking)
            this.uploadDirect(data, target, offset, size);
        } else {
            // optimized path: staging buffers (non-blocking)
            this.uploadStaging(data, target, offset, size);
        }
    }
    /**
     * Direct storage buffer write (simple, blocking).
     *
     * @param {Uint8Array|Uint32Array|Float32Array} data - The data to upload.
     * @param {import('../storage-buffer.js').StorageBuffer} target - The target storage buffer.
     * @param {number} offset - The element offset in the target.
     * @param {number} size - The number of elements to upload.
     * @private
     */ uploadDirect(data, target, offset, size) {
        const byteOffset = offset * data.BYTES_PER_ELEMENT;
        const byteSize = size * data.BYTES_PER_ELEMENT;
        // WebGPU requires 4-byte alignment for buffer operations
        Debug.assert(byteOffset % 4 === 0, `WebGPU upload offset in bytes (${byteOffset}) must be a multiple of 4`);
        Debug.assert(byteSize % 4 === 0, `WebGPU upload size in bytes (${byteSize}) must be a multiple of 4`);
        target.write(byteOffset, data, 0, size);
    }
    /**
     * Staging buffer-based upload.
     *
     * @param {Uint8Array|Uint32Array|Float32Array} data - The data to upload.
     * @param {import('../storage-buffer.js').StorageBuffer} target - The target storage buffer.
     * @param {number} offset - The element offset in the target.
     * @param {number} size - The number of elements to upload.
     * @private
     */ uploadStaging(data, target, offset, size) {
        const device = this.uploadStream.device;
        const byteOffset = offset * data.BYTES_PER_ELEMENT;
        const byteSize = size * data.BYTES_PER_ELEMENT;
        // Detect when a previous staging copy is still on an unsubmitted command buffer.
        // update() will call mapAsync on that buffer, putting it in "mapping pending" state,
        // which causes WebGPU validation errors ("buffer used in submit while mapped") when
        // the command buffer is eventually submitted.
        if (this.pendingStagingBuffers.length > 0) {
            // @ts-ignore - submitVersion is available on WebgpuGraphicsDevice
            Debug.assert(device.submitVersion !== this._lastUploadSubmitVersion, 'UploadStream: each instance can only upload once per submit. A previous staging ' + 'buffer copy has not been submitted yet. This causes WebGPU "buffer used in submit ' + 'while mapped" errors. Ensure the caller defers uploads to one per frame.');
        }
        // Update staging buffers
        this.update(byteSize);
        // WebGPU copyBufferToBuffer requires offset and size to be multiples of 4 bytes
        Debug.assert(byteOffset % 4 === 0, `WebGPU upload offset in bytes (${byteOffset}) must be a multiple of 4 for copyBufferToBuffer`);
        Debug.assert(byteSize % 4 === 0, `WebGPU upload size in bytes (${byteSize}) must be a multiple of 4 for copyBufferToBuffer`);
        // Get or create a staging buffer (guaranteed to be large enough after recycling)
        const buffer = this.availableStagingBuffers.pop() ?? (()=>{
            // @ts-ignore - wgpu is available on WebgpuGraphicsDevice
            const newBuffer = this.uploadStream.device.wgpu.createBuffer({
                size: byteSize,
                usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
                mappedAtCreation: true
            });
            DebugHelper.setLabel(newBuffer, `UploadStream-Staging-${id++}`);
            return newBuffer;
        })();
        // Write to mapped range (non-blocking)
        const mappedRange = buffer.getMappedRange();
        new Uint8Array(mappedRange).set(new Uint8Array(data.buffer, data.byteOffset, byteSize));
        buffer.unmap();
        // Copy from staging to storage buffer (GPU-side)
        // @ts-ignore - getCommandEncoder is available on WebgpuGraphicsDevice
        device.getCommandEncoder().copyBufferToBuffer(buffer, 0, target.impl.buffer, byteOffset, byteSize);
        // Track for recycling
        this.pendingStagingBuffers.push(buffer);
        // @ts-ignore - submitVersion is available on WebgpuGraphicsDevice
        this._lastUploadSubmitVersion = device.submitVersion;
    }
    /**
     * @param {UploadStream} uploadStream - The upload stream.
     */ constructor(uploadStream){
        /**
     * Available staging buffers ready for immediate use.
     *
     * @type {GPUBuffer[]}
     * @private
     */ this.availableStagingBuffers = [];
        /**
     * Staging buffers currently in use by the GPU.
     *
     * @type {GPUBuffer[]}
     * @private
     */ this.pendingStagingBuffers = [];
        this._destroyed = false;
        /**
     * The device's _submitVersion at the time the last staging copy was recorded.
     * Used to detect whether the copy has been submitted before the next upload.
     *
     * @type {number}
     * @private
     */ this._lastUploadSubmitVersion = -1;
        this.uploadStream = uploadStream;
        this.useSingleBuffer = uploadStream.useSingleBuffer;
    }
}

/**
 * @import { RenderPass } from '../render-pass.js'
 */ const _uniqueLocations = new Map();
// size of indirect draw entry in bytes, 5 x 32bit
const _indirectEntryByteSize = 5 * 4;
// size of indirect dispatch entry in bytes, 3 x 32bit (x, y, z workgroup counts)
const _indirectDispatchEntryByteSize = 3 * 4;
class WebgpuGraphicsDevice extends GraphicsDevice {
    /**
     * Destroy the graphics device.
     */ destroy() {
        this.clearRenderer.destroy();
        this.clearRenderer = null;
        this.mipmapRenderer.destroy();
        this.mipmapRenderer = null;
        this.resolver.destroy();
        this.resolver = null;
        super.destroy();
    }
    initDeviceCaps() {
        const limits = this.wgpu?.limits;
        this.limits = limits;
        this.precision = 'highp';
        this.maxPrecision = 'highp';
        this.maxSamples = 4;
        this.maxTextures = 16;
        this.maxTextureSize = limits.maxTextureDimension2D;
        this.maxCubeMapSize = limits.maxTextureDimension2D;
        this.maxVolumeSize = limits.maxTextureDimension3D;
        this.maxColorAttachments = limits.maxColorAttachments;
        this.maxPixelRatio = 1;
        this.maxAnisotropy = 16;
        this.fragmentUniformsCount = limits.maxUniformBufferBindingSize / 16;
        this.vertexUniformsCount = limits.maxUniformBufferBindingSize / 16;
        this.supportsUniformBuffers = true;
        this.supportsAreaLights = true;
        this.supportsGpuParticles = true;
        this.supportsCompute = true;
        this.textureFloatRenderable = true;
        this.textureHalfFloatRenderable = true;
        this.supportsImageBitmap = true;
        // WebGPU currently only supports 1 and 4 samples
        this.samples = this.backBufferAntialias ? 4 : 1;
        // WGSL features
        const wgslFeatures = window.navigator.gpu.wgslLanguageFeatures;
        this.supportsStorageTextureRead = wgslFeatures?.has('readonly_and_readwrite_storage_textures');
        this.supportsSubgroupUniformity = wgslFeatures?.has('subgroup_uniformity');
        this.supportsSubgroupId = wgslFeatures?.has('subgroup_id');
        this.initCapsDefines();
    }
    async initWebGpu(glslangUrl, twgslUrl) {
        if (!window.navigator.gpu) {
            throw new Error('Unable to retrieve GPU. Ensure you are using a browser that supports WebGPU rendering.');
        }
        // temporary message to confirm Webgpu is being used
        Debug.log('WebgpuGraphicsDevice initialization ..');
        // Import shader transpilers only if both URLs are provided
        if (glslangUrl && twgslUrl) {
            // build a full URL from a relative or absolute path
            const buildUrl = (srcPath)=>{
                return new URL(srcPath, window.location.href).toString();
            };
            const results = await Promise.all([
                import(/* @vite-ignore */ /* webpackIgnore: true */ `${buildUrl(twgslUrl)}`).then((module)=>twgsl(twgslUrl.replace('.js', '.wasm'))),
                import(/* @vite-ignore */ /* webpackIgnore: true */ `${buildUrl(glslangUrl)}`).then((module)=>module.default())
            ]);
            this.twgsl = results[0];
            this.glslang = results[1];
        }
        // create the device
        return this.createDevice();
    }
    async createDevice() {
        /** @type {GPURequestAdapterOptions} */ const adapterOptions = {
            powerPreference: this.initOptions.powerPreference !== 'default' ? this.initOptions.powerPreference : undefined,
            xrCompatible: this.initOptions.xrCompatible
        };
        /**
         * @type {GPUAdapter}
         * @private
         */ this.gpuAdapter = await window.navigator.gpu.requestAdapter(adapterOptions);
        // request optional features
        const requiredFeatures = [];
        const requireFeature = (feature)=>{
            const supported = this.gpuAdapter.features.has(feature);
            if (supported) {
                requiredFeatures.push(feature);
            }
            return supported;
        };
        this.textureFloatFilterable = requireFeature('float32-filterable');
        this.textureFloatBlendable = requireFeature('float32-blendable');
        this.extCompressedTextureS3TC = requireFeature('texture-compression-bc');
        this.extCompressedTextureS3TCSliced3D = requireFeature('texture-compression-bc-sliced-3d');
        this.extCompressedTextureETC = requireFeature('texture-compression-etc2');
        this.extCompressedTextureASTC = requireFeature('texture-compression-astc');
        this.extCompressedTextureASTCSliced3D = requireFeature('texture-compression-astc-sliced-3d');
        this.supportsTimestampQuery = requireFeature('timestamp-query');
        this.supportsDepthClip = requireFeature('depth-clip-control');
        this.supportsDepth32Stencil = requireFeature('depth32float-stencil8');
        this.supportsIndirectFirstInstance = requireFeature('indirect-first-instance');
        this.supportsShaderF16 = requireFeature('shader-f16');
        this.supportsStorageRGBA8 = requireFeature('bgra8unorm-storage');
        this.textureRG11B10Renderable = requireFeature('rg11b10ufloat-renderable');
        this.supportsClipDistances = requireFeature('clip-distances');
        this.supportsTextureFormatTier1 = requireFeature('texture-format-tier1');
        this.supportsTextureFormatTier2 = requireFeature('texture-format-tier2');
        this.supportsTextureFormatTier1 || (this.supportsTextureFormatTier1 = this.supportsTextureFormatTier2);
        this.supportsPrimitiveIndex = requireFeature('primitive-index');
        Debug.log(`WEBGPU features: ${requiredFeatures.join(', ')}`);
        // copy all adapter limits to the requiredLimits object - to created a device with the best feature sets available
        const adapterLimits = this.gpuAdapter?.limits;
        const requiredLimits = {};
        if (adapterLimits) {
            for(const limitName in adapterLimits){
                // skip these as they fail on Windows Chrome and are not part of spec currently
                if (limitName === 'minSubgroupSize' || limitName === 'maxSubgroupSize') {
                    continue;
                }
                requiredLimits[limitName] = adapterLimits[limitName];
            }
        }
        /** @type {GPUDeviceDescriptor} */ const deviceDescr = {
            requiredFeatures,
            requiredLimits,
            defaultQueue: {
                label: 'Default Queue'
            }
        };
        DebugHelper.setLabel(deviceDescr, 'PlayCanvasWebGPUDevice');
        /**
         * @type {GPUDevice}
         * @private
         */ this.wgpu = await this.gpuAdapter.requestDevice(deviceDescr);
        // handle lost device
        this.wgpu.lost?.then(this.handleDeviceLost.bind(this));
        this.initDeviceCaps();
        this.gpuContext = this.canvas.getContext('webgpu');
        // tonemapping, used when the backbuffer is HDR
        let canvasToneMapping = 'standard';
        // pixel format of the framebuffer that is the most efficient one on the system
        let preferredCanvasFormat = window.navigator.gpu.getPreferredCanvasFormat();
        // display format the user asked for
        const displayFormat = this.initOptions.displayFormat;
        // combine requested display format with the preferred format
        this.backBufferFormat = preferredCanvasFormat === 'rgba8unorm' ? displayFormat === DISPLAYFORMAT_LDR_SRGB ? PIXELFORMAT_SRGBA8 : PIXELFORMAT_RGBA8 : displayFormat === DISPLAYFORMAT_LDR_SRGB ? PIXELFORMAT_SBGRA8 : PIXELFORMAT_BGRA8; // (S)BGRA
        // view format for the backbuffer. Backbuffer is always allocated without srgb conversion, and
        // the view we create specifies srgb is needed to handle the conversion.
        this.backBufferViewFormat = displayFormat === DISPLAYFORMAT_LDR_SRGB ? `${preferredCanvasFormat}-srgb` : preferredCanvasFormat;
        // optional HDR display format
        if (displayFormat === DISPLAYFORMAT_HDR && this.textureFloatFilterable) {
            // if supported by the system
            const hdrMediaQuery = window.matchMedia('(dynamic-range: high)');
            if (hdrMediaQuery?.matches) {
                // configure the backbuffer to be 16 bit float
                this.backBufferFormat = PIXELFORMAT_RGBA16F;
                this.backBufferViewFormat = 'rgba16float';
                preferredCanvasFormat = 'rgba16float';
                this.isHdr = true;
                // use extended tonemapping for HDR to avoid clipping
                canvasToneMapping = 'extended';
            }
        }
        /**
         * Configuration of the main colorframebuffer we obtain using getCurrentTexture
         *
         * @type {GPUCanvasConfiguration}
         * @private
         */ this.canvasConfig = {
            device: this.wgpu,
            colorSpace: 'srgb',
            alphaMode: this.initOptions.alpha ? 'premultiplied' : 'opaque',
            // use preferred format for optimal performance on mobile
            format: preferredCanvasFormat,
            toneMapping: {
                mode: canvasToneMapping
            },
            // RENDER_ATTACHMENT is required, COPY_SRC allows scene grab to copy out from it
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
            // formats that views created from textures returned by getCurrentTexture may use
            // (this allows us to view the preferred format as srgb)
            viewFormats: displayFormat === DISPLAYFORMAT_LDR_SRGB ? [
                this.backBufferViewFormat
            ] : []
        };
        this.gpuContext?.configure(this.canvasConfig);
        this.createBackbuffer();
        this.clearRenderer = new WebgpuClearRenderer(this);
        this.mipmapRenderer = new WebgpuMipmapRenderer(this);
        this.resolver = new WebgpuResolver(this);
        this.postInit();
        return this;
    }
    async handleDeviceLost(info) {
        // reason is 'destroyed' if we intentionally destroy the device
        if (info.reason !== 'destroyed') {
            Debug.warn(`WebGPU device was lost: ${info.message}, this needs to be handled`);
            super.loseContext(); // 'super' works correctly here
            await this.createDevice(); // Ensure this method is defined in your class
            super.restoreContext(); // 'super' works correctly here
        }
    }
    postInit() {
        super.postInit();
        this.initializeRenderState();
        this.setupPassEncoderDefaults();
        this.gpuProfiler = new WebgpuGpuProfiler(this);
        // init dynamic buffer using 100kB allocation
        this.dynamicBuffers = new WebgpuDynamicBuffers(this, 100 * 1024, this.limits.minUniformBufferOffsetAlignment);
        // empty bind group
        this.emptyBindGroup = new BindGroup(this, new BindGroupFormat(this, []));
        this.emptyBindGroup.update();
    }
    createBackbuffer() {
        this.supportsStencil = this.initOptions.stencil;
        this.backBuffer = new RenderTarget({
            name: 'WebgpuFramebuffer',
            graphicsDevice: this,
            depth: this.initOptions.depth,
            stencil: this.supportsStencil,
            samples: this.samples
        });
        this.backBuffer.impl.isBackbuffer = true;
    }
    frameStart() {
        super.frameStart();
        this.gpuProfiler.frameStart();
        // submit any commands collected before the frame rendering
        this.submit();
        WebgpuDebug.memory(this);
        WebgpuDebug.validate(this);
        // current frame color output buffer (fallback to external backbuffer if not available)
        const outColorBuffer = this.gpuContext?.getCurrentTexture?.() ?? this.externalBackbuffer?.impl.gpuTexture;
        DebugHelper.setLabel(outColorBuffer, `${this.backBuffer.name}`);
        // reallocate framebuffer if dimensions change, to match the output texture
        if (this.backBufferSize.x !== outColorBuffer.width || this.backBufferSize.y !== outColorBuffer.height) {
            this.backBufferSize.set(outColorBuffer.width, outColorBuffer.height);
            this.backBuffer.destroy();
            this.backBuffer = null;
            this.createBackbuffer();
        }
        const rt = this.backBuffer;
        const wrt = rt.impl;
        // assign the format, allowing following init call to use it to allocate matching multisampled buffer
        wrt.setColorAttachment(0, undefined, this.backBufferViewFormat);
        this.initRenderTarget(rt);
        // assign current frame's render texture
        wrt.assignColorTexture(this, outColorBuffer);
        WebgpuDebug.end(this, 'frameStart');
        WebgpuDebug.end(this, 'frameStart');
    }
    frameEnd() {
        super.frameEnd();
        this.gpuProfiler.frameEnd();
        // submit scheduled command buffers
        this.submit();
        if (!this.contextLost) {
            this.gpuProfiler.request();
        }
        this._indirectDrawNextIndex = 0;
        this._indirectDispatchNextIndex = 0;
    }
    createBufferImpl(usageFlags) {
        return new WebgpuBuffer(usageFlags);
    }
    createUniformBufferImpl(uniformBuffer) {
        return new WebgpuUniformBuffer(uniformBuffer);
    }
    createVertexBufferImpl(vertexBuffer, format, options) {
        return new WebgpuVertexBuffer(vertexBuffer, format, options);
    }
    createIndexBufferImpl(indexBuffer, options) {
        return new WebgpuIndexBuffer(indexBuffer, options);
    }
    createShaderImpl(shader) {
        return new WebgpuShader(shader);
    }
    createDrawCommandImpl(drawCommands) {
        return new WebgpuDrawCommands(this);
    }
    createTextureImpl(texture) {
        this.textures.add(texture);
        return new WebgpuTexture(texture);
    }
    createRenderTargetImpl(renderTarget) {
        return new WebgpuRenderTarget(renderTarget);
    }
    createUploadStreamImpl(uploadStream) {
        return new WebgpuUploadStream(uploadStream);
    }
    createBindGroupFormatImpl(bindGroupFormat) {
        return new WebgpuBindGroupFormat(bindGroupFormat);
    }
    createBindGroupImpl(bindGroup) {
        return new WebgpuBindGroup();
    }
    createComputeImpl(compute) {
        return new WebgpuCompute(compute);
    }
    get indirectDrawBuffer() {
        this.allocateIndirectDrawBuffer();
        return this._indirectDrawBuffer;
    }
    allocateIndirectDrawBuffer() {
        // handle reallocation
        if (this._indirectDrawNextIndex === 0 && this._indirectDrawBufferCount < this.maxIndirectDrawCount) {
            this._indirectDrawBuffer?.destroy();
            this._indirectDrawBuffer = null;
        }
        // allocate buffer
        if (this._indirectDrawBuffer === null) {
            this._indirectDrawBuffer = new StorageBuffer(this, this.maxIndirectDrawCount * _indirectEntryByteSize, BUFFERUSAGE_INDIRECT | BUFFERUSAGE_COPY_DST);
            this._indirectDrawBufferCount = this.maxIndirectDrawCount;
        }
    }
    getIndirectDrawSlot(count = 1) {
        // make sure the buffer is allocated
        this.allocateIndirectDrawBuffer();
        // allocate consecutive slots
        const slot = this._indirectDrawNextIndex;
        const nextIndex = this._indirectDrawNextIndex + count;
        Debug.assert(nextIndex <= this.maxIndirectDrawCount, `Insufficient indirect draw slots per frame (requested ${count}, currently ${nextIndex}), please adjust GraphicsDevice#maxIndirectDrawCount`);
        this._indirectDrawNextIndex = nextIndex;
        return slot;
    }
    get indirectDispatchBuffer() {
        this.allocateIndirectDispatchBuffer();
        return this._indirectDispatchBuffer;
    }
    allocateIndirectDispatchBuffer() {
        // handle reallocation
        if (this._indirectDispatchNextIndex === 0 && this._indirectDispatchBufferCount < this.maxIndirectDispatchCount) {
            this._indirectDispatchBuffer?.destroy();
            this._indirectDispatchBuffer = null;
        }
        // allocate buffer
        if (this._indirectDispatchBuffer === null) {
            this._indirectDispatchBuffer = new StorageBuffer(this, this.maxIndirectDispatchCount * _indirectDispatchEntryByteSize, BUFFERUSAGE_INDIRECT | BUFFERUSAGE_COPY_DST);
            this._indirectDispatchBufferCount = this.maxIndirectDispatchCount;
        }
    }
    getIndirectDispatchSlot(count = 1) {
        // make sure the buffer is allocated
        this.allocateIndirectDispatchBuffer();
        // allocate consecutive slots
        const slot = this._indirectDispatchNextIndex;
        const nextIndex = this._indirectDispatchNextIndex + count;
        Debug.assert(nextIndex <= this.maxIndirectDispatchCount, `Insufficient indirect dispatch slots per frame (requested ${count}, currently ${nextIndex}), please adjust GraphicsDevice#maxIndirectDispatchCount`);
        this._indirectDispatchNextIndex = nextIndex;
        return slot;
    }
    /**
     * @param {number} index - Index of the bind group slot
     * @param {BindGroup} bindGroup - Bind group to attach
     * @param {number[]} [offsets] - Byte offsets for all uniform buffers in the bind group.
     */ setBindGroup(index, bindGroup, offsets) {
        // TODO: this condition should be removed, it's here to handle fake grab pass, which should be refactored instead
        if (this.passEncoder) {
            // set it on the device
            this.passEncoder.setBindGroup(index, bindGroup.impl.bindGroup, offsets ?? bindGroup.uniformBufferOffsets);
            // store the active formats, used by the pipeline creation
            this.bindGroupFormats[index] = bindGroup.format.impl;
        }
    }
    submitVertexBuffer(vertexBuffer, slot) {
        const format = vertexBuffer.format;
        const { interleaved, elements } = format;
        const elementCount = elements.length;
        const vbBuffer = vertexBuffer.impl.buffer;
        if (interleaved) {
            // for interleaved buffers, we use a single vertex buffer, and attributes are specified using the layout
            this.passEncoder.setVertexBuffer(slot, vbBuffer);
            return 1;
        }
        // non-interleaved - vertex buffer per attribute
        for(let i = 0; i < elementCount; i++){
            this.passEncoder.setVertexBuffer(slot + i, vbBuffer, elements[i].offset);
        }
        return elementCount;
    }
    validateVBLocations(vb0, vb1) {
        // in case of multiple VBs, validate all elements use unique locations
        const validateVB = (vb)=>{
            const { elements } = vb.format;
            for(let i = 0; i < elements.length; i++){
                const name = elements[i].name;
                const location = semanticToLocation[name];
                if (_uniqueLocations.has(location)) {
                    Debug.errorOnce(`Vertex buffer element location ${location} used by [${name}] is already used by element [${_uniqueLocations.get(location)}], while rendering [${DebugGraphics.toString()}]`);
                }
                _uniqueLocations.set(location, name);
            }
        };
        validateVB(vb0);
        validateVB(vb1);
        _uniqueLocations.clear();
    }
    draw(primitive, indexBuffer, numInstances = 1, drawCommands, first = true, last = true) {
        if (this.shader.ready && !this.shader.failed) {
            WebgpuDebug.validate(this);
            const passEncoder = this.passEncoder;
            Debug.assert(passEncoder);
            let pipeline = this.pipeline;
            // vertex buffers
            const vb0 = this.vertexBuffers[0];
            const vb1 = this.vertexBuffers[1];
            if (first) {
                if (vb0) {
                    const vbSlot = this.submitVertexBuffer(vb0, 0);
                    if (vb1) {
                        Debug.call(()=>this.validateVBLocations(vb0, vb1));
                        this.submitVertexBuffer(vb1, vbSlot);
                    }
                }
                Debug.call(()=>this.validateAttributes(this.shader, vb0?.format, vb1?.format));
                // render pipeline
                pipeline = this.renderPipeline.get(primitive, vb0?.format, vb1?.format, indexBuffer?.format, this.shader, this.renderTarget, this.bindGroupFormats, this.blendState, this.depthState, this.cullMode, this.stencilEnabled, this.stencilFront, this.stencilBack, this.frontFace);
                Debug.assert(pipeline);
                if (this.pipeline !== pipeline) {
                    this.pipeline = pipeline;
                    passEncoder.setPipeline(pipeline);
                }
            }
            if (indexBuffer) {
                passEncoder.setIndexBuffer(indexBuffer.impl.buffer, indexBuffer.impl.format);
            }
            // draw
            if (drawCommands) {
                const storage = drawCommands.impl?.storage ?? this.indirectDrawBuffer;
                const indirectBuffer = storage.impl.buffer;
                const drawsCount = drawCommands.count;
                // TODO: when multiDrawIndirect is supported, we can use it here instead of a loop
                for(let d = 0; d < drawsCount; d++){
                    const indirectOffset = (drawCommands.slotIndex + d) * _indirectEntryByteSize;
                    if (indexBuffer) {
                        passEncoder.drawIndexedIndirect(indirectBuffer, indirectOffset);
                    } else {
                        passEncoder.drawIndirect(indirectBuffer, indirectOffset);
                    }
                }
            } else {
                if (indexBuffer) {
                    passEncoder.drawIndexed(primitive.count, numInstances, primitive.base, primitive.baseVertex ?? 0, 0);
                } else {
                    passEncoder.draw(primitive.count, numInstances, primitive.base, 0);
                }
            }
            // track draw calls - always count as 1 (one material setup, one API call)
            this._drawCallsPerFrame++;
            // track primitive count
            if (drawCommands) {
                // use pre-calculated primitive count from drawCommands
                this._primsPerFrame[primitive.type] += drawCommands.primitiveCount;
            } else {
                // single draw
                const primCount = primitive.count * (numInstances > 1 ? numInstances : 1);
                this._primsPerFrame[primitive.type] += primCount;
            }
            WebgpuDebug.end(this, 'Drawing', {
                vb0,
                vb1,
                indexBuffer,
                primitive,
                numInstances,
                pipeline
            });
        }
        if (last) {
            // empty array of vertex buffers
            this.clearVertexBuffer();
            this.pipeline = null;
        }
    }
    setShader(shader, asyncCompile = false) {
        if (shader !== this.shader) {
            this.shader = shader;
            // TODO: we should probably track other stats instead, like pipeline switches
            this._shaderSwitchesPerFrame++;
        }
    }
    setBlendState(blendState) {
        this.blendState.copy(blendState);
    }
    setDepthState(depthState) {
        this.depthState.copy(depthState);
    }
    setStencilState(stencilFront, stencilBack) {
        if (stencilFront || stencilBack) {
            this.stencilEnabled = true;
            this.stencilFront.copy(stencilFront ?? StencilParameters.DEFAULT);
            this.stencilBack.copy(stencilBack ?? StencilParameters.DEFAULT);
            // ref value - based on stencil front
            const ref = this.stencilFront.ref;
            if (this.stencilRef !== ref) {
                this.stencilRef = ref;
                this.passEncoder.setStencilReference(ref);
            }
        } else {
            this.stencilEnabled = false;
        }
    }
    setBlendColor(r, g, b, a) {
        const c = this.blendColor;
        if (r !== c.r || g !== c.g || b !== c.b || a !== c.a) {
            c.set(r, g, b, a);
            this.passEncoder.setBlendConstant(c);
        }
    }
    setCullMode(cullMode) {
        this.cullMode = cullMode;
    }
    setFrontFace(frontFace) {
        this.frontFace = frontFace;
    }
    setAlphaToCoverage(state) {}
    initializeContextCaches() {
        super.initializeContextCaches();
    }
    /**
     * Set up default values for the render pass encoder.
     */ setupPassEncoderDefaults() {
        this.pipeline = null;
        this.stencilRef = 0;
        this.blendColor.set(0, 0, 0, 0);
    }
    _uploadDirtyTextures() {
        this.texturesToUpload.forEach((texture)=>{
            if (texture._needsUpload || texture._needsMipmapsUpload) {
                texture.upload();
            }
        });
        this.texturesToUpload.clear();
    }
    setupTimeStampWrites(passDesc, name) {
        if (this.gpuProfiler._enabled) {
            if (this.gpuProfiler.timestampQueriesSet) {
                const slot = this.gpuProfiler.getSlot(name);
                if (slot === -1) {
                    Debug.warnOnce('Too many GPU profiler slots allocated during the frame, ignoring timestamp writes');
                } else {
                    passDesc = passDesc ?? {};
                    passDesc.timestampWrites = {
                        querySet: this.gpuProfiler.timestampQueriesSet.querySet,
                        beginningOfPassWriteIndex: slot * 2,
                        endOfPassWriteIndex: slot * 2 + 1
                    };
                }
            }
        }
        return passDesc;
    }
    /**
     * Start a render pass.
     *
     * @param {RenderPass} renderPass - The render pass to start.
     * @ignore
     */ startRenderPass(renderPass) {
        // upload textures that need it, to avoid them being uploaded / their mips generated during the pass
        // TODO: this needs a better solution
        this._uploadDirtyTextures();
        WebgpuDebug.internal(this);
        WebgpuDebug.validate(this);
        const rt = renderPass.renderTarget || this.backBuffer;
        this.renderTarget = rt;
        Debug.assert(rt);
        /** @type {WebgpuRenderTarget} */ const wrt = rt.impl;
        // framebuffer is initialized at the start of the frame
        if (rt !== this.backBuffer) {
            this.initRenderTarget(rt);
        }
        // set up clear / store / load settings
        wrt.setupForRenderPass(renderPass, rt);
        const renderPassDesc = wrt.renderPassDescriptor;
        // timestamp
        this.setupTimeStampWrites(renderPassDesc, renderPass.name);
        // start the pass
        const commandEncoder = this.getCommandEncoder();
        this.passEncoder = commandEncoder.beginRenderPass(renderPassDesc);
        this.passEncoder.label = `${renderPass.name}-PassEncoder RT:${rt.name}`;
        // push marker to the passEncoder
        DebugGraphics.pushGpuMarker(this, `Pass:${renderPass.name} RT:${rt.name}`);
        this.setupPassEncoderDefaults();
        // the pass always clears full target
        // TODO: avoid this setting the actual viewport/scissor on webgpu as those are automatically reset to full
        // render target. We just need to update internal state, for the get functionality to return it.
        const { width, height } = rt;
        this.setViewport(0, 0, width, height);
        this.setScissor(0, 0, width, height);
        Debug.assert(!this.insideRenderPass, 'RenderPass cannot be started while inside another render pass.');
        this.insideRenderPass = true;
    }
    /**
     * End a render pass.
     *
     * @param {RenderPass} renderPass - The render pass to end.
     * @ignore
     */ endRenderPass(renderPass) {
        // pop the marker from the passEncoder
        DebugGraphics.popGpuMarker(this);
        // end the render pass
        this.passEncoder.end();
        this.passEncoder = null;
        this.insideRenderPass = false;
        // each render pass can use different number of bind groups
        this.bindGroupFormats.length = 0;
        // resolve depth if needed after the pass has finished
        const target = this.renderTarget;
        if (target) {
            // resolve depth buffer (stencil resolve is not yet implemented)
            if (target.depthBuffer && renderPass.depthStencilOps.resolveDepth) {
                if (renderPass.samples > 1 && target.autoResolve) {
                    const depthAttachment = target.impl.depthAttachment;
                    const destTexture = target.depthBuffer.impl.gpuTexture;
                    if (depthAttachment && destTexture) {
                        this.resolver.resolveDepth(this.commandEncoder, depthAttachment.multisampledDepthBuffer, destTexture);
                    }
                }
            }
        }
        // generate mipmaps using the same command buffer encoder
        for(let i = 0; i < renderPass.colorArrayOps.length; i++){
            const colorOps = renderPass.colorArrayOps[i];
            if (colorOps.genMipmaps) {
                this.mipmapRenderer.generate(renderPass.renderTarget._colorBuffers[i].impl);
            }
        }
        WebgpuDebug.end(this, 'RenderPass', {
            renderPass
        });
        WebgpuDebug.end(this, 'RenderPass', {
            renderPass
        });
    }
    startComputePass(name) {
        // upload textures that need it, to avoid them being uploaded during the pass
        this._uploadDirtyTextures();
        WebgpuDebug.internal(this);
        WebgpuDebug.validate(this);
        // clear cached encoder state
        this.pipeline = null;
        // timestamp
        const computePassDesc = this.setupTimeStampWrites(undefined, name);
        // start the pass
        DebugHelper.setLabel(computePassDesc, `ComputePass-${name}`);
        const commandEncoder = this.getCommandEncoder();
        this.passEncoder = commandEncoder.beginComputePass(computePassDesc);
        DebugHelper.setLabel(this.passEncoder, `ComputePass-${name}`);
        Debug.assert(!this.insideRenderPass, 'ComputePass cannot be started while inside another pass.');
        this.insideRenderPass = true;
    }
    endComputePass() {
        // end the compute pass
        this.passEncoder.end();
        this.passEncoder = null;
        this.insideRenderPass = false;
        // each render pass can use different number of bind groups
        this.bindGroupFormats.length = 0;
        WebgpuDebug.end(this, 'ComputePass');
        WebgpuDebug.end(this, 'ComputePass');
    }
    computeDispatch(computes, name = 'Unnamed') {
        this.startComputePass(name);
        // update uniform buffers and bind groups
        for(let i = 0; i < computes.length; i++){
            const compute = computes[i];
            compute.applyParameters();
            compute.impl.updateBindGroup();
        }
        // dispatch
        for(let i = 0; i < computes.length; i++){
            const compute = computes[i];
            compute.impl.dispatch(compute.countX, compute.countY, compute.countZ);
        }
        this.endComputePass();
    }
    getCommandEncoder() {
        // use existing or create new encoder
        let commandEncoder = this.commandEncoder;
        if (!commandEncoder) {
            commandEncoder = this.wgpu.createCommandEncoder();
            DebugHelper.setLabel(commandEncoder, 'CommandEncoder-Shared');
            this.commandEncoder = commandEncoder;
        }
        return commandEncoder;
    }
    endCommandEncoder() {
        Debug.assert(!this.insideRenderPass, 'Attempted to finish GPUCommandEncoder while inside a pass. This will invalidate the current pass encoder and cause "Parent encoder is already finished" validation errors.');
        const { commandEncoder } = this;
        if (commandEncoder) {
            const cb = commandEncoder.finish();
            DebugHelper.setLabel(cb, 'CommandBuffer-Shared');
            this.addCommandBuffer(cb);
            this.commandEncoder = null;
        }
    }
    addCommandBuffer(commandBuffer, front = false) {
        if (front) {
            this.commandBuffers.unshift(commandBuffer);
        } else {
            this.commandBuffers.push(commandBuffer);
        }
    }
    submit() {
        Debug.assert(!this.insideRenderPass, 'Attempted to submit command buffers while inside a pass. This finishes the parent command encoder and invalidates the active pass ("Parent encoder is already finished") .');
        // end the current encoder
        this.endCommandEncoder();
        if (this.commandBuffers.length > 0) {
            // copy dynamic buffers data to the GPU (this schedules the copy CB to run before all other CBs)
            this.dynamicBuffers.submit();
            // trace all scheduled command buffers
            Debug.call(()=>{
                if (this.commandBuffers.length > 0) {
                    Debug.trace(TRACEID_RENDER_QUEUE, `SUBMIT (${this.commandBuffers.length})`);
                    for(let i = 0; i < this.commandBuffers.length; i++){
                        Debug.trace(TRACEID_RENDER_QUEUE, `  CB: ${this.commandBuffers[i].label}`);
                    }
                }
            });
            this.wgpu.queue.submit(this.commandBuffers);
            this.commandBuffers.length = 0;
            this.submitVersion++;
            // notify dynamic buffers
            this.dynamicBuffers.onCommandBuffersSubmitted();
        }
        // destroy deferred resources after submit to ensure they're no longer referenced
        const deferredDestroys = this._deferredDestroys;
        if (deferredDestroys.length > 0) {
            for(let i = 0; i < deferredDestroys.length; i++){
                deferredDestroys[i].destroy();
            }
            deferredDestroys.length = 0;
        }
    }
    /**
     * Defer destruction of a GPU resource until after the current command buffers are submitted.
     * This ensures the resource is not destroyed while still referenced by pending GPU commands.
     *
     * @param {GPUTexture|GPUBuffer|GPUQuerySet} gpuResource - The GPU resource to destroy.
     * @private
     */ deferDestroy(gpuResource) {
        if (gpuResource) {
            this._deferredDestroys.push(gpuResource);
        }
    }
    clear(options) {
        if (options.flags) {
            this.clearRenderer.clear(this, this.renderTarget, options, this.defaultClearOptions);
        }
    }
    setViewport(x, y, w, h) {
        // TODO: only execute when it changes. Also, the viewport of encoder  matches the rendering attachments,
        // so we can skip this if fullscreen
        // TODO: this condition should be removed, it's here to handle fake grab pass, which should be refactored instead
        if (this.passEncoder) {
            if (!this.renderTarget.flipY) {
                y = this.renderTarget.height - y - h;
            }
            this.vx = x;
            this.vy = y;
            this.vw = w;
            this.vh = h;
            this.passEncoder.setViewport(x, y, w, h, 0, 1);
        }
    }
    setScissor(x, y, w, h) {
        // TODO: only execute when it changes. Also, the viewport of encoder  matches the rendering attachments,
        // so we can skip this if fullscreen
        // TODO: this condition should be removed, it's here to handle fake grab pass, which should be refactored instead
        if (this.passEncoder) {
            if (!this.renderTarget.flipY) {
                y = this.renderTarget.height - y - h;
            }
            this.sx = x;
            this.sy = y;
            this.sw = w;
            this.sh = h;
            this.passEncoder.setScissorRect(x, y, w, h);
        }
    }
    /**
     * Clear the content of a storage buffer to 0.
     *
     * @param {WebgpuBuffer} storageBuffer - The storage buffer.
     * @param {number} [offset] - The offset of data to clear. Defaults to 0.
     * @param {number} [size] - The size of data to clear. Defaults to the full size of the buffer.
     * @ignore
     */ clearStorageBuffer(storageBuffer, offset = 0, size = storageBuffer.byteSize) {
        const commandEncoder = this.getCommandEncoder();
        commandEncoder.clearBuffer(storageBuffer.buffer, offset, size);
    }
    /**
     * Read a content of a storage buffer.
     *
     * @param {WebgpuBuffer} storageBuffer - The storage buffer.
     * @param {number} [offset] - The byte offset of data to read. Defaults to 0.
     * @param {number} [size] - The byte size of data to read. Defaults to the full size of the
     * buffer minus the offset.
     * @param {ArrayBufferView} [data] - Typed array to populate with the data read from the storage
     * buffer. When typed array is supplied, enough space needs to be reserved, otherwise only
     * partial data is copied. If not specified, the data is returned in an Uint8Array. Defaults to
     * null.
     * @param {boolean} [immediate] - If true, the read operation will be executed as soon as
     * possible. This has a performance impact, so it should be used only when necessary. Defaults
     * to false.
     * @returns {Promise<ArrayBufferView>} A promise that resolves with the data read from the storage
     * buffer.
     * @ignore
     */ readStorageBuffer(storageBuffer, offset = 0, size = storageBuffer.byteSize - offset, data = null, immediate = false) {
        // create a temporary staging buffer
        const stagingBuffer = this.createBufferImpl(BUFFERUSAGE_READ | BUFFERUSAGE_COPY_DST);
        stagingBuffer.allocate(this, size);
        const destBuffer = stagingBuffer.buffer;
        // copy the GPU buffer to the staging buffer
        const commandEncoder = this.getCommandEncoder();
        commandEncoder.copyBufferToBuffer(storageBuffer.buffer, offset, destBuffer, 0, size);
        return this.readBuffer(stagingBuffer, size, data, immediate);
    }
    readBuffer(stagingBuffer, size, data = null, immediate = false) {
        const destBuffer = stagingBuffer.buffer;
        // return a promise that resolves with the data
        return new Promise((resolve, reject)=>{
            const read = ()=>{
                destBuffer?.mapAsync(GPUMapMode.READ).then(()=>{
                    // copy data to a buffer
                    data ?? (data = new Uint8Array(size));
                    const copySrc = destBuffer.getMappedRange(0, size);
                    // use the same type as the target
                    const srcType = data.constructor;
                    data.set(new srcType(copySrc));
                    // release staging buffer
                    destBuffer.unmap();
                    stagingBuffer.destroy(this);
                    resolve(data);
                });
            };
            if (immediate) {
                // submit the command buffer immediately
                this.submit();
                read();
            } else {
                // map the buffer during the next event handling cycle, when the command buffer is submitted
                setTimeout(()=>{
                    read();
                });
            }
        });
    }
    /**
     * Issues a write operation of the provided data into a storage buffer.
     *
     * @param {WebgpuBuffer} storageBuffer - The storage buffer.
     * @param {number} bufferOffset - The offset in bytes to start writing to the storage buffer.
     * @param {ArrayBufferView} data - The data to write to the storage buffer.
     * @param {number} dataOffset - Offset in data to begin writing from. Given in elements if data
     * is a TypedArray and bytes otherwise.
     * @param {number} size - Size of content to write from data to buffer. Given in elements if
     * data is a TypedArray and bytes otherwise.
     */ writeStorageBuffer(storageBuffer, bufferOffset = 0, data, dataOffset = 0, size) {
        Debug.assert(storageBuffer.buffer);
        Debug.assert(data);
        this.wgpu.queue.writeBuffer(storageBuffer.buffer, bufferOffset, data, dataOffset, size);
    }
    /**
     * Copies source render target into destination render target. Mostly used by post-effects.
     *
     * @param {RenderTarget} [source] - The source render target. Defaults to frame buffer.
     * @param {RenderTarget} [dest] - The destination render target. Defaults to frame buffer.
     * @param {boolean} [color] - If true, will copy the color buffer. Defaults to false.
     * @param {boolean} [depth] - If true, will copy the depth buffer. Defaults to false.
     * @returns {boolean} True if the copy was successful, false otherwise.
     */ copyRenderTarget(source, dest, color, depth) {
        /** @type {GPUExtent3D} */ const copySize = {
            width: source ? source.width : dest.width,
            height: source ? source.height : dest.height,
            depthOrArrayLayers: 1
        };
        const commandEncoder = this.getCommandEncoder();
        DebugGraphics.pushGpuMarker(this, 'COPY-RT');
        if (color) {
            // read from supplied render target, or from the framebuffer
            /** @type {GPUImageCopyTexture} */ const copySrc = {
                texture: source ? source.colorBuffer.impl.gpuTexture : this.backBuffer.impl.assignedColorTexture,
                mipLevel: source ? source.mipLevel : 0
            };
            // write to supplied render target, or to the framebuffer
            /** @type {GPUImageCopyTexture} */ const copyDst = {
                texture: dest ? dest.colorBuffer.impl.gpuTexture : this.backBuffer.impl.assignedColorTexture,
                mipLevel: dest ? dest.mipLevel : 0
            };
            Debug.assert(copySrc.texture !== null && copyDst.texture !== null);
            commandEncoder.copyTextureToTexture(copySrc, copyDst, copySize);
        }
        if (depth) {
            // read from supplied render target, or from the framebuffer
            const sourceRT = source ? source : this.renderTarget;
            const sourceTexture = sourceRT.impl.depthAttachment.depthTexture;
            const sourceMipLevel = sourceRT.mipLevel;
            if (source.samples > 1) {
                // resolve the depth to a color buffer of destination render target
                const destTexture = dest.colorBuffer.impl.gpuTexture;
                this.resolver.resolveDepth(commandEncoder, sourceTexture, destTexture);
            } else {
                // write to supplied render target, or to the framebuffer
                const destTexture = dest ? dest.depthBuffer.impl.gpuTexture : this.renderTarget.impl.depthAttachment.depthTexture;
                const destMipLevel = dest ? dest.mipLevel : this.renderTarget.mipLevel;
                /** @type {GPUImageCopyTexture} */ const copySrc = {
                    texture: sourceTexture,
                    mipLevel: sourceMipLevel
                };
                /** @type {GPUImageCopyTexture} */ const copyDst = {
                    texture: destTexture,
                    mipLevel: destMipLevel
                };
                Debug.assert(copySrc.texture !== null && copyDst.texture !== null);
                commandEncoder.copyTextureToTexture(copySrc, copyDst, copySize);
            }
        }
        DebugGraphics.popGpuMarker(this);
        return true;
    }
    get hasTranspilers() {
        return this.glslang && this.twgsl;
    }
    pushMarker(name) {
        this.passEncoder?.pushDebugGroup(name);
    }
    popMarker() {
        this.passEncoder?.popDebugGroup();
    }
    constructor(canvas, options = {}){
        super(canvas, options), /**
     * Array of GPU resources pending destruction. Resources are destroyed after the current
     * command buffers are submitted to ensure they're not in use.
     *
     * @type {Array<GPUTexture|GPUBuffer|GPUQuerySet>}
     * @private
     */ this._deferredDestroys = [], /**
     * Object responsible for caching and creation of render pipelines.
     */ this.renderPipeline = new WebgpuRenderPipeline(this), /**
     * Object responsible for caching and creation of compute pipelines.
     */ this.computePipeline = new WebgpuComputePipeline(this), /**
     * Buffer used to store arguments for indirect draw calls.
     *
     * @type {StorageBuffer|null}
     * @private
     */ this._indirectDrawBuffer = null, /**
     * Number of indirect draw slots allocated.
     *
     * @type {number}
     * @private
     */ this._indirectDrawBufferCount = 0, /**
     * Next unused index in indirectDrawBuffer.
     *
     * @type {number}
     * @private
     */ this._indirectDrawNextIndex = 0, /**
     * Buffer used to store arguments for indirect dispatch calls.
     *
     * @type {StorageBuffer|null}
     * @private
     */ this._indirectDispatchBuffer = null, /**
     * Number of indirect dispatch slots allocated.
     *
     * @type {number}
     * @private
     */ this._indirectDispatchBufferCount = 0, /**
     * Next unused index in indirectDispatchBuffer.
     *
     * @type {number}
     * @private
     */ this._indirectDispatchNextIndex = 0, /**
     * Render pipeline currently set on the device.
     *
     * @type {GPURenderPipeline|null}
     * @private
     */ this.pipeline = null, /**
     * An array of bind group formats, based on currently assigned bind groups
     *
     * @type {WebgpuBindGroupFormat[]}
     */ this.bindGroupFormats = [], /**
     * Monotonically increasing counter incremented each time queue.submit() is called.
     *
     * @type {number}
     * @ignore
     */ this.submitVersion = 0, /**
     * Current command buffer encoder.
     *
     * @type {GPUCommandEncoder|null}
     * @private
     */ this.commandEncoder = null, /**
     * Command buffers scheduled for execution on the GPU.
     *
     * @type {GPUCommandBuffer[]}
     * @private
     */ this.commandBuffers = [], /** GLSL to SPIR-V transpiler */ this.glslang = null, /** SPIR-V to WGSL transpiler */ this.twgsl = null;
        options = this.initOptions;
        // alpha defaults to true
        options.alpha = options.alpha ?? true;
        this.backBufferAntialias = options.antialias ?? false;
        this.isWebGPU = true;
        this._deviceType = DEVICETYPE_WEBGPU;
        this.scope.resolve(UNUSED_UNIFORM_NAME).setValue(0);
    }
}

/**
 * @import { GraphicsDevice } from './graphics-device.js'
 * @import { IndexBuffer } from './index-buffer.js'
 * @import { ScopeId } from './scope-id.js'
 * @import { Shader } from './shader.js'
 * @import { StorageBuffer } from './storage-buffer.js'
 * @import { Texture } from './texture.js'
 * @import { TextureView } from './texture-view.js'
 * @import { Vec2 } from '../../core/math/vec2.js'
 * @import { VertexBuffer } from './vertex-buffer.js'
 */ /**
 * A helper class storing a parameter value as well as its scope ID.
 *
 * @ignore
 */ class ComputeParameter {
    constructor(){
        /** @type {ScopeId} */ this.scopeId = null;
    }
}
/**
 * A representation of a compute shader with the associated resources, that can be executed on the
 * GPU. Only supported on WebGPU platform.
 */ class Compute {
    /**
     * Sets a shader parameter on a compute instance.
     *
     * @param {string} name - The name of the parameter to set.
     * @param {number|number[]|Float32Array|Texture|StorageBuffer|VertexBuffer|IndexBuffer|TextureView} value -
     * The value for the specified parameter.
     */ setParameter(name, value) {
        let param = this.parameters.get(name);
        if (!param) {
            param = new ComputeParameter();
            param.scopeId = this.device.scope.resolve(name);
            this.parameters.set(name, param);
        }
        param.value = value;
    }
    /**
     * Returns the value of a shader parameter from the compute instance.
     *
     * @param {string} name - The name of the parameter to get.
     * @returns {number|number[]|Float32Array|Texture|StorageBuffer|VertexBuffer|IndexBuffer|undefined}
     * The value of the specified parameter.
     */ getParameter(name) {
        return this.parameters.get(name)?.value;
    }
    /**
     * Deletes a shader parameter from the compute instance.
     *
     * @param {string} name - The name of the parameter to delete.
     */ deleteParameter(name) {
        this.parameters.delete(name);
    }
    /**
     * Apply the parameters to the scope.
     *
     * @ignore
     */ applyParameters() {
        for (const [, param] of this.parameters){
            param.scopeId.setValue(param.value);
        }
    }
    /**
     * Prepare the compute work dispatch.
     *
     * @param {number} x - X dimension of the grid of work-groups to dispatch.
     * @param {number} [y] - Y dimension of the grid of work-groups to dispatch.
     * @param {number} [z] - Z dimension of the grid of work-groups to dispatch.
     */ setupDispatch(x, y, z) {
        this.countX = x;
        this.countY = y;
        this.countZ = z;
        // reset indirect dispatch state
        this.indirectSlotIndex = -1;
        this.indirectBuffer = null;
    }
    /**
     * Prepare the compute work dispatch to use indirect parameters from a buffer. The dispatch
     * parameters (x, y, z workgroup counts) are read from the buffer at the specified slot index.
     *
     * When using the device's built-in buffer (buffer parameter is null), this method must be
     * called each frame as slots are only valid for the current frame.
     *
     * @param {number} slotIndex - Slot index in the indirect dispatch buffer. When using the
     * device's built-in buffer, obtain this by calling {@link GraphicsDevice#getIndirectDispatchSlot}.
     * @param {StorageBuffer|null} [buffer] - Optional custom storage buffer containing dispatch
     * parameters. If not provided, uses the device's built-in {@link GraphicsDevice#indirectDispatchBuffer}.
     * When providing a custom buffer, the user is responsible for its lifetime and contents.
     * @example
     * // Reserve a slot in the indirect dispatch buffer
     * const slot = device.getIndirectDispatchSlot();
     *
     * // First compute shader writes dispatch parameters to the buffer
     * prepareCompute.setParameter('indirectBuffer', device.indirectDispatchBuffer);
     * prepareCompute.setParameter('slot', slot);
     * prepareCompute.setupDispatch(1, 1, 1);
     * device.computeDispatch([prepareCompute]);
     *
     * // Second compute shader uses indirect dispatch
     * processCompute.setupIndirectDispatch(slot);
     * device.computeDispatch([processCompute]);
     */ setupIndirectDispatch(slotIndex, buffer = null) {
        this.indirectSlotIndex = slotIndex;
        this.indirectBuffer = buffer;
        this.indirectFrameStamp = this.device.renderVersion;
    }
    /**
     * Calculate near-square 2D dispatch dimensions for a given workgroup count,
     * respecting the WebGPU per-dimension limit. When the count fits within a single
     * dimension, Y is 1. Otherwise, dimensions are chosen to be roughly square to
     * minimize wasted padding threads.
     *
     * @param {number} count - Total number of workgroups needed.
     * @param {Vec2} result - Output vector to receive X (x) and Y (y) dimensions.
     * @param {number} [maxDimension] - Maximum workgroups per dimension.
     * @returns {Vec2} The result vector with dimensions set.
     * @ignore
     */ static calcDispatchSize(count, result, maxDimension = 65535) {
        if (count <= maxDimension) {
            return result.set(count, 1);
        }
        const x = Math.floor(Math.sqrt(count));
        return result.set(x, Math.ceil(count / x));
    }
    /**
     * Create a compute instance. Note that this is supported on WebGPU only and is a no-op on
     * other platforms.
     *
     * @param {GraphicsDevice} graphicsDevice -
     * The graphics device.
     * @param {Shader} shader - The compute shader.
     * @param {string} [name] - The name of the compute instance, used for debugging only.
     */ constructor(graphicsDevice, shader, name = 'Unnamed'){
        /**
     * A compute shader.
     *
     * @type {Shader|null}
     * @ignore
     */ this.shader = null;
        /**
     * @type {Map<string, ComputeParameter>}
     * @ignore
     */ this.parameters = new Map();
        /**
     * @type {number}
     * @ignore
     */ this.countX = 1;
        /**
     * Slot index in the indirect dispatch buffer, or -1 for direct dispatch.
     *
     * @type {number}
     * @ignore
     */ this.indirectSlotIndex = -1;
        /**
     * Custom buffer for indirect dispatch, or null to use device's built-in buffer.
     *
     * @type {StorageBuffer|null}
     * @ignore
     */ this.indirectBuffer = null;
        /**
     * Frame stamp (device.renderVersion) when indirect slot was set. Used for validation
     * when using the built-in buffer.
     *
     * @type {number}
     * @ignore
     */ this.indirectFrameStamp = 0;
        this.device = graphicsDevice;
        this.shader = shader;
        this.name = name;
        if (graphicsDevice.supportsCompute) {
            this.impl = graphicsDevice.createComputeImpl(this);
        }
    }
}

/**
 * A named column of typed array data within a DataTable.
 *
 * Columns store homogeneous numeric data efficiently using JavaScript typed arrays.
 *
 * @example
 * ```ts
 * const positions = new Column('x', new Float32Array([1.0, 2.0, 3.0]));
 * console.log(positions.name);     // 'x'
 * console.log(positions.dataType); // 'float32'
 * ```
 */
class Column {
    name;
    data;
    constructor(name, data) {
        this.name = name;
        this.data = data;
    }
    get dataType() {
        switch (this.data.constructor) {
            case Int8Array: return 'int8';
            case Uint8Array: return 'uint8';
            case Int16Array: return 'int16';
            case Uint16Array: return 'uint16';
            case Int32Array: return 'int32';
            case Uint32Array: return 'uint32';
            case Float32Array: return 'float32';
            case Float64Array: return 'float64';
        }
        return null;
    }
    clone() {
        return new Column(this.name, this.data.slice());
    }
}
/**
 * A table of columnar data representing Gaussian splat properties.
 *
 * DataTable is the core data structure for splat data. Each column represents
 * a property (e.g., position, rotation, color) as a typed array, and all columns
 * must have the same number of rows.
 *
 * Standard columns include:
 * - Position: `x`, `y`, `z`
 * - Rotation: `rot_0`, `rot_1`, `rot_2`, `rot_3` (quaternion)
 * - Scale: `scale_0`, `scale_1`, `scale_2` (log scale)
 * - Color: `f_dc_0`, `f_dc_1`, `f_dc_2` (spherical harmonics DC)
 * - Opacity: `opacity` (logit)
 * - Spherical Harmonics: `f_rest_0` through `f_rest_44`
 *
 * @example
 * ```ts
 * const table = new DataTable([
 *     new Column('x', new Float32Array([0, 1, 2])),
 *     new Column('y', new Float32Array([0, 0, 0])),
 *     new Column('z', new Float32Array([0, 0, 0]))
 * ]);
 * console.log(table.numRows);    // 3
 * console.log(table.numColumns); // 3
 * ```
 */
class DataTable {
    columns;
    constructor(columns) {
        if (columns.length === 0) {
            throw new Error('DataTable must have at least one column');
        }
        // check all columns have the same lengths
        for (let i = 1; i < columns.length; i++) {
            if (columns[i].data.length !== columns[0].data.length) {
                throw new Error(`Column '${columns[i].name}' has inconsistent number of rows: expected ${columns[0].data.length}, got ${columns[i].data.length}`);
            }
        }
        this.columns = columns;
    }
    // rows
    get numRows() {
        return this.columns[0].data.length;
    }
    getRow(index, row = {}, columns = this.columns) {
        for (const column of columns) {
            row[column.name] = column.data[index];
        }
        return row;
    }
    setRow(index, row, columns = this.columns) {
        for (const column of columns) {
            if (row.hasOwnProperty(column.name)) {
                column.data[index] = row[column.name];
            }
        }
    }
    // columns
    get numColumns() {
        return this.columns.length;
    }
    get columnNames() {
        return this.columns.map(column => column.name);
    }
    get columnData() {
        return this.columns.map(column => column.data);
    }
    get columnTypes() {
        return this.columns.map(column => column.dataType);
    }
    getColumn(index) {
        return this.columns[index];
    }
    getColumnIndex(name) {
        return this.columns.findIndex(column => column.name === name);
    }
    getColumnByName(name) {
        return this.columns.find(column => column.name === name);
    }
    hasColumn(name) {
        return this.columns.some(column => column.name === name);
    }
    addColumn(column) {
        if (column.data.length !== this.numRows) {
            throw new Error(`Column '${column.name}' has inconsistent number of rows: expected ${this.numRows}, got ${column.data.length}`);
        }
        this.columns.push(column);
    }
    removeColumn(name) {
        const index = this.columns.findIndex(column => column.name === name);
        if (index === -1) {
            return false;
        }
        this.columns.splice(index, 1);
        return true;
    }
    // general
    clone() {
        return new DataTable(this.columns.map(c => c.clone()));
    }
    // return a new table containing the rows referenced in indices
    permuteRows(indices) {
        const result = new DataTable(this.columns.map((c) => {
            const constructor = c.data.constructor;
            return new Column(c.name, new constructor(indices.length));
        }));
        for (let i = 0; i < this.numColumns; ++i) {
            const src = this.getColumn(i).data;
            const dst = result.getColumn(i).data;
            for (let j = 0; j < indices.length; j++) {
                dst[j] = src[indices[j]];
            }
        }
        return result;
    }
    /**
     * Permutes the rows of this DataTable in-place according to the given indices.
     * After calling, row `i` will contain the data that was previously at row `indices[i]`.
     *
     * This is a memory-efficient alternative to `permuteRows` that modifies the table
     * in-place rather than creating a copy. It reuses ArrayBuffers between columns to
     * minimize memory allocations.
     *
     * @param indices - Array of indices defining the permutation. Must have the same
     * length as the number of rows, and must be a valid permutation
     * (each index 0 to n-1 appears exactly once).
     */
    permuteRowsInPlace(indices) {
        // Cache for reusing ArrayBuffers by size
        const cache = new Map();
        const getBuffer = (size) => {
            const cached = cache.get(size);
            if (cached) {
                cache.delete(size);
                return cached;
            }
            return new ArrayBuffer(size);
        };
        const returnBuffer = (buffer) => {
            cache.set(buffer.byteLength, buffer);
        };
        const n = this.numRows;
        for (const column of this.columns) {
            const src = column.data;
            const constructor = src.constructor;
            const dst = new constructor(getBuffer(src.byteLength));
            // Sequential writes are cache-friendly
            for (let i = 0; i < n; i++) {
                dst[i] = src[indices[i]];
            }
            returnBuffer(src.buffer);
            column.data = dst;
        }
    }
}

new Array(45).fill('').map((_, i) => `f_rest_${i}`);

/**
 * Default logger implementation (browser-safe).
 */
const defaultLogger = {
    log: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
    debug: (...args) => console.log(...args),
    output: text => console.log(text),
    onProgress: (node) => {
        // step 0 is the begin notification - nothing to print
        if (node.step === 0)
            return;
        const indent = '  '.repeat(node.depth);
        const name = node.stepName ?? '';
        console.log(`${indent}[${node.step}/${node.totalSteps}] ${name}`);
    }
};
let impl = defaultLogger;
let quiet = false;
/**
 * Progress tracking with nested step support.
 * Access via logger.progress.begin(), logger.progress.step()
 */
class Progress {
    currentNode;
    /**
     * Start a multi-step progress operation. Creates a new node with current as parent.
     * Calls onProgress with step: 0 to notify consumers of the new progress block.
     * @param totalSteps - Total number of steps in the operation.
     */
    begin(totalSteps) {
        this.currentNode = {
            step: 0,
            totalSteps,
            stepName: undefined,
            parent: this.currentNode,
            depth: (this.currentNode?.depth ?? -1) + 1
        };
        if (!quiet)
            impl.onProgress(this.currentNode);
    }
    /**
     * Advance to the next step. Auto-increments the step counter.
     * Auto-ends when all steps are complete.
     * @param name - Optional name of the step.
     */
    step(name) {
        if (!this.currentNode)
            return;
        this.currentNode.step++;
        this.currentNode.stepName = name;
        if (!quiet)
            impl.onProgress(this.currentNode);
        // Auto-end when all steps complete
        if (this.currentNode.step === this.currentNode.totalSteps) {
            this.currentNode = this.currentNode.parent;
        }
    }
}
/**
 * Global logger instance with injectable implementation.
 * Use setLogger() to provide a custom implementation (e.g., Node.js with process.stdout).
 * Use setQuiet() to suppress log/warn/progress output.
 */
const logger = {
    /**
     * Progress tracking with nested step support.
     * Call begin(n) to start, then step() n times. Auto-ends when complete.
     */
    progress: new Progress(),
    /**
     * Set a custom logger implementation.
     * @param l - The logger implementation to use.
     */
    setLogger(l) {
        impl = l;
    },
    /**
     * Set quiet mode. When quiet, log/warn/progress are suppressed. Errors always show.
     * @param q - Whether to enable quiet mode.
     */
    setQuiet(q) {
        quiet = q;
    },
    /**
     * Log normal messages. Suppressed in quiet mode.
     * @param args - The arguments to log.
     */
    log(...args) {
        if (!quiet)
            impl.log(...args);
    },
    /**
     * Log warning messages. Suppressed in quiet mode.
     * @param args - The arguments to log.
     */
    warn(...args) {
        if (!quiet)
            impl.warn(...args);
    },
    /**
     * Log error messages. Always shown, even in quiet mode.
     * @param args - The arguments to log.
     */
    error(...args) {
        impl.error(...args);
    },
    /**
     * Log debug/verbose messages. Suppressed in quiet mode.
     * @param args - The arguments to log.
     */
    debug(...args) {
        if (!quiet)
            impl.debug(...args);
    },
    /**
     * Output data to stdout (for piping). Always shown, even in quiet mode.
     * @param text - The text to output.
     */
    output(text) {
        impl.output(text);
    }
};

// sort the provided indices into morton order
const sortMortonOrder = (dataTable, indices) => {
    const xCol = dataTable.getColumnByName('x');
    const yCol = dataTable.getColumnByName('y');
    const zCol = dataTable.getColumnByName('z');
    if (!xCol || !yCol || !zCol) {
        logger.debug('missing required position columns');
        return;
    }
    const cx = xCol.data;
    const cy = yCol.data;
    const cz = zCol.data;
    const generate = (indices) => {
        if (indices.length === 0) {
            return;
        }
        // https://fgiesen.wordpress.com/2009/12/13/decoding-morton-codes/
        const encodeMorton3 = (x, y, z) => {
            const Part1By2 = (x) => {
                x &= 0x000003ff;
                x = (x ^ (x << 16)) & 0xff0000ff;
                x = (x ^ (x << 8)) & 0x0300f00f;
                x = (x ^ (x << 4)) & 0x030c30c3;
                x = (x ^ (x << 2)) & 0x09249249;
                return x;
            };
            return (Part1By2(z) << 2) + (Part1By2(y) << 1) + Part1By2(x);
        };
        let mx = Infinity;
        let my = Infinity;
        let mz = Infinity;
        let Mx = -Infinity;
        let My = -Infinity;
        let Mz = -Infinity;
        // calculate scene extents across all splats (using sort centers, because they're in world space)
        for (let i = 0; i < indices.length; ++i) {
            const ri = indices[i];
            const x = cx[ri];
            const y = cy[ri];
            const z = cz[ri];
            if (x < mx)
                mx = x;
            if (x > Mx)
                Mx = x;
            if (y < my)
                my = y;
            if (y > My)
                My = y;
            if (z < mz)
                mz = z;
            if (z > Mz)
                Mz = z;
        }
        const xlen = Mx - mx;
        const ylen = My - my;
        const zlen = Mz - mz;
        if (!isFinite(xlen) || !isFinite(ylen) || !isFinite(zlen)) {
            logger.debug('invalid extents', xlen, ylen, zlen);
            return;
        }
        // all points are identical
        if (xlen === 0 && ylen === 0 && zlen === 0) {
            return;
        }
        const xmul = (xlen === 0) ? 0 : 1024 / xlen;
        const ymul = (ylen === 0) ? 0 : 1024 / ylen;
        const zmul = (zlen === 0) ? 0 : 1024 / zlen;
        const morton = new Uint32Array(indices.length);
        for (let i = 0; i < indices.length; ++i) {
            const ri = indices[i];
            const x = cx[ri];
            const y = cy[ri];
            const z = cz[ri];
            const ix = Math.min(1023, (x - mx) * xmul) >>> 0;
            const iy = Math.min(1023, (y - my) * ymul) >>> 0;
            const iz = Math.min(1023, (z - mz) * zmul) >>> 0;
            morton[i] = encodeMorton3(ix, iy, iz);
        }
        // sort indices by morton code
        const order = new Uint32Array(indices.length);
        for (let i = 0; i < order.length; i++) {
            order[i] = i;
        }
        order.sort((a, b) => morton[a] - morton[b]);
        const tmpIndices = indices.slice();
        for (let i = 0; i < indices.length; ++i) {
            indices[i] = tmpIndices[order[i]];
        }
        // sort the largest buckets recursively
        let start = 0;
        let end = 1;
        while (start < indices.length) {
            while (end < indices.length && morton[order[end]] === morton[order[start]]) {
                ++end;
            }
            if (end - start > 256) {
                generate(indices.subarray(start, end));
            }
            start = end;
        }
    };
    generate(indices);
};

const _DRIVE_LETTER_START_RE = /^[A-Za-z]:\//;
function normalizeWindowsPath(input = "") {
  if (!input) {
    return input;
  }
  return input.replace(/\\/g, "/").replace(_DRIVE_LETTER_START_RE, (r) => r.toUpperCase());
}
const _IS_ABSOLUTE_RE = /^[/\\](?![/\\])|^[/\\]{2}(?!\.)|^[A-Za-z]:[/\\]/;
const _DRIVE_LETTER_RE = /^[A-Za-z]:$/;
function cwd() {
  if (typeof process !== "undefined" && typeof process.cwd === "function") {
    return process.cwd().replace(/\\/g, "/");
  }
  return "/";
}
const resolve = function(...arguments_) {
  arguments_ = arguments_.map((argument) => normalizeWindowsPath(argument));
  let resolvedPath = "";
  let resolvedAbsolute = false;
  for (let index = arguments_.length - 1; index >= -1 && !resolvedAbsolute; index--) {
    const path = index >= 0 ? arguments_[index] : cwd();
    if (!path || path.length === 0) {
      continue;
    }
    resolvedPath = `${path}/${resolvedPath}`;
    resolvedAbsolute = isAbsolute(path);
  }
  resolvedPath = normalizeString(resolvedPath, !resolvedAbsolute);
  if (resolvedAbsolute && !isAbsolute(resolvedPath)) {
    return `/${resolvedPath}`;
  }
  return resolvedPath.length > 0 ? resolvedPath : ".";
};
function normalizeString(path, allowAboveRoot) {
  let res = "";
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let char = null;
  for (let index = 0; index <= path.length; ++index) {
    if (index < path.length) {
      char = path[index];
    } else if (char === "/") {
      break;
    } else {
      char = "/";
    }
    if (char === "/") {
      if (lastSlash === index - 1 || dots === 1) ; else if (dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res[res.length - 1] !== "." || res[res.length - 2] !== ".") {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf("/");
            if (lastSlashIndex === -1) {
              res = "";
              lastSegmentLength = 0;
            } else {
              res = res.slice(0, lastSlashIndex);
              lastSegmentLength = res.length - 1 - res.lastIndexOf("/");
            }
            lastSlash = index;
            dots = 0;
            continue;
          } else if (res.length > 0) {
            res = "";
            lastSegmentLength = 0;
            lastSlash = index;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          res += res.length > 0 ? "/.." : "..";
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0) {
          res += `/${path.slice(lastSlash + 1, index)}`;
        } else {
          res = path.slice(lastSlash + 1, index);
        }
        lastSegmentLength = index - lastSlash - 1;
      }
      lastSlash = index;
      dots = 0;
    } else if (char === "." && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}
const isAbsolute = function(p) {
  return _IS_ABSOLUTE_RE.test(p);
};
const dirname = function(p) {
  const segments = normalizeWindowsPath(p).replace(/\/$/, "").split("/").slice(0, -1);
  if (segments.length === 1 && _DRIVE_LETTER_RE.test(segments[0])) {
    segments[0] += "/";
  }
  return segments.join("/") || (isAbsolute(p) ? "/" : ".");
};

var Module = (() => {
  
  return (
async function(moduleArg = {}) {
  var moduleRtn;

var Module=moduleArg;var readyPromiseResolve,readyPromiseReject;var readyPromise=new Promise((resolve,reject)=>{readyPromiseResolve=resolve;readyPromiseReject=reject;});var ENVIRONMENT_IS_WEB=typeof window=="object";var ENVIRONMENT_IS_WORKER=typeof WorkerGlobalScope!="undefined";var ENVIRONMENT_IS_NODE=typeof process=="object"&&process.versions?.node&&process.type!="renderer";if(ENVIRONMENT_IS_NODE){const{createRequire}=await import('module');var require=createRequire(import.meta.url);}var _scriptName=import.meta.url;var scriptDirectory="";function locateFile(path){if(Module["locateFile"]){return Module["locateFile"](path,scriptDirectory)}return scriptDirectory+path}var readAsync,readBinary;if(ENVIRONMENT_IS_NODE){var fs=require("fs");var nodePath=require("path");if(_scriptName.startsWith("file:")){scriptDirectory=nodePath.dirname(require("url").fileURLToPath(_scriptName))+"/";}readBinary=filename=>{filename=isFileURI(filename)?new URL(filename):filename;var ret=fs.readFileSync(filename);return ret};readAsync=async(filename,binary=true)=>{filename=isFileURI(filename)?new URL(filename):filename;var ret=fs.readFileSync(filename,binary?undefined:"utf8");return ret};if(process.argv.length>1){process.argv[1].replace(/\\/g,"/");}process.argv.slice(2);}else if(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER){try{scriptDirectory=new URL(".",_scriptName).href;}catch{}{if(ENVIRONMENT_IS_WORKER){readBinary=url=>{var xhr=new XMLHttpRequest;xhr.open("GET",url,false);xhr.responseType="arraybuffer";xhr.send(null);return new Uint8Array(xhr.response)};}readAsync=async url=>{var response=await fetch(url,{credentials:"same-origin"});if(response.ok){return response.arrayBuffer()}throw new Error(response.status+" : "+response.url)};}}else;console.log.bind(console);var err=console.error.bind(console);var wasmBinary;var wasmMemory;var ABORT=false;var HEAP8,HEAPU8;var isFileURI=filename=>filename.startsWith("file://");function updateMemoryViews(){var b=wasmMemory.buffer;HEAP8=new Int8Array(b);Module["HEAPU8"]=HEAPU8=new Uint8Array(b);Module["HEAPU32"]=new Uint32Array(b);new BigInt64Array(b);new BigUint64Array(b);}function preRun(){if(Module["preRun"]){if(typeof Module["preRun"]=="function")Module["preRun"]=[Module["preRun"]];while(Module["preRun"].length){addOnPreRun(Module["preRun"].shift());}}callRuntimeCallbacks(onPreRuns);}function initRuntime(){wasmExports["c"]();}function postRun(){if(Module["postRun"]){if(typeof Module["postRun"]=="function")Module["postRun"]=[Module["postRun"]];while(Module["postRun"].length){addOnPostRun(Module["postRun"].shift());}}callRuntimeCallbacks(onPostRuns);}var runDependencies=0;var dependenciesFulfilled=null;function addRunDependency(id){runDependencies++;Module["monitorRunDependencies"]?.(runDependencies);}function removeRunDependency(id){runDependencies--;Module["monitorRunDependencies"]?.(runDependencies);if(runDependencies==0){if(dependenciesFulfilled){var callback=dependenciesFulfilled;dependenciesFulfilled=null;callback();}}}function abort(what){Module["onAbort"]?.(what);what="Aborted("+what+")";err(what);ABORT=true;what+=". Build with -sASSERTIONS for more info.";var e=new WebAssembly.RuntimeError(what);readyPromiseReject(e);throw e}var wasmBinaryFile;function findWasmBinary(){if(Module["locateFile"]){return locateFile("webp.wasm")}return new URL("webp.wasm",import.meta.url).href}function getBinarySync(file){if(file==wasmBinaryFile&&wasmBinary){return new Uint8Array(wasmBinary)}if(readBinary){return readBinary(file)}throw "both async and sync fetching of the wasm failed"}async function getWasmBinary(binaryFile){if(!wasmBinary){try{var response=await readAsync(binaryFile);return new Uint8Array(response)}catch{}}return getBinarySync(binaryFile)}async function instantiateArrayBuffer(binaryFile,imports){try{var binary=await getWasmBinary(binaryFile);var instance=await WebAssembly.instantiate(binary,imports);return instance}catch(reason){err(`failed to asynchronously prepare wasm: ${reason}`);abort(reason);}}async function instantiateAsync(binary,binaryFile,imports){if(!binary&&typeof WebAssembly.instantiateStreaming=="function"&&!ENVIRONMENT_IS_NODE){try{var response=fetch(binaryFile,{credentials:"same-origin"});var instantiationResult=await WebAssembly.instantiateStreaming(response,imports);return instantiationResult}catch(reason){err(`wasm streaming compile failed: ${reason}`);err("falling back to ArrayBuffer instantiation");}}return instantiateArrayBuffer(binaryFile,imports)}function getWasmImports(){return {a:wasmImports}}async function createWasm(){function receiveInstance(instance,module){wasmExports=instance.exports;wasmMemory=wasmExports["b"];updateMemoryViews();removeRunDependency();return wasmExports}addRunDependency();function receiveInstantiationResult(result){return receiveInstance(result["instance"])}var info=getWasmImports();if(Module["instantiateWasm"]){return new Promise((resolve,reject)=>{Module["instantiateWasm"](info,(mod,inst)=>{resolve(receiveInstance(mod));});})}wasmBinaryFile??=findWasmBinary();try{var result=await instantiateAsync(wasmBinary,wasmBinaryFile,info);var exports$1=receiveInstantiationResult(result);return exports$1}catch(e){readyPromiseReject(e);return Promise.reject(e)}}var callRuntimeCallbacks=callbacks=>{while(callbacks.length>0){callbacks.shift()(Module);}};var onPostRuns=[];var addOnPostRun=cb=>onPostRuns.push(cb);var onPreRuns=[];var addOnPreRun=cb=>onPreRuns.push(cb);var stackRestore=val=>__emscripten_stack_restore(val);var stackSave=()=>_emscripten_stack_get_current();var getHeapMax=()=>2147483648;var alignMemory=(size,alignment)=>Math.ceil(size/alignment)*alignment;var growMemory=size=>{var b=wasmMemory.buffer;var pages=(size-b.byteLength+65535)/65536|0;try{wasmMemory.grow(pages);updateMemoryViews();return 1}catch(e){}};var _emscripten_resize_heap=requestedSize=>{var oldSize=HEAPU8.length;requestedSize>>>=0;var maxHeapSize=getHeapMax();if(requestedSize>maxHeapSize){return false}for(var cutDown=1;cutDown<=4;cutDown*=2){var overGrownHeapSize=oldSize*(1+.2/cutDown);overGrownHeapSize=Math.min(overGrownHeapSize,requestedSize+100663296);var newSize=Math.min(maxHeapSize,alignMemory(Math.max(requestedSize,overGrownHeapSize),65536));var replacement=growMemory(newSize);if(replacement){return true}}return false};var getCFunc=ident=>{var func=Module["_"+ident];return func};var writeArrayToMemory=(array,buffer)=>{HEAP8.set(array,buffer);};var lengthBytesUTF8=str=>{var len=0;for(var i=0;i<str.length;++i){var c=str.charCodeAt(i);if(c<=127){len++;}else if(c<=2047){len+=2;}else if(c>=55296&&c<=57343){len+=4;++i;}else {len+=3;}}return len};var stringToUTF8Array=(str,heap,outIdx,maxBytesToWrite)=>{if(!(maxBytesToWrite>0))return 0;var startIdx=outIdx;var endIdx=outIdx+maxBytesToWrite-1;for(var i=0;i<str.length;++i){var u=str.charCodeAt(i);if(u>=55296&&u<=57343){var u1=str.charCodeAt(++i);u=65536+((u&1023)<<10)|u1&1023;}if(u<=127){if(outIdx>=endIdx)break;heap[outIdx++]=u;}else if(u<=2047){if(outIdx+1>=endIdx)break;heap[outIdx++]=192|u>>6;heap[outIdx++]=128|u&63;}else if(u<=65535){if(outIdx+2>=endIdx)break;heap[outIdx++]=224|u>>12;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63;}else {if(outIdx+3>=endIdx)break;heap[outIdx++]=240|u>>18;heap[outIdx++]=128|u>>12&63;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63;}}heap[outIdx]=0;return outIdx-startIdx};var stringToUTF8=(str,outPtr,maxBytesToWrite)=>stringToUTF8Array(str,HEAPU8,outPtr,maxBytesToWrite);var stackAlloc=sz=>__emscripten_stack_alloc(sz);var stringToUTF8OnStack=str=>{var size=lengthBytesUTF8(str)+1;var ret=stackAlloc(size);stringToUTF8(str,ret,size);return ret};var UTF8Decoder=typeof TextDecoder!="undefined"?new TextDecoder:undefined;var UTF8ArrayToString=(heapOrArray,idx=0,maxBytesToRead=NaN)=>{var endIdx=idx+maxBytesToRead;var endPtr=idx;while(heapOrArray[endPtr]&&!(endPtr>=endIdx))++endPtr;if(endPtr-idx>16&&heapOrArray.buffer&&UTF8Decoder){return UTF8Decoder.decode(heapOrArray.subarray(idx,endPtr))}var str="";while(idx<endPtr){var u0=heapOrArray[idx++];if(!(u0&128)){str+=String.fromCharCode(u0);continue}var u1=heapOrArray[idx++]&63;if((u0&224)==192){str+=String.fromCharCode((u0&31)<<6|u1);continue}var u2=heapOrArray[idx++]&63;if((u0&240)==224){u0=(u0&15)<<12|u1<<6|u2;}else {u0=(u0&7)<<18|u1<<12|u2<<6|heapOrArray[idx++]&63;}if(u0<65536){str+=String.fromCharCode(u0);}else {var ch=u0-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023);}}return str};var UTF8ToString=(ptr,maxBytesToRead)=>ptr?UTF8ArrayToString(HEAPU8,ptr,maxBytesToRead):"";var ccall=(ident,returnType,argTypes,args,opts)=>{var toC={string:str=>{var ret=0;if(str!==null&&str!==undefined&&str!==0){ret=stringToUTF8OnStack(str);}return ret},array:arr=>{var ret=stackAlloc(arr.length);writeArrayToMemory(arr,ret);return ret}};function convertReturnValue(ret){if(returnType==="string"){return UTF8ToString(ret)}if(returnType==="boolean")return Boolean(ret);return ret}var func=getCFunc(ident);var cArgs=[];var stack=0;if(args){for(var i=0;i<args.length;i++){var converter=toC[argTypes[i]];if(converter){if(stack===0)stack=stackSave();cArgs[i]=converter(args[i]);}else {cArgs[i]=args[i];}}}var ret=func(...cArgs);function onDone(ret){if(stack!==0)stackRestore(stack);return convertReturnValue(ret)}ret=onDone(ret);return ret};var cwrap=(ident,returnType,argTypes,opts)=>{var numericArgs=!argTypes||argTypes.every(type=>type==="number"||type==="boolean");var numericRet=returnType!=="string";if(numericRet&&numericArgs&&!opts){return getCFunc(ident)}return (...args)=>ccall(ident,returnType,argTypes,args)};{if(Module["printErr"])err=Module["printErr"];if(Module["wasmBinary"])wasmBinary=Module["wasmBinary"];}Module["cwrap"]=cwrap;var wasmImports={a:_emscripten_resize_heap};var wasmExports=await createWasm();Module["_webp_encode_rgba"]=wasmExports["d"];Module["_webp_encode_lossless_rgba"]=wasmExports["e"];Module["_webp_decode_rgba"]=wasmExports["f"];Module["_webp_free"]=wasmExports["g"];Module["_malloc"]=wasmExports["h"];Module["_free"]=wasmExports["i"];var __emscripten_stack_restore=wasmExports["j"];var __emscripten_stack_alloc=wasmExports["k"];var _emscripten_stack_get_current=wasmExports["l"];function run(){if(runDependencies>0){dependenciesFulfilled=run;return}preRun();if(runDependencies>0){dependenciesFulfilled=run;return}function doRun(){Module["calledRun"]=true;if(ABORT)return;initRuntime();readyPromiseResolve(Module);Module["onRuntimeInitialized"]?.();postRun();}if(Module["setStatus"]){Module["setStatus"]("Running...");setTimeout(()=>{setTimeout(()=>Module["setStatus"](""),1);doRun();},1);}else {doRun();}}function preInit(){if(Module["preInit"]){if(typeof Module["preInit"]=="function")Module["preInit"]=[Module["preInit"]];while(Module["preInit"].length>0){Module["preInit"].shift()();}}}preInit();run();moduleRtn=readyPromise;


  return moduleRtn;
}
);
})();

class WebPCodec {
    /**
     * URL to the webp.wasm file. Set this before any SOG read/write operations
     * in browser environments where the default path resolution doesn't work.
     *
     * @example
     * import { WebPCodec } from '@playcanvas/splat-transform';
     * import wasmUrl from '@playcanvas/splat-transform/lib/webp.wasm?url';
     * WebPCodec.wasmUrl = wasmUrl;
     */
    static wasmUrl = null;
    Module;
    static async create() {
        const instance = new WebPCodec();
        instance.Module = await Module({
            locateFile: (path) => {
                if (path.endsWith('.wasm') && WebPCodec.wasmUrl) {
                    return WebPCodec.wasmUrl;
                }
                return new URL(`../lib/${path}`, import.meta.url).toString();
            }
        });
        return instance;
    }
    encodeLosslessRGBA(rgba, width, height, stride = width * 4) {
        const { Module } = this;
        const inPtr = Module._malloc(rgba.length);
        const outPtrPtr = Module._malloc(4);
        const outSizePtr = Module._malloc(4);
        Module.HEAPU8.set(rgba, inPtr);
        const ok = Module._webp_encode_lossless_rgba(inPtr, width, height, stride, outPtrPtr, outSizePtr);
        if (!ok) {
            throw new Error('WebP lossless encode failed');
        }
        const outPtr = Module.HEAPU32[outPtrPtr >> 2];
        const outSize = Module.HEAPU32[outSizePtr >> 2];
        const bytes = Module.HEAPU8.slice(outPtr, outPtr + outSize);
        Module._webp_free(outPtr);
        Module._free(inPtr);
        Module._free(outPtrPtr);
        Module._free(outSizePtr);
        return bytes;
    }
    decodeRGBA(webp) {
        const { Module } = this;
        const input = webp;
        const inPtr = Module._malloc(input.length);
        const outPtrPtr = Module._malloc(4);
        const widthPtr = Module._malloc(4);
        const heightPtr = Module._malloc(4);
        Module.HEAPU8.set(input, inPtr);
        const ok = Module._webp_decode_rgba(inPtr, input.length, outPtrPtr, widthPtr, heightPtr);
        if (!ok) {
            Module._free(inPtr);
            Module._free(outPtrPtr);
            Module._free(widthPtr);
            Module._free(heightPtr);
            throw new Error('WebP decode failed');
        }
        const outPtr = Module.HEAPU32[outPtrPtr >> 2];
        const width = Module.HEAPU32[widthPtr >> 2];
        const height = Module.HEAPU32[heightPtr >> 2];
        const size = width * height * 4;
        const bytes = Module.HEAPU8.slice(outPtr, outPtr + size);
        Module._webp_free(outPtr);
        Module._free(inPtr);
        Module._free(outPtrPtr);
        Module._free(widthPtr);
        Module._free(heightPtr);
        return { rgba: bytes, width, height };
    }
}

const sigmoid = (v) => 1 / (1 + Math.exp(-v));

var version = "1.8.2";
new Array(45).fill('').map((_, i) => `f_rest_${i}`);

const writeFile$1 = async (fs, filename, data) => {
    const outputFile = await fs.createWriter(filename);
    await outputFile.write(data instanceof Uint8Array ? data : new TextEncoder().encode(data));
    await outputFile.close();
};

// write data to a memory buffer
class MemoryWriter {
    write;
    close;
    constructor(onclose) {
        const buffers = [];
        let buffer;
        let cursor = 0;
        this.write = (data) => {
            let readcursor = 0;
            while (readcursor < data.byteLength) {
                const readSize = data.byteLength - readcursor;
                // allocate buffer
                if (!buffer) {
                    buffer = new Uint8Array(Math.max(5 * 1024 * 1024, readSize));
                }
                const writeSize = buffer.byteLength - cursor;
                const copySize = Math.min(readSize, writeSize);
                buffer.set(data.subarray(readcursor, readcursor + copySize), cursor);
                readcursor += copySize;
                cursor += copySize;
                if (cursor === buffer.byteLength) {
                    buffers.push(buffer);
                    buffer = null;
                    cursor = 0;
                }
            }
        };
        this.close = () => {
            if (buffer) {
                buffers.push(new Uint8Array(buffer.buffer, 0, cursor));
                buffer = null;
                cursor = 0;
            }
            onclose(buffers);
        };
    }
}
/**
 * A file system that writes files to in-memory buffers.
 *
 * Useful for generating output without writing to disk, such as when
 * creating data for download or further processing.
 *
 * @example
 * ```ts
 * const fs = new MemoryFileSystem();
 * await writeFile({ filename: 'output.ply', ... }, fs);
 *
 * // Get the generated data
 * const data = fs.results.get('output.ply');
 * ```
 */
class MemoryFileSystem {
    results = new Map();
    createWriter(filename) {
        return new MemoryWriter((result) => {
            // combine buffers
            if (result.length === 1) {
                this.results.set(filename, result[0]);
            }
            else {
                const combined = new Uint8Array(result.reduce((total, buf) => total + buf.byteLength, 0));
                let offset = 0;
                for (let i = 0; i < result.length; ++i) {
                    combined.set(result[i], offset);
                    offset += result[i].byteLength;
                }
                this.results.set(filename, combined);
            }
        });
    }
    async mkdir(path) {
        // no-op
    }
}

const crc32_table = (() => {
    const tbl = [];
    let c;
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        tbl[n] = c;
    }
    return tbl;
})();
class Crc {
    reset;
    update;
    value;
    constructor() {
        let bits = -1;
        this.update = (data) => {
            for (let i = 0; i < data.length; i++) {
                bits = (bits >>> 8) ^ crc32_table[(bits ^ data[i]) & 0xFF];
            }
        };
        this.value = () => (bits ^ (-1)) >>> 0;
    }
}

// Writer for a single zip entry
class ZipEntryWriter {
    write;
    close;
    constructor(outputWriter, entry) {
        this.write = async (data) => {
            entry.sizeBytes += data.length;
            entry.crc.update(data);
            await outputWriter.write(data);
        };
        this.close = async () => {
            // no-op, finalization is handled by ZipFileSystem
        };
    }
}
/**
 * A file system that writes files into a ZIP archive.
 *
 * Creates a ZIP file containing all written files. Used internally
 * for bundled output formats like .sog files.
 *
 * @example
 * ```ts
 * const outputWriter = await fs.createWriter('bundle.zip');
 * const zipFs = new ZipFileSystem(outputWriter);
 *
 * // Write files into the zip
 * const writer = await zipFs.createWriter('data.json');
 * await writer.write(jsonData);
 * await writer.close();
 *
 * // Finalize the zip
 * await zipFs.close();
 * ```
 */
class ZipFileSystem {
    close;
    createWriter;
    mkdir;
    constructor(writer) {
        const textEncoder = new TextEncoder();
        const files = [];
        let activeEntry = null;
        const date = new Date();
        const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
        const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
        const writeEntryHeader = async (filename) => {
            const filenameBuf = textEncoder.encode(filename);
            const nameLen = filenameBuf.length;
            const header = new Uint8Array(30 + nameLen);
            const view = new DataView(header.buffer);
            view.setUint32(0, 0x04034b50, true);
            view.setUint16(4, 20, true); // version needed to extract = 2.0
            view.setUint16(6, 0x8 | 0x800, true); // indicate crc and size comes after, utf-8 encoding
            view.setUint16(8, 0, true); // method = 0 (store)
            view.setUint16(10, dosTime, true);
            view.setUint16(12, dosDate, true);
            view.setUint16(26, nameLen, true);
            header.set(filenameBuf, 30);
            await writer.write(header);
            const entry = { filename: filenameBuf, crc: new Crc(), sizeBytes: 0 };
            files.push(entry);
            return entry;
        };
        const writeEntryFooter = async (entry) => {
            const { crc, sizeBytes } = entry;
            const data = new Uint8Array(16);
            const view = new DataView(data.buffer);
            view.setUint32(0, 0x08074b50, true);
            view.setUint32(4, crc.value(), true);
            view.setUint32(8, sizeBytes, true);
            view.setUint32(12, sizeBytes, true);
            await writer.write(data);
        };
        this.createWriter = async (filename) => {
            // Close previous entry if exists
            if (activeEntry) {
                await writeEntryFooter(activeEntry);
                activeEntry = null;
            }
            // Start new entry
            const entry = await writeEntryHeader(filename);
            activeEntry = entry;
            return new ZipEntryWriter(writer, entry);
        };
        this.mkdir = async (_path) => {
            // No-op for zip - directories are created implicitly from file paths
        };
        this.close = async () => {
            // Close last entry if exists
            if (activeEntry) {
                await writeEntryFooter(activeEntry);
                activeEntry = null;
            }
            // Write central directory records
            let offset = 0;
            for (const file of files) {
                const { filename, crc, sizeBytes } = file;
                const nameLen = filename.length;
                const cdr = new Uint8Array(46 + nameLen);
                const view = new DataView(cdr.buffer);
                view.setUint32(0, 0x02014b50, true);
                view.setUint16(4, 20, true);
                view.setUint16(6, 20, true);
                view.setUint16(8, 0x8 | 0x800, true);
                view.setUint16(10, 0, true);
                view.setUint16(12, dosTime, true);
                view.setUint16(14, dosDate, true);
                view.setUint32(16, crc.value(), true);
                view.setUint32(20, sizeBytes, true);
                view.setUint32(24, sizeBytes, true);
                view.setUint16(28, nameLen, true);
                view.setUint32(42, offset, true);
                cdr.set(filename, 46);
                await writer.write(cdr);
                offset += 30 + nameLen + sizeBytes + 16; // 30 local header + name + data + 16 descriptor
            }
            const filenameLength = files.reduce((tot, file) => tot + file.filename.length, 0);
            const dataLength = files.reduce((tot, file) => tot + file.sizeBytes, 0);
            // Write end of central directory record
            const eocd = new Uint8Array(22);
            const eocdView = new DataView(eocd.buffer);
            eocdView.setUint32(0, 0x06054b50, true);
            eocdView.setUint16(8, files.length, true);
            eocdView.setUint16(10, files.length, true);
            eocdView.setUint32(12, filenameLength + files.length * 46, true);
            eocdView.setUint32(16, filenameLength + files.length * (30 + 16) + dataLength, true);
            await writer.write(eocd);
            // Close the underlying writer
            await writer.close();
        };
    }
}

class KdTree {
    centroids;
    root;
    constructor(centroids) {
        const build = (indices, depth) => {
            const { centroids } = this;
            const values = centroids.columns[depth % centroids.numColumns].data;
            indices.sort((a, b) => values[a] - values[b]);
            if (indices.length === 1) {
                return {
                    index: indices[0],
                    count: 1
                };
            }
            else if (indices.length === 2) {
                return {
                    index: indices[0],
                    count: 2,
                    right: {
                        index: indices[1],
                        count: 1
                    }
                };
            }
            const mid = indices.length >> 1;
            const left = build(indices.subarray(0, mid), depth + 1);
            const right = build(indices.subarray(mid + 1), depth + 1);
            return {
                index: indices[mid],
                count: 1 + left.count + right.count,
                left,
                right
            };
        };
        const indices = new Uint32Array(centroids.numRows);
        for (let i = 0; i < indices.length; ++i) {
            indices[i] = i;
        }
        this.centroids = centroids;
        this.root = build(indices, 0);
    }
    findNearest(point, filterFunc) {
        const { centroids } = this;
        const { numColumns } = centroids;
        const calcDistance = (index) => {
            let l = 0;
            for (let i = 0; i < numColumns; ++i) {
                const v = centroids.columns[i].data[index] - point[i];
                l += v * v;
            }
            return l;
        };
        let mind = Infinity;
        let mini = -1;
        let cnt = 0;
        const recurse = (node, depth) => {
            const axis = depth % numColumns;
            const distance = point[axis] - centroids.columns[axis].data[node.index];
            const next = (distance > 0) ? node.right : node.left;
            cnt++;
            if (next) {
                recurse(next, depth + 1);
            }
            // check index
            if (!filterFunc || filterFunc(node.index)) {
                const thisd = calcDistance(node.index);
                if (thisd < mind) {
                    mind = thisd;
                    mini = node.index;
                }
            }
            // check the other side
            if (distance * distance < mind) {
                const other = next === node.right ? node.left : node.right;
                if (other) {
                    recurse(other, depth + 1);
                }
            }
        };
        recurse(this.root, 0);
        return { index: mini, distanceSqr: mind, cnt };
    }
}

const clusterWgsl = (numColumns, useF16) => {
    const floatType = useF16 ? 'f16' : 'f32';
    return /* wgsl */ `
${useF16 ? 'enable f16;' : ''}

struct Uniforms {
    numPoints: u32,
    numCentroids: u32
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> points: array<${floatType}>;
@group(0) @binding(2) var<storage, read> centroids: array<${floatType}>;
@group(0) @binding(3) var<storage, read_write> results: array<u32>;

const numColumns = ${numColumns};   // number of columns in the points and centroids tables
const chunkSize = 128u;             // must be a multiple of 64
var<workgroup> sharedChunk: array<${floatType}, numColumns * chunkSize>;

// calculate the squared distance between the point and centroid
fn calcDistanceSqr(point: array<${floatType}, numColumns>, centroid: u32) -> f32 {
    var result = 0.0;

    var ci = centroid * numColumns;

    for (var i = 0u; i < numColumns; i++) {
        let v = f32(point[i] - sharedChunk[ci+i]);
        result += v * v;
    }

    return result;
}

@compute @workgroup_size(64)
fn main(
    @builtin(local_invocation_index) local_id : u32,
    @builtin(global_invocation_id) global_id: vec3u,
    @builtin(num_workgroups) num_workgroups: vec3u
) {
    // calculate row index for this thread point
    let pointIndex = global_id.x + global_id.y * num_workgroups.x * 64u;

    // copy the point data from global memory
    var point: array<${floatType}, numColumns>;
    if (pointIndex < uniforms.numPoints) {
        for (var i = 0u; i < numColumns; i++) {
            point[i] = points[pointIndex * numColumns + i];
        }
    }

    var mind = 1000000.0;
    var mini = 0u;

    // work through the list of centroids in shared memory chunks
    let numChunks = u32(ceil(f32(uniforms.numCentroids) / f32(chunkSize)));
    for (var i = 0u; i < numChunks; i++) {

        // copy this thread's slice of the centroid shared chunk data
        let dstRow = local_id * (chunkSize / 64u);
        let srcRow = min(uniforms.numCentroids, i * chunkSize + local_id * chunkSize / 64u);
        let numRows = min(uniforms.numCentroids, srcRow + chunkSize / 64u) - srcRow;

        var dst = dstRow * numColumns;
        var src = srcRow * numColumns;

        for (var c = 0u; c < numRows * numColumns; c++) {
            sharedChunk[dst + c] = centroids[src + c];
        }

        // wait for all threads to finish writing their part of centroids shared memory buffer
        workgroupBarrier();

        // loop over the next chunk of centroids finding the closest
        if (pointIndex < uniforms.numPoints) {
            let thisChunkSize = min(chunkSize, uniforms.numCentroids - i * chunkSize);
            for (var c = 0u; c < thisChunkSize; c++) {
                let d = calcDistanceSqr(point, c);
                if (d < mind) {
                    mind = d;
                    mini = i * chunkSize + c;
                }
            }
        }

        // next loop will overwrite the shared memory, so wait
        workgroupBarrier();
    }

    if (pointIndex < uniforms.numPoints) {
        results[pointIndex] = mini;
    }
}
`;
};
const roundUp = (value, multiple) => {
    return Math.ceil(value / multiple) * multiple;
};
const interleaveData = (result, dataTable, numRows, rowOffset) => {
    const { numColumns } = dataTable;
    if (result instanceof Uint16Array) {
        // interleave shorts
        for (let c = 0; c < numColumns; ++c) {
            const column = dataTable.columns[c];
            for (let r = 0; r < numRows; ++r) {
                result[r * numColumns + c] = FloatPacking.float2Half(column.data[rowOffset + r]);
            }
        }
    }
    else {
        // interleave floats
        for (let c = 0; c < numColumns; ++c) {
            const column = dataTable.columns[c];
            for (let r = 0; r < numRows; ++r) {
                result[r * numColumns + c] = column.data[rowOffset + r];
            }
        }
    }
};
class GpuClustering {
    execute;
    destroy;
    constructor(device, numColumns, numCentroids) {
        // Check if device supports f16
        const useF16 = !!('supportsShaderF16' in device && device.supportsShaderF16);
        const workgroupSize = 64;
        const workgroupsPerBatch = 1024;
        const batchSize = workgroupsPerBatch * workgroupSize;
        const bindGroupFormat = new BindGroupFormat(device, [
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE),
            new BindStorageBufferFormat('pointsBuffer', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('centroidsBuffer', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('resultsBuffer', SHADERSTAGE_COMPUTE)
        ]);
        const shader = new Shader(device, {
            name: 'compute-cluster',
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: clusterWgsl(numColumns, useF16),
            // @ts-ignore
            computeUniformBufferFormats: {
                uniforms: new UniformBufferFormat(device, [
                    new UniformFormat('numPoints', UNIFORMTYPE_UINT),
                    new UniformFormat('numCentroids', UNIFORMTYPE_UINT)
                ])
            },
            // @ts-ignore
            computeBindGroupFormat: bindGroupFormat
        });
        const interleavedPoints = useF16 ? new Uint16Array(roundUp(numColumns * batchSize, 2)) : new Float32Array(numColumns * batchSize);
        const interleavedCentroids = useF16 ? new Uint16Array(roundUp(numColumns * numCentroids, 2)) : new Float32Array(numColumns * numCentroids);
        const resultsData = new Uint32Array(batchSize);
        const pointsBuffer = new StorageBuffer(device, interleavedPoints.byteLength, BUFFERUSAGE_COPY_DST);
        const centroidsBuffer = new StorageBuffer(device, interleavedCentroids.byteLength, BUFFERUSAGE_COPY_DST);
        const resultsBuffer = new StorageBuffer(device, resultsData.byteLength, BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST);
        const compute = new Compute(device, shader, 'compute-cluster');
        compute.setParameter('pointsBuffer', pointsBuffer);
        compute.setParameter('centroidsBuffer', centroidsBuffer);
        compute.setParameter('resultsBuffer', resultsBuffer);
        this.execute = async (points, centroids, labels) => {
            const numPoints = points.numRows;
            const numBatches = Math.ceil(numPoints / batchSize);
            // upload centroid data to gpu
            interleaveData(interleavedCentroids, centroids, numCentroids, 0);
            centroidsBuffer.write(0, interleavedCentroids, 0, interleavedCentroids.length);
            compute.setParameter('numCentroids', numCentroids);
            for (let batch = 0; batch < numBatches; batch++) {
                const currentBatchSize = Math.min(numPoints - batch * batchSize, batchSize);
                const groups = Math.ceil(currentBatchSize / 64);
                // write this batch of point data to gpu
                interleaveData(interleavedPoints, points, currentBatchSize, batch * batchSize);
                pointsBuffer.write(0, interleavedPoints, 0, useF16 ? roundUp(numColumns * currentBatchSize, 2) : numColumns * currentBatchSize);
                compute.setParameter('numPoints', currentBatchSize);
                // start compute job
                compute.setupDispatch(groups);
                device.computeDispatch([compute], `cluster-dispatch-${batch}`);
                // read results from gpu and store in labels
                await resultsBuffer.read(0, currentBatchSize * 4, resultsData, true);
                labels.set(resultsData.subarray(0, currentBatchSize), batch * batchSize);
            }
        };
        this.destroy = () => {
            pointsBuffer.destroy();
            centroidsBuffer.destroy();
            resultsBuffer.destroy();
            shader.destroy();
            bindGroupFormat.destroy();
        };
    }
}

// use floyd's algorithm to pick m unique random indices from 0..n-1
const pickRandomIndices = (n, m) => {
    const chosen = new Set();
    for (let j = n - m; j < n; j++) {
        const t = Math.floor(Math.random() * (j + 1));
        chosen.add(chosen.has(t) ? j : t);
    }
    return [...chosen];
};
const initializeCentroids = (dataTable, centroids, row) => {
    const indices = pickRandomIndices(dataTable.numRows, centroids.numRows);
    for (let i = 0; i < centroids.numRows; ++i) {
        dataTable.getRow(indices[i], row);
        centroids.setRow(i, row);
    }
};
// in the 1d case we use quantile-based initialization for better handling of skewed data
const initializeCentroids1D = (dataTable, centroids) => {
    const data = dataTable.getColumn(0).data;
    const n = dataTable.numRows;
    const k = centroids.numRows;
    // Sort data to compute quantiles
    const sorted = Float32Array.from(data).sort((a, b) => a - b);
    const centroidsData = centroids.getColumn(0).data;
    for (let i = 0; i < k; ++i) {
        // Place centroid at the center of its expected cluster region
        const quantile = (2 * i + 1) / (2 * k);
        const index = Math.min(Math.floor(quantile * n), n - 1);
        centroidsData[i] = sorted[index];
    }
};
const calcAverage = (dataTable, cluster, row) => {
    const keys = dataTable.columnNames;
    for (let i = 0; i < keys.length; ++i) {
        row[keys[i]] = 0;
    }
    const dataRow = {};
    for (let i = 0; i < cluster.length; ++i) {
        dataTable.getRow(cluster[i], dataRow);
        for (let j = 0; j < keys.length; ++j) {
            const key = keys[j];
            row[key] += dataRow[key];
        }
    }
    if (cluster.length > 0) {
        for (let i = 0; i < keys.length; ++i) {
            row[keys[i]] /= cluster.length;
        }
    }
};
const clusterKdTreeCpu = (points, centroids, labels) => {
    const kdTree = new KdTree(centroids);
    // construct a kdtree over the centroids so we can find the nearest quickly
    const point = new Float32Array(points.numColumns);
    const row = {};
    // assign each point to the nearest centroid
    for (let i = 0; i < points.numRows; ++i) {
        points.getRow(i, row);
        points.columns.forEach((c, i) => {
            point[i] = row[c.name];
        });
        const a = kdTree.findNearest(point);
        labels[i] = a.index;
    }
};
const groupLabels = (labels, k) => {
    const clusters = [];
    for (let i = 0; i < k; ++i) {
        clusters[i] = [];
    }
    for (let i = 0; i < labels.length; ++i) {
        clusters[labels[i]].push(i);
    }
    return clusters;
};
const kmeans = async (points, k, iterations, device) => {
    // too few data points
    if (points.numRows < k) {
        return {
            centroids: points.clone(),
            // use a typed array here so downstream code can rely on
            // labels supporting subarray(), even in this early-return
            // path used for very small datasets.
            labels: new Uint32Array(points.numRows).map((_, i) => i)
        };
    }
    const row = {};
    // construct centroids data table and assign initial values
    const centroids = new DataTable(points.columns.map(c => new Column(c.name, new Float32Array(k))));
    if (points.numColumns === 1) {
        initializeCentroids1D(points, centroids);
    }
    else {
        initializeCentroids(points, centroids, row);
    }
    const gpuClustering = device && new GpuClustering(device, points.numColumns, k);
    const labels = new Uint32Array(points.numRows);
    let converged = false;
    let steps = 0;
    logger.debug(`running k-means clustering: dims=${points.numColumns} points=${points.numRows} clusters=${k} iterations=${iterations}...`);
    // Report iterations as anonymous nested steps
    logger.progress.begin(iterations);
    while (!converged) {
        if (gpuClustering) {
            await gpuClustering.execute(points, centroids, labels);
        }
        else {
            clusterKdTreeCpu(points, centroids, labels);
        }
        // calculate the new centroid positions
        const groups = groupLabels(labels, k);
        for (let i = 0; i < centroids.numRows; ++i) {
            if (groups[i].length === 0) {
                // re-seed this centroid to a random point to avoid zero vector
                const idx = Math.floor(Math.random() * points.numRows);
                points.getRow(idx, row);
                centroids.setRow(i, row);
            }
            else {
                calcAverage(points, groups[i], row);
                centroids.setRow(i, row);
            }
        }
        steps++;
        if (steps >= iterations) {
            converged = true;
        }
        // Report iteration as anonymous step
        logger.progress.step();
    }
    if (gpuClustering) {
        gpuClustering.destroy();
    }
    return { centroids, labels };
};

/**
 * Optimal 1D quantization using dynamic programming on a histogram.
 *
 * Pools all columns of the input DataTable into a single 1D dataset,
 * bins values into a histogram, then uses DP to find k centroids that
 * minimize weighted sum-of-squared-errors (SSE).
 *
 * Bin weights use sub-linear density weighting: weight = count^alpha.
 * With alpha < 1, sparse tail regions of the distribution earn
 * meaningful influence on centroid placement, preventing the
 * catastrophic clipping of extreme values that standard k-means
 * (alpha = 1) exhibits on heavy-tailed distributions.
 *
 * @param dataTable - Input data table whose columns are pooled into 1D.
 * @param k - Number of codebook entries (default 256).
 * @param alpha - Density weight exponent. 0 = uniform (each bin equal),
 * 0.5 = sqrt (balanced), 1.0 = standard MSE (dense regions dominate).
 * Default 0.5.
 * @returns Object with `centroids` (DataTable with one 'data' column of
 * k Float32 values, sorted ascending) and `labels` (DataTable with same
 * column layout as input, each column containing Uint8Array indices into
 * the codebook).
 */
const quantize1d = (dataTable, k = 256, alpha = 0.5) => {
    const { numColumns, numRows } = dataTable;
    // pool all columns into a flat 1D array
    const N = numRows * numColumns;
    const data = new Float32Array(N);
    for (let i = 0; i < numColumns; ++i) {
        data.set(dataTable.getColumn(i).data, i * numRows);
    }
    // find global min/max
    let dataMin = Infinity;
    let dataMax = -Infinity;
    for (let i = 0; i < N; ++i) {
        const v = data[i];
        if (v < dataMin)
            dataMin = v;
        if (v > dataMax)
            dataMax = v;
    }
    // handle degenerate case where all values are identical
    if (dataMax - dataMin < 1e-20) {
        const centroids = new DataTable([new Column('data', new Float32Array(k))]);
        centroids.getColumn(0).data.fill(dataMin);
        const result = new DataTable(dataTable.columnNames.map(name => new Column(name, new Uint8Array(numRows))));
        return { centroids, labels: result };
    }
    // build histogram
    const H = 1024;
    const binWidth = (dataMax - dataMin) / H;
    const counts = new Float64Array(H);
    const sums = new Float64Array(H);
    for (let i = 0; i < N; ++i) {
        const bin = Math.min(H - 1, Math.floor((data[i] - dataMin) / binWidth));
        counts[bin]++;
        sums[bin] += data[i];
    }
    // compute bin centers (mean of values in each bin, or geometric center if empty)
    const centers = new Float64Array(H);
    for (let i = 0; i < H; ++i) {
        centers[i] = counts[i] > 0 ? sums[i] / counts[i] : dataMin + (i + 0.5) * binWidth;
    }
    // compute weights: w = count^alpha (sub-linear density weighting)
    const weights = new Float64Array(H);
    for (let i = 0; i < H; ++i) {
        weights[i] = counts[i] > 0 ? Math.pow(counts[i], alpha) : 0;
    }
    // prefix sums for O(1) range cost queries
    //   cost(a,b) = sum_wxx - sum_wx^2 / sum_w
    //   centroid(a,b) = sum_wx / sum_w
    const prefW = new Float64Array(H + 1);
    const prefWX = new Float64Array(H + 1);
    const prefWXX = new Float64Array(H + 1);
    for (let i = 0; i < H; ++i) {
        prefW[i + 1] = prefW[i] + weights[i];
        prefWX[i + 1] = prefWX[i] + weights[i] * centers[i];
        prefWXX[i + 1] = prefWXX[i] + weights[i] * centers[i] * centers[i];
    }
    const rangeCost = (a, b) => {
        const w = prefW[b + 1] - prefW[a];
        if (w <= 0)
            return 0;
        const wx = prefWX[b + 1] - prefWX[a];
        const wxx = prefWXX[b + 1] - prefWXX[a];
        return wxx - (wx * wx) / w;
    };
    const rangeMean = (a, b) => {
        const w = prefW[b + 1] - prefW[a];
        if (w <= 0)
            return (centers[a] + centers[b]) * 0.5;
        return (prefWX[b + 1] - prefWX[a]) / w;
    };
    // clamp k to number of non-empty bins
    const nonEmpty = counts.reduce((n, c) => n + (c > 0 ? 1 : 0), 0);
    const effectiveK = Math.min(k, nonEmpty);
    // DP: dp[m][j] = min weighted SSE of quantizing bins 0..j into m centroids
    // Use two rows to save memory (only need previous row)
    const INF = 1e30;
    let dpPrev = new Float64Array(H).fill(INF);
    let dpCurr = new Float64Array(H).fill(INF);
    const splitTable = new Array(effectiveK + 1);
    // base case: m = 1
    const split1 = new Int32Array(H);
    for (let j = 0; j < H; ++j) {
        dpPrev[j] = rangeCost(0, j);
        split1[j] = -1;
    }
    splitTable[1] = split1;
    // fill DP for m = 2..effectiveK
    for (let m = 2; m <= effectiveK; ++m) {
        dpCurr.fill(INF);
        const splitM = new Int32Array(H);
        for (let j = m - 1; j < H; ++j) {
            let bestCost = INF;
            let bestS = m - 2;
            for (let s = m - 2; s < j; ++s) {
                const cost = dpPrev[s] + rangeCost(s + 1, j);
                if (cost < bestCost) {
                    bestCost = cost;
                    bestS = s;
                }
            }
            dpCurr[j] = bestCost;
            splitM[j] = bestS;
        }
        splitTable[m] = splitM;
        // swap rows
        const tmp = dpPrev;
        dpPrev = dpCurr;
        dpCurr = tmp;
    }
    // backtrack to find centroid values
    const centroidValues = new Float32Array(effectiveK);
    let j = H - 1;
    for (let m = effectiveK; m >= 1; --m) {
        const s = m > 1 ? splitTable[m][j] : -1;
        centroidValues[m - 1] = rangeMean(s + 1, j);
        j = s;
    }
    // sort centroids (should already be sorted, but ensure)
    centroidValues.sort();
    // pad to k entries if effectiveK < k (duplicate last centroid)
    const finalCentroids = new Float32Array(k);
    finalCentroids.set(centroidValues);
    for (let i = effectiveK; i < k; ++i) {
        finalCentroids[i] = centroidValues[effectiveK - 1];
    }
    // assign each data point to nearest centroid via binary search
    const labels = new Uint8Array(N);
    for (let i = 0; i < N; ++i) {
        const v = data[i];
        // binary search for nearest centroid
        let lo = 0;
        let hi = k - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            // compare against midpoint between centroids mid and mid+1
            if (v < (finalCentroids[mid] + finalCentroids[mid + 1]) * 0.5) {
                hi = mid;
            }
            else {
                lo = mid + 1;
            }
        }
        labels[i] = lo;
    }
    // build output in the same format as cluster1d
    const centroids = new DataTable([new Column('data', finalCentroids)]);
    const result = new DataTable(dataTable.columnNames.map(name => new Column(name, new Uint8Array(numRows))));
    for (let i = 0; i < numColumns; ++i) {
        result.getColumn(i).data.set(labels.subarray(i * numRows, (i + 1) * numRows));
    }
    return { centroids, labels: result };
};

const shNames$1 = new Array(45).fill('').map((_, i) => `f_rest_${i}`);
const calcMinMax = (dataTable, columnNames, indices) => {
    const columns = columnNames.map(name => dataTable.getColumnByName(name));
    const minMax = columnNames.map(() => [Infinity, -Infinity]);
    const row = {};
    for (let i = 0; i < indices.length; ++i) {
        const r = dataTable.getRow(indices[i], row, columns);
        for (let j = 0; j < columnNames.length; ++j) {
            const value = r[columnNames[j]];
            if (value < minMax[j][0])
                minMax[j][0] = value;
            if (value > minMax[j][1])
                minMax[j][1] = value;
        }
    }
    return minMax;
};
const logTransform = (value) => {
    return Math.sign(value) * Math.log(Math.abs(value) + 1);
};
// no packing
const identity = (index, width) => {
    return index;
};
const generateIndices = (dataTable) => {
    const result = new Uint32Array(dataTable.numRows);
    for (let i = 0; i < result.length; ++i) {
        result[i] = i;
    }
    sortMortonOrder(dataTable, result);
    return result;
};
let webPCodec;
/**
 * Writes Gaussian splat data to the PlayCanvas SOG format.
 *
 * SOG (Splat Optimized Graphics) uses WebP lossless compression and k-means
 * clustering to achieve high compression ratios. Data is stored in textures
 * for efficient GPU loading.
 *
 * @param options - Options including filename, data, and compression settings.
 * @param fs - File system for writing output files.
 * @ignore
 */
const writeSog = async (options, fs) => {
    const { filename: outputFilename, dataTable, iterations, createDevice } = options;
    // initialize output stream - use ZipFileSystem for bundled output
    const zipFs = new ZipFileSystem(await fs.createWriter(outputFilename)) ;
    const outputFs = zipFs || fs;
    const indices = options.indices || generateIndices(dataTable);
    const numRows = indices.length;
    const width = Math.ceil(Math.sqrt(numRows) / 4) * 4;
    const height = Math.ceil(numRows / width / 4) * 4;
    const channels = 4;
    // the layout function determines how the data is packed into the output texture.
    const layout = identity; // rectChunks;
    const writeWebp = async (filename, data, w = width, h = height) => {
        const pathname = zipFs ? filename : resolve(dirname(outputFilename), filename);
        logger.log(`writing '${pathname}'...`);
        // construct the encoder on first use
        if (!webPCodec) {
            webPCodec = await WebPCodec.create();
        }
        const webp = await webPCodec.encodeLosslessRGBA(data, w, h);
        await writeFile$1(outputFs, pathname, webp);
    };
    const writeTableData = (filename, dataTable, w = width, h = height) => {
        const data = new Uint8Array(w * h * channels);
        const columns = dataTable.columns.map(c => c.data);
        const numColumns = columns.length;
        for (let i = 0; i < indices.length; ++i) {
            const idx = indices[i];
            const ti = layout(i);
            data[ti * channels + 0] = columns[0][idx];
            data[ti * channels + 1] = numColumns > 1 ? columns[1][idx] : 0;
            data[ti * channels + 2] = numColumns > 2 ? columns[2][idx] : 0;
            data[ti * channels + 3] = numColumns > 3 ? columns[3][idx] : 255;
        }
        return writeWebp(filename, data, w, h);
    };
    const row = {};
    const writeMeans = async () => {
        const meansL = new Uint8Array(width * height * channels);
        const meansU = new Uint8Array(width * height * channels);
        const meansNames = ['x', 'y', 'z'];
        const meansMinMax = calcMinMax(dataTable, meansNames, indices).map(v => v.map(logTransform));
        const meansColumns = meansNames.map(name => dataTable.getColumnByName(name));
        for (let i = 0; i < indices.length; ++i) {
            dataTable.getRow(indices[i], row, meansColumns);
            const x = 65535 * (logTransform(row.x) - meansMinMax[0][0]) / (meansMinMax[0][1] - meansMinMax[0][0]);
            const y = 65535 * (logTransform(row.y) - meansMinMax[1][0]) / (meansMinMax[1][1] - meansMinMax[1][0]);
            const z = 65535 * (logTransform(row.z) - meansMinMax[2][0]) / (meansMinMax[2][1] - meansMinMax[2][0]);
            const ti = layout(i);
            meansL[ti * 4] = x & 0xff;
            meansL[ti * 4 + 1] = y & 0xff;
            meansL[ti * 4 + 2] = z & 0xff;
            meansL[ti * 4 + 3] = 0xff;
            meansU[ti * 4] = (x >> 8) & 0xff;
            meansU[ti * 4 + 1] = (y >> 8) & 0xff;
            meansU[ti * 4 + 2] = (z >> 8) & 0xff;
            meansU[ti * 4 + 3] = 0xff;
        }
        await writeWebp('means_l.webp', meansL);
        await writeWebp('means_u.webp', meansU);
        return {
            mins: meansMinMax.map(v => v[0]),
            maxs: meansMinMax.map(v => v[1])
        };
    };
    const writeQuaternions = async () => {
        const quats = new Uint8Array(width * height * channels);
        const quatNames = ['rot_0', 'rot_1', 'rot_2', 'rot_3'];
        const quatColumns = quatNames.map(name => dataTable.getColumnByName(name));
        const q = [0, 0, 0, 0];
        for (let i = 0; i < indices.length; ++i) {
            dataTable.getRow(indices[i], row, quatColumns);
            q[0] = row.rot_0;
            q[1] = row.rot_1;
            q[2] = row.rot_2;
            q[3] = row.rot_3;
            const l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
            // normalize
            q.forEach((v, j) => {
                q[j] = v / l;
            });
            // find max component
            const maxComp = q.reduce((v, _, i) => (Math.abs(q[i]) > Math.abs(q[v]) ? i : v), 0);
            // invert if max component is negative
            if (q[maxComp] < 0) {
                q.forEach((v, j) => {
                    q[j] *= -1;
                });
            }
            // scale by sqrt(2) to fit in [-1, 1] range
            const sqrt2 = Math.sqrt(2);
            q.forEach((v, j) => {
                q[j] *= sqrt2;
            });
            const idx = [
                [1, 2, 3],
                [0, 2, 3],
                [0, 1, 3],
                [0, 1, 2]
            ][maxComp];
            const ti = layout(i);
            quats[ti * 4] = 255 * (q[idx[0]] * 0.5 + 0.5);
            quats[ti * 4 + 1] = 255 * (q[idx[1]] * 0.5 + 0.5);
            quats[ti * 4 + 2] = 255 * (q[idx[2]] * 0.5 + 0.5);
            quats[ti * 4 + 3] = 252 + maxComp;
        }
        await writeWebp('quats.webp', quats);
    };
    const writeScales = async () => {
        const scaleData = quantize1d(new DataTable(['scale_0', 'scale_1', 'scale_2'].map(name => dataTable.getColumnByName(name))));
        await writeTableData('scales.webp', scaleData.labels);
        return Array.from(scaleData.centroids.getColumn(0).data);
    };
    const writeColors = async () => {
        const colorData = quantize1d(new DataTable(['f_dc_0', 'f_dc_1', 'f_dc_2'].map(name => dataTable.getColumnByName(name))));
        // generate and store sigmoid(opacity) [0..1]
        const opacity = dataTable.getColumnByName('opacity').data;
        const opacityData = new Uint8Array(opacity.length);
        for (let i = 0; i < numRows; ++i) {
            opacityData[i] = Math.max(0, Math.min(255, sigmoid(opacity[i]) * 255));
        }
        colorData.labels.addColumn(new Column('opacity', opacityData));
        await writeTableData('sh0.webp', colorData.labels);
        return Array.from(colorData.centroids.getColumn(0).data);
    };
    const writeSH = async (shBands) => {
        const shCoeffs = [0, 3, 8, 15][shBands];
        const shColumnNames = shNames$1.slice(0, shCoeffs * 3);
        const shColumns = shColumnNames.map(name => dataTable.getColumnByName(name));
        // create a table with just spherical harmonics data
        // NOTE: this step should also copy the rows referenced in indices, but that's a
        // lot of duplicate data when it's unneeded (which is currently never). so that
        // means k-means is clustering the full dataset, instead of the rows referenced in
        // indices.
        const shDataTable = new DataTable(shColumns);
        const paletteSize = Math.min(64, 2 ** Math.floor(Math.log2(indices.length / 1024))) * 1024;
        // Create GPU device lazily — only needed for SH k-means clustering
        const gpuDevice = createDevice ? await createDevice() : undefined;
        logger.progress.step('Compressing spherical harmonics');
        const { centroids, labels } = await kmeans(shDataTable, paletteSize, iterations, gpuDevice);
        logger.progress.step('Quantizing spherical harmonics');
        const codebook = quantize1d(centroids);
        // write centroids
        const centroidsBuf = new Uint8Array(64 * shCoeffs * Math.ceil(centroids.numRows / 64) * channels);
        const centroidsRow = {};
        for (let i = 0; i < centroids.numRows; ++i) {
            codebook.labels.getRow(i, centroidsRow);
            for (let j = 0; j < shCoeffs; ++j) {
                const x = centroidsRow[shColumnNames[shCoeffs * 0 + j]];
                const y = centroidsRow[shColumnNames[shCoeffs * 1 + j]];
                const z = centroidsRow[shColumnNames[shCoeffs * 2 + j]];
                centroidsBuf[i * shCoeffs * 4 + j * 4 + 0] = x;
                centroidsBuf[i * shCoeffs * 4 + j * 4 + 1] = y;
                centroidsBuf[i * shCoeffs * 4 + j * 4 + 2] = z;
                centroidsBuf[i * shCoeffs * 4 + j * 4 + 3] = 0xff;
            }
        }
        await writeWebp('shN_centroids.webp', centroidsBuf, 64 * shCoeffs, Math.ceil(centroids.numRows / 64));
        // write labels
        const labelsBuf = new Uint8Array(width * height * channels);
        for (let i = 0; i < indices.length; ++i) {
            const label = labels[indices[i]];
            const ti = layout(i);
            labelsBuf[ti * 4 + 0] = 0xff & label;
            labelsBuf[ti * 4 + 1] = 0xff & (label >> 8);
            labelsBuf[ti * 4 + 2] = 0;
            labelsBuf[ti * 4 + 3] = 0xff;
        }
        await writeWebp('shN_labels.webp', labelsBuf);
        return {
            count: paletteSize,
            bands: shBands,
            codebook: Array.from(codebook.centroids.getColumn(0).data),
            files: [
                'shN_centroids.webp',
                'shN_labels.webp'
            ]
        };
    };
    const shBands = { '9': 1, '24': 2, '-1': 3 }[shNames$1.findIndex(v => !dataTable.hasColumn(v))] ?? 0;
    const totalSteps = shBands > 0 ? 8 : 6;
    // convert and write attributes
    logger.progress.begin(totalSteps);
    logger.progress.step('Generating morton order');
    // indices already generated above
    logger.progress.step('Writing positions');
    const meansMinMax = await writeMeans();
    logger.progress.step('Writing quaternions');
    await writeQuaternions();
    logger.progress.step('Compressing scales');
    const scalesCodebook = await writeScales();
    logger.progress.step('Compressing colors');
    const colorsCodebook = await writeColors();
    let shN = null;
    if (shBands > 0) {
        shN = await writeSH(shBands);
    }
    logger.progress.step('Finalizing');
    // construct meta.json
    const meta = {
        version: 2,
        asset: {
            generator: `splat-transform v${version}`
        },
        count: numRows,
        means: {
            mins: meansMinMax.mins,
            maxs: meansMinMax.maxs,
            files: [
                'means_l.webp',
                'means_u.webp'
            ]
        },
        scales: {
            codebook: scalesCodebook,
            files: ['scales.webp']
        },
        quats: {
            files: ['quats.webp']
        },
        sh0: {
            codebook: colorsCodebook,
            files: ['sh0.webp']
        },
        ...(shN ? { shN } : {})
    };
    const metaJson = (new TextEncoder()).encode(JSON.stringify(meta));
    const metaFilename = zipFs ? 'meta.json' : outputFilename;
    await writeFile$1(outputFs, metaFilename, metaJson);
    // Close zip archive if bundling
    if (zipFs) {
        await zipFs.close();
    }
};

new Array(45).fill('').map((_, i) => `f_rest_${i}`);

const workerContext = globalThis;
let cachedGpuDevice = null;
let cachedBackbuffer = null;
WebPCodec.wasmUrl ??= new URL('./static/lib/webp/webp.wasm', import.meta.url).toString();
const createGpuDevice = async () => {
    if (cachedGpuDevice) {
        return cachedGpuDevice;
    }
    if (!navigator.gpu) {
        throw new Error('WebGPU is not available in this worker');
    }
    const canvas = new OffscreenCanvas(1024, 512);
    const graphicsDevice = new WebgpuGraphicsDevice(canvas, {
        antialias: false,
        depth: false,
        stencil: false
    });
    await graphicsDevice.createDevice();
    cachedBackbuffer = new Texture(graphicsDevice, {
        width: 1024,
        height: 512,
        name: 'SogComputeBackbufferWorker',
        mipmaps: false,
        format: PIXELFORMAT_BGRA8
    });
    // @ts-ignore - externalBackbuffer is internal
    graphicsDevice.externalBackbuffer = cachedBackbuffer;
    cachedGpuDevice = graphicsDevice;
    return graphicsDevice;
};
const createProgressLogger = (token) => ({
    log: () => { },
    warn: console.warn,
    error: console.error,
    debug: () => { },
    output: () => { },
    onProgress: (node) => {
        if (node.depth === 0) {
            if (node.step > 0) {
                workerContext.postMessage({
                    type: 'progress',
                    token,
                    text: `Step ${node.step} of ${node.totalSteps}: ${node.stepName ?? ''}`,
                    progress: 0
                });
            }
        }
        else {
            workerContext.postMessage({
                type: 'progress',
                token,
                text: `Step ${node.parent?.step ?? node.step} of ${node.parent?.totalSteps ?? node.totalSteps}: ${node.parent?.stepName ?? node.stepName ?? ''}`,
                progress: 100 * node.step / node.totalSteps
            });
        }
    }
});
const serialize = async (message) => {
    const dataTable = new DataTable(message.columns.map(column => new Column(column.name, column.data)));
    const fs = new MemoryFileSystem();
    logger.setLogger(createProgressLogger(message.token));
    await writeSog({
        filename: message.filename,
        dataTable,
        iterations: message.iterations,
        createDevice: createGpuDevice
    }, fs);
    const data = fs.results.get(message.filename);
    if (!data) {
        throw new Error(`Failed to serialize '${message.filename}' as SOG`);
    }
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    workerContext.postMessage({
        type: 'done',
        token: message.token,
        data: copy.buffer
    }, [copy.buffer]);
};
workerContext.addEventListener('message', async (event) => {
    const message = event.data;
    if (message.type !== 'serialize') {
        return;
    }
    try {
        await serialize(message);
    }
    catch (error) {
        workerContext.postMessage({
            type: 'error',
            token: message.token,
            error: `${error?.message ?? error}`
        });
    }
});
workerContext.postMessage({ type: 'ready' });
//# sourceMappingURL=sog-serialize.worker-impl-CGP_Qhtk.js.map
