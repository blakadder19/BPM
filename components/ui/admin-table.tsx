import { type ReactNode } from "react";

interface AdminTableProps {
  headers: string[];
  children: ReactNode;
  count?: number;
}

export function AdminTable({ headers, children, count }: AdminTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {headers.map((h, i) => (
              <th
                key={`${h || "col"}-${i}`}
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
      {count !== undefined && (
        <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
          {count} {count === 1 ? "result" : "results"}
        </div>
      )}
    </div>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <td className={`whitespace-nowrap px-4 py-3 text-sm text-gray-700 ${className}`}>
      {children}
    </td>
  );
}
