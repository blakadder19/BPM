"use client";

interface SelectFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function SelectFilter({ value, onChange, options, placeholder = "All" }: SelectFilterProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-[40px] flex-1 sm:flex-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100"
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
