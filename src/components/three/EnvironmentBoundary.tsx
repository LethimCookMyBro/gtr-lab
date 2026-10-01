import { Component } from "react";
import type { ReactNode } from "react";

/** Only lighting fails here; the model, controls, and graphics context stay mounted. */
export class EnvironmentBoundary extends Component<
  {
    children: ReactNode;
    fallback: ReactNode;
    onFailure: (message: string) => void;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onFailure(error.message);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
