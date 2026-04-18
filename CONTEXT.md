# Session Context - 2026-04-18

**Current Task**: Finished implementing support for non-goal ad-hoc tasks and improved scheduler reliability locks.

### Key Decisions
- **Locking**: Implemented row-level locking on the `User` table to serialize schedule generation and a time-based stale lock force-release mechanism.
- **Solver**: Added a `general` task type to allow ad-hoc tasks without goal IDs.
- **Fail-safe**: Added "undelete" logic to `_handle_stale_schedule` so that if regeneration fails, the stale schedule remains accessible.

### Next Steps
- Implement frontend UI to allow users to add these new "General" tasks.
- Track solver latency as the number of active goals grows.
