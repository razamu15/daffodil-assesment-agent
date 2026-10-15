/** Keeps a screen's rendering bug from blanking the whole app: shows a plain message instead. Used once, around the routed screen in App. */
import { Component } from "react";
import type { ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="screen">
        <h1>Something went wrong on this page</h1>
        <p className="muted">Nothing was changed. Reload the page to try again.</p>
      </section>
    );
  }
}
