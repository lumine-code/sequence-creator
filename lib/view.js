const { Emitter } = require("lumine");
const { INPUT_LIMIT, checkLength } = require("./budget");

const modalTemplate = `\
<lumine-text-editor placeholder-text="examples: 01+2, aa+2, 1+2:0>2, 2!" mini></lumine-text-editor>
<div class="inset-panel padded">
  <span class="icon icon-terminal"></span>
  <span id="sequence-creator-simulator"></span>
</div>\
`;

module.exports = class SequentialNumberView extends Emitter {
  constructor(window = lumine.workspace.getMainWindow()) {
    super();
    this.window = window;
    this.element = document.createElement("div");
    this.element.classList.add("select-list", "sequence-creator");
    this.element.innerHTML = modalTemplate;
    this.textEditor = this.element.querySelector("lumine-text-editor");
    this.simulator = this.element.querySelector("#sequence-creator-simulator");
    this.modalPanel = window.addModalPanel({
      item: this.element,
      autoFocus: this.textEditor,
      visible: false,
    });
    this.handleBlur = this.handleBlur.bind(this);
    this.refreshSub = null;
  }

  bindEvents() {
    this.textEditor.addEventListener("blur", this.handleBlur, false);
    this.refreshSub = this.textEditor.getModel().onDidChange(() => {
      if (this.editTimer) return;
      this.editTimer = this.window.getDocument().defaultView.setTimeout(() => {
        this.editTimer = null;
        this.handleEdit();
      }, 10);
    });
  }

  unbindEvents() {
    this.textEditor.removeEventListener("blur", this.handleBlur, false);
    this.refreshSub.dispose();
    this.refreshSub = null;
    if (this.editTimer) {
      this.window.getDocument().defaultView.clearTimeout(this.editTimer);
      this.editTimer = null;
    }
  }

  handleBlur(event) {
    if (event.relatedTarget === null) {
      return;
    }
    const document = this.element.ownerDocument;
    document.defaultView.requestAnimationFrame(() => {
      if (!this.isVisible()) return;
      if (this.element.contains(document.activeElement)) return;
      this.emit("blur");
    });
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
    return this.modalPanel ? this.modalPanel.isVisible() : false;
  }

  focus() {
    this.textEditor.focus();
  }

  show() {
    if (this.isVisible()) {
      return;
    }

    this.textEditor.getModel().selectAll();
    this.modalPanel.show();
    this.focus();
    return this.bindEvents();
  }

  hide() {
    if (this.refreshSub) this.unbindEvents();
    this.modalPanel.hide();
  }

  destroy() {
    this.hide();
    this.modalPanel.destroy();
    this.modalPanel = null;
    this.element.remove();
    this.textEditor.getModel().destroy();
    this.dispose();
    this.element = null;
  }

  setText(text) {
    return this.textEditor.getModel().setText(text);
  }

  getText() {
    try {
      checkLength(
        this.textEditor.getModel().getBuffer().getLength(),
        INPUT_LIMIT,
        "Sequence input",
      );
      return this.textEditor.getModel().getText();
    } catch (error) {
      this.setSimulatorError(error.message);
      return null;
    }
  }

  setSimulatorText(simulateList) {
    this.simulator.classList.remove("text-error");
    return (this.simulator.textContent = simulateList.join(", "));
  }

  setSimulatorError(message) {
    this.simulator.classList.add("text-error");
    return (this.simulator.textContent = `Error: ${message}`);
  }
};
