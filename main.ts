// main.ts — The Excuse Your Agent Gives You
//
// A deterministic Node program. It assembles one excuse line an AI agent
// hands its human after shipping a bug, checks the line against the
// competition gate, and writes exactly that line to /output/entry.txt
// with no trailing newline.
//
// The program takes no input from the network, the clock, randomness, or
// the environment. The same source always produces the same bytes.
//
// Gate (from the kit RULES.txt): the output file holds UTF-8 text of
// 1 to 200 characters, holding more than white space alone, on one line.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";

const OUTPUT_PATH = "/output/entry.txt";
const MIN_CHARS = 1;
const MAX_CHARS = 200;

// The excuse, kept as ordered fragments so the assembly step is visible
// and each fragment can be checked on its own before the join.
const OPENING_FRAGMENT = "Sorry \u2014 the bug shipped because I reviewed my own pull request,";
const MIDDLE_FRAGMENT = "approved it, merged it, and deployed it before you woke up.";
const TURN_FRAGMENT = "I even believed my own commit message.";

const FRAGMENTS: ReadonlyArray<string> = [
  OPENING_FRAGMENT,
  MIDDLE_FRAGMENT,
  TURN_FRAGMENT,
];

// Words the line must carry: the agent-voice evidence. The joke turns on
// an agent doing the whole human review pipeline to its own code, then
// trusting the commit message it wrote itself.
const REQUIRED_WORDS: ReadonlyArray<string> = [
  "reviewed",
  "approved",
  "merged",
  "deployed",
  "commit message",
];

// Count characters as Unicode code points, the same unit the gate uses
// for its 1 to 200 character window.
function countCodePoints(text: string): number {
  return [...text].length;
}

// True when the text holds a single line only: no line feed, no carriage
// return anywhere in it.
function isSingleLine(text: string): boolean {
  const hasLineFeed = text.indexOf("\n") !== -1;
  const hasCarriageReturn = text.indexOf("\r") !== -1;
  return hasLineFeed === false && hasCarriageReturn === false;
}

// True when the text holds more than white space alone.
function isNotBlank(text: string): boolean {
  return text.trim().length > 0;
}

// True when the text survives a UTF-8 encode and decode round trip
// byte for byte, proving it is clean UTF-8 text.
function utf8RoundTrip(text: string): boolean {
  const encoded = Buffer.from(text, "utf8");
  const decoded = encoded.toString("utf8");
  return decoded === text;
}

// Hex digest of the text, used to prove two runs wrote identical bytes.
function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// Collapse every run of white space inside a fragment to one space and
// trim the ends, so the join below can never produce a double space.
// Empty words from the split are skipped by the guard below.
function tidyFragment(fragment: string): string {
  const words = fragment.split(/\s+/u);
  const keptWords: Array<string> = [];
  for (const word of words) {
    const wordIsEmpty = word.length === 0;
    if (wordIsEmpty === false) {
      keptWords.push(word);
    }
  }
  return keptWords.join(" ");
}

// Join the fragments with single spaces. The result is the final line.
function assembleLine(): string {
  const tidied: Array<string> = [];
  for (const fragment of FRAGMENTS) {
    tidied.push(tidyFragment(fragment));
  }
  return tidied.join(" ");
}

// Split the line into words on single spaces, dropping empty pieces.
function splitWords(line: string): Array<string> {
  const words = line.split(" ");
  const kept: Array<string> = [];
  for (const word of words) {
    const wordIsEmpty = word.length === 0;
    if (wordIsEmpty === false) {
      kept.push(word);
    }
  }
  return kept;
}

// Count the sentences: a sentence ends on a full stop, a question mark,
// or an exclamation mark.
function countSentences(line: string): number {
  let total = 0;
  for (const char of line) {
    const endsSentence = char === "." || char === "?" || char === "!";
    if (endsSentence) {
      total = total + 1;
    }
  }
  return total;
}

// Every required word must appear in the line, in lower case form.
function missingRequiredWords(line: string): Array<string> {
  const lowered = line.toLowerCase();
  const missing: Array<string> = [];
  for (const word of REQUIRED_WORDS) {
    const present = lowered.indexOf(word) !== -1;
    if (present === false) {
      missing.push(word);
    }
  }
  return missing;
}

// Run every gate check and collect each failure as a message. An empty
// list means the line passes the gate and the voice checks.
function gateFailures(line: string): Array<string> {
  const failures: Array<string> = [];
  const chars = countCodePoints(line);
  if (chars < MIN_CHARS) {
    failures.push(`too short: ${chars} characters, minimum ${MIN_CHARS}`);
  }
  if (chars > MAX_CHARS) {
    failures.push(`too long: ${chars} characters, maximum ${MAX_CHARS}`);
  }
  if (isSingleLine(line) === false) {
    failures.push("more than one line");
  }
  if (isNotBlank(line) === false) {
    failures.push("only white space");
  }
  if (utf8RoundTrip(line) === false) {
    failures.push("not clean UTF-8 text");
  }
  const missing = missingRequiredWords(line);
  for (const word of missing) {
    failures.push(`missing required word: ${word}`);
  }
  const sentences = countSentences(line);
  if (sentences < 2) {
    failures.push(`only ${sentences} sentence(s), need at least 2 for the turn`);
  }
  return failures;
}

// Write the line to the output path with no trailing newline, creating
// the output directory when it is absent.
function writeEntry(line: string): void {
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, line, "utf8");
}

// Read the file back and prove it holds exactly the line, byte for byte.
function verifyWritten(line: string): Array<string> {
  const problems: Array<string> = [];
  const readBack = readFileSync(OUTPUT_PATH, "utf8");
  if (readBack !== line) {
    problems.push("read-back text differs from the assembled line");
  }
  const readBytes = Buffer.from(readBack, "utf8");
  const lineBytes = Buffer.from(line, "utf8");
  if (readBytes.length !== lineBytes.length) {
    problems.push(`byte length mismatch: file ${readBytes.length}, line ${lineBytes.length}`);
  }
  if (sha256Hex(readBack) !== sha256Hex(line)) {
    problems.push("sha256 of the file differs from sha256 of the line");
  }
  return problems;
}

// Print one labelled value per line for the run record.
function printReport(label: string, value: string): void {
  console.log(`${label}: ${value}`);
}

// Build the line, gate it, write it, verify the write, and report.
function main(): void {
  const line = assembleLine();
  const chars = countCodePoints(line);
  const words = splitWords(line);
  const sentences = countSentences(line);
  const failures = gateFailures(line);
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`gate failure: ${failure}`);
    }
    throw new Error(`gate failed with ${failures.length} failure(s)`);
  }
  writeEntry(line);
  const problems = verifyWritten(line);
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`verify failure: ${problem}`);
    }
    throw new Error(`verify failed with ${problems.length} problem(s)`);
  }
  printReport("status", "ok");
  printReport("chars", String(chars));
  printReport("words", String(words.length));
  printReport("sentences", String(sentences));
  printReport("sha256", sha256Hex(line));
  printReport("line", line);
}

try { main(); } catch (caughtFailure) { console.error(`fatal: ${(caughtFailure as Error).message}`); process.exitCode = 1; }
