from __future__ import annotations

import json
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator


# 每个文件路径对应一把可重入锁。ThreadingHTTPServer 下同一 workspace 的
# 并发请求会命中同一路径，用这把锁把"读-改-写"整段串行化，避免竞态覆盖。
_LOCKS: dict[str, threading.RLock] = {}
_REGISTRY_LOCK = threading.Lock()


def _lock_key(path: Path) -> str:
    try:
        return str(path.resolve())
    except OSError:
        return str(path)


def path_lock(path: Path) -> threading.RLock:
    """返回某个文件路径对应的可重入锁（进程内共享、按需创建）。"""
    key = _lock_key(path)
    with _REGISTRY_LOCK:
        lock = _LOCKS.get(key)
        if lock is None:
            lock = threading.RLock()
            _LOCKS[key] = lock
        return lock


@contextmanager
def locked_path(path: Path) -> Iterator[None]:
    """对单个文件路径加锁的上下文管理器，用于包裹读-改-写序列。"""
    lock = path_lock(path)
    lock.acquire()
    try:
        yield
    finally:
        lock.release()


def atomic_write_text(path: Path, text: str, *, encoding: str = "utf-8") -> None:
    """原子写文本：先写 .tmp 同目录临时文件，再 rename 覆盖目标。

    同目录 rename 在同一文件系统上是原子操作，能保证读方要么看到旧内容、
    要么看到完整新内容，不会读到写了一半的文件。
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.{threading.get_ident()}.tmp")
    try:
        tmp.write_text(text, encoding=encoding)
        tmp.replace(path)
    except OSError:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        raise


def atomic_write_json(path: Path, payload: Any, *, indent: int = 2) -> None:
    """原子写 JSON，并对同一路径加锁，避免并发写互相截断。"""
    with locked_path(path):
        atomic_write_text(
            path,
            json.dumps(payload, ensure_ascii=False, indent=indent),
        )
