import assert from "node:assert/strict";
import { test } from "vitest";
import { PerspectiveCamera } from "three";
import { OrbitControls } from "three-stdlib";
import {
  createReleasedOrbitDamping,
  type OrbitLike,
  type ReleasedOrbitDamping,
} from "../src/components/three/releasedOrbitDamping";

const BASE = 0.09;
const GOOD = { exterior: true, moving: false, reducedMotion: false };
const factor = (dt: number) =>
  Math.max(BASE, -Math.expm1(60 * dt * Math.log1p(-BASE)));
const near = (actual: number, expected: number, tolerance = 1e-12) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} != ${expected}`,
  );
function fixture(override: Partial<OrbitLike> = {}) {
  const samples: number[] = [];
  const controls: OrbitLike = {
    enabled: true,
    enableDamping: true,
    autoRotate: false,
    dampingFactor: BASE,
    update(this: OrbitLike) {
      samples.push(this.dampingFactor);
      return true;
    },
    ...override,
  };
  const original = controls.update;
  const adapter = createReleasedOrbitDamping(controls);
  return { controls, adapter, samples, original };
}
function release(f: { adapter: ReleasedOrbitDamping }, at = 0, id = 1) {
  f.adapter.pointerDown(id, at);
  f.adapter.pointerUp(id, at);
}
function frame(
  f: { adapter: ReleasedOrbitDamping; controls: OrbitLike },
  at: number,
  eligibility = GOOD,
) {
  f.adapter.arm(at, eligibility);
  const result = f.controls.update();
  f.adapter.clear();
  return result;
}

test("module exports the narrow adapter factory", () =>
  assert.equal(typeof createReleasedOrbitDamping, "function"));
test("arming and clearing never call update", () => {
  const f = fixture();
  release(f);
  f.adapter.arm(1, GOOD);
  f.adapter.clear();
  assert.deepEqual(f.samples, []);
});
test("mounting with no pointers does not create a release", () => {
  const f = fixture();
  frame(f, 5);
  assert.deepEqual(f.samples, [BASE]);
});
for (const hz of [60, 90, 120, 144])
  test(`preserves baseline for ${hz} Hz released motion`, () => {
    const f = fixture();
    release(f);
    frame(f, 1 / hz);
    near(f.samples[0], BASE);
  });
for (const hz of [1, 5, 15, 30])
  test(`compensates ${hz} Hz released motion`, () => {
    const f = fixture();
    release(f);
    frame(f, 1 / hz);
    near(f.samples[0], factor(1 / hz));
  });
test("five-second released stall has no artificial elapsed cap", () => {
  const f = fixture();
  release(f);
  frame(f, 5);
  near(f.samples[0], factor(5), 1e-15);
  assert.ok(f.samples[0] > factor(2));
  assert.equal(f.controls.dampingFactor, BASE);
});
test("time begins at actual release rather than preceding frame", () => {
  const f = fixture();
  f.adapter.pointerDown(1, 0);
  frame(f, 0.1);
  f.adapter.pointerUp(1, 0.11);
  frame(f, 0.15);
  near(f.samples.at(-1)!, factor(0.04));
});
test("a later frame consumes elapsed time only since previous eligible update", () => {
  const f = fixture();
  release(f);
  frame(f, 0.1);
  frame(f, 0.3);
  near(f.samples[0], factor(0.1));
  near(f.samples[1], factor(0.2));
});
test("held drag never compensates", () => {
  const f = fixture();
  f.adapter.pointerDown(1, 0);
  frame(f, 5);
  assert.deepEqual(f.samples, [BASE]);
});
test("only final tracked pointer release starts compensation", () => {
  const f = fixture();
  f.adapter.pointerDown(1, 0);
  f.adapter.pointerDown(2, 0.01);
  f.adapter.pointerUp(1, 0.02);
  frame(f, 1);
  f.adapter.pointerUp(2, 1.01);
  frame(f, 1.11);
  assert.equal(f.samples[0], BASE);
  near(f.samples[1], factor(0.1));
});
test("unknown or duplicate pointer release is ignored", () => {
  const f = fixture();
  f.adapter.pointerUp(123, 0);
  frame(f, 1);
  release(f, 2);
  frame(f, 2.1);
  f.adapter.pointerUp(1, 20);
  frame(f, 2.2);
  assert.equal(f.samples[0], BASE);
  near(f.samples[2], factor(0.1));
});
test("wheel start/end alone cannot create released epoch", () => {
  const f = fixture();
  f.adapter.inputBoundary(0);
  f.adapter.inputBoundary(0.01);
  frame(f, 5);
  assert.equal(f.samples[0], BASE);
});
test("wheel boundary during held drag preserves pointer IDs", () => {
  const f = fixture();
  f.adapter.pointerDown(1, 0);
  f.adapter.inputBoundary(0.1);
  f.adapter.pointerUp(987, 0.2);
  frame(f, 5);
  f.adapter.pointerUp(1, 5);
  frame(f, 5.1);
  assert.equal(f.samples[0], BASE);
  near(f.samples[1], factor(0.1));
});
test("input boundary cancels both epoch and armed token", () => {
  const f = fixture();
  release(f);
  f.adapter.arm(5, GOOD);
  f.adapter.inputBoundary(5);
  f.controls.update();
  frame(f, 10);
  assert.deepEqual(f.samples, [BASE, BASE]);
});
test("reset drops held pointers so a later up cannot resume old input", () => {
  const f = fixture();
  f.adapter.pointerDown(1, 0);
  f.adapter.reset();
  f.adapter.pointerUp(1, 1);
  frame(f, 2);
  assert.equal(f.samples[0], BASE);
});
test("new drag after idle starts elapsed time from its release", () => {
  const f = fixture();
  release(f);
  frame(f, 1);
  f.adapter.pointerDown(2, 100);
  f.adapter.pointerUp(2, 100.01);
  frame(f, 100.02);
  near(f.samples[1], BASE);
});
test("unarmed native update uses baseline and cancels released epoch", () => {
  const f = fixture();
  release(f);
  f.controls.dampingFactor = 0.8;
  f.controls.update();
  frame(f, 5);
  assert.deepEqual(f.samples, [BASE, BASE]);
  assert.equal(f.controls.dampingFactor, 0.8);
});
test("one-use frame token is consumed before synchronous reentrant update", () => {
  const factors: number[] = [];
  let inside = false;
  const f = fixture({
    update(this: OrbitLike) {
      factors.push(this.dampingFactor);
      if (!inside) {
        inside = true;
        this.update();
        inside = false;
      }
      return true;
    },
  });
  release(f);
  frame(f, 0.2);
  near(factors[0], factor(0.2));
  assert.equal(factors[1], BASE);
  assert.equal(f.controls.dampingFactor, BASE);
});
test("native return value and controls receiver are preserved", () => {
  let receiver: unknown;
  const marker = {};
  const f = fixture({
    update(this: OrbitLike) {
      receiver = this;
      return marker;
    },
  });
  assert.equal(f.controls.update(), marker);
  assert.equal(receiver, f.controls);
});
test("throwing original update restores coefficient and clears token", () => {
  const factors: number[] = [];
  const failure = new Error("original failure");
  const f = fixture({
    update(this: OrbitLike) {
      factors.push(this.dampingFactor);
      throw failure;
    },
  });
  release(f);
  f.adapter.arm(0.2, GOOD);
  assert.throws(
    () => f.controls.update(),
    (error: unknown) => error === failure,
  );
  assert.equal(f.controls.dampingFactor, BASE);
  assert.throws(
    () => f.controls.update(),
    (error: unknown) => error === failure,
  );
  near(factors[0], factor(0.2));
  assert.equal(factors[1], BASE);
});
test("clear prevents a skipped Drei frame token from reaching a native update", () => {
  const f = fixture();
  release(f);
  f.adapter.arm(0.2, GOOD);
  f.adapter.clear();
  f.controls.update();
  assert.equal(f.samples[0], BASE);
});
test("false update return ends the released epoch", () => {
  const f = fixture({
    update(this: OrbitLike) {
      f.samples.push(this.dampingFactor);
      return false;
    },
  });
  release(f);
  frame(f, 0.2);
  frame(f, 1);
  near(f.samples[0], factor(0.2));
  assert.equal(f.samples[1], BASE);
});
test("undefined return does not assume idle for void-typed controls", () => {
  const f = fixture({
    update(this: OrbitLike) {
      f.samples.push(this.dampingFactor);
    },
  });
  release(f);
  frame(f, 0.2);
  frame(f, 0.4);
  near(f.samples[0], factor(0.2));
  near(f.samples[1], factor(0.2));
});
for (const [name, values] of Object.entries({
  cabin: { exterior: false },
  transition: { moving: true },
  reducedMotion: { reducedMotion: true },
}))
  test(`${name} eligibility cancels the epoch`, () => {
    const f = fixture();
    release(f);
    frame(f, 0.2, { ...GOOD, ...values });
    frame(f, 1);
    assert.deepEqual(f.samples, [BASE, BASE]);
  });
for (const [name, value] of [
  ["enabled", false],
  ["enableDamping", false],
  ["autoRotate", true],
] as const)
  test(`${name} guard cancels epoch`, () => {
    const f = fixture();
    release(f);
    f.controls[name] = value;
    frame(f, 0.2);
    f.controls[name] = !value;
    frame(f, 1);
    assert.deepEqual(f.samples, [BASE, BASE]);
  });
test("guards are checked again at consumption", () => {
  const f = fixture();
  release(f);
  f.adapter.arm(0.2, GOOD);
  f.controls.autoRotate = true;
  f.controls.update();
  assert.equal(f.samples[0], BASE);
});
for (const time of [NaN, Infinity, -Infinity, -1])
  test(`invalid clock ${time} never leaks an invalid coefficient`, () => {
    const f = fixture();
    release(f);
    frame(f, time);
    frame(f, 1);
    assert.deepEqual(f.samples, [BASE, BASE]);
  });
test("backward clock cancels token and resumes baseline", () => {
  const f = fixture();
  release(f, 1);
  frame(f, 2);
  frame(f, 1.5);
  frame(f, 3);
  near(f.samples[0], factor(1));
  assert.deepEqual(f.samples.slice(1), [BASE, BASE]);
});
test("duplicate arm cannot duplicate compensated frame consumption", () => {
  const f = fixture();
  release(f);
  frame(f, 0.2);
  frame(f, 0.2);
  assert.equal(f.samples[1], BASE);
});
test("reset followed by new gesture permits a rebased clock", () => {
  const f = fixture();
  release(f, 20);
  frame(f, 21);
  f.adapter.reset();
  release(f, 0);
  frame(f, 0.2);
  near(f.samples[1], factor(0.2));
});
test("dispose restores original update identity and is idempotent", () => {
  const f = fixture();
  assert.notEqual(f.controls.update, f.original);
  f.adapter.dispose();
  assert.equal(f.controls.update, f.original);
  f.adapter.dispose();
  assert.equal(f.controls.update, f.original);
});
test("dispose does not overwrite a later wrapper owner", () => {
  const f = fixture();
  const wrapped = f.controls.update;
  const later = () => wrapped();
  f.controls.update = later;
  f.adapter.dispose();
  assert.equal(f.controls.update, later);
  f.controls.dampingFactor = 0.7;
  later();
  assert.equal(f.samples[0], 0.7);
});
test("disposed API calls cannot reactivate the detached wrapper", () => {
  const f = fixture();
  const wrapped = f.controls.update;
  f.adapter.dispose();
  release(f);
  f.adapter.arm(5, GOOD);
  f.controls.dampingFactor = 0.6;
  wrapped();
  assert.equal(f.samples[0], 0.6);
});
test("cleanup and reinstall safely model StrictMode and fresh instances", () => {
  const f = fixture();
  f.adapter.dispose();
  const again = createReleasedOrbitDamping(f.controls);
  again.pointerDown(1, 0);
  again.pointerUp(1, 0);
  again.arm(0.2, GOOD);
  f.controls.update();
  near(f.samples[0], factor(0.2));
  again.dispose();
  assert.equal(f.controls.update, f.original);
});

// Real installed OrbitControls with a deliberately tiny, socket-free DOM target.
class FakeTarget {
  readonly listeners = new Map<string, Set<EventListener>>();
  readonly style = {};
  readonly clientWidth = 1000;
  readonly clientHeight = 1000;
  readonly ownerDocument: FakeTarget;
  constructor(ownerDocument?: FakeTarget) {
    this.ownerDocument = ownerDocument ?? this;
  }
  addEventListener(type: string, callback: EventListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(callback);
  }
  removeEventListener(type: string, callback: EventListener) {
    this.listeners.get(type)?.delete(callback);
  }
  dispatch(type: string, extra: Record<string, unknown> = {}) {
    const event = {
      type,
      pointerType: "mouse",
      pointerId: 1,
      button: 0,
      clientX: 0,
      clientY: 0,
      pageX: 0,
      pageY: 0,
      preventDefault() {},
      ...extra,
    };
    for (const callback of [...(this.listeners.get(type) ?? [])])
      callback(event as unknown as Event);
  }
  releasePointerCapture() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 1000, height: 1000 };
  }
}
function realFixture(adapted = true) {
  const document = new FakeTarget();
  const element = new FakeTarget(document);
  const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(0, 4, 10);
  // The cast is restricted to this fake DOM fixture, not production controls.
  const controls = new OrbitControls(camera, element as unknown as HTMLElement);
  controls.enableDamping = true;
  controls.dampingFactor = BASE;
  controls.rotateSpeed = 0.6;
  controls.enablePan = false;
  controls.autoRotateSpeed = 0.45;
  controls.minPolarAngle = 0.005;
  controls.maxPolarAngle = Math.PI / 2 - 0.025;
  controls.minDistance = 3;
  controls.maxDistance = 20;
  controls.update();
  const samples: number[] = [];
  const raw = controls.update;
  controls.update = () => {
    samples.push(controls.dampingFactor);
    return raw();
  };
  const adapter = createReleasedOrbitDamping(controls);
  if (!adapted) adapter.dispose();
  return { controls, adapter, samples, camera, element, document };
}
type RealFixture = ReturnType<typeof realFixture>;
function realDown(
  f: RealFixture,
  at = 0,
  id = 1,
  pointerType = "mouse",
  x = 0,
) {
  f.adapter.pointerDown(id, at);
  f.element.dispatch("pointerdown", {
    pointerId: id,
    pointerType,
    clientX: x,
    pageX: x,
  });
}
function realMove(f: RealFixture, x = 80, id = 1, pointerType = "mouse") {
  f.document.dispatch("pointermove", {
    pointerId: id,
    pointerType,
    clientX: x,
    pageX: x,
  });
}
function realUp(f: RealFixture, at = 0, id = 1, pointerType = "mouse") {
  f.document.dispatch("pointerup", { pointerId: id, pointerType });
  f.adapter.pointerUp(id, at);
}
function seedReal(f: RealFixture) {
  realDown(f);
  realMove(f);
  realUp(f);
}
function realPose(f: RealFixture) {
  return [
    f.controls.getAzimuthalAngle(),
    f.controls.getPolarAngle(),
    ...f.camera.position.toArray(),
    ...f.controls.target.toArray(),
  ];
}
function samePose(a: RealFixture, b: RealFixture) {
  realPose(a).forEach((value, i) => near(value, realPose(b)[i], 2e-10));
}
function disposeReal(...fixtures: RealFixture[]) {
  for (const f of fixtures) {
    f.adapter.dispose();
    f.controls.dispose();
  }
}

for (const hz of [1, 5, 15, 30])
  test(`installed OrbitControls ${hz} Hz release matches 60 Hz reference over one second`, () => {
    const reference = realFixture(false),
      adapted = realFixture();
    try {
      seedReal(reference);
      seedReal(adapted);
      for (let i = 1; i <= 60; i++) reference.controls.update();
      for (let i = 1; i <= hz; i++) frame(adapted, i / hz);
      samePose(reference, adapted);
      assert.equal(adapted.samples.length, hz + 1); // One native move, one existing update per frame.
    } finally {
      disposeReal(reference, adapted);
    }
  });
test("installed 60 Hz full held and released trace remains equivalent including mid-frame release", () => {
  const reference = realFixture(false),
    adapted = realFixture();
  try {
    for (const f of [reference, adapted]) realDown(f);
    for (let i = 1; i <= 8; i++) {
      for (const f of [reference, adapted]) realMove(f, i * 10);
      reference.controls.update();
      frame(adapted, i / 60);
      samePose(reference, adapted);
    }
    for (const f of [reference, adapted]) realUp(f, 8 / 60 + 0.01);
    for (let i = 9; i <= 69; i++) {
      reference.controls.update();
      frame(adapted, i / 60);
      samePose(reference, adapted);
    }
    assert.equal(adapted.samples.length, reference.samples.length);
  } finally {
    disposeReal(reference, adapted);
  }
});
test("installed controls settle a five-second release in two existing demand updates", () => {
  const f = realFixture();
  try {
    seedReal(f);
    assert.equal(frame(f, 5), true);
    assert.equal(frame(f, 10), false);
    frame(f, 15);
    assert.equal(f.samples.length, 4);
    near(f.samples[1], factor(5), 1e-15);
    assert.equal(f.samples[3], BASE);
  } finally {
    disposeReal(f);
  }
});
test("installed next native mouse drag is unaffected by prior compensated factor", () => {
  const reference = realFixture(false),
    adapted = realFixture();
  try {
    seedReal(reference);
    seedReal(adapted);
    reference.controls.dampingFactor = factor(0.2);
    reference.controls.update();
    reference.controls.dampingFactor = BASE;
    frame(adapted, 0.2);
    for (const f of [reference, adapted]) {
      realDown(f, 1);
      realMove(f, 20);
    }
    samePose(reference, adapted);
    assert.equal(adapted.samples.at(-1), BASE);
  } finally {
    disposeReal(reference, adapted);
  }
});
test("installed wheel start/end during held mouse drag cannot start compensation", () => {
  const f = realFixture();
  try {
    realDown(f);
    realMove(f);
    f.adapter.inputBoundary(0.1);
    f.element.dispatch("wheel", { deltaY: 10, deltaMode: 0 });
    frame(f, 5);
    assert.equal(f.samples.at(-1), BASE);
    realUp(f, 5.01);
    frame(f, 5.11);
    near(f.samples.at(-1)!, factor(0.1));
  } finally {
    disposeReal(f);
  }
});
test("installed two-touch release cannot compensate while one touch remains", () => {
  const f = realFixture();
  try {
    realDown(f, 0, 1, "touch", 0);
    realDown(f, 0.01, 2, "touch", 40);
    realMove(f, 20, 1, "touch");
    realUp(f, 0.02, 1, "touch");
    frame(f, 1);
    assert.equal(f.samples.at(-1), BASE);
    realUp(f, 1.01, 2, "touch");
    frame(f, 1.11);
    near(f.samples.at(-1)!, factor(0.1));
  } finally {
    disposeReal(f);
  }
});
test("installed auto-rotation retains native baseline update behavior", () => {
  const reference = realFixture(false),
    adapted = realFixture();
  try {
    for (const f of [reference, adapted]) {
      seedReal(f);
      f.controls.autoRotate = true;
    }
    for (let i = 1; i <= 5; i++) {
      reference.controls.update();
      frame(adapted, i);
      samePose(reference, adapted);
    }
    assert.ok(adapted.samples.every((value) => value === BASE));
  } finally {
    disposeReal(reference, adapted);
  }
});
test("installed compensated motion respects orbit angle and distance bounds", () => {
  const f = realFixture();
  try {
    f.controls.minAzimuthAngle = -0.2;
    f.controls.maxAzimuthAngle = 0.2;
    realDown(f);
    realMove(f, 500);
    realUp(f);
    frame(f, 5);
    assert.ok(f.controls.getAzimuthalAngle() >= -0.2 - 1e-12);
    assert.ok(f.controls.getAzimuthalAngle() <= 0.2 + 1e-12);
    assert.ok(f.controls.getPolarAngle() >= f.controls.minPolarAngle);
    assert.ok(f.controls.getPolarAngle() <= f.controls.maxPolarAngle);
    assert.ok(f.controls.getDistance() >= f.controls.minDistance);
    assert.ok(f.controls.getDistance() <= f.controls.maxDistance);
  } finally {
    disposeReal(f);
  }
});

test("an immediate post-release frame retains the demand-loop baseline floor", () => {
  const f = fixture();
  release(f, 1);
  frame(f, 1);
  assert.equal(f.samples[0], BASE);
});
test("a cleared, unconsumed frame does not discard elapsed release time", () => {
  const f = fixture();
  release(f);
  f.adapter.arm(0.1, GOOD);
  f.adapter.clear();
  frame(f, 0.3);
  near(f.samples[0], factor(0.3));
});
test("an old settled frame cannot erase a newer synchronous release epoch", () => {
  let first = true;
  const f = fixture({
    update(this: OrbitLike) {
      f.samples.push(this.dampingFactor);
      if (first) {
        first = false;
        f.adapter.pointerDown(2, 0.21);
        f.adapter.pointerUp(2, 0.21);
      }
      return false;
    },
  });
  release(f);
  frame(f, 0.2);
  frame(f, 0.41);
  near(f.samples[1], factor(0.2));
});
test("mode ineligibility drops old held IDs before a later pointer-up", () => {
  const f = fixture();
  f.adapter.pointerDown(1, 0);
  frame(f, 0.1, { ...GOOD, exterior: false });
  f.adapter.pointerUp(1, 0.2);
  frame(f, 1);
  assert.deepEqual(f.samples, [BASE, BASE]);
});
