const { fn } = require('jest-mock');

// Minimal EventEmitter implementation compatible with the VS Code API surface
// used in tests: new vscode.EventEmitter<T>(); emitter.event(listener) -> Disposable;
// emitter.fire(payload) -> calls listeners. dispose() clears listeners.
class EventEmitter {
  constructor() {
    this._listeners = [];
    // Bind as an arrow so the function remains bound when assigned (like the real API)
    this.event = (listener) => {
      this._listeners.push(listener);
      return {
        dispose: () => {
          const idx = this._listeners.indexOf(listener);
          if (idx !== -1) this._listeners.splice(idx, 1);
        }
      };
    };
  }

  // Call all listeners with the provided value
  fire(value) {
    for (const l of Array.from(this._listeners)) {
      try {
        l(value);
      } catch (e) {
        // swallow errors to mimic the real emitter behavior in tests
      }
    }
  }

  // Remove all listeners
  dispose() {
    this._listeners = [];
  }
}

module.exports = {
  window: {
  showWarningMessage: fn(() => Promise.resolve(undefined)),
  showInformationMessage: fn(() => Promise.resolve(undefined)),
  showErrorMessage: fn(() => Promise.resolve(undefined)),
    createTreeView: fn(() => ({ dispose: () => {} })),
  },
  commands: {
    getCommands: fn(async () => []),
    executeCommand: fn(async () => {})
  },
  extensions: {
    getExtension: fn(() => ({ activate: async () => {}, isActive: false, exports: {} }))
  },
  Uri: {
    joinPath: (...args) => args.join('/'),
    file: (s) => s
  },
  ViewColumn: { One: 1 },
  // Expose EventEmitter so tests and runtime code can instantiate and use it.
  EventEmitter
};
