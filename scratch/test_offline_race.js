// Mocking the offlineQueue.ts logic in Node
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let isDraining = false;
let mockStorage = [];

async function getQueue() {
    return [...mockStorage];
}

async function setQueue(q) {
    mockStorage = [...q];
}

async function drainQueue() {
    if (isDraining) {
        console.log('[drainQueue] ALREADY DRAINING - Skipping');
        return;
    }
    isDraining = true;
    console.log('[drainQueue] STARTING');

    try {
        const actions = await getQueue(); // SNAPSHOT
        console.log(`[drainQueue] Found ${actions.length} items in snapshot`);

        for (const action of actions) {
            console.log(`[drainQueue] Processing: ${action.type}`);
            await sleep(100); // Simulate network latency
            
            // In real code, we remove it from the ACTUAL queue after success
            mockStorage = mockStorage.filter(a => a.id !== action.id);
        }
    } finally {
        isDraining = false;
        console.log('[drainQueue] FINISHED');
    }
}

async function enqueueAction(type) {
    const id = Math.random().toString(36).substring(7);
    const queue = await getQueue();
    queue.push({ id, type });
    await setQueue(queue);
    console.log(`[enqueue] Added ${type}. Queue size: ${mockStorage.length}`);
    drainQueue();
}

async function runTest() {
    console.log('--- TEST START ---');
    
    // 1. Initial enqueue
    enqueueAction('TASK_1');
    
    // 2. Wait a bit, then enqueue while it's draining
    await sleep(50);
    enqueueAction('TASK_2'); // This should be missed!
    
    // 3. Wait for drain to finish
    await sleep(500);
    
    console.log('--- TEST END ---');
    console.log(`Final Queue State: ${JSON.stringify(mockStorage)}`);
    
    if (mockStorage.length > 0) {
        console.log('!!! RACE CONFIRMED: TASK_2 was never drained because it was added during an active drain.');
    } else {
        console.log('No race detected.');
    }
}

runTest();
