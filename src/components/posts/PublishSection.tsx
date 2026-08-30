import { useFormContext } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { BestTimePanel } from "./BestTimePanel";
import { SchedulePicker } from "./SchedulePicker";
import { useComposerState } from "./ComposerStateContext";
import type { PostFormValues } from "@/validators";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-destructive">{message}</p>;
}

export function PublishSection() {
  const { watch, setValue, formState: { errors } } = useFormContext<PostFormValues>();
  const { bestTime, applyRecommendedTime, isPublished } = useComposerState();

  const scheduleValue = {
    publish_date: watch("publish_date"),
    publish_time: watch("publish_time"),
    timezone: watch("timezone"),
  };

  return (
    <div className="space-y-2 border-t pt-4">
      <Label className="text-sm font-semibold">Schedule Time</Label>

      <div className="mb-2">
        <BestTimePanel
          result={bestTime.result}
          isLoading={bestTime.isLoading}
          onUse={applyRecommendedTime}
          disabled={isPublished}
        />
      </div>

      <SchedulePicker
        value={scheduleValue}
        onChange={(next) => {
          setValue("publish_date", next.publish_date, { shouldValidate: true });
          setValue("publish_time", next.publish_time, { shouldValidate: true });
          setValue("timezone", next.timezone, { shouldValidate: true });
        }}
      />
      <FieldError message={errors.publish_date?.message} />
      <FieldError message={errors.publish_time?.message} />
    </div>
  );
}
