import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const baseUrl = (process.env.SAVIA_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const total = boundedInteger(process.env.SAVIA_LOAD_REQUESTS, 100, 1, 10_000);
const concurrency = boundedInteger(process.env.SAVIA_LOAD_CONCURRENCY, 10, 1, 100);
const p95Limit = boundedInteger(process.env.SAVIA_LOAD_P95_MS, 1_500, 50, 60_000);
const durations = [];
let next = 0;
let failures = 0;

const started = performance.now();
await Promise.all(Array.from({ length: Math.min(total, concurrency) }, async () => {
  while (true) {
    const current = next;
    next += 1;
    if (current >= total) return;
    const requestStarted = performance.now();
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.json();
      if (!response.ok || body.status !== 'healthy') failures += 1;
    } catch {
      failures += 1;
    } finally {
      durations.push(performance.now() - requestStarted);
    }
  }
}));

const elapsed = performance.now() - started;
durations.sort((left, right) => left - right);
const percentile = (value) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * value) - 1)] ?? 0;
const p50 = percentile(0.5);
const p95 = percentile(0.95);
const p99 = percentile(0.99);

console.log(JSON.stringify({
  url: `${baseUrl}/api/health`,
  requests: total,
  concurrency,
  failures,
  requestsPerSecond: Number((total / (elapsed / 1_000)).toFixed(2)),
  p50Ms: Number(p50.toFixed(2)),
  p95Ms: Number(p95.toFixed(2)),
  p99Ms: Number(p99.toFixed(2)),
}, null, 2));

assert.equal(failures, 0, `${failures} solicitudes fallaron.`);
assert.ok(p95 <= p95Limit, `p95 ${p95.toFixed(2)} ms excede el límite ${p95Limit} ms.`);

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Valor de carga inválido: ${value}`);
  }
  return parsed;
}
