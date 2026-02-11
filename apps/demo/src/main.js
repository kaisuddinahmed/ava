import "./styles.css";
import { createIntegrationWizard } from "./components/integration-wizard.js";

const app = document.getElementById("app");
if (!app) {
  throw new Error("Missing #app root element");
}

app.innerHTML = `
  <div class="layout">
    <aside class="wizard-pane">
      <header class="pane-header">
        <p class="eyebrow">AVA Demo</p>
        <h1>Integration Wizard</h1>
        <p class="subtext">Analyze -> Map -> Verify -> Activate</p>
      </header>
      <section id="wizard-root"></section>
    </aside>

    <main class="experience-pane">
      <section class="frame-card">
        <div class="card-header">
          <h2>Demo Store</h2>
          <span class="hint">Customer journey view</span>
        </div>
        <iframe title="Demo Store" src="http://localhost:3001"></iframe>
      </section>

      <section class="frame-card">
        <div class="card-header">
          <h2>Dashboard</h2>
          <span class="hint">Backend analysis + intervention feed</span>
        </div>
        <iframe title="Dashboard" src="http://localhost:3000"></iframe>
      </section>
    </main>
  </div>
`;

const wizardRoot = document.getElementById("wizard-root");
if (!wizardRoot) {
  throw new Error("Missing #wizard-root element");
}

createIntegrationWizard(wizardRoot, {
  apiBaseUrl: "http://localhost:8080",
});
