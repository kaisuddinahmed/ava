export function InactiveOverlay() {
  return (
    <div className="inactive-overlay">
      <div className="inactive-content">
        <div className="inactive-icon">&#x23F8;</div>
        <h2>Dashboard Inactive</h2>
        <p>Complete the integration wizard to activate AVA.</p>
        <p className="muted">
          Once activated, real-time tracking, evaluations, and interventions
          will appear here.
        </p>
        <div className="inactive-steps">
          <span className="inactive-step">1. Start the server</span>
          <span className="inactive-step">2. Analyze &rarr; Map &rarr; Verify</span>
          <span className="inactive-step">3. Click Activate</span>
        </div>
      </div>
    </div>
  );
}
