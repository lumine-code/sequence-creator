describe("sequence-creator", () => {
  let workspaceElement, editor, editorElement, mainModule, view;

  beforeEach(async () => {
    workspaceElement = atom.views.getView(atom.workspace);
    jasmine.attachToDOM(workspaceElement);
    editor = await atom.workspace.open();
    editorElement = atom.views.getView(editor);

    // The package defers activation until one of its commands is dispatched.
    const activation = atom.packages.activatePackage("sequence-creator");
    atom.commands.dispatch(editorElement, "sequence-creator:open");
    mainModule = (await activation).mainModule;
    view = mainModule.view;
  });

  function runSequence(input) {
    view.setText(input);
    atom.commands.dispatch(view.element, "core:confirm");
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
    atom.commands.dispatch(view.element, "core:cancel");
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
      atom.config.set("sequence-creator.simulateCursorLength", 2);
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
});
