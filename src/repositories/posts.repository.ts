import dayjs from "dayjs";
import { getSupabase } from "@/lib/supabase";
import type {
  DashboardStats,
  Paginated,
  Post,
  PostInsert,
  PostListParams,
  PostStatus,
  PostUpdate,
  SortOption,
} from "@/types";

const TABLE = "posts";

/** Postgres `time` columns come back as HH:mm:ss — the UI works in HH:mm. */
function mapRow(row: Record<string, unknown>): Post {
  const post = row as unknown as Post;
  return { ...post, publish_time: (post.publish_time ?? "").slice(0, 5) };
}

/** Escape characters that would break a PostgREST `or=` filter string. */
function sanitizeSearch(term: string): string {
  return term.replace(/[,()"]/g, " ").trim();
}

function applySort(sort: SortOption) {
  switch (sort) {
    case "created_asc":
      return [{ column: "created_at", ascending: true }];
    case "publish_asc":
      return [
        { column: "publish_date", ascending: true },
        { column: "publish_time", ascending: true },
      ];
    case "publish_desc":
      return [
        { column: "publish_date", ascending: false },
        { column: "publish_time", ascending: false },
      ];
    case "title_asc":
      return [{ column: "title", ascending: true }];
    case "created_desc":
      return [{ column: "created_at", ascending: false }];
  }
}

/**
 * Data-access layer for the `posts` table. Pure Supabase queries —
 * no UI concerns, no business rules. RLS scopes every query to the
 * signed-in user.
 */
export const postsRepository = {
  async page(params: PostListParams): Promise<Paginated<Post>> {
    let query = getSupabase()
      .from(TABLE)
      .select("*", { count: "exact" });

    if (params.status !== "all") {
      query = query.eq("status", params.status);
    }
    if (params.platform !== "all") {
      query = query.contains("platforms", JSON.stringify([params.platform]));
    }
    const term = sanitizeSearch(params.search);
    if (term) {
      query = query.or(`title.ilike.%${term}%,caption.ilike.%${term}%`);
    }
    if (params.from) {
      query = query.gte("publish_date", params.from);
    }
    if (params.to) {
      query = query.lte("publish_date", params.to);
    }

    for (const order of applySort(params.sort)) {
      query = query.order(order.column, { ascending: order.ascending });
    }

    const fromIndex = (params.page - 1) * params.pageSize;
    query = query.range(fromIndex, fromIndex + params.pageSize - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const total = count ?? 0;
    return {
      data: (data ?? []).map(mapRow),
      count: total,
      page: params.page,
      pageCount: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  },

  async listAll(): Promise<Post[]> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  },

  async listByDateRange(start: string, end: string): Promise<Post[]> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select("*")
      .gte("publish_date", start)
      .lte("publish_date", end)
      .order("publish_time", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  },

  async getById(id: string): Promise<Post> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw new Error(error.message);
    return mapRow(data);
  },

  async insert(input: PostInsert): Promise<Post> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapRow(data);
  },

  async update(id: string, input: PostUpdate): Promise<Post> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .update(input)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapRow(data);
  },

  async remove(id: string): Promise<void> {
    const { error } = await getSupabase().from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async countByStatus(): Promise<DashboardStats> {
    const sb = getSupabase();
    const countWhere = async (status?: PostStatus) => {
      let query = sb.from(TABLE).select("*", { count: "exact", head: true });
      if (status) query = query.eq("status", status);
      const { count, error } = await query;
      if (error) throw new Error(error.message);
      return count ?? 0;
    };

    const [total, drafts, scheduled, published] = await Promise.all([
      countWhere(),
      countWhere("draft"),
      countWhere("scheduled"),
      countWhere("published"),
    ]);
    return { total, drafts, scheduled, published };
  },

  async recent(limit = 5): Promise<Post[]> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  },

  async upcoming(limit = 5): Promise<Post[]> {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select("*")
      .eq("status", "scheduled")
      .gte("publish_date", dayjs().format("YYYY-MM-DD"))
      .order("publish_date", { ascending: true })
      .order("publish_time", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  },

  async activity(days = 14): Promise<Post[]> {
    const since = dayjs().subtract(days, "day");
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select("*")
      .or(
        `created_at.gte.${since.toISOString()},publish_date.gte.${since.format("YYYY-MM-DD")}`,
      );
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  },
};
