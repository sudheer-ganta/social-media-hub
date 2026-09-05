export function CreativePerformance({ published, observations }: { published: boolean; observations: number }) {
  if (!published) return <p className="text-xs text-muted-foreground">Not published yet.</p>;
  if (observations < 3) return <p className="text-xs text-muted-foreground">Published · insufficient performance evidence.</p>;
  return <p className="text-xs text-muted-foreground">Observed in {observations} measured publications. Patterns are associations, not causes.</p>;
}
