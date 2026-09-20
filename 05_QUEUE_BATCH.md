# Queue and Batch Processing

Create robust typed queue states:

idle
queued
processing
completed
failed
cancelled

Implement:
- individual progress
- overall progress
- retry
- remove
- clear completed
- clear all
- individual download
- ZIP download
- partial failure handling

Do not process unlimited heavy videos concurrently. Use conservative video concurrency and keep the UI responsive.
