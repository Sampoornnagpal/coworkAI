import time
from collections import defaultdict
from dataclasses import dataclass, field
import asyncio

@dataclass
class TeamWindow:
    token_log: list = field(default_factory=list)   # list of (timestamp, actual_token_count)
    request_log: list = field(default_factory=list)  # list of timestamps

class RateLimiter:
    def __init__(self):
        self._windows: dict[int, TeamWindow] = defaultdict(TeamWindow)
        self._lock = asyncio.Lock()

    async def check_request(self, team_id: int, tpm_limit: int, rpm_limit: int) -> tuple[bool, str]:
        """
        Call BEFORE creating the task.
        Checks RPM (request count in last 60s) and TPM (sum of ACTUAL tokens from
        completed requests in last 60s). If allowed, records this request's timestamp
        for RPM. Does NOT record any token estimate.
        Returns (allowed, reason).
        """
        async with self._lock:
            w = self._windows[team_id]
            now = time.time()
            # Prune entries older than 60s
            w.token_log = [(t, c) for t, c in w.token_log if t > now - 60]
            w.request_log = [t for t in w.request_log if t > now - 60]

            # RPM check
            if rpm_limit > 0 and len(w.request_log) >= rpm_limit:
                return False, f"Rate limit reached: {rpm_limit} requests per minute. Please wait a minute."

            # TPM check (based on tokens actually consumed by recently completed requests)
            if tpm_limit > 0:
                used = sum(c for _, c in w.token_log)
                if used >= tpm_limit:
                    return False, f"Token rate limit reached: {tpm_limit} tokens per minute. Please wait a minute."

            # Allowed — record the request for RPM
            w.request_log.append(now)
            return True, ""

    async def record_tokens(self, team_id: int, tokens: int):
        """Call AFTER the LLM responds, with the ACTUAL token count."""
        async with self._lock:
            self._windows[team_id].token_log.append((time.time(), tokens))

rate_limiter = RateLimiter()
