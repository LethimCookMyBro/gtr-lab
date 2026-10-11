type Modal = {
  layer: HTMLElement;
  dialog: HTMLElement;
  returnFocus: HTMLElement[];
};

type Isolation = {
  modals: Modal[];
  inert: Map<Element, string | null>;
  observer: MutationObserver;
  unlockScroll: () => void;
};

const documents = new WeakMap<Document, Isolation>();
const overflowProperties = ["overflow", "overflow-x", "overflow-y"];

function restoreAttribute(
  element: Element,
  name: string,
  value: string | null,
) {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function lockOverflow(element: HTMLElement) {
  const before = element.getAttribute("style");
  const declarations = Array.from(element.style)
    .filter((property) => overflowProperties.includes(property))
    .map((property) => [
      property,
      element.style.getPropertyValue(property),
      element.style.getPropertyPriority(property),
    ]);
  for (const property of overflowProperties)
    element.style.removeProperty(property);
  element.style.setProperty("overflow", "hidden", "important");
  const locked = element.getAttribute("style");
  return () => {
    if (element.getAttribute("style") === locked) {
      restoreAttribute(element, "style", before);
      return;
    }
    // Preserve unrelated inline changes made while the drawer was present.
    for (const property of overflowProperties)
      element.style.removeProperty(property);
    for (const [property, value, priority] of declarations) {
      element.style.setProperty(property, value, priority);
    }
  };
}

function reconcile(isolation: Isolation) {
  const desired = new Set<Element>();
  const top = isolation.modals.at(-1);
  if (top?.layer.isConnected) {
    // The existing drawer is inline, so isolate siblings along its entire path.
    // Never inert an ancestor of the active sheet or its clickable backdrop.
    let branch: Element = top.layer;
    while (branch.parentElement && branch !== branch.ownerDocument.body) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch) desired.add(sibling);
      }
      branch = branch.parentElement;
    }
  }
  for (const [element, before] of isolation.inert) {
    if (!desired.has(element)) {
      restoreAttribute(element, "inert", before);
      isolation.inert.delete(element);
    }
  }
  for (const element of desired) {
    if (!isolation.inert.has(element)) {
      isolation.inert.set(element, element.getAttribute("inert"));
      element.setAttribute("inert", "");
    }
  }
}

/** Hold isolation for the drawer's visible lifetime, including its exit. */
export function isolateModal(layer: HTMLElement, dialog: HTMLElement) {
  const document = layer.ownerDocument;
  let isolation = documents.get(document);
  if (!isolation) {
    const unlock = [document.documentElement, document.body].map(lockOverflow);
    const observer = new MutationObserver(() => reconcile(state));
    const state: Isolation = {
      modals: [],
      inert: new Map(),
      observer,
      unlockScroll: () => unlock.forEach((restore) => restore()),
    };
    isolation = state;
    documents.set(document, state);
    observer.observe(document.body, { childList: true, subtree: true });
  }
  const state = isolation;
  const before = document.activeElement;
  const modal: Modal = {
    layer,
    dialog,
    returnFocus: [
      ...(before instanceof HTMLElement ? [before] : []),
      ...(state.modals.at(-1)?.returnFocus ?? []),
    ],
  };
  state.modals.push(modal);
  reconcile(state);
  let released = false;
  return {
    isTop: () => !released && state.modals.at(-1) === modal,
    release() {
      if (released) return;
      released = true;
      const wasTop = state.modals.at(-1) === modal;
      state.modals.splice(state.modals.indexOf(modal), 1);
      if (!state.modals.length) {
        state.observer.disconnect();
        state.unlockScroll();
        documents.delete(document);
      }
      reconcile(state);
      if (!wasTop) return;
      const next = state.modals.at(-1);
      const target = modal.returnFocus.find(
        (element) =>
          element.isConnected &&
          !element.closest("[inert]") &&
          !layer.contains(element) &&
          (!next || next.layer.contains(element)),
      );
      (target ?? next?.dialog)?.focus({ preventScroll: true });
    },
  };
}
