// Monetization abstraction.
//
// In production, wire these to native plugins (the calls are already shaped for
// it), e.g.:
//   Ads        -> @capacitor-community/admob (rewarded video)
//   Purchases  -> @capacitor-community/in-app-purchases or RevenueCat
//
// Until a provider is set, Ads falls back to a mock rewarded ad (a short
// in-page placeholder) so the full continue flow is playable in the browser,
// and Purchases reports as unavailable.

export class Ads {
  constructor() {
    this.provider = null;
  }

  setProvider(p) {
    this.provider = p;
  }

  // Resolves true when the player earned the reward (finished the ad).
  async showRewarded() {
    if (this.provider?.showRewarded) {
      try {
        return await this.provider.showRewarded();
      } catch {
        return false;
      }
    }
    return false;
  }
}

export class Purchases {
  constructor() {
    this.provider = null;
  }

  setProvider(p) {
    this.provider = p;
  }

  available() {
    return !!this.provider;
  }

  // Real-money coin packs would resolve to the number of coins granted.
  async buy(packId) {
    if (this.provider?.buy) {
      try {
        return await this.provider.buy(packId);
      } catch {
        return 0;
      }
    }
    return 0;
  }
}
