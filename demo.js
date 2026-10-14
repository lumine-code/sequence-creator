// Authentic package usage. Run with lumine/script/demo.js; fixtures stay in demo/.
module.exports = {
  version: 1,
  dependencies: [],
  viewport: { width: 1100, height: 340 },
  async before() {},
  async prepare(context) {
    const { state, open } = context;
    state.editor = await open("usage/filenames.txt");
  },
  scenes: [
    {
      id: "scene-1",
      file: "demo.png",
      caption: "Insert a padded numeric sequence at multiple cursors.",
      timeout: 60000,
      async run(context) {
        const { lumine, state, waitFor } = context;
        {
          state.editor.setSelectedBufferRanges(
            [0, 1, 2, 3, 4].map((row) => [
              [row, 7],
              [row, 7],
            ]),
          );
          lumine.commands.dispatch(lumine.views.getView(state.editor), "sequence-creator:open");
          await waitFor(
            () => lumine.workspace.getModalPanels().some((p) => p.isVisible()),
            "action picker",
          );
          const input = lumine.workspace
            .getModalPanels()
            .find((p) => p.isVisible())
            .getElement()
            .querySelector("lumine-text-editor[mini]");
          if (!input) throw new Error("Missing picker input");
          input.getModel().setText("001+1");
        }
      },
      ready() {
        return Boolean(
          document.querySelector("#sequence-creator-simulator")?.innerText.includes("001"),
        );
      },
    },
    {
      id: "scene-2",
      file: "demo-2.png",
      caption: "Generated file numbers inserted at all five cursors.",
      timeout: 60000,
      async run(context) {
        const { lumine } = context;
        {
          lumine.packages.getActivePackage("sequence-creator").mainModule.view.handleDone();
        }
      },
      ready(context) {
        const { state } = context;
        return Boolean(
          state.editor.getText().includes("sample-001.csv") &&
          state.editor.getText().includes("sample-005.csv"),
        );
      },
    },
  ],
  async cleanup() {},
};
