export function AppBackdrop() {
  return (
    <div className="app-backdrop print:hidden" aria-hidden="true">
      <div className="app-orb app-orb-a" />
      <div className="app-orb app-orb-b" />
      <div className="app-grid" />
      <div className="app-noise" />
    </div>
  );
}
