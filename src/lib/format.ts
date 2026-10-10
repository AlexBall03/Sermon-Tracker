// A fixed zone keeps server and browser output identical.
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export function formatDate(date: Date) {
  return dateFormat.format(date);
}
