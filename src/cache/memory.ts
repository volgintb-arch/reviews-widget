import NodeCache from 'node-cache';

// TTL 300 seconds (5 minutes)
export const memoryCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60,
  useClones: false,
});
