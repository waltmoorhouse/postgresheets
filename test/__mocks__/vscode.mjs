// ESM mock of the 'vscode' module for tests (exports named properties)

// Minimal EventEmitter implementation compatible with the VS Code API surface
export class EventEmitter {
  constructor() {
    this._listeners = [];
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

  fire(value) {
    for (const l of Array.from(this._listeners)) {
      try {
        l(value);
      } catch (e) {
        // swallow
      }
    }
  }

  dispose() {
    this._listeners = [];
  }
}

export const window = {
  showWarningMessage: async () => undefined,
  showInformationMessage: async () => undefined,
  createTreeView: () => ({ dispose: () => {} })
};
window.showErrorMessage = async () => undefined;

export const commands = {
  getCommands: async () => [],
  executeCommand: async () => {}
};

export const extensions = {
  getExtension: () => ({ activate: async () => {}, isActive: false, exports: {} })
};

export const Uri = {
  joinPath: (...args) => args.join('/'),
  file: (s) => s
};

export const ViewColumn = { One: 1 };

export default {
  window,
  commands,
  extensions,
  Uri,
  ViewColumn,
  EventEmitter
};
