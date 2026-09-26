import type { StopReasonRule } from "@evsa/core";
import type { ParsedFile, WorkerRequest, WorkerResponse } from "../workers/protocol";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
type Payload<T> = T extends unknown ? Omit<T, "id"> : never;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function get(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/file.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.result);
    else p.reject(new Error(e.data.error));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || "File worker crashed"));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function call<T>(msg: Payload<WorkerRequest>): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    get().postMessage({ ...msg, id } as WorkerRequest);
  });
}

export const parseFile = (file: File) => call<ParsedFile>({ type: "parse", file });
export const exportClassified = (rules: StopReasonRule[], reportDate: string) => call<Blob>({ type: "export", rules, reportDate });
export const clearFile = () => call<null>({ type: "clear" });

export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
