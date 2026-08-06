import { CalendarClock, Globe2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIMEZONES } from "@/utils/constants";
import { currentTime, nextMonday, today, tomorrow } from "@/utils/date";
import { cn } from "@/lib/utils";

interface ScheduleValue {
  publish_date: string;
  publish_time: string;
  timezone: string;
}

interface SchedulePickerProps {
  value: ScheduleValue;
  onChange: (value: ScheduleValue) => void;
}

export function SchedulePicker({ value, onChange }: SchedulePickerProps) {
  const patch = (partial: Partial<ScheduleValue>) =>
    onChange({ ...value, ...partial });

  const presets = [
    { label: "Today", date: today() },
    { label: "Tomorrow", date: tomorrow() },
    { label: "Next Monday", date: nextMonday() },
  ];

  const publishNow = () =>
    patch({ publish_date: today(), publish_time: currentTime() });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => patch({ publish_date: preset.date })}
            className={cn(
              value.publish_date === preset.date &&
                "border-primary/60 bg-accent text-accent-foreground",
            )}
          >
            <CalendarClock />
            {preset.label}
          </Button>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={publishNow}>
          <Zap className="text-warning" />
          Publish Now
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="publish-date">Publish date</Label>
          <Input
            id="publish-date"
            type="date"
            value={value.publish_date}
            onChange={(e) => patch({ publish_date: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="publish-time">Publish time</Label>
          <Input
            id="publish-time"
            type="time"
            value={value.publish_time}
            onChange={(e) => patch({ publish_time: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Timezone</Label>
          <Select
            value={value.timezone}
            onValueChange={(timezone) => patch({ timezone })}
          >
            <SelectTrigger aria-label="Timezone">
              <span className="flex items-center gap-2 truncate">
                <Globe2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Timezone" />
              </span>
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
