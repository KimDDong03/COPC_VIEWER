import { describe, expect, it } from "vitest";
import {
  consumeSharedAbortableTask,
  createSharedAbortableTask,
} from "./SharedAbortableTask";

describe("SharedAbortableTask", () => {
  it("aborts an unconsumed pending task when its first consumer is already aborted", async () => {
    let operationSignal: AbortSignal | undefined;
    const task = createSharedAbortableTask<number>(async (signal) => {
      operationSignal = signal;

      return await new Promise<number>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    });
    const abortController = new AbortController();
    abortController.abort();

    expect(() =>
      consumeSharedAbortableTask(task, abortController.signal),
    ).toThrowError(expect.objectContaining({ name: "AbortError" }));
    expect(operationSignal?.aborted).toBe(true);
    expect(task.activeConsumerCount).toBe(0);
    await expect(task.promise).rejects.toMatchObject({ name: "AbortError" });
    expect(task.state).toBe("rejected");
  });
});
