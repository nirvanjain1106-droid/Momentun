import asyncio
import uuid
import logging
from collections import defaultdict
from typing import AsyncIterator

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Mocking the EventBus logic locally to test the leak
class MockEventBus:
    def __init__(self):
        self._subscribers = defaultdict(list)
        self._last_active = {}
        self._task_count = 0

    async def subscribe(self, user_id: str) -> AsyncIterator[dict]:
        self._task_count += 1
        curr_tasks = self._task_count
        logger.info(f"sse_subscribe_start | active_tasks: {curr_tasks}")
        
        queue = asyncio.Queue()
        self._subscribers[user_id].append(queue)
        
        try:
            while True:
                try:
                    # Simulation of the 15s ping loop
                    event = await asyncio.wait_for(queue.get(), timeout=0.1) 
                    if event is None:
                        break
                    yield event
                except asyncio.TimeoutError:
                    yield {"event": "ping"}
        finally:
            queues = self._subscribers[user_id]
            if queue in queues:
                queues.remove(queue)
            self._task_count -= 1
            logger.info(f"sse_subscribe_end | active_tasks: {self._task_count}")

    def cleanup_stale(self, user_id: str):
        # This is what cleanup_stale does in the real code
        # It just drops the queue from the registry
        logger.info(f"cleanup_stale for {user_id}")
        self._subscribers[user_id] = [] # Hard drop

async def simulate_leak():
    bus = MockEventBus()
    user_id = "user_123"

    async def consumer():
        async for msg in bus.subscribe(user_id):
            # Simulation of a long-lived but "forgotten" connection
            pass

    # Start a subscription
    task = asyncio.create_task(consumer())
    await asyncio.sleep(0.5) # Let it start and ping a few times
    
    print(f"Initial tasks: {bus._task_count}")
    
    # Simulate cleanup_stale running
    bus.cleanup_stale(user_id)
    
    await asyncio.sleep(0.5) # Wait to see if it pings/stays alive
    print(f"Tasks after cleanup: {bus._task_count}")
    
    if bus._task_count > 0:
        print("!!! LEAK CONFIRMED: Subscription task is still alive despite being dropped from registry.")
    else:
        print("No leak detected.")
        
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    print(f"Final tasks: {bus._task_count}")

if __name__ == "__main__":
    asyncio.run(simulate_leak())
