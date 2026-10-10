/**
 * Grain, scanlines, and vignette. Same three layers on every page.
 * They sit above the page and below clicks.
 */
export function Atmosphere() {
  return (
    <div className="club-atmosphere" aria-hidden>
      <div className="club-grain absolute inset-0" />
      <div className="club-scan absolute inset-0" />
      <div className="club-vignette absolute inset-0" />
    </div>
  );
}
