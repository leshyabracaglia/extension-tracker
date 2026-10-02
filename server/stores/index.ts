import { chrome } from './chrome.ts';
import { edge } from './edge.ts';
import { firefox } from './firefox.ts';
import { safari } from './safari.ts';
import type { Store, StoreAdapter } from './types.ts';

export * from './types.ts';

export const adapters: Record<Store, StoreAdapter> = { chrome, firefox, edge, safari };
