import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

@dataclass
class TaskRecord:
    task_id: str
    team_id: int
    user_id: int
    question: str
    status: str = "processing"          # processing | completed | failed
    chunks: list[str] = field(default_factory=list)
    result: Optional[str] = None
    sources: Optional[list[dict]] = None
    model_used: str = ""
    error: Optional[str] = None
    tokens_used: int = 0
    created_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None

class TaskManager:
    def __init__(self):
        self.tasks: dict[str, TaskRecord] = {}
        self._lock = asyncio.Lock()

    async def create_task(self, team_id: int, user_id: int, question: str) -> str:
        task_id = str(uuid.uuid4())
        async with self._lock:
            self.tasks[task_id] = TaskRecord(
                task_id=task_id, team_id=team_id,
                user_id=user_id, question=question
            )
        return task_id

    async def append_chunk(self, task_id: str, chunk: str):
        async with self._lock:
            if task_id in self.tasks:
                self.tasks[task_id].chunks.append(chunk)

    async def complete_task(self, task_id: str, result: str, sources: list[dict],
                            model_used: str = "", tokens: int = 0):
        async with self._lock:
            if task_id in self.tasks:
                t = self.tasks[task_id]
                t.status = "completed"
                t.result = result
                t.sources = sources
                t.model_used = model_used
                t.tokens_used = tokens
                t.completed_at = datetime.utcnow()

    async def fail_task(self, task_id: str, error: str):
        async with self._lock:
            if task_id in self.tasks:
                t = self.tasks[task_id]
                t.status = "failed"
                t.error = error
                t.completed_at = datetime.utcnow()

    def get_task(self, task_id: str) -> Optional[TaskRecord]:
        return self.tasks.get(task_id)

    def get_chunks_since(self, task_id: str, offset: int) -> list[str]:
        task = self.tasks.get(task_id)
        if not task:
            return []
        return task.chunks[offset:]

    async def cleanup_old_tasks(self, max_age_minutes: int = 30):
        now = datetime.utcnow()
        async with self._lock:
            expired = [
                tid for tid, t in self.tasks.items()
                if t.completed_at and (now - t.completed_at).total_seconds() > max_age_minutes * 60
            ]
            for tid in expired:
                del self.tasks[tid]

# Global singleton
task_manager = TaskManager()
