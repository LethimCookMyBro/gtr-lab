import type { WebGLRenderer } from "three";

export type PreparationRequest = {
  signal: AbortSignal;
  /** One bounded synchronous GPU submission. Never return a Promise. */
  run: () => void | { poll: () => boolean };
};
export type MainRequest = {
  signal: AbortSignal;
  /** Pure exact-state identity, or null while the requested view is not current. */
  stamp: () => string | null;
};
export type MainCompletion = {
  stamp: string;
  submittedAt: number;
  completedAt: number;
};
type Common = {
  signal: AbortSignal;
  done: boolean;
  abort: () => void;
  reject: (error: unknown) => void;
};
type Preparation = Common & {
  kind: "preparation";
  request: PreparationRequest;
  resolve: () => void;
  nativeDone: boolean;
  poll?: () => boolean;
};
type Main = Common & {
  kind: "main";
  request: MainRequest;
  resolve: (value: MainCompletion) => void;
  certificate?: Omit<MainCompletion, "completedAt">;
};
type Ticket = Preparation | Main;
type MainToken = { ticket: Main; stamp: string; submittedAt: number };
type PublicOwner = {
  enqueue: (request: PreparationRequest) => Promise<void>;
  awaitMain: (request: MainRequest) => Promise<MainCompletion>;
};
const owners = new WeakMap<WebGLRenderer, PublicOwner>();
const unavailable = () =>
  new Error("The renderer preparation owner is unavailable.");
const cancelled = () =>
  new DOMException("Renderer preparation cancelled.", "AbortError");

export function enqueueRendererPreparation(
  renderer: WebGLRenderer,
  request: PreparationRequest,
): Promise<void> {
  return (
    owners.get(renderer)?.enqueue(request) ?? Promise.reject(unavailable())
  );
}
export function awaitCompletedMain(
  renderer: WebGLRenderer,
  request: MainRequest,
): Promise<MainCompletion> {
  return (
    owners.get(renderer)?.awaitMain(request) ?? Promise.reject(unavailable())
  );
}

/** Admission's bookkeeping only: no renderer calls, timer, native sync or global hook. */
export function createRendererPreparationOwner(
  renderer: WebGLRenderer,
  wake: () => void,
) {
  if (owners.has(renderer))
    throw new Error("Renderer already has a preparation owner.");
  let healthy = true;
  let disposed = false;
  let queue: Preparation[] = [];
  let active: Preparation | undefined;
  const tickets = new Set<Ticket>();
  const unsealed = new Set<Ticket>();
  const batches = new Map<WebGLSync, Set<Ticket>>();
  // Presence, not value, distinguishes failure (JavaScript permits throw undefined).
  function finish(ticket: Ticket, ...failure: [] | [unknown]) {
    if (ticket.done) return;
    ticket.done = true;
    ticket.signal.removeEventListener("abort", ticket.abort);
    tickets.delete(ticket);
    unsealed.delete(ticket);
    queue = queue.filter((item) => item !== ticket);
    if (active === ticket) active = undefined;
    for (const [sync, members] of batches) {
      members.delete(ticket);
      if (!members.size) batches.delete(sync);
    }
    if (failure.length) ticket.reject(failure[0]);
    else if (ticket.kind === "preparation") ticket.resolve();
    else
      ticket.resolve({
        ...ticket.certificate!,
        completedAt: performance.now(),
      });
  }
  function accept(ticket: Ticket) {
    if (!healthy || disposed) {
      finish(ticket, unavailable());
      return false;
    }
    if (ticket.signal.aborted) {
      finish(ticket, cancelled());
      return false;
    }
    if (tickets.size >= 64) {
      finish(ticket, new Error("Too many renderer preparation requests."));
      return false;
    }
    tickets.add(ticket);
    ticket.signal.addEventListener("abort", ticket.abort, { once: true });
    return true;
  }
  function invalidateMain() {
    for (const ticket of [...tickets])
      if (ticket.kind === "main" && ticket.certificate)
        finish(
          ticket,
          new Error("The completed main presentation was superseded."),
        );
  }
  const api: PublicOwner = {
    enqueue(request) {
      return new Promise((resolve, reject) => {
        const ticket: Preparation = {
          kind: "preparation",
          request,
          signal: request.signal,
          done: false,
          nativeDone: false,
          resolve,
          reject,
          abort: () => finish(ticket, cancelled()),
        };
        if (!accept(ticket)) return;
        invalidateMain();
        queue.push(ticket);
        wake();
      });
    },
    awaitMain(request) {
      return new Promise((resolve, reject) => {
        const ticket: Main = {
          kind: "main",
          request,
          signal: request.signal,
          done: false,
          resolve,
          reject,
          abort: () => finish(ticket, cancelled()),
        };
        accept(ticket); // Waiting for a real draw never invents a demand frame.
      });
    },
  };
  owners.set(renderer, api);
  function reset(error: Error) {
    healthy = false;
    for (const ticket of [...tickets]) finish(ticket, error);
    batches.clear();
    unsealed.clear();
    queue = [];
    active = undefined;
  }
  return {
    hasWork: () => healthy && (queue.length > 0 || active !== undefined),
    hasMainWaiters: () =>
      healthy && [...tickets].some((t) => t.kind === "main"),
    /** Returns true even after a thrown/aborted partial submission: host MUST seal it. */
    runNext() {
      if (!healthy || active || !queue.length) return false;
      const ticket = queue.shift()!;
      active = ticket;
      invalidateMain();
      try {
        const result = ticket.request.run();
        if (
          result &&
          (typeof result !== "object" ||
            typeof result.poll !== "function" ||
            "then" in result)
        )
          throw new Error(
            "Preparation must return only a synchronous link-readiness check.",
          );
        if (!ticket.done) {
          ticket.poll = result?.poll;
          unsealed.add(ticket);
        }
      } catch (error) {
        finish(ticket, error);
      }
      return true;
    },
    poll() {
      const ticket = active;
      if (!healthy || !ticket || ticket.done || !ticket.nativeDone) return;
      try {
        const ready = ticket.poll ? ticket.poll() : true;
        if (ready === true) finish(ticket);
        else if (ready !== false)
          throw new Error("Preparation readiness must be boolean.");
      } catch (error) {
        finish(ticket, error);
      }
    },
    beforeMain(): MainToken[] {
      if (!healthy || active || queue.length) return [];
      const token: MainToken[] = [];
      for (const ticket of [...tickets])
        if (ticket.kind === "main" && !ticket.certificate) {
          try {
            const stamp = ticket.request.stamp();
            if (stamp !== null && (typeof stamp !== "string" || !stamp.length))
              throw new Error("Invalid main readiness stamp.");
            if (
              stamp !== null &&
              !ticket.done &&
              healthy &&
              !active &&
              !queue.length
            )
              token.push({ ticket, stamp, submittedAt: performance.now() });
          } catch (error) {
            finish(ticket, error);
          }
        }
      return token;
    },
    afterMain(token: MainToken[], valid: boolean) {
      for (const item of token) {
        const ticket = item.ticket;
        if (ticket.done || !healthy || active || queue.length) continue;
        try {
          if (!valid)
            throw new Error(
              "The main renderer submission failed or changed owner.",
            );
          if (
            ticket.request.stamp() !== item.stamp ||
            ticket.done ||
            !healthy ||
            active ||
            queue.length
          )
            continue;
          ticket.certificate = {
            stamp: item.stamp,
            submittedAt: item.submittedAt,
          };
          unsealed.add(ticket);
        } catch (error) {
          finish(ticket, error);
        }
      }
    },
    invalidateMain,
    seal(sync: WebGLSync, previous: WebGLSync | null) {
      const members = new Set<Ticket>([
        ...(previous ? (batches.get(previous) ?? []) : []),
        ...unsealed,
      ]);
      if (previous) batches.delete(previous);
      unsealed.clear();
      if (members.size) batches.set(sync, members);
    },
    completed(sync: WebGLSync) {
      const members = batches.get(sync);
      batches.delete(sync);
      for (const ticket of members ?? []) {
        if (ticket.done) continue;
        if (ticket.kind === "preparation") ticket.nativeDone = true;
        else
          try {
            if (ticket.request.stamp() !== ticket.certificate?.stamp)
              throw new Error(
                "The main readiness stamp changed before native completion.",
              );
            finish(ticket);
          } catch (error) {
            finish(ticket, error);
          }
      }
    },
    reset,
    restore() {
      if (!disposed) healthy = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reset(unavailable());
      if (owners.get(renderer) === api) owners.delete(renderer);
    },
  };
}
