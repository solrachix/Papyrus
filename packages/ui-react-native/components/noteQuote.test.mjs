import assert from "node:assert/strict";
import { resolveNoteQuoteParts } from "./noteQuoteLayout.ts";

assert.deepEqual(resolveNoteQuoteParts("trecho selecionado"), {
  before: "...",
  content: "trecho selecionado",
  after: "...",
});
assert.deepEqual(resolveNoteQuoteParts("linha 1\nlinha 2"), {
  before: "...",
  content: "linha 1\nlinha 2",
  after: "...",
});
assert.deepEqual(resolveNoteQuoteParts(""), {
  before: "...",
  content: "",
  after: "...",
});

console.log("note quote layout: 3/3 passed");
