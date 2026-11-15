describe("sequence-creator", () => {
  let workspaceElement, editor, editorElement, mainModule, view;

  beforeEach(async () => {
    workspaceElement = lumine.views.getView(lumine.workspace);
    jasmine.attachToDOM(workspaceElement);
    editor = await lumine.workspace.open();
    editorElement = lumine.views.getView(editor);

    // The package defers activation until one of its commands is dispatched.
    const activation = lumine.packages.activatePackage("sequence-creator");
    lumine.commands.dispatch(editorElement, "sequence-creator:open");
    mainModule = (await activation).mainModule;
    spyOn(mainModule, "exec").and.callThrough();
    view = mainModule.view;
  });

  async function confirmSequence() {
    const calls = mainModule.exec.calls.count();
    lumine.commands.dispatch(view.element, "core:confirm");
    expect(mainModule.exec.calls.count()).toBe(calls + 1);
    await mainModule.exec.calls.mostRecent().returnValue;
  }

  async function runSequence(input) {
    view.setText(input);
    await confirmSequence();
  }

  function placeCursors() {
    editor.setText("x\nx\nx\n");
    editor.setCursorBufferPosition([0, 1]);
    editor.addCursorAtBufferPosition([1, 1]);
    editor.addCursorAtBufferPosition([2, 1]);
  }

  it("opens the modal panel on sequence-creator:open", () => {
    expect(view.isVisible()).toBe(true);
    expect(view.element.classList.contains("select-list")).toBe(false);
    expect(view.inputDialog.getContentElement()).toBe(view.preview);
  });

  it("preserves its draft and resumes the preview after reopening", () => {
    view.setText("01+2");
    view.hide();
    mainModule.open(editor);
    expect(view.getText()).toBe("01+2");
    expect(view.simulator.textContent).toBe("01");
    expect(view.preview.hidden).toBe(false);
  });

  it("closes the modal panel on core:cancel", () => {
    lumine.commands.dispatch(view.element, "core:cancel");
    expect(view.isVisible()).toBe(false);
  });

  it("rejects an oversized draft before reading while leaving it editable", async () => {
    view.setText("x".repeat(4097));
    const model = view.textEditor.getModel();
    const read = spyOn(model, "getText").and.throwError("Oversized input read");
    view.handleEdit();
    view.handleDone();
    expect(read).not.toHaveBeenCalled();
    expect(view.isVisible()).toBe(true);
    expect(model.getBuffer().getLength()).toBe(4097);
    await view.inputDialog.updateComponent();
    expect(view.element.textContent).toContain("4096");
    read.and.callThrough();
    view.setText("1");
    view.handleDone();
    expect(editor.getText()).toBe("1");
  });

  it("checks padding expansion before padStart allocation", () => {
    const pad = spyOn(String.prototype, "padStart").and.throwError("Unbounded padding");
    expect(() => mainModule.leftPadding("1", Number.MAX_SAFE_INTEGER, "0")).toThrowError(
      /Padded item/,
    );
    expect(pad).not.toHaveBeenCalled();
  });

  it("prepares every value before editing when a late unary item exceeds the limit", async () => {
    jasmine.useRealClock();
    lumine.config.set("sequence-creator.alphabetSequence", "x");
    const original = Array(10).fill("old").join("\n");
    editor.setText(original);
    editor.setSelectedBufferRanges(
      Array.from({ length: 10 }, (_, row) => [
        [row, 0],
        [row, 3],
      ]),
    );
    const ranges = editor.getSelectedBufferRanges();
    view.setText("x+150000");
    await mainModule.exec("x+150000");
    expect(editor.getText()).toBe(original);
    expect(editor.getSelectedBufferRanges()).toEqual(ranges);
    expect(view.isVisible()).toBe(true);
    expect(view.inputDialog.getStatus().message).toContain("Generated item");
  });

  it("rejects aggregate output and cancels prepared work when the target changes", async () => {
    jasmine.useRealClock();
    const original = Array(10).fill("old").join("\n");
    editor.setText(original);
    editor.setSelectedBufferRanges(
      Array.from({ length: 10 }, (_, row) => [
        [row, 0],
        [row, 3],
      ]),
    );
    view.setText("1");
    const text = "x".repeat(1024 * 1024);
    const calculate = spyOn(mainModule, "calculateValue").and.returnValue(text);
    await mainModule.exec("1");
    expect(editor.getText()).toBe(original);
    expect(view.inputDialog.getStatus().message).toContain("Complete generated sequence");
    calculate.and.callThrough();
    let now = 0;
    spyOn(performance, "now").and.callFake(() => (now += 5));
    const pending = mainModule.exec("1");
    editor.setCursorBufferPosition([0, 0]);
    await pending;
    expect(editor.getText()).toBe(original);
    expect(view.inputDialog.getStatus().message).toContain("changed");
  });

  describe("sequence insertion", () => {
    it("inserts an incrementing number sequence at each cursor", async () => {
      placeCursors();
      await runSequence("1");
      expect(editor.getText()).toBe("x1\nx2\nx3\n");
      expect(view.isVisible()).toBe(false);
    });

    it("supports a custom step", async () => {
      placeCursors();
      await runSequence("10+2");
      expect(editor.getText()).toBe("x10\nx12\nx14\n");
    });

    it("supports decrementing sequences", async () => {
      placeCursors();
      await runSequence("5-2");
      expect(editor.getText()).toBe("x5\nx3\nx1\n");
    });

    it("supports padding", async () => {
      placeCursors();
      await runSequence("27+3:0>4");
      expect(editor.getText()).toBe("x0027\nx0030\nx0033\n");
    });

    it("supports a custom radix", async () => {
      placeCursors();
      await runSequence("10+1#16");
      expect(editor.getText()).toBe("xa\nxb\nxc\n");
    });

    it("waits for confirmation when sequence preparation yields before applying edits", async () => {
      jasmine.useRealClock();
      placeCursors();
      let now = 0;
      const clock = spyOn(performance, "now").and.callFake(() => (now += 5));
      const completion = runSequence("10+1#16");
      expect(typeof mainModule.exec.calls.mostRecent().returnValue?.then).toBe("function");
      expect(editor.getText()).toBe("x\nx\nx\n");
      expect(view.isVisible()).toBe(true);
      clock.and.callThrough();
      await completion;
      expect(editor.getText()).toBe("xa\nxb\nxc\n");
      expect(view.isVisible()).toBe(false);
    });

    it("supports repeat counts", async () => {
      placeCursors();
      await runSequence("1^2");
      expect(editor.getText()).toBe("x1\nx1\nx2\n");
    });

    it("inserts alphabetic sequences", async () => {
      placeCursors();
      await runSequence("a+2");
      expect(editor.getText()).toBe("xa\nxc\nxe\n");
    });

    it("replaces selected text with the sequence values", async () => {
      editor.setText("foo\nbar\nbaz\n");
      editor.setSelectedBufferRanges([
        [
          [0, 0],
          [0, 3],
        ],
        [
          [1, 0],
          [1, 3],
        ],
        [
          [2, 0],
          [2, 3],
        ],
      ]);
      await runSequence("7");
      expect(editor.getText()).toBe("7\n8\n9\n");
    });
  });

  describe("preview simulation", () => {
    it("hides a stale preview immediately for an oversized edit and restores it after correction", async () => {
      placeCursors();
      view.setText("1");
      advanceClock(20);
      expect(view.simulator.textContent).toBe("1, 2, 3");
      const model = view.textEditor.getModel();
      const read = spyOn(model, "getText").and.throwError("Oversized input read");
      view.setText("x".repeat(4097));
      expect(view.preview.hidden).toBe(true);
      await view.inputDialog.updateComponent();
      expect(view.element.textContent).toContain("4096");
      expect(read).not.toHaveBeenCalled();
      read.and.callThrough();
      view.setText("5");
      advanceClock(20);
      expect(view.preview.hidden).toBe(false);
      expect(view.simulator.textContent).toBe("5, 6, 7");
    });

    it("shows a preview of the sequence while typing", () => {
      placeCursors();
      view.setText("1+1");
      advanceClock(20);
      expect(view.simulator.textContent).toBe("1, 2, 3");
    });

    it("caps the preview at the configured length", () => {
      lumine.config.set("sequence-creator.simulateCursorLength", 2);
      placeCursors();
      view.setText("1");
      advanceClock(20);
      expect(view.simulator.textContent).toBe("1, 2, ...");
    });

    it("reports invalid input as an error", () => {
      view.setText("1+1#99");
      advanceClock(20);
      expect(view.inputDialog.getStatus().type).toBe("error");
      expect(view.preview.hidden).toBe(true);
    });
  });

  describe("repeat bucket preview and insertion", () => {
    for (const [input, expected] of [
      ["1^2", ["1", "1", "2", "2", "3"]],
      ["a^2", ["a", "a", "b", "b", "c"]],
      ["1^10000000", ["1", "1", "1"]],
      ["a^10000000", ["a", "a", "a"]],
      ["X-2^10000000", ["X", "X", "X", "X"]],
    ]) {
      it(`previews, confirms and undoes the repeated values for ${input}`, async () => {
        if (input.startsWith("X")) lumine.config.set("sequence-creator.alphabetSequence", "xyz");
        const original = Array(expected.length).fill("old").join("\n");
        editor.setText(original);
        editor.setSelectedBufferRanges(
          Array.from({ length: expected.length }, (_, row) => [
            [row, 0],
            [row, 3],
          ]),
        );
        editor.getBuffer().clearUndoStack();
        view.setText(input);
        advanceClock(20);
        expect(view.simulator.textContent).toBe(expected.join(", "));
        await confirmSequence();
        expect(editor.getText()).toBe(expected.join("\n"));
        expect(view.isVisible()).toBe(false);
        editor.undo();
        expect(editor.getText()).toBe(original);
      });
    }
  });

  describe("configured alphabet rollover", () => {
    beforeEach(() => {
      editor.setText("\n\n");
      editor.setCursorBufferPosition([0, 0]);
      editor.addCursorAtBufferPosition([1, 0]);
      editor.addCursorAtBufferPosition([2, 0]);
    });

    it("uses the configured first letter when a lowercase sequence rolls over", async () => {
      lumine.config.set("sequence-creator.alphabetSequence", "xyz");
      await runSequence("z+");
      expect(editor.getText()).toBe("z\nxx\nxy");
      expect(view.isVisible()).toBe(false);
    });

    it("preserves uppercase through the configured rollover", async () => {
      lumine.config.set("sequence-creator.alphabetSequence", "xyz");
      await runSequence("Z+");
      expect(editor.getText()).toBe("Z\nXX\nXY");
    });

    it("uses the configured first letter for a carry across multiple positions", async () => {
      lumine.config.set("sequence-creator.alphabetSequence", "xyz");
      await runSequence("zz+");
      expect(editor.getText()).toBe("zz\nxxx\nxxy");
    });

    it("preserves the configured order instead of selecting the Latin alphabet", async () => {
      lumine.config.set("sequence-creator.alphabetSequence", "cba");
      await runSequence("a+");
      expect(editor.getText()).toBe("a\ncc\ncb");
    });

    it("shows the same configured rollover in the preview and insertion", async () => {
      lumine.config.set("sequence-creator.alphabetSequence", "xyz");
      view.setText("z+");
      advanceClock(20);
      expect(view.simulator.textContent).toBe("z, xx, xy");
      await confirmSequence();
      expect(editor.getText()).toBe("z\nxx\nxy");
    });

    it("preserves rollover with the default alphabet", async () => {
      await runSequence("z+");
      expect(editor.getText()).toBe("z\naa\nab");
    });

    it("keeps an empty configured alphabet invalid for character sequences", async () => {
      lumine.config.set("sequence-creator.alphabetSequence", "");
      await runSequence("z+");
      expect(editor.getText()).toBe("\n\n");
      expect(view.inputDialog.getStatus().type).toBe("error");
      expect(view.inputDialog.getStatus().message).toContain("not in the configured alphabet");
      expect(view.isVisible()).toBe(true);
    });
  });

  describe("alphabetic decrement and wrapping", () => {
    function selectEntries(count) {
      editor.setText(Array(count).fill("old").join("\n"));
      editor.setSelectedBufferRanges(
        Array.from({ length: count }, (_, row) => [
          [row, 0],
          [row, 3],
        ]),
      );
    }

    it("borrows from a longer alphabetic value before continuing downward", async () => {
      selectEntries(3);
      await runSequence("aa-");
      expect(editor.getText()).toBe("aa\nz\ny");
    });

    it("wraps below the first default character", async () => {
      selectEntries(4);
      await runSequence("b-");
      expect(editor.getText()).toBe("b\na\nz\ny");
    });

    it("wraps through the configured alphabet in its configured order", async () => {
      lumine.config.set("sequence-creator.alphabetSequence", "xyz");
      selectEntries(4);
      await runSequence("x-");
      expect(editor.getText()).toBe("x\nz\ny\nx");
    });

    it("retains uppercase while borrowing", async () => {
      selectEntries(3);
      await runSequence("AA-");
      expect(editor.getText()).toBe("AA\nZ\nY");
    });

    it("preserves custom steps and repeat counts while wrapping", async () => {
      lumine.config.set("sequence-creator.alphabetSequence", "xyz");
      selectEntries(6);
      await runSequence("X-2^2");
      expect(editor.getText()).toBe("X\nX\nY\nY\nZ\nZ");
    });

    it("supports a negative increment step through the wrap boundary", async () => {
      selectEntries(4);
      await runSequence("a+-1");
      expect(editor.getText()).toBe("a\nz\ny\nx");
    });

    it("retains the aligned character case when a mixed-case value borrows", async () => {
      selectEntries(3);
      await runSequence("aC-3");
      expect(editor.getText()).toBe("aC\nZ\nW");
    });

    it("uses wrapping in the preview and replaces selections in one undo step", async () => {
      lumine.config.set("sequence-creator.alphabetSequence", "xyz");
      selectEntries(4);
      editor.getBuffer().clearUndoStack();
      view.setText("x-");
      advanceClock(20);
      expect(view.simulator.textContent).toBe("x, z, y, x");
      await confirmSequence();
      expect(editor.getText()).toBe("x\nz\ny\nx");
      editor.undo();
      expect(editor.getText()).toBe("old\nold\nold\nold");
    });

    it("supports positive steps with a single-character alphabet", async () => {
      lumine.config.set("sequence-creator.alphabetSequence", "x");
      selectEntries(3);
      await runSequence("x+2");
      expect(editor.getText()).toBe("x\nxxx\nxxxxx");
    });

    it("wraps a single-character alphabet without changing uppercase", async () => {
      lumine.config.set("sequence-creator.alphabetSequence", "x");
      selectEntries(3);
      await runSequence("X-");
      expect(editor.getText()).toBe("X\nX\nX");
    });

    it("reports an unrepresentable unary output without changing selections", async () => {
      lumine.config.set("sequence-creator.alphabetSequence", "x");
      selectEntries(3);
      view.setText(`x+1${"0".repeat(100)}`);
      advanceClock(20);
      expect(view.inputDialog.getStatus().type).toBe("error");
      await confirmSequence();
      expect(editor.getText()).toBe("old\nold\nold");
      expect(view.isVisible()).toBe(true);
    });
  });
});
