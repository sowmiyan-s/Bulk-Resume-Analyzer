import * as React from "react";
import { cn } from "@/lib/utils";

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange"> {
  value?: number[];
  defaultValue?: number[];
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (value: number[]) => void;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      className,
      value,
      defaultValue,
      min = 0,
      max = 100,
      step = 1,
      onValueChange,
      disabled,
      ...props
    },
    ref,
  ) => {
    const currentVal = value?.[0] ?? defaultValue?.[0] ?? min;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const num = Number(e.target.value);
      onValueChange?.([num]);
    };

    const pct = max > min ? Math.max(0, Math.min(100, ((currentVal - min) / (max - min)) * 100)) : 0;

    return (
      <div className={cn("relative flex w-full touch-none select-none items-center", className)}>
        <input
          type="range"
          ref={ref}
          min={min}
          max={max}
          step={step}
          value={currentVal}
          disabled={disabled}
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
          {...props}
        />
        <div className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20 pointer-events-none">
          <div className="absolute h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <div
          className="absolute block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors pointer-events-none -translate-x-1/2"
          style={{ left: `${pct}%` }}
        />
      </div>
    );
  },
);
Slider.displayName = "Slider";

export { Slider };
