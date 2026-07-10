import type { Getter } from "copc";
import {
  createCachedRangeGetter,
  type CopcRangeGetterCacheOptions,
} from "./createCachedRangeGetter";
import { createHttpRangeGetter } from "./createHttpRangeGetter";

export type CopcSourceInput = string | Blob;

export interface CopcSourceDescriptor {
  readonly key: string;
  readonly input: CopcSourceInput;
}

let blobSourceId = 0;

export function createCopcSourceDescriptor(
  input: CopcSourceInput,
): CopcSourceDescriptor {
  return {
    key: typeof input === "string" ? `url:${input}` : `blob:${++blobSourceId}`,
    input,
  };
}

export type CopcRangeGetterOptions = CopcRangeGetterCacheOptions;

export function createCopcRangeGetter(
  input: CopcSourceInput,
  options: CopcRangeGetterOptions = {},
): Getter {
  return typeof input === "string"
    ? createHttpRangeGetter(input, options)
    : createCachedRangeGetter(createBlobRangeGetter(input), options);
}

export function createCopcSourceLabel(input: CopcSourceInput): string {
  if (typeof input === "string") {
    return input;
  }

  const namedBlob = input as Blob & { readonly name?: string };
  return namedBlob.name?.trim() || "COPC Blob";
}

function createBlobRangeGetter(blob: Blob): Getter {
  return async (begin: number, end: number): Promise<Uint8Array> => {
    if (
      !Number.isSafeInteger(begin) ||
      !Number.isSafeInteger(end) ||
      begin < 0 ||
      end < begin
    ) {
      throw new Error(`Invalid byte range: ${begin}-${end}`);
    }

    if (end === begin) {
      return new Uint8Array();
    }

    const arrayBuffer = await blob.slice(begin, end).arrayBuffer();
    return new Uint8Array(arrayBuffer);
  };
}
