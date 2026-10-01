import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

/** Canvas fallback children mount even on healthy WebGL; keep this purely presentational. */
export function CanvasFallback() {
  return (
    <span>
      Interactive 3D requires a WebGL-capable browser. Enable hardware
      acceleration or try another browser.
    </span>
  );
}

export class SceneBoundary extends Component<
  { children: ReactNode; onError: (message: string) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError(`The 3D viewer could not start. ${error.message}`);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
