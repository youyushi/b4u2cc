interface PendingRequest {
  id: string;
  resolve: () => void;
  timestamp: number;
}

// 简单的异步等待函数，与项目中其他部分保持一致
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class RateLimiter {
  private timestamps: number[] = [];
  private pendingQueue: PendingRequest[] = [];
  private isProcessing = false;
  private requestCounter = 0;

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  async acquire(): Promise<void> {
    if (this.limit <= 0) {
      return;
    }

    const requestId = `req_${++this.requestCounter}_${Date.now()}`;
    
    return new Promise<void>((resolve) => {
      // 将请求添加到队列中，确保先来后到
      this.pendingQueue.push({
        id: requestId,
        resolve,
        timestamp: Date.now(),
      });

      // 如果当前没有在处理队列，开始处理
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.pendingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.pendingQueue.length > 0) {
        const now = Date.now();
        
        // 清理过期的时间戳
        this.cleanupExpiredTimestamps(now);
        
        // 如果还有配额，处理下一个请求
        if (this.timestamps.length < this.limit) {
          const request = this.pendingQueue.shift()!;
          this.timestamps.push(now);
          request.resolve();
        } else {
          // 没有配额，计算需要等待的时间
          const oldestTimestamp = this.timestamps[0];
          const waitMs = Math.max(0, this.windowMs - (now - oldestTimestamp));
          
          if (waitMs > 0) {
            // 等待最旧的时间戳过期
            await sleep(waitMs);
          } else {
            // 如果等待时间为0，立即清理并继续
            this.cleanupExpiredTimestamps(Date.now());
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private cleanupExpiredTimestamps(now: number): void {
    // 保留在时间窗口内的时间戳
    this.timestamps = this.timestamps.filter((ts) => now - ts < this.windowMs);
  }

  // 用于测试和调试的方法
  getQueueLength(): number {
    return this.pendingQueue.length;
  }

  getActiveRequestsCount(): number {
    this.cleanupExpiredTimestamps(Date.now());
    return this.timestamps.length;
  }
}
