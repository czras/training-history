import { RateLimiter } from "./rate-limiter.js";

const WORKERS = 8;

type QueuedRequest = {
  url: string;
  init?: RequestInit;
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
};

class HttpClient {
  private readonly queue: QueuedRequest[] = [];
  private readonly waiters: Array<
    (request: QueuedRequest) => void
  > = [];

  private readonly rateLimiter = new RateLimiter();

  constructor(workerCount = WORKERS) {
    for (let i = 0; i < workerCount; i++) {
      void this.worker();
    }
  }

  get(url: string, init?: RequestInit): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const request: QueuedRequest = {
        url,
        init,
        resolve,
        reject,
      };

      const waiter = this.waiters.shift();

      if (waiter) {
        waiter(request);
      } else {
        this.queue.push(request);
      }
    });
  }

  private async worker(): Promise<void> {
    while (true) {
      const request = await this.next();

      try {
        await this.rateLimiter.wait();

        const response = await fetch(request.url, request.init);

        this.rateLimiter.observe(response);

        if (response.status === 429) {
          const retryAfter = this.rateLimiter.retryAfter(response);

          if (retryAfter !== undefined) {
            this.rateLimiter.blockFor(retryAfter);
            this.queue.unshift(request);
            continue;
          }
        }

        request.resolve(response);
      } catch (error) {
        request.reject(error);
      }
    }
  }

  private next(): Promise<QueuedRequest> {
    const request = this.queue.shift();

    if (request) {
      return Promise.resolve(request);
    }

    return new Promise<QueuedRequest>((resolve) => {
      this.waiters.push(resolve);
    });
  }
}

export const http = new HttpClient();
