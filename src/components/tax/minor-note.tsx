/** Shown, never in the way: people under 18 use everything that others do. */
export function MinorNote() {
  return (
    <div className="grid gap-1 rounded-lg bg-muted p-4 text-sm sm:col-span-2">
      <p className="font-medium">If you are under 18</p>
      <ul className="grid list-disc gap-1 pl-5 text-muted-foreground">
        <li>What you earn by your own work or skill is taxed as your own, at the usual rates.</li>
        <li>Interest is normally added to a parent&apos;s income instead.</li>
        <li>A parent or guardian normally applies for your PAN and files your return.</li>
        <li>Ask them before you sign agreements or register for GST.</li>
        <li>
          If you turn 18 during the year, choose 18 to 59. Interest from before your birthday may still be your
          parent&apos;s.
        </li>
      </ul>
    </div>
  );
}
