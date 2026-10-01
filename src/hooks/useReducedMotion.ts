import { useEffect, useState } from "react";
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const listener = () => setReduced(q.matches);
    q.addEventListener("change", listener);
    return () => q.removeEventListener("change", listener);
  }, []);
  return reduced;
}
