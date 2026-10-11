import assert from 'node:assert/strict';

/** Read actual production DOM geometry in the CI browser, with no app hook. */
export function measureCabinWindowLayout() {
  const status = document.querySelector('.cabin-window-status');
  if (!status) return null;
  const button = status.parentElement.querySelector('.study-disclosure');
  const header = document.querySelector('.config-information-header');
  const rect = element => {
    const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
    return { left, top, right, bottom, width, height };
  };
  return {
    viewport: { width: innerWidth, height: innerHeight },
    hidden: status.hidden,
    rendered: status.getClientRects().length > 0,
    status: rect(status),
    button: rect(button),
    header: rect(header),
    textFits: status.scrollWidth <= status.clientWidth + 1,
  };
}

export function assertCabinWindowLayout(layout) {
  if (!layout) return;
  assert.ok(layout.button.height >= 43, 'Provenance keeps its 44px touch target');
  if (layout.hidden) {
    assert.equal(layout.rendered, false, 'Irrelevant window status is not painted inside the full cabin');
    return;
  }
  assert.equal(layout.rendered, true, 'Exterior window status remains visible');
  assert.ok(layout.status.top >= layout.button.bottom, 'Window status is below the provenance button without overlap');
  assert.ok(layout.status.top <= layout.button.bottom + 8, 'Window status remains adjacent to provenance');
  assert.ok(layout.status.left >= 0 && layout.status.right <= layout.viewport.width, 'Window status fits viewport width');
  assert.ok(layout.status.top >= 0 && layout.status.bottom <= layout.viewport.height, 'Window status fits viewport height');
  assert.ok(layout.status.height > 0 && layout.status.height <= 32 && layout.textFits, 'Window status is at most two unclipped lines');
  if (layout.viewport.width <= 760) {
    assert.ok(layout.status.bottom <= layout.header.bottom, 'Mobile window status stays in the header above the canvas');
  }
}
