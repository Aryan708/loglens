/**
 * Generates a realistic sample log (about 2 hours of an e-commerce backend)
 * with a deliberate error spike, so the dashboard has something to show.
 *   node samples/generate-sample.mjs > samples/sample-app.log
 */

// Small seeded random generator so the output is identical on every run.
let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = (items) => items[Math.floor(rand() * items.length)];

const start = Date.UTC(2026, 2, 14, 9, 0, 0);
const lines = [];
const services = ['api-gateway', 'auth-service', 'cart-service', 'payment-service', 'inventory-service', 'search-service'];
const info = [
  () => `GET /api/products/${Math.floor(rand() * 9000) + 1000} 200 ${Math.floor(rand() * 180) + 20}ms`,
  () => `User ${Math.floor(rand() * 90000) + 10000} logged in`,
  () => `Added item ${Math.floor(rand() * 900) + 100} to cart ${Math.floor(rand() * 9000)}`,
  () => `Search query completed in ${Math.floor(rand() * 90) + 10}ms (${Math.floor(rand() * 200)} results)`,
  () => `Order ${Math.floor(rand() * 90000) + 10000} placed successfully`,
  () => 'Health check passed',
  () => `Cache hit ratio ${Math.floor(rand() * 20) + 80}%`,
];
const warn = [
  () => `Slow response from inventory DB: ${Math.floor(rand() * 1500) + 800}ms`,
  () => `Retrying request to payment provider (attempt ${Math.floor(rand() * 3) + 1})`,
  () => `Connection pool at ${Math.floor(rand() * 15) + 80}% capacity`,
  () => 'Deprecated API version v1 called by client mobile-ios',
];
const errors = [
  () => `Timeout after ${pick([3000, 5000])}ms calling payment provider for order ${Math.floor(rand() * 90000) + 10000}`,
  () => `Database connection refused: 10.0.3.${Math.floor(rand() * 50) + 10}:5432`,
  () => `Failed to reserve stock for SKU ${Math.floor(rand() * 900000) + 100000}: insufficient quantity`,
  () => 'JWT validation failed: token expired',
];

for (let t = start; t < start + 2 * 3600 * 1000; t += Math.floor(rand() * 9000) + 1000) {
  const minute = (t - start) / 60000;
  const inIncident = minute >= 71 && minute <= 79; // payment provider outage
  const ts = new Date(t).toISOString().replace('T', ' ').replace('Z', '').replace('.', ',');
  const r = rand();

  if (inIncident && r < 0.55) {
    lines.push(`${ts} ERROR [payment-service] ${errors[0]()}`);
    if (rand() < 0.15) {
      lines.push('java.net.SocketTimeoutException: Read timed out');
      lines.push('    at com.shop.payments.ProviderClient.charge(ProviderClient.java:142)');
      lines.push('    at com.shop.payments.CheckoutService.pay(CheckoutService.java:87)');
    }
  } else if (r < 0.04) {
    lines.push(`${ts} ERROR [${pick(services)}] ${pick(errors)()}`);
  } else if (r < 0.13) {
    lines.push(`${ts} WARN [${pick(services)}] ${pick(warn)()}`);
  } else if (r < 0.2) {
    lines.push(`${ts} DEBUG [${pick(services)}] Request context loaded in ${Math.floor(rand() * 5) + 1}ms`);
  } else {
    lines.push(`${ts} INFO [${pick(services)}] ${pick(info)()}`);
  }
  if (minute > 74 && minute < 75 && rand() < 0.2) {
    lines.push(`${ts} FATAL [payment-service] Circuit breaker OPEN for payment provider after repeated failures`);
  }
}

process.stdout.write(`${lines.join('\n')}\n`);
