import { profileLimits, normalizeProcessInfo, summarizeProcessCpu, traceStartOptions, summarizeTimeline } from './pipeline-profile-policy.mjs';
export async function bounded(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms); })]); }
  finally { clearTimeout(timer); }
}
/** Browser-level counters/timeline only. No app hooks, screenshots, or GL queries. */
export function createPipelineCollector({ cdp, phase = () => 'profile', now = () => performance.now(), writeTrace, limits = profileLimits }) {
  const report = { scope: 'Bounded instrumented pipeline attribution, not acceptance', limits, samples: [], issues: [], trace: { status: 'not-started', bytes: 0, maxBufferUsage: 0 }, markers: [], status: 'not-started' };
  let stopped = false, samplingTimer, windowTimer, samplePending = null, stopPromise, traceStarted = false, traceDoneResolve, traceDone, knownStream, streamCloseAttempted = false;
  const issue = e => { const s = String(e); if (!report.issues.includes(s) && report.issues.length < 32) report.issues.push(s); };
  const send = (method, params, ms = limits.controlMs) => bounded(Promise.resolve().then(() => cdp.send(method, params)), ms, method);
  const onUsage = e => { const value = e.percentFull ?? e.value; if (Number.isFinite(value)) { report.trace.maxBufferUsage = Math.max(report.trace.maxBufferUsage, value); if (value >= .99) issue('Trace buffer reached capacity; attribution incomplete'); } };
  const onComplete = e => { knownStream = e.stream; traceDoneResolve(e); };
  const closeKnownStream = async () => {
    if (!knownStream || streamCloseAttempted) return;
    streamCloseAttempted = true;
    try { await send('IO.close', {handle: knownStream}); report.trace.streamClosed = true; }
    catch (e) { report.trace.streamClosed = false; issue(e); }
  };
  const sample = async () => {
    try {
      if (report.samples.length >= limits.maxCpuSamples) throw new Error('CPU sample cap reached');
      const hostBefore = now(), phaseBefore = phase(), response = await send('SystemInfo.getProcessInfo', undefined, limits.requestMs);
      report.samples.push({ time: now(), hostBefore, phaseBefore, phase: phase(), processes: normalizeProcessInfo(response.processInfo, limits.maxProcesses) });
    } catch (e) { issue(e); return false; }
    return true;
  };
  const schedule = () => {
    if (stopped) return;
    samplingTimer = setTimeout(() => { samplePending = sample().then(ok => { samplePending = null; if (ok) schedule(); }); }, limits.cpuIntervalMs);
  };
  const api = {
    async start() {
      if (report.status !== 'not-started') throw new Error('Pipeline collector may start only once');
      report.startedAt = now(); report.status = 'starting';
      try {
        const categories = await send('Tracing.getCategories'), options = traceStartOptions(categories.categories);
        traceDone = new Promise(resolve => traceDoneResolve = resolve);
        cdp.on('Tracing.bufferUsage', onUsage); cdp.on('Tracing.tracingComplete', onComplete);
        // Start the wall cap before the recording request, not after its acknowledgement.
        report.trace.startRequestedAt = now(); traceStarted = true;
        windowTimer = setTimeout(() => { issue('Profile wall-time cap reached'); void api.stop('window-limit'); }, limits.windowMs);
        await send('Tracing.start', options); report.trace.startAcknowledgedAt = now(); report.trace.status = 'recording';
        if (stopped) throw new Error('Profile stopped during trace start');
        samplePending = sample(); const ok = await samplePending; samplePending = null;
        if (!ok || stopped) throw new Error('Initial CPU sample unavailable or profile stopped');
        report.status = 'recording'; schedule();
      } catch (e) { issue(e); await api.stop('start-failure'); throw e; }
    },
    active: () => !stopped && report.status === 'recording',
    async mark(name) {
      if (!api.active()) throw new Error('Profile inactive');
      if (!['orbit-input', 'single-capture'].includes(name)) throw new Error('Unreviewed trace marker');
      const marker = { syncId: `pipeline-${name}`, hostBefore: now() }; report.markers.push(marker);
      try { await send('Tracing.recordClockSyncMarker', { syncId: marker.syncId }, limits.requestMs); marker.acknowledged = true; }
      catch (e) { marker.error = String(e); issue(e); throw e; }
      finally { marker.hostAfter = now(); }
    },
    async stop(reason = 'capture-settled') {
      if (stopPromise) return stopPromise;
      stopped = true; clearTimeout(samplingTimer); clearTimeout(windowTimer);
      report.stopReason = reason; report.stoppedAt = now();
      stopPromise = (async () => {
        try {
          if (traceStarted) {
            // Do not let a pending CPU request defer the stop command.
            report.trace.endRequestedAt = now(); await send('Tracing.end'); report.trace.endAcknowledgedAt = now();
            const completed = await bounded(traceDone, limits.controlMs, 'Tracing.tracingComplete');
            report.trace.completeAt = now();
            if (completed.dataLossOccurred) issue('Chromium reported trace data loss');
            if (!completed.stream) throw new Error('Trace stream missing');
            const chunks = [];
            try {
              const deadline = now() + limits.exportMs;
              for (;;) {
                if (now() >= deadline) throw new Error('Trace export wall-time cap reached');
                const part = await send('IO.read', { handle: completed.stream, size: limits.chunkBytes }, Math.min(limits.controlMs, Math.max(1, deadline - now())));
                const chunk = Buffer.from(part.data, part.base64Encoded ? 'base64' : 'utf8'); report.trace.bytes += chunk.length;
                if (report.trace.bytes > limits.maxTraceBytes) throw new Error('Trace byte cap exceeded');
                chunks.push(chunk); if (part.eof) break;
              }
              const bytes = Buffer.concat(chunks); report.trace.summary = summarizeTimeline(bytes);
              if (!report.trace.summary.hasRendererTrack || !report.trace.summary.hasGpuTrack) issue('Required renderer/GPU trace tracks missing');
              for (const marker of report.markers) {
                const anchors = report.trace.summary.clockSyncMarkers.filter(m => m.syncId === marker.syncId);
                if (anchors.length !== 1) issue(`Trace clock anchor missing/ambiguous: ${marker.syncId}`);
                else marker.traceTimestampUs = anchors[0].traceTimestampUs;
              }
              if (now() >= deadline) throw new Error('Trace export wall-time cap reached after parsing');
              await bounded(Promise.resolve().then(() => writeTrace(bytes)), Math.min(limits.controlMs, Math.max(1, deadline - now())), 'Trace artifact write');
              if (now() >= deadline) throw new Error('Trace export wall-time cap reached after writing');
              report.trace.status = 'exported';
            } finally {
              await closeKnownStream();
            }
          }
        } catch (e) { issue(e); report.trace.status = 'incomplete'; }
        finally {
          if (samplePending) await samplePending;
          await closeKnownStream();
          cdp.off('Tracing.bufferUsage', onUsage); cdp.off('Tracing.tracingComplete', onComplete);
          try {
            if (report.samples.length < 2) issue('Fewer than two process CPU samples');
            report.cpu = summarizeProcessCpu(report.samples);
            if (report.cpu.issues.length) issue('Process CPU continuity incomplete');
          } catch (e) { issue(e); }
          report.status = report.issues.length ? 'inconclusive' : 'collected'; report.finishedAt = now();
        }
        return api.snapshot();
      })();
      return stopPromise;
    },
    snapshot: () => JSON.parse(JSON.stringify(report)),
  };
  return api;
}
/** Stop is requested on the original screenshot promise settlement, before post-capture
 * geometry/export work. Cleanup is awaited separately and cannot start another capture. */
export function createSingleProfiledCapture(collector) {
  let used = false, completion;
  return {
    async run(capture) {
      if (used) throw new Error('Only one profile screenshot is permitted'); used = true;
      if (!collector.active()) throw new Error('Profile stopped before screenshot; do not enqueue');
      try { return await capture(); }
      finally { completion = collector.stop('single-capture-settled'); void completion.catch(() => {}); }
    },
    finish: () => completion ?? collector.stop('no-capture'),
  };
}
