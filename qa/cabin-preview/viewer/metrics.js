function distribution(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return { min: sorted[0], median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted.at(-1) };
}

export function createFrameSample(now, previousFrame, renderCpuMs, calls, triangles) {
  return { intervalMs: previousFrame ? now - previousFrame : null, renderCpuMs, calls, triangles };
}

export function summarizeSamples(samples) {
  return { samples: samples.length, frames: samples.map(value => ({...value})),
    frameIntervalsMs: distribution(samples.map(value => value.intervalMs).filter(Number.isFinite)),
    renderCpuMs: distribution(samples.map(value => value.renderCpuMs)),
    drawCalls: distribution(samples.map(value => value.calls)),
    renderedTriangles: distribution(samples.map(value => value.triangles)), gpuTimeMs: null,
    interpretation: 'Browser frame intervals and JavaScript render-submission wall time. CPU time excludes asynchronous GPU completion. This is not physical Android performance.' };
}
