import { useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import { PageContainer } from "@/components/layout/PageContainer";
import { CalendarView } from "@/components/calendar/CalendarView";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonthPosts } from "@/hooks/usePosts";

export default function Calendar() {
  const [month, setMonth] = useState<Dayjs>(() => dayjs().startOf("month"));
  const { data: posts, isLoading } = useMonthPosts(month.format("YYYY-MM-DD"));

  return (
    <PageContainer
      title="Calendar"
      description="Drag posts between days to reschedule."
    >
      {isLoading ? (
        <Skeleton className="h-[560px] w-full rounded-lg" />
      ) : (
        <CalendarView
          posts={posts ?? []}
          month={month}
          onMonthChange={setMonth}
        />
      )}
    </PageContainer>
  );
}
