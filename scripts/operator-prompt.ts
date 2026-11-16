import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { stdin, stdout } from "node:process";

export function operatorPrompt() {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("An interactive private terminal is required.");
  let hidden = false;
  const output = new Writable({ write(chunk, encoding, done) { if (!hidden) stdout.write(chunk, encoding); done(); } });
  // A later visible prompt must never recall a hidden URL/password with Up-arrow.
  const prompt = createInterface({ input: stdin, output, terminal: true, historySize: 0 });
  return {
    ask: (label: string) => prompt.question(label),
    async secret(label: string) {
      stdout.write(label);
      hidden = true;
      try { return await prompt.question(""); }
      finally { hidden = false; stdout.write("\n"); }
    },
    close() { hidden = false; prompt.close(); },
  };
}
