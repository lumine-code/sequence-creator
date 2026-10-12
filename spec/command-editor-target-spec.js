describe("Sequence Creator command editor targets", () => {
  let first, second, firstPane, secondPane, main;

  beforeEach(async () => {
    for (const operation of ["openExternal", "openPath", "showItemInFolder", "openApplication"]) {
      if (!jasmine.isSpy(lumine.shell[operation])) spyOn(lumine.shell, operation).and.resolveTo();
    }
    if (!jasmine.isSpy(lumine.application.openWindow))
      spyOn(lumine.application, "openWindow").and.resolveTo();
    jasmine.attachToDOM(lumine.workspace.getElement());
    first = await lumine.workspace.open();
    firstPane = lumine.workspace.paneForItem(first);
    secondPane = firstPane.splitRight();
    second = await lumine.workspace.open();
    for (const editor of [first, second]) {
      editor.setText("x\nx\n");
      editor.setCursorBufferPosition([0, 1]);
      editor.addCursorAtBufferPosition([1, 1]);
    }
    firstPane.activate();
    expect(lumine.workspace.getActiveTextEditor()).toBe(first);
    main = (await lumine.packages.activatePackage("sequence-creator")).mainModule;
  });

  afterEach(async () => {
    if (lumine.packages.isPackageLoaded("sequence-creator"))
      await lumine.packages.unloadPackage("sequence-creator");
    first?.destroy();
    second?.destroy();
    await lumine.fileWatchClient.settlePendingTeardown();
  });

  async function confirm(target, movePane) {
    lumine.commands.dispatch(target, "sequence-creator:open");
    movePane?.activate();
    await Promise.resolve();
    expect(main.view.isVisible()).toBe(true);
    main.view.setText("7");
    lumine.commands.dispatch(main.view.element, "core:confirm");
  }

  it("inserts into the inactive split editor that invoked the command", async () => {
    await confirm(second.element);
    expect(second.getText()).toBe("x7\nx8\n");
    expect(first.getText()).toBe("x\nx\n");
  });

  it("keeps the accepted workspace editor while queued modal construction runs", async () => {
    await confirm(lumine.workspace.getElement(), secondPane);
    expect(first.getText()).toBe("x7\nx8\n");
    expect(second.getText()).toBe("x\nx\n");
  });

  it("uses the active editor for an ordinary workspace invocation", async () => {
    await confirm(lumine.workspace.getElement());
    expect(first.getText()).toBe("x7\nx8\n");
    expect(second.getText()).toBe("x\nx\n");
  });
});
