import { describe, it, expect, beforeEach } from '@jest/globals';
import { LineEditor, EscapeSequenceParser, HistoryNavigator } from '../src/sqlTerminalProvider';
import { QueryHistory } from '../src/queryHistory';

// However, LineEditor etc are not exported; to test them we will reimport via require and access them from module (TS transpiles). 
// If direct imports fail, use a dynamic require in tests.

describe('LineEditor', () => {
    it('inserts characters and moves cursor', () => {
        const le = new LineEditor();
        le.insertChar('a');
        le.insertChar('b');
        le.insertChar('c');
        expect(le.getLine()).toBe('abc');
        expect(le.getCursorPos()).toBe(3);

        le.moveCursor(-1);
        expect(le.getCursorPos()).toBe(2);
        le.backspace();
        expect(le.getLine()).toBe('ac');
        expect(le.getCursorPos()).toBe(1);
    });

    it('delete at cursor works', () => {
        const le = new LineEditor();
        le.setLine('hello world');
        le.moveCursorToStart();
        le.moveCursor(6); // position at 'w'
        expect(le.getCursorPos()).toBe(6);
        le.deleteChar();
        expect(le.getLine()).toBe('hello orld');
    });

    it('word movement works', () => {
        const le = new LineEditor();
        le.setLine('select * from users');
        le.moveCursorToStart();
        le.moveWordForward();
        expect(le.getCursorPos()).toBe(6); // after 'select'
        le.moveWordForward();
        expect(le.getCursorPos()).toBe(8); // after '*'
        le.moveWordBackward();
        expect(le.getCursorPos()).toBe(6);
    });

    it('enforces max line length', () => {
        const le = new LineEditor();
        const huge = 'x'.repeat(10005);
        let inserted = true;
        for (const ch of huge) {
            const ok = le.insertChar(ch);
            if (!ok) { inserted = false; break; }
        }
        expect(inserted).toBe(false);
        expect(le.getLine().length).toBeLessThanOrEqual(10000);
    });
});

describe('EscapeSequenceParser', () => {
    it('parses arrow keys', () => {
        const p = new EscapeSequenceParser();
        expect(p.addChar('\x1b')).toBeNull();
        expect(p.addChar('[A')).toBe('\x1b[A');
    });
});

describe('HistoryNavigator', () => {
    it('navigates history and restores partial', () => {
        const ctx: any = { globalState: { get: () => [], update: () => Promise.resolve() } };
        const qh = new QueryHistory(ctx as any);

        // add queries
        return qh.addQuery('select 1', 'c1', 'conn').then(() =>
            qh.addQuery('select 2', 'c1', 'conn').then(async () => {
                const hn = new HistoryNavigator(qh, 'c1');
                const first = hn.navigateUp('partial');
                expect(first).toBe('select 2');
                const second = hn.navigateUp('partial');
                expect(second).toBe('select 1');
                const down = hn.navigateDown();
                expect(down).toBe('select 2');
                const restored = hn.navigateDown();
                expect(restored).toBe('partial');
            })
        );
    });
});
