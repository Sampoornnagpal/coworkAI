import time
import asyncio
from collections import defaultdict

class RateLimiter:
    def __init__(self):
        self.windows: dict[str, list[float]] = defaultdict(list)
        self.lock = asyncio.Lock()
    
    async def check_rate_limit(self, key: str, rpm_limit: int) -> bool:
        """Returns True if within limit, False if exceeded."""
        async with self.lock:
            now = time.time()
            window = self.windows[key]
            # Remove entries older than 60 seconds
            self.windows[key] = [t for t in window if now - t < 60]
            if len(self.windows[key]) >= rpm_limit:
                return False
            self.windows[key].append(now)
            return True
    
    async def get_usage(self, key: str) -> dict:
        async with self.lock:
            now = time.time()
            window = self.windows[key]
            self.windows[key] = [t for t in window if now - t < 60]
            return {
                "current_rpm": len(self.windows[key]),
                "window_seconds": 60
            }

rate_limiter = RateLimiter()
