const { CompositeDisposable, Range } = require("lumine");
const SequentialNumberView = require("./view");

/**
 * Sequence Creator Package
 * Generates sequential numbers or letters at multiple cursor positions.
 * Supports custom start values, steps, radixes, padding, and alphabetic sequences.
 */
module.exports = {
  /**
   * Activates the package and sets up the input view.
   */
  activate() {
    this.view = new SequentialNumberView();
    this.view.on("blur", () => this.close());
    this.view.on("change", (value) => this.simulate(value));
    this.view.on("done", (value) => this.exec(value));
    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(
      // On the workspace: the application menu dispatches at whatever holds
      // focus, so an editor scope left every one of these menu items dead
      // whenever focus was elsewhere. Each handler resolves the editor itself.
      lumine.commands.add("lumine-workspace", {
        "sequence-creator:open": {
          description: "Insert a counted sequence across the cursors.",
          didDispatch: () => this.open(),
        },
      }),
      lumine.commands.add(this.view.element, {
        "core:confirm": () => this.view.handleDone(),
        "core:cancel": () => this.close(),
      }),
      lumine.config.observe("sequence-creator.simulateCursorLength", (value) => {
        this.simulateCursorLength = value;
      }),
      lumine.config.observe("sequence-creator.alphabetSequence", (value) => {
        this.alphabetSequence = value.split("");
      }),
    );
  },

  deactivate() {
    this.subscriptions.dispose();
    return this.view.destroy();
  },

  open() {
    if (!this.view.isVisible()) {
      this.editor = this.getEditor();
      this.view.show();
      return this.simulate(this.view.getText());
    }
  },

  close() {
    this.view.hide();
    this.editor = null;
  },

  simulate(value) {
    let simulateList = [];
    try {
      const result = this.parseValue(value);
      if (result !== null) {
        const cursorCount = this.getCursorCount();
        const previewLength = Math.min(cursorCount, this.simulateCursorLength);
        simulateList = __range__(0, previewLength - 1, true).map((index) => {
          return this.calculateValue(index, result);
        });
        if (cursorCount > previewLength) {
          simulateList.push("...");
        }
      }
    } catch (err) {
      return this.view.setSimulatorError(err.message);
    }
    return this.view.setSimulatorText(simulateList);
  },

  exec(value) {
    const editor = this.getEditor();
    let result;
    try {
      result = this.parseValue(value);
      if (result !== null) {
        __range__(0, this.simulateCursorLength - 1, true).forEach((index) => {
          this.calculateValue(index, result);
        });
      }
    } catch (err) {
      return this.view.setSimulatorError(err.message);
    }

    if (result !== null && !editor) {
      return this.view.setSimulatorError("no active editor");
    }

    if (result !== null) {
      editor.transact(() => {
        const { length } = editor.cursors;
        return (() => {
          const result1 = [];
          for (
            let index = 0, end = length, asc = 0 <= end;
            asc ? index < end : index > end;
            asc ? index++ : index--
          ) {
            let cursors = editor.cursors.slice();
            cursors = cursors.map((cursor) => cursor.selection.getBufferRange());
            if (result.reorder) {
              cursors = cursors.sort(
                (a, b) => a.start.row - b.start.row || a.start.column - b.start.column,
              );
            }
            const range = cursors[index];
            result1.push(
              editor.setTextInBufferRange(
                new Range(range.start, range.end),
                this.calculateValue(index, result),
              ),
            );
          }
          return result1;
        })();
      });
    }

    return this.close();
  },

  getEditor() {
    return this.editor || lumine.textEditors.getActiveTextEditor();
  },

  getCursorCount() {
    const editor = this.getEditor();
    return editor ? editor.cursors.length : 1;
  },

  parseValue(input) {
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

    // validate alphabetic start chars
    if (alpha) {
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
    index = parseInt(index / repeat);
    let value;
    switch (operator) {
      case "+":
        value = start + index * step;
        break;
      case "-":
        value = start - index * step;
        break;
    }
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
    index = parseInt(index / repeat);
    let count;
    switch (operator) {
      case "+":
        count = index * +step;
        break;
      case "-":
        count = index * -step;
        break;
    }
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
    let last = str.slice(-1);
    if (last === "") {
      upperCase = upperCase ? true : false;
    } else if (last === last.toUpperCase()) {
      upperCase = true;
    } else {
      upperCase = false;
    }
    let index = this.alphabetSequence.indexOf(last.toLowerCase());
    let n = Math.floor((index + count) / this.alphabetSequence.length);
    let next = this.alphabetSequence[(index + count) % this.alphabetSequence.length];
    if (!next) {
      return "";
    }
    if (upperCase) {
      next = next.toUpperCase();
    }
    let s = `${str.slice(0, str.length - 1)}${next}`;
    if (n > 0) {
      if (s.length === 1 && index === this.alphabetSequence.length - 1) {
        s = (upperCase ? "A" : "a") + s;
      } else {
        s = `${this.alphaSequence(s.slice(0, s.length - 1), n, upperCase)}${next}`;
      }
    }
    return s;
  },

  /**
   * Adds left padding to a string value.
   * @param {string} str - The string to pad
   * @param {number} digit - The target length
   * @param {string} padString - The character to use for padding
   * @returns {string} The padded string
   */
  leftPadding(str, digit, padString) {
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
