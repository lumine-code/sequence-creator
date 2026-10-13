describe("sequence dialogs in editor windows", () => {
  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("sequence-creator");
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("sequence-creator");
    await lumine.workspace.discardEditorWindows();
  });
  it("keeps previews and insertion cursors owned by their invoking windows", async () => {
    const workspace = lumine.workspace;
    const first = await workspace.open();
    const extra = await workspace.openEditorWindow({ show: false });
    const second = workspace.buildTextEditor();
    extra.getEditorContainer().getActivePane().activateItem(second, { activatePane: true });
    await lumine.commands.dispatch(first.getElement(), "sequence-creator:open");
    await lumine.commands.dispatch(second.getElement(), "sequence-creator:open");
    const main = lumine.packages.getActivePackage("sequence-creator").mainModule;
    await conditionPromise(() => main.views.size === 2);
    const local = main.views.get(workspace.getMainWindow()).view;
    const remote = main.views.get(extra).view;
    expect(local.isVisible()).toBe(true);
    expect(remote.element.ownerDocument).toBe(extra.getDocument());
    local.setText("10");
    remote.setText("20");
    await lumine.commands.dispatch(remote.textEditor, "core:confirm");
    expect(second.getText()).toBe("20");
    expect(first.getText()).toBe("");
    expect(local.getText()).toBe("10");
    expect(local.isVisible()).toBe(true);
  });
});
