import { useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import { motion } from "framer-motion";
import { CalendarView } from "@/components/calendar/CalendarView";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonthPosts } from "@/hooks/usePosts";

export default function Calendar() {
  const [month, setMonth] = useState<Dayjs>(() => dayjs().startOf("month"));
  const { data: posts, isLoading } = useMonthPosts(month.format("YYYY-MM-DD"));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className="w-full min-w-0 px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-4 lg:h-full lg:flex lg:flex-col lg:overflow-hidden lg:box-border"
    >
      {isLoading ? (
        <div className="space-y-4 flex-1 flex flex-col">
          <Skeleton className="h-10 w-48 shrink-0" />
          <Skeleton className="h-8 w-64 shrink-0" />
          <Skeleton className="flex-1 w-full rounded-xl" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 lg:pb-2">
          <CalendarView
            posts={posts ?? []}
            month={month}
            onMonthChange={setMonth}
          />
        </div>
      )}
    </motion.div>
  );
}
