
/**
 * Deeply compares two objects and returns a structured diff.
 * Returns an object where keys are the field names and values are { old, new }.
 */
export const getDiff = (oldData: any, newData: any): any => {
    const diff: any = {};

    // Get all unique keys from both objects
    const keys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);

    for (const key of keys) {
        // Skip internal Mongoose fields
        if (key.startsWith('_') || key === '__v') continue;

        const oldValue = oldData?.[key];
        const newValue = newData?.[key];

        // If both are objects (not null, not arrays, not Dates), recurse
        if (
            oldValue && newValue &&
            typeof oldValue === 'object' && typeof newValue === 'object' &&
            !Array.isArray(oldValue) && !Array.isArray(newValue) &&
            !(oldValue instanceof Date) && !(newValue instanceof Date)
        ) {
            const nestedDiff = getDiff(oldValue, newValue);
            if (Object.keys(nestedDiff).length > 0) {
                diff[key] = nestedDiff;
            }
            continue;
        }

        // Compare values
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            diff[key] = {
                old: oldValue,
                new: newValue
            };
        }
    }

    return diff;
};
