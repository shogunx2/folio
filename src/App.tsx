import MobileApp from './portfolio/MobileApp';

/**
 * App shell. Today it renders the mobile-first layout for every viewport
 * (the product is delivered as a mobile browser app / future mobile app).
 *
 * To add a dedicated desktop experience later, build a `DesktopApp` that
 * consumes the same `usePortfolio()` view-model and branch on viewport here:
 *
 *   const isDesktop = useMediaQuery('(min-width: 900px)');
 *   return isDesktop ? <DesktopApp /> : <MobileApp />;
 *
 * No business logic needs to move — all state, data fetching, and derived
 * values live in `portfolio/usePortfolio.ts`, so a desktop layout is purely
 * presentational.
 */
function App() {
  return <MobileApp />;
}

export default App;
