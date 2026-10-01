import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabase } from '@/lib/supabase';
import { API_BASE_URL } from '@/constants/api';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { CreativeLineage } from '@/components/creative/CreativeLineage';
import { CreativePerformance } from '@/components/creative/CreativePerformance';
import { useBrands } from '@/hooks/useBrands';

type HistoryAsset = { id: string; imageUrl?: string | null; width?: number | null; height?: number | null; source: string; parentAssetId?: string | null; contextType: 'personal' | 'brand'; brandId?: string | null; creativeBrief: { concept?: string }; postAttributions: Array<{ finalPublished: boolean; post: { id: string; title: string; status: string } }> };

export default function CreativeHistory() {
  const navigate = useNavigate();
  const { brands } = useBrands();
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  
  const activeBrandId = selectedBrandId ?? brands[0]?.id ?? null;
  const [assets, setAssets] = useState<HistoryAsset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      if (!activeBrandId) {
        setAssets([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data } = await getSupabase().auth.getSession();
      if (!data.session) return;
      const params = new URLSearchParams({ contextType: 'brand', brandId: activeBrandId });
      const response = await fetch(`${API_BASE_URL}/api/creative/history?${params}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const body = await response.json();
      setAssets(response.ok ? body.assets : []);
      setLoading(false);
    })();
  }, [activeBrandId]);

  function reuse(asset: HistoryAsset) {
    const brandId = asset.brandId ?? activeBrandId;
    const key = `flowpost_media_draft_new_brand_${brandId}`;
    sessionStorage.setItem(
      key,
      JSON.stringify([
        {
          id: asset.id,
          generatedAssetId: asset.id,
          url: asset.imageUrl,
          type: 'image',
          width: asset.width ?? 0,
          height: asset.height ?? 0,
          crop: null,
        },
      ])
    );
    navigate(`/posts/new?context=brand&brand=${brandId}`);
  }

  return (
    <PageContainer
      title="Creative history"
      description="Generated creatives, their versions, reuse, and observed publication state."
    >
      {brands.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {brands.map((brand) => (
            <Button
              key={brand.id}
              size="sm"
              variant={activeBrandId === brand.id ? 'default' : 'outline'}
              onClick={() => setSelectedBrandId(brand.id)}
            >
              {brand.name}
            </Button>
          ))}
        </div>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading creatives…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <article key={asset.id} className="overflow-hidden rounded-lg border bg-card">
              {asset.imageUrl && (
                <img
                  src={asset.imageUrl}
                  alt={asset.creativeBrief.concept ?? 'Generated creative'}
                  className="aspect-square w-full object-cover"
                />
              )}
              <div className="space-y-3 p-4">
                <p className="text-sm font-semibold">
                  {asset.creativeBrief.concept ?? 'Generated creative'}
                </p>
                <CreativeLineage source={asset.source} parentAssetId={asset.parentAssetId} />
                <CreativePerformance
                  published={asset.postAttributions.some((a) => a.finalPublished)}
                  observations={asset.postAttributions.filter((a) => a.finalPublished).length}
                />
                <Button size="sm" disabled={!asset.imageUrl} onClick={() => reuse(asset)}>
                  Use in a new post
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {!loading && !assets.length && (
        <p className="text-sm text-muted-foreground">No generated creatives for this brand yet.</p>
      )}
    </PageContainer>
  );
}
