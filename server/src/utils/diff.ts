import _ from 'lodash';

/**
 * Normalizes objects before comparison to avoid false positives:
 * 1. Converts Mongoose ObjectIds & Dates to string formats
 * 2. Removes internal keys like _id, __v, and virtual id
 * 3. Normalizes empty strings '', [], {}, and undefined to null.
 * 4. Normalizes Date strings from ISO format to strictly YYYY-MM-DD
 */
const stripAndNormalize = (obj: any): any => {
    if (obj === null || obj === undefined || obj === '') return null;
    if (typeof obj !== 'object') return obj;

    // Convert to pure JSON to normalize Dates and ObjectIDs into strings
    const jsonObj = JSON.parse(JSON.stringify(obj));

    const clean = (item: any): any => {
        if (Array.isArray(item)) {
            const cleanedArr = item.map(clean).filter((v: any) => v !== null);
            return cleanedArr.length > 0 ? cleanedArr : null;
        } else if (item && typeof item === 'object') {
            const result: any = {};
            let hasProps = false;
            for (const key in item) {
                // Ignore internal Mongoose keys and virtual 'id'
                if (!key.startsWith('_') && key !== 'id') {
                    let cleanedVal = clean(item[key]);

                    // Normalize Dates: Mongoose sends T00:00:00.000Z, Frontend sends strictly "YYYY-MM-DD"
                    if (typeof cleanedVal === 'string' && cleanedVal.endsWith('T00:00:00.000Z')) {
                        cleanedVal = cleanedVal.split('T')[0];
                    }

                    // Special Wizard Ignore: If 'amount' is 0, treat it as empty for templates
                    if (key === 'amount' && cleanedVal === 0) continue;

                    if (cleanedVal !== null && cleanedVal !== '' && cleanedVal !== undefined) {
                        result[key] = cleanedVal;
                        hasProps = true;
                    }
                }
            }

            // Check if the resulting object is just a default wizard template (e.g., only has a platform but no link)
            if (hasProps) {
                const keys = Object.keys(result);
                const templateKeys = ['platform', 'documentType', 'component', 'type'];
                const isOnlyTemplateKeys = keys.every(k => templateKeys.includes(k));
                if (isOnlyTemplateKeys) return null;
            }

            return hasProps ? result : null;
        }
        
        // Normalize primitive empty values and root level Dates
        if (item === '' || item === undefined) return null;
        if (typeof item === 'string' && item.endsWith('T00:00:00.000Z')) {
            return item.split('T')[0];
        }
        return item;
    };

    return clean(jsonObj);
};

/**
 * Deeply compares two objects and returns a structured diff.
 * Returns an object where keys are the field names and values are { old, new } or nested object.
 */
export const getDiff = (oldData: any, newData: any): any => {
    const diff: any = {};
    const oldNorm = stripAndNormalize(oldData) || {};
    const newNorm = stripAndNormalize(newData) || {};

    const keys = new Set([...Object.keys(oldNorm), ...Object.keys(newNorm)]);

    for (const key of keys) {
        if (['createdAt', 'updatedAt', 'userId', 'employeeId', 'employmentStatus'].includes(key) && key === 'employeeId') continue; // keep employmentStatus diffs
        if (['createdAt', 'updatedAt'].includes(key)) continue;

        const oldValue = oldNorm[key];
        const newValue = newNorm[key];

        // Treat identical objects/arrays as perfectly equal
        if (_.isEqual(oldValue, newValue)) {
            continue;
        }

        // If both are nested objects (not arrays), dive deeper to get specific fields
        if (
            oldValue !== null && newValue !== null &&
            typeof oldValue === 'object' && typeof newValue === 'object' &&
            !Array.isArray(oldValue) && !Array.isArray(newValue)
        ) {
            const nestedDiff = getDiff(oldValue, newValue);
            if (Object.keys(nestedDiff).length > 0) {
                diff[key] = nestedDiff;
            }
            continue;
        }

        // For primitives and arrays, strictly record the before and after
        diff[key] = {
            old: oldValue,
            new: newValue
        };
    }

    return diff;
};
