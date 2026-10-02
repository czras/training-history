class RateLimiter {
  private blockedUntil = 0;

  async wait(): Promise<void> {
    const delay = this.blockedUntil - Date.now();

    if (delay > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, delay);
      });
    }
  }

  observe(response: Response): void {
    const remaining = this.headerNumber(
      response.headers,
      "x-ratelimit-remaining",
    );

    if (remaining !== 0) {
      return;
    }

    const reset = this.resetDelay(response);

    if (reset !== undefined) {
      this.blockFor(reset);
    }
  }

  retryAfter(response: Response): number | undefined {
    const value = response.headers.get("retry-after");

    if (!value) {
      return undefined;
    }

    const seconds = Number(value);

    if (Number.isFinite(seconds)) {
      return Math.max(0, seconds * 1000);
    }

    const date = Date.parse(value);

    if (!Number.isNaN(date)) {
      return Math.max(0, date - Date.now());
    }

    return undefined;
  }

  blockFor(delay: number): void {
    this.blockedUntil = Math.max(
      this.blockedUntil,
      Date.now() + delay,
    );
  }

  private resetDelay(response: Response): number | undefined {
    const value = response.headers.get("x-ratelimit-reset");

    if (!value) {
      return undefined;
    }

    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
      return undefined;
    }

    // Common convention: Unix timestamp.
    if (numeric > 1_000_000_000) {
      return Math.max(0, numeric * 1000 - Date.now());
    }

    // Otherwise treat it as seconds until reset.
    return Math.max(0, numeric * 1000);
  }

  private headerNumber(
    headers: Headers,
    name: string,
  ): number | undefined {
    const value = headers.get(name);

    if (value === null) {
      return undefined;
    }

    const numeric = Number(value);

    return Number.isFinite(numeric) ? numeric : undefined;
  }
}

export { RateLimiter };
