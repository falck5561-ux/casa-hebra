import { Component, lazy, Suspense } from "react";

const Storefront = lazy(() => import("./store/Storefront"));
const AdminApp = lazy(() => import("./admin/AdminApp"));

function RouteLoading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <div className="route-loading__mark" aria-hidden="true">
        CH
      </div>
      <span>Cargando Casa Hebra…</span>
    </div>
  );
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("Casa Hebra UI error", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="fatal-state">
          <div className="fatal-state__card">
            <span className="eyebrow">Algo se enredó</span>
            <h1>No pudimos mostrar esta página.</h1>
            <p>Recarga el sitio para intentarlo nuevamente.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Recargar página
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const isAdmin = window.location.pathname.startsWith("/admin");

  return (
    <AppErrorBoundary>
      <Suspense fallback={<RouteLoading />}>
        {isAdmin ? <AdminApp /> : <Storefront />}
      </Suspense>
    </AppErrorBoundary>
  );
}
