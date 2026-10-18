import { EdgeProvider } from "./edge.ts";
import { PiperProvider } from "./piper.ts";
import type { TtsProvider } from "./types.ts";

export type ProviderName = "edge" | "piper";

/** Primary first, fallback second. `only` restricts to one provider (testing, or a known outage). */
export function defaultProviders(only?: ProviderName): TtsProvider[] {
  const all: Record<ProviderName, () => TtsProvider> = {
    edge: () => new EdgeProvider(),
    piper: () => new PiperProvider(),
  };
  return only ? [all[only]()] : [all.edge(), all.piper()];
}
