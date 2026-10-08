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
    view = mainModule.view;
  });

  function runSequence(input) {
    view.setText(input);
    lumine.commands.dispatch(view.element, "core:confirm");
  }

  function placeCursors() {
    editor.setText("x\nx\nx\n");
    editor.setCursorBufferPosition([0, 1]);
    editor.addCursorAtBufferPosition([1, 1]);
    editor.addCursorAtBufferPosition([2, 1]);
  }

  it("opens the modal panel on sequence-creator:open", () => {
    expect(view.isVisible()).toBe(true);
  });

  it("closes the modal panel on core:cancel", () => {
    lumine.commands.dispatch(view.element, "core:cancel");
    expect(view.isVisible()).toBe(false);
  });

  describe("sequence insertion", () => {
    it("inserts an incrementing number sequence at each cursor", () => {
      placeCursors();
      runSequence("1");
      expect(editor.getText()).toBe("x1\nx2\nx3\n");
      expect(view.isVisible()).toBe(false);
    });

    it("supports a custom step", () => {
      placeCursors();
      runSequence("10+2");
      expect(editor.getText()).toBe("x10\nx12\nx14\n");
    });

    it("supports decrementing sequences", () => {
      placeCursors();
      runSequence("5-2");
      expect(editor.getText()).toBe("x5\nx3\nx1\n");
    });

    it("supports padding", () => {
      placeCursors();
      runSequence("27+3:0>4");
      expect(editor.getText()).toBe("x0027\nx0030\nx0033\n");
    });

    it("supports a custom radix", () => {
      placeCursors();
      runSequence("10+1#16");
      expect(editor.getText()).toBe("xa\nxb\nxc\n");
    });

    it("supports repeat counts", () => {
      placeCursors();
      runSequence("1^2");
      expect(editor.getText()).toBe("x1\nx1\nx2\n");
    });

    it("inserts alphabetic sequences", () => {
      placeCursors();
      runSequence("a+2");
      expect(editor.getText()).toBe("xa\nxc\nxe\n");
    });

    it("replaces selected text with the sequence values", () => {
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
      runSequence("7");
      expect(editor.getText()).toBe("7\n8\n9\n");
    });
  });

  describe("preview simulation", () => {
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
      expect(view.simulator.classList.contains("text-error")).toBe(true);
      expect(view.simulator.textContent).toContain("Error:");
    });
  });

  describe("configured alphabet rollover", () => {
    beforeEach(() => {
      editor.setText("\n\n");
      editor.setCursorBufferPosition([0, 0]);
      editor.addCursorAtBufferPosition([1, 0]);
      editor.addCursorAtBufferPosition([2, 0]);
    });

    it("uses the configured first letter when a lowercase sequence rolls over", () => {
      lumine.config.set("sequence-creator.alphabetSequence", "xyz");
      runSequence("z+");
      expect(editor.getText()).toBe("z\nxx\nxy");
      expect(view.isVisible()).toBe(false);
    });

    it("preserves uppercase through the configured rollover", () => {
      lumine.config.set("sequence-creator.alphabetSequence", "xyz");
      runSequence("Z+");
      expect(editor.getText()).toBe("Z\nXX\nXY");
    });

    it("uses the configured first letter for a carry across multiple positions", () => {
      lumine.config.set("sequence-creator.alphabetSequence", "xyz");
      runSequence("zz+");
      expect(editor.getText()).toBe("zz\nxxx\nxxy");
    });

    it("preserves the configured order instead of selecting the Latin alphabet", () => {
      lumine.config.set("sequence-creator.alphabetSequence", "cba");
      runSequence("a+");
      expect(editor.getText()).toBe("a\ncc\ncb");
    });

    it("shows the same configured rollover in the preview and insertion", () => {
      lumine.config.set("sequence-creator.alphabetSequence", "xyz");
      view.setText("z+");
      advanceClock(20);
      expect(view.simulator.textContent).toBe("z, xx, xy");
      lumine.commands.dispatch(view.element, "core:confirm");
      expect(editor.getText()).toBe("z\nxx\nxy");
    });

    it("preserves rollover with the default alphabet", () => {
      runSequence("z+");
      expect(editor.getText()).toBe("z\naa\nab");
    });

    it("keeps an empty configured alphabet invalid for character sequences", () => {
      lumine.config.set("sequence-creator.alphabetSequence", "");
      runSequence("z+");
      expect(editor.getText()).toBe("\n\n");
      expect(view.simulator.classList.contains("text-error")).toBe(true);
      expect(view.simulator.textContent).toContain("not in the configured alphabet");
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

    it("borrows from a longer alphabetic value before continuing downward", () => {
      selectEntries(3);
      runSequence("aa-");
      expect(editor.getText()).toBe("aa\nz\ny");
    });

    it("wraps below the first default character", () => {
      selectEntries(4);
      runSequence("b-");
      expect(editor.getText()).toBe("b\na\nz\ny");
    });

    it("wraps through the configured alphabet in its configured order", () => {
      lumine.config.set("sequence-creator.alphabetSequence", "xyz");
      selectEntries(4);
      runSequence("x-");
      expect(editor.getText()).toBe("x\nz\ny\nx");
    });

    it("retains uppercase while borrowing", () => {
      selectEntries(3);
      runSequence("AA-");
      expect(editor.getText()).toBe("AA\nZ\nY");
    });

    it("preserves custom steps and repeat counts while wrapping", () => {
      lumine.config.set("sequence-creator.alphabetSequence", "xyz");
      selectEntries(6);
      runSequence("X-2^2");
      expect(editor.getText()).toBe("X\nX\nY\nY\nZ\nZ");
    });

    it("supports a negative increment step through the wrap boundary", () => {
      selectEntries(4);
      runSequence("a+-1");
      expect(editor.getText()).toBe("a\nz\ny\nx");
    });

    it("retains the aligned character case when a mixed-case value borrows", () => {
      selectEntries(3);
      runSequence("aC-3");
      expect(editor.getText()).toBe("aC\nZ\nW");
    });

    it("uses wrapping in the preview and replaces selections in one undo step", () => {
      lumine.config.set("sequence-creator.alphabetSequence", "xyz");
      selectEntries(4);
      editor.getBuffer().clearUndoStack();
      view.setText("x-");
      advanceClock(20);
      expect(view.simulator.textContent).toBe("x, z, y, x");
      lumine.commands.dispatch(view.element, "core:confirm");
      expect(editor.getText()).toBe("x\nz\ny\nx");
      editor.undo();
      expect(editor.getText()).toBe("old\nold\nold\nold");
    });

    it("supports positive steps with a single-character alphabet", () => {
      lumine.config.set("sequence-creator.alphabetSequence", "x");
      selectEntries(3);
      runSequence("x+2");
      expect(editor.getText()).toBe("x\nxxx\nxxxxx");
    });

    it("wraps a single-character alphabet without changing uppercase", () => {
      lumine.config.set("sequence-creator.alphabetSequence", "x");
      selectEntries(3);
      runSequence("X-");
      expect(editor.getText()).toBe("X\nX\nX");
    });

    it("reports an unrepresentable unary output without changing selections", () => {
      lumine.config.set("sequence-creator.alphabetSequence", "x");
      selectEntries(3);
      view.setText(`x+1${"0".repeat(100)}`);
      advanceClock(20);
      expect(view.simulator.classList.contains("text-error")).toBe(true);
      lumine.commands.dispatch(view.element, "core:confirm");
      expect(editor.getText()).toBe("old\nold\nold");
      expect(view.isVisible()).toBe(true);
    });
  });
});
