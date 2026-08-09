const { Emitter } = require("lumine");

const modalTemplate = `\
<lumine-text-editor placeholder-text="examples: 01+2, aa+2, 1+2:0>2, 2!" mini></lumine-text-editor>
<div class="inset-panel padded">
  <span class="icon icon-terminal"></span>
  <span id="sequence-creator-simulator"></span>
</div>\
`;

module.exports = class SequentialNumberView extends Emitter {
  constructor() {
    super();
    this.element = document.createElement("div");
    this.element.classList.add("select-list", "sequence-creator");
    this.element.innerHTML = modalTemplate;
    this.textEditor = this.element.querySelector("lumine-text-editor");
    this.simulator = this.element.querySelector("#sequence-creator-simulator");
    this.modalPanel = lumine.workspace.addModalPanel({
      item: this.element,
      visible: false,
    });
    this.handleBlur = this.handleBlur.bind(this);
    this.refreshSub = null;
  }

  bindEvents() {
    this.textEditor.addEventListener("blur", this.handleBlur, false);
    this.refreshSub = this.textEditor.getModel().onDidChange(() => {
      if (this.editTimer) return;
      this.editTimer = setTimeout(() => {
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
      clearTimeout(this.editTimer);
      this.editTimer = null;
    }
  }

  handleBlur(event) {
    if (event.relatedTarget === null) {
      return;
    }
    requestAnimationFrame(() => {
      if (!this.isVisible()) return;
      if (this.element.contains(document.activeElement)) return;
      this.emit("blur");
    });
  }

  handleEdit() {
    this.emit("change", this.getText());
  }

  handleDone() {
    this.emit("done", this.getText());
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
    if (!this.isVisible()) {
      return;
    }
    this.unbindEvents();
    if (this.modalPanel) {
      this.modalPanel.hide();
    }
  }

  destroy() {
    this.modalPanel.destroy();
    this.modalPanel = null;
    this.element.remove();
    return (this.element = null);
  }

  setText(text) {
    return this.textEditor.getModel().setText(text);
  }

  getText() {
    return this.textEditor.getModel().getText();
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
