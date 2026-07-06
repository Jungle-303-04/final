"""명령 롱폴 웨이크업 — 알림 즉시 기상, 리스너 부재 시 타임아웃 폴백 검증."""

from __future__ import annotations

import asyncio
import time

from packages.runtime.command_wakeup import CommandWakeup, wakeup_key


def test_notify_wakes_matching_waiter_immediately() -> None:
    async def run() -> None:
        wakeup = CommandWakeup()
        started = time.monotonic()

        async def waiter() -> float:
            await wakeup.wait("workspace-1", "cluster-1", timeout=5)
            return time.monotonic() - started

        task = asyncio.create_task(waiter())
        await asyncio.sleep(0.05)  # 대기 등록 보장
        woken = wakeup.notify_local(wakeup_key("workspace-1", "cluster-1"))
        elapsed = await task

        assert woken == 1
        assert elapsed < 1.0  # 5초 타임아웃을 기다리지 않고 즉시 기상

    asyncio.run(run())


def test_notify_does_not_wake_other_cluster() -> None:
    async def run() -> None:
        wakeup = CommandWakeup()

        async def waiter() -> None:
            await wakeup.wait("workspace-1", "cluster-1", timeout=0.2)

        task = asyncio.create_task(waiter())
        await asyncio.sleep(0.05)
        woken = wakeup.notify_local(wakeup_key("workspace-1", "other-cluster"))
        await task

        assert woken == 0

    asyncio.run(run())


def test_wait_without_listener_times_out_like_plain_sleep() -> None:
    async def run() -> None:
        wakeup = CommandWakeup()
        started = time.monotonic()
        await wakeup.wait("workspace-1", "cluster-1", timeout=0.1)
        elapsed = time.monotonic() - started

        assert 0.08 <= elapsed < 1.0  # 알림 없으면 타임아웃까지만 대기(기존 폴링과 동일)
        assert not wakeup.listening

    asyncio.run(run())


def test_waiters_are_cleaned_up_after_wait() -> None:
    async def run() -> None:
        wakeup = CommandWakeup()
        await wakeup.wait("workspace-1", "cluster-1", timeout=0.01)
        assert wakeup.notify_local(wakeup_key("workspace-1", "cluster-1")) == 0

    asyncio.run(run())
