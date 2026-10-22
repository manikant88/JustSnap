const INSERTION_FAILURE_MESSAGES = [
  "WhatsApp did not accept",
  "Could not find an active message field",
  "ignored the image insert"
];

export function friendlyErrorMessage(error: string): string {
  if (isInsertionFailure(error)) {
    return "Couldn't add the image here. Try copying it from the Dock and pasting it into the page.";
  }
  return error;
}

export function isInsertionFailure(error: string): boolean {
  return INSERTION_FAILURE_MESSAGES.some((message) => error.includes(message));
}
