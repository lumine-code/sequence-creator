const { CompositeDisposable, Emitter } = require("lumine");
const { INPUT_LIMIT } = require("./budget");

module.exports = class SequentialNumberView extends Emitter {
  constructor(window = lumine.workspace.getMainWindow()) {
    super();
    this.window = window;
    const document = window.getDocument();
    this.preview = document.createElement("div");
    this.preview.className = "inset-panel padded";
    const icon = document.createElement("span");
    icon.className = "icon icon-terminal";
    this.simulator = document.createElement("span");
    this.simulator.id = "sequence-creator-simulator";
    this.preview.append(icon, this.simulator);
    this.inputDialogHost = lumine.workspace.addInputDialog(
      {
        maxQueryLength: INPUT_LIMIT,
        placeholderText: "examples: 01+2, aa+2, 1+2:0>2, 2!",
        contentElement: this.preview,
      },
      { window, className: "sequence-creator" },
    );
    this.inputDialog = this.inputDialogHost.getModel();
    this.element = this.inputDialog.getElement();
    this.element.classList.add("sequence-creator");
    this.textEditor = this.inputDialog.getQueryEditor().element;
    this.modalPanel = this.inputDialogHost.getPanel();
    this.refreshSub = null;
    this.subscriptions = new CompositeDisposable(
      this.inputDialog.onDidConfirm(() => this.handleDone()),
      this.inputDialogHost.onDidHide(() => {
        this.unbindEvents();
        this.emit("blur");
      }),
    );
  }

  bindEvents() {
    this.refreshSub = this.inputDialog.onDidChangeQuery(() => {
      if (this.editTimer) return;
      this.editTimer = this.window.getDocument().defaultView.setTimeout(() => {
        this.editTimer = null;
        this.handleEdit();
      }, 10);
    });
  }

  unbindEvents() {
    this.refreshSub?.dispose();
    this.refreshSub = null;
    if (this.editTimer) {
      this.window.getDocument().defaultView.clearTimeout(this.editTimer);
      this.editTimer = null;
    }
  }

  handleEdit() {
    const text = this.getText();
    if (text !== null) this.emit("change", text);
  }

  handleDone() {
    const text = this.getText();
    if (text !== null) this.emit("done", text);
  }

  isVisible() {
    return this.inputDialogHost.isVisible();
  }

  focus() {
    this.textEditor.focus();
  }

  show() {
    if (this.isVisible()) return;
    const query = this.textEditor.getModel().getBuffer().getTextSnapshot();
    this.inputDialogHost.show();
    this.inputDialog.setQuery(query, { select: true });
    this.bindEvents();
  }

  hide() {
    this.unbindEvents();
    this.inputDialogHost.hide();
  }

  destroy() {
    this.unbindEvents();
    this.subscriptions.dispose();
    const destroyed = this.inputDialogHost.destroy();
    this.modalPanel = null;
    this.dispose();
    this.element = null;
    return destroyed;
  }

  setText(text) {
    return this.inputDialog.setQuery(text);
  }

  getText() {
    if (!this.inputDialog.getQueryStatus().available) {
      this.preview.hidden = true;
      return null;
    }
    return this.inputDialog.getQuery();
  }

  setSimulatorText(simulateList) {
    this.inputDialog.clearStatus();
    this.preview.hidden = false;
    this.simulator.textContent = simulateList.join(", ");
  }

  setSimulatorError(message) {
    this.preview.hidden = true;
    this.inputDialog.setStatus({ type: "error", message });
  }
};
