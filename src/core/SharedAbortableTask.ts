export type SharedAbortableTaskState =
  | "pending"
  | "fulfilled"
  | "rejected";

export interface SharedAbortableTask<T> {
  readonly abortController: AbortController;
  readonly promise: Promise<T>;
  state: SharedAbortableTaskState;
  activeConsumerCount: number;
}

export function createSharedAbortableTask<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): SharedAbortableTask<T> {
  const abortController = new AbortController();
  let task: SharedAbortableTask<T>;
  let operationPromise: Promise<T>;

  try {
    operationPromise = operation(abortController.signal);
  } catch (error: unknown) {
    operationPromise = Promise.reject(error);
  }

  const promise = operationPromise.then(
    (value) => {
      task.state = "fulfilled";
      return value;
    },
    (error: unknown) => {
      task.state = "rejected";
      throw error;
    },
  );

  task = {
    abortController,
    promise,
    state: "pending",
    activeConsumerCount: 0,
  };
  return task;
}

export function createFulfilledSharedAbortableTask<T>(
  value: T,
): SharedAbortableTask<T> {
  return {
    abortController: new AbortController(),
    promise: Promise.resolve(value),
    state: "fulfilled",
    activeConsumerCount: 0,
  };
}

export function isReusableSharedAbortableTask<T>(
  task: SharedAbortableTask<T>,
): boolean {
  return task.state !== "rejected" && !task.abortController.signal.aborted;
}

export function consumeSharedAbortableTask<T>(
  task: SharedAbortableTask<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    if (
      task.state === "pending" &&
      task.activeConsumerCount === 0 &&
      !task.abortController.signal.aborted
    ) {
      task.abortController.abort(createAbortError(signal));
    }

    throw createAbortError(signal);
  }

  if (task.state !== "pending") {
    return withAbortSignal(task.promise, signal);
  }

  task.activeConsumerCount += 1;
  return withAbortSignal(task.promise, signal).finally(() => {
    task.activeConsumerCount -= 1;

    if (
      task.state === "pending" &&
      task.activeConsumerCount === 0 &&
      !task.abortController.signal.aborted
    ) {
      task.abortController.abort(createAbortError(signal));
    }
  });
}

function withAbortSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) {
    return promise;
  }

  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const abort = (): void => {
      cleanup();
      reject(createAbortError(signal));
    };
    const cleanup = (): void => {
      signal.removeEventListener("abort", abort);
    };

    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createAbortError(signal);
  }
}

function createAbortError(signal: AbortSignal | undefined): Error {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }

  if (typeof DOMException !== "undefined") {
    return new DOMException("The operation was aborted.", "AbortError");
  }

  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}
