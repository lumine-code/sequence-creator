const { CompositeDisposable } = require("lumine");
const { INPUT_LIMIT, ITEM_LIMIT, OUTPUT_LIMIT, SELECTION_LIMIT, checkLength } = require("./budget");

// The view builds a modal panel and a mini text editor. Keep that work out of
// package activation: the package is activated at startup, while the view is
// only needed after the user invokes sequence-creator:open.
let SequentialNumberView;

/**
 * Sequence Creator Package
 * Generates sequential numbers or letters at multiple cursor positions.
 * Supports custom start values, steps, radixes, padding, and alphabetic sequences.
 */
module.exports = {
  provideBackgroundTips() {
    return {
      packageName: "sequence-creator",
      tips: [
        "You can fill your cursors with a numbered or alphabetic sequence using {{ 'sequence-creator:open' | keystroke }}",
      ],
    };
  },

  /**
   * Activates the package and sets up the input view.
   */
  activate() {
    const generation = (this.activationGeneration ?? 0) + 1;
    this.activationGeneration = generation;
    this.view = null;
    this.views = new Map();
    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(
      lumine.commands.add("lumine-text-editor:not([mini]):not([readonly])", {
        "sequence-creator:open": {
          description: "Insert a counted sequence across the cursors.",
          // A command can be dispatched synchronously while PackageManager is
          // still measuring activation. Let the bootstrap finish before
          // constructing the modal and its mini editor.
          didDispatch: (event) => {
            const editor = lumine.workspace.getTextEditorForElement(event?.target, {
              includeMini: false,
            });
            queueMicrotask(() => {
              if (this.activationGeneration === generation && editor && !editor.isDestroyed()) {
                this.open(editor);
              }
            });
          },
        },
      }),
      lumine.config.observe("sequence-creator.simulateCursorLength", (value) => {
        this.simulateCursorLength = value;
      }),
      lumine.config.observe("sequence-creator.alphabetSequence", (value) => {
        this.alphabetError = null;
        if (value.length > INPUT_LIMIT) {
          this.alphabetError = "Configured alphabet exceeds its 4 Ki UTF-16 unit limit.";
          this.alphabetSequence = [];
        } else this.alphabetSequence = value.split("");
      }),
    );
  },

  deactivate() {
    this.activationGeneration = (this.activationGeneration ?? 0) + 1;
    this.subscriptions?.dispose();
    const destroyed = [];
    for (const record of this.views?.values() ?? []) {
      record.lease.dispose();
      destroyed.push(record.view.destroy());
    }
    this.views?.clear();
    this.view = null;
    this.editor = null;
    return Promise.all(destroyed);
  },

  ensureView(window = lumine.workspace.getMainWindow()) {
    let record = this.views.get(window);
    if (record) return record.view;
    if (!SequentialNumberView) SequentialNumberView = require("./view");
    const view = new SequentialNumberView(window);
    record = { view, window, editor: null };
    record.lease = new CompositeDisposable(
      view.on("blur", () => this.close(record)),
      view.on("change", (value) => this.simulate(value, record)),
      view.on("done", (value) => this.exec(value, record)),
      window.onWillDestroy(() => {
        this.views.delete(window);
        record.lease.dispose();
        view.destroy();
      }),
    );
    this.views.set(window, record);
    if (window.isMain()) this.view = view;
    return view;
  },

  open(editor = lumine.workspace.getActiveTextEditor()) {
    if (!editor) return;
    const window =
      lumine.workspace.getWindowForElement(editor.getElement()) ?? lumine.workspace.getMainWindow();
    const view = this.ensureView(window);
    if (view.isVisible()) return;
    const record = this.views.get(window);
    record.editor = editor;
    if (window.isMain()) this.editor = editor;
    view.show();
    const input = view.getText();
    if (input !== null) return this.simulate(input, record);
  },

  close(flow = this) {
    if (!flow.view) return;
    flow.view.hide();
    flow.editor = null;
    if (flow.window?.isMain()) this.editor = null;
  },

  simulate(value, flow = this) {
    let simulateList = [];
    try {
      const result = this.parseValue(value);
      if (result !== null) {
        const cursorCount = this.getCursorCount(flow);
        const previewLength = Math.min(cursorCount, this.simulateCursorLength);
        simulateList = __range__(0, previewLength - 1, true).map((index) => {
          const value = this.calculateValue(index, result);
          return value.length > 120
            ? `${value.slice(0, 120)}… (${value.length} characters)`
            : value;
        });
        if (cursorCount > previewLength) {
          simulateList.push("...");
        }
      }
    } catch (err) {
      return flow.view.setSimulatorError(err.message);
    }
    return flow.view.setSimulatorText(simulateList);
  },

  exec(value, flow = this) {
    const editor = this.getEditor(flow);
    let preparationLease;
    const fail = (error) => {
      preparationLease?.dispose();
      return flow.view.setSimulatorError(error.message);
    };
    try {
      const result = this.parseValue(value);
      if (result === null) return this.close(flow);
      if (!editor || editor.isDestroyed() || editor.isReadOnly())
        throw new Error("no writable editor");
      if (editor.cursors.length > SELECTION_LIMIT)
        throw new RangeError("Sequence exceeds 100,000 selections. Nothing was inserted.");
      const buffer = editor.getBuffer(),
        revision = buffer.getTextRevision();
      const inputBuffer = flow.view.textEditor.getModel().getBuffer(),
        inputRevision = inputBuffer.getTextRevision();
      const generation = this.activationGeneration;
      const selections = editor.getSelections();
      const ranges = selections.map((selection) => selection.getBufferRange());
      const targets = result.reorder
        ? ranges.slice().sort((a, b) => a.start.compare(b.start))
        : ranges;
      let selectionChanged = false;
      const changed = () => {
        selectionChanged = true;
      };
      preparationLease = new CompositeDisposable(
        editor.onDidChangeSelectionRange(changed),
        editor.onDidAddSelection(changed),
        editor.onDidRemoveSelection(changed),
      );
      const edits = [];
      let index = 0,
        units = 0;
      const current = () =>
        this.activationGeneration === generation &&
        flow.view.isVisible() &&
        flow.editor === editor &&
        !editor.isDestroyed() &&
        !editor.isReadOnly() &&
        buffer.getTextRevision() === revision &&
        inputBuffer.getTextRevision() === inputRevision &&
        !selectionChanged;
      const prepare = () => {
        if (!current())
          throw new Error("Sequence target or input changed. Nothing was inserted; confirm again.");
        const deadline = performance.now() + 4;
        do {
          const text = this.calculateValue(index, result);
          checkLength(text.length, ITEM_LIMIT, "Generated item");
          units += text.length;
          checkLength(units, OUTPUT_LIMIT, "Complete generated sequence");
          edits.push({ range: targets[index], text });
          index++;
        } while (index < targets.length && performance.now() < deadline);
        if (index < targets.length) return false;
        if (!current()) throw new Error("Sequence target changed. Nothing was inserted.");
        preparationLease.dispose();
        buffer.setTextInIndependentRanges(edits, { expectedRevision: revision });
        this.close(flow);
        return true;
      };
      if (prepare()) return;
      return (async () => {
        try {
          do {
            await new Promise((resolve) => setImmediate(resolve));
          } while (!prepare());
        } catch (error) {
          fail(error);
        }
      })();
    } catch (error) {
      return fail(error);
    }
  },

  getEditor(flow = this) {
    return flow.editor;
  },

  getCursorCount(flow = this) {
    const editor = this.getEditor(flow);
    return editor ? editor.cursors.length : 1;
  },

  parseValue(input) {
    checkLength(input.length, INPUT_LIMIT, "Sequence input");
    if (this.alphabetError) throw new Error(this.alphabetError);
    // analyze input
    const match = input.match(
      /^(?:((?:-|\+)?\d+)|([a-zA-Z]+))([+-])?((?:-|\+)?\d+)?((?:#)\d+)?(?::(.*)>(\d+))?(?:\^(\d+))?([!@]+)?$/,
    );

    // exit if doesn't match
    if (match === null) {
      return null;
    }

    // find start value and determine what type it is
    let start, alpha;
    if (match[1]) {
      start = parseInt(match[1], 10);
      alpha = false;
    } else if (match[2]) {
      start = match[2];
      alpha = true;
    } else {
      return null;
    }

    // determine operator if given
    let operator = match[3] ? match[3] : "+";

    // determine step if given
    let step = match[4] ? parseInt(match[4], 10) : 1;

    // determine radix if given
    let radix = match[5] ? parseInt(match[5].slice(1), 10) : 10;
    if (!alpha && (radix < 2 || radix > 36)) {
      throw new Error(`radix must be between 2 and 36 (got ${radix})`);
    }

    // determine left padding if given
    let digit = match[7] ? parseInt(match[7], 10) : false;
    if (!digit && match[1] && match[1].charAt(0) === "0") {
      digit = match[1].length;
    }
    let padString = match[6] ? match[6] : alpha ? " " : "0";
    if (digit && padString === "") {
      throw new Error("padding string must not be empty");
    }

    // determine index repeat
    let repeat = match[8] ? parseInt(match[8], 10) : 1;
    if (repeat < 1) {
      throw new Error(`repeat must be >= 1 (got ${repeat})`);
    }

    for (const [name, value] of Object.entries({
      step,
      radix,
      repeat,
      ...(digit ? { digit } : {}),
      ...(!alpha ? { start } : {}),
    })) {
      if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer`);
    }

    // validate alphabetic start chars
    if (alpha) {
      checkLength(start.length, 256, "Alphabetic start");
      const seq = this.alphabetSequence;
      for (const ch of start) {
        if (seq.indexOf(ch.toLowerCase()) === -1) {
          throw new Error(`'${ch}' is not in the configured alphabet sequence`);
        }
      }
    }

    // determine flags
    let reorder, possign;
    if (match[9]) {
      reorder = match[9].includes("!");
      possign = match[9].includes("@");
    } else {
      reorder = false;
      possign = false;
    }

    return {
      start,
      alpha,
      operator,
      step,
      radix,
      padString,
      digit,
      repeat,
      reorder,
      possign,
    };
  },

  calculateValue(index, args) {
    if (args.alpha) {
      return this.calculateAlphaValue(index, args);
    } else {
      return this.calculateNumberValue(index, args);
    }
  },

  /**
   * Calculates a sequential numeric value.
   * @param {number} index - The cursor index
   * @param {Object} args - Configuration options
   * @returns {string} The formatted numeric value
   */
  calculateNumberValue(index, { start, operator, step, radix, padString, digit, repeat, possign }) {
    index = Math.trunc(index / repeat);
    let value;
    switch (operator) {
      case "+":
        value = start + index * step;
        break;
      case "-":
        value = start - index * step;
        break;
    }
    if (!Number.isSafeInteger(value))
      throw new RangeError(
        "Generated number is outside the safe integer range. Nothing was inserted.",
      );
    let sign = possign && value >= 0 ? "+" : "";
    value = sign + value.toString(radix);
    if (digit) {
      value = this.leftPadding(value, digit, padString);
    }
    return value;
  },

  /**
   * Calculates a sequential alphabetic value.
   * @param {number} index - The cursor index
   * @param {Object} args - Configuration options
   * @returns {string} The formatted alphabetic value
   */
  calculateAlphaValue(index, { start, operator, step, padString, digit, repeat }) {
    index = Math.trunc(index / repeat);
    let count;
    switch (operator) {
      case "+":
        count = index * +step;
        break;
      case "-":
        count = index * -step;
        break;
    }
    if (!Number.isSafeInteger(count))
      throw new RangeError(
        "Alphabetic offset is outside the safe integer range. Nothing was inserted.",
      );
    let value = this.alphaSequence(start, count);
    if (digit) {
      value = this.leftPadding(value, digit, padString);
    }
    return value;
  },

  /**
   * Generates an alphabetic sequence value.
   * @param {string} str - The starting string
   * @param {number} count - The offset to apply
   * @param {boolean} upperCase - Whether to use uppercase
   * @returns {string} The resulting sequence value
   */
  alphaSequence(str, count, upperCase) {
    if (count === 0) {
      return str;
    }
    const alphabet = this.alphabetSequence;
    if (alphabet.length === 0) return "";
    const base = BigInt(alphabet.length);
    // Bijective ranks make the ordinary borrow aa -> z explicit. BigInt keeps
    // long alphabetic starts exact without recursive carry or rounding.
    let rank = 0n;
    for (const character of str) {
      rank = rank * base + BigInt(alphabet.indexOf(character.toLowerCase()) + 1);
    }
    rank += BigInt(count);
    // Below the first value, cycle through the configured single characters.
    if (rank <= 0n) rank = ((((rank - 1n) % base) + base) % base) + 1n;

    const first = str.charAt(0);
    const leadingUpperCase = first ? first === first.toUpperCase() : Boolean(upperCase);
    if (base === 1n) {
      const length = Number(rank);
      checkLength(length, ITEM_LIMIT, "Generated item");
      const leading = leadingUpperCase ? alphabet[0].toUpperCase() : alphabet[0];
      checkLength(
        Math.max(0, length - str.length) * leading.length + Math.min(str.length, length),
        ITEM_LIMIT,
        "Generated item",
      );
      return (
        leading.repeat(Math.max(0, length - str.length)) + str.slice(-Math.min(str.length, length))
      );
    }
    let column = str.length - 1;
    let value = "";
    while (rank > 0n) {
      const original = str[column--];
      let next = alphabet[Number((rank - 1n) % base)];
      if (original ? original === original.toUpperCase() : leadingUpperCase) {
        next = next.toUpperCase();
      }
      value = next + value;
      rank = (rank - 1n) / base;
    }
    return value;
  },

  /**
   * Adds left padding to a string value.
   * @param {string} str - The string to pad
   * @param {number} digit - The target length
   * @param {string} padString - The character to use for padding
   * @returns {string} The padded string
   */
  leftPadding(str, digit, padString) {
    checkLength(digit, ITEM_LIMIT, "Padded item");
    let firstLetter = str.charAt(0);
    let fixCount = firstLetter === "+" || firstLetter === "-" ? 1 : 0;
    return (
      (fixCount ? firstLetter : "") + str.slice(fixCount).padStart(digit - fixCount, padString)
    );
  },
};

function __range__(left, right, inclusive) {
  let range = [];
  let ascending = left < right;
  let end = !inclusive ? right : ascending ? right + 1 : right - 1;
  for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
    range.push(i);
  }
  return range;
}
