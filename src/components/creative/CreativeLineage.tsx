import { Badge } from '@/components/ui/badge';

export function CreativeLineage({ source, parentAssetId }: { source: string; parentAssetId?: string | null }) {
  return <div className="flex gap-2"><Badge variant="outline">{source.replace('AI_', '').toLowerCase()}</Badge>{parentAssetId && <Badge variant="secondary">Version of earlier creative</Badge>}</div>;
}
