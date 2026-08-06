import { useParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { CreatePostForm } from "@/components/posts/CreatePostForm";
import { Skeleton } from "@/components/ui/skeleton";
import { usePost } from "@/hooks/usePosts";

export default function CreatePost() {
  const { id } = useParams<{ id: string }>();
  const { data: post, isLoading } = usePost(id);

  const editing = Boolean(id);
  const title = editing ? "Edit Post" : "Create Post";
  const description = editing
    ? "Refine your post and reschedule if needed."
    : "Craft once, publish everywhere.";

  if (editing && isLoading) {
    return (
      <PageContainer title={title} description={description}>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96 w-full rounded-lg" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title={title} description={description}>
      <CreatePostForm key={post?.id ?? "new"} post={post} />
    </PageContainer>
  );
}
