interface Props {
  connected: boolean;
  activated?: boolean;
}

export function Header({ connected, activated = true }: Props) {
  const dotClass = !activated ? "inactive" : connected ? "" : "disconnected";
  const statusText = !activated ? "Inactive" : connected ? "Live" : "Disconnected";

  return (
    <div className="dashboard-header">
      <div className="brand">
        <span className="tag">AVA</span>
        <h1>Dashboard</h1>
      </div>
      <div className="status-pill">
        <span className={`status-dot ${dotClass}`} />
        {statusText}
      </div>
    </div>
  );
}
