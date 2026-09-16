export type NoteQuoteParts = {
  before: "...";
  content: string;
  after: "...";
};

export const resolveNoteQuoteParts = (content: string): NoteQuoteParts => ({
  before: "...",
  content,
  after: "...",
});
