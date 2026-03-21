import { EventHandler } from 'playcanvas';

type FunctionCallback = (...args: any[]) => any;

class Events extends EventHandler {
    functions = new Map<string, FunctionCallback>();

    // declare an editor function
    function(name: string, fn: FunctionCallback) {
        if (this.functions.has(name)) {
            throw new Error(`error: function ${name} already exists`);
        }
        this.functions.set(name, fn);
    }

    // invoke an editor function
    invoke(name: string, ...args: any[]) {
        const fn = this.functions.get(name);
        if (!fn) {
            console.log(`error: function not found '${name}'`);
            return;
        }
        return fn(...args);
    }

    // invoke an editor function that may not be registered yet
    invokeOptional(name: string, ...args: any[]) {
        const fn = this.functions.get(name);
        return fn ? fn(...args) : undefined;
    }

    // invoke an editor function that must exist
    invokeRequired(name: string, ...args: any[]) {
        const fn = this.functions.get(name);
        if (!fn) {
            throw new Error(`error: function not found '${name}'`);
        }
        return fn(...args);
    }
}

export { Events };
