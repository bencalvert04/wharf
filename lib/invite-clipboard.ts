/** Start during the click so Safari retains clipboard permission while we create the link. */
export function beginInviteCopy() {
  let resolve!: (url: string) => void;
  let reject!: (error: Error) => void;
  const url = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  let result: Promise<boolean>;
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const content = url.then(value => new Blob([value], {type: 'text/plain'}));
      // Observe cancellation even when a browser rejects the write before reading content.
      void content.catch(() => {});
      result = navigator.clipboard.write([new ClipboardItem({'text/plain': content})]).then(() => true, () => false);
    } else {
      result = url.then(value => navigator.clipboard.writeText(value)).then(() => true, () => false);
    }
  } catch {
    result = Promise.resolve(false);
  }
  void url.catch(() => {});
  // Clipboard permission/focus can leave a write pending indefinitely. Once the
  // meeting exists, stop waiting so calendar sign-in can continue.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let finish!: (copied: boolean) => void;
  const boundedResult = new Promise<boolean>(done => {
    finish = copied => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done(copied);
    };
  });
  void result.then(finish);
  return {
    resolve: (value: string) => {
      if (!settled && timer === undefined) timer = setTimeout(() => finish(false), 1500);
      resolve(value);
    },
    cancel: () => {
      reject(new Error('Meeting creation cancelled'));
      finish(false);
    },
    result: boundedResult,
  };
}
export type InviteCopy = ReturnType<typeof beginInviteCopy>;
