import { getDiff } from '../src/utils/diff';

describe('getDiff Utility', () => {
    it('should return empty object for identical objects', () => {
        const oldObj = { name: 'Alice', age: 30 };
        const newObj = { name: 'Alice', age: 30 };
        const diff = getDiff(oldObj, newObj);
        expect(diff).toEqual({});
    });

    it('should detect added properties', () => {
        const oldObj = { name: 'Alice' };
        const newObj = { name: 'Alice', age: 30 };
        const diff = getDiff(oldObj, newObj);
        expect(diff).toEqual({ age: { old: undefined, new: 30 } });
    });

    it('should detect updated properties', () => {
        const oldObj = { name: 'Alice', age: 30 };
        const newObj = { name: 'Alice', age: 31 };
        const diff = getDiff(oldObj, newObj);
        expect(diff).toEqual({ age: { old: 30, new: 31 } });
    });

    it('should track deleted properties as undefined in new', () => {
        const oldObj = { name: 'Alice', age: 30 };
        const newObj = { name: 'Alice' };
        const diff = getDiff(oldObj, newObj);
        expect(diff).toEqual({ age: { old: 30, new: undefined } });
    });

    it('should detect deep changes', () => {
        const oldObj = { profile: { role: 'admin', level: 1 } };
        const newObj = { profile: { role: 'admin', level: 2 } };
        const diff = getDiff(oldObj, newObj);
        expect(diff).toEqual({ profile: { level: { old: 1, new: 2 } } });
    });
});
