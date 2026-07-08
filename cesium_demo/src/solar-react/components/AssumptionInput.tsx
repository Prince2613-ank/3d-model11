interface AssumptionInputProps {
  label: string;
  value: number;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}

export function AssumptionInput({ label, value, unit, step = 1, min, max, onChange }: AssumptionInputProps) {
  return (
    <label className="sw-assumption">
      <span className="sw-assumption-label">{label}</span>
      <span className="sw-assumption-input-wrap">
        <input
          type="number"
          className="sw-assumption-input"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const next = parseFloat(e.target.value);
            if (!isNaN(next)) onChange(next);
          }}
        />
        {unit && <span className="sw-assumption-unit">{unit}</span>}
      </span>
    </label>
  );
}
