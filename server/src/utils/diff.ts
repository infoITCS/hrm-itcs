
export interface NormalizeOptions {
    internalKeys?: string[] | Set<string>;
    templateKeys?: string[];
    filterZeroAmount?: boolean;
    maxDepth?: number;
}

const DEFAULT_INTERNAL_KEYS = new Set(['_id', '__v', 'id', 'createdAt', 'updatedAt', 'employeeId', 'userId']);
const DEFAULT_TEMPLATE_KEYS = ['platform', 'documentType', 'component', 'type'];
const MAX_RECURSION_DEPTH = 10;

/**
 * Robust deep-equal helper that handles Dates, RegExps, Maps, Sets, and circular references.
 * Key order independent for plain objects.
 */
export const deepEqual = (a: any, b: any, seen = new WeakMap<any, any>()): boolean => {
    if (a === b) return true;

    // Handle primitive types and nulls
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
        return a === b;
    }

    // Handle Date objects
    if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime();
    }

    // Handle RegExp objects
    if (a instanceof RegExp && b instanceof RegExp) {
        return a.toString() === b.toString();
    }

    // Cycle detection
    if (seen.has(a)) {
        return seen.get(a) === b;
    }
    seen.set(a, b);

    // Handle Arrays
    if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) return false;
        return a.every((v, i) => deepEqual(v, b[i], seen));
    }

    // Handle Maps
    if (a instanceof Map && b instanceof Map) {
        if (a.size !== b.size) return false;
        for (const [key, val] of a) {
            if (!b.has(key) || !deepEqual(val, b.get(key), seen)) return false;
        }
        return true;
    }

    // Handle Sets
    if (a instanceof Set && b instanceof Set) {
        if (a.size !== b.size) return false;
        const bArray = Array.from(b);
        for (const valA of a) {
            // For each element valA, we need a fresh seen-state for the trial matches in bArray
            // to avoid cross-contamination from failed attempts.
            if (!bArray.some(valB => deepEqual(valA, valB, new WeakMap(seen as any)))) return false;
        }
        return true;
    }

    // Handle Plain Objects
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;

    return keysA.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k], seen));
};

/**
 * Normalizes objects before comparison to avoid false positives.
 * Configurable via options for domain-specific rules.
 */
export const stripAndNormalize = (obj: any, options: NormalizeOptions = {}): any => {
    const internalKeys = options.internalKeys ? new Set(options.internalKeys) : DEFAULT_INTERNAL_KEYS;
    const templateKeys = options.templateKeys || DEFAULT_TEMPLATE_KEYS;
    const filterZeroAmount = options.filterZeroAmount ?? true;

    const clean = (item: any, depth = 0): any => {
        if (depth > (options.maxDepth || MAX_RECURSION_DEPTH)) return null;
        if (item === null || item === undefined || item === '') return null;

        // Handle Dates (normalize to YYYY-MM-DD if they are T00:00:00.000Z)
        if (item instanceof Date || (typeof item === 'string' && /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(item))) {
            const dateStr = item instanceof Date ? item.toISOString() : item;
            return dateStr.split('T')[0];
        }

        // Handle primitives
        if (typeof item !== 'object') {
            if (item === 0 && filterZeroAmount) return 0;
            return item;
        }

        if (Array.isArray(item)) {
            const cleanedArr = item.map(v => clean(v, depth + 1)).filter(v => v !== null);
            return cleanedArr.length > 0 ? cleanedArr : null;
        }

        const result: any = {};
        let hasProps = false;

        for (const key in item) {
            // Filter internal keys and pattern-based internal keys (like __v)
            if (internalKeys.has(key) || key.startsWith('__')) continue;

            let cleanedVal = clean(item[key], depth + 1);

            // Domain-specific: Filter zero amount if requested
            if (key === 'amount' && cleanedVal === 0 && filterZeroAmount) continue;

            if (cleanedVal !== null && cleanedVal !== '' && cleanedVal !== undefined) {
                result[key] = cleanedVal;
                hasProps = true;
            }
        }

        // Check if the resulting object is just a metadata template
        if (hasProps) {
            const keys = Object.keys(result);
            const isOnlyTemplateKeys = keys.every(k => templateKeys.includes(k));
            if (isOnlyTemplateKeys) return null;
        }

        return hasProps ? result : null;
    };

    // Use a clean JSON-like representation to start (handles Mongoose toJSON automatically)
    // but we still recurse for deep cleaning.
    const initialData = obj && typeof obj.toJSON === 'function' ? obj.toJSON() : obj;
    return clean(initialData);
};

/**
 * Deeply compares two objects and returns a structured diff.
 * Returns an object where keys are the field names and values are { old, new } or nested object.
 */
export const getDiff = (
    oldData: any, 
    newData: any, 
    options: NormalizeOptions = {}, 
    depth = 0, 
    seen = new WeakSet()
): any => {
    if (depth > (options.maxDepth || MAX_RECURSION_DEPTH)) return {};
    
    const diff: any = {};
    const oldNorm = depth === 0 ? stripAndNormalize(oldData, options) || {} : oldData;
    const newNorm = depth === 0 ? stripAndNormalize(newData, options) || {} : newData;

    // Detect cycles in normalized data symmetrically
    const isOldObj = typeof oldNorm === 'object' && oldNorm !== null;
    const isNewObj = typeof newNorm === 'object' && newNorm !== null;
    if (isOldObj || isNewObj) {
        if ((isOldObj && seen.has(oldNorm)) || (isNewObj && seen.has(newNorm))) return {};
        if (isOldObj) seen.add(oldNorm);
        if (isNewObj) seen.add(newNorm);
    }

    const keys = new Set([...Object.keys(oldNorm), ...Object.keys(newNorm)]);

    for (const key of keys) {
        const oldValue = oldNorm[key];
        const newValue = newNorm[key];

        // Treat identical objects/arrays as perfectly equal
        if (deepEqual(oldValue, newValue)) {
            continue;
        }

        // If both are nested objects (not arrays), dive deeper
        if (
            oldValue !== null && newValue !== null &&
            typeof oldValue === 'object' && typeof newValue === 'object' &&
            !Array.isArray(oldValue) && !Array.isArray(newValue)
        ) {
            const nestedDiff = getDiff(oldValue, newValue, options, depth + 1, seen);
            if (Object.keys(nestedDiff).length > 0) {
                diff[key] = nestedDiff;
            }
            continue;
        }

        // For primitives and arrays, record the before and after
        diff[key] = {
            old: oldValue,
            new: newValue
        };
    }

    return diff;
};
