export type ClipboardWriter = {
  setString: (value: string) => void | Promise<void>;
};

export async function copySelectionText(
  text: string,
  clipboard: ClipboardWriter
): Promise<boolean> {
  if (!text.trim()) return false;
  try {
    await clipboard.setString(text);
    return true;
  } catch {
    return false;
  }
}
