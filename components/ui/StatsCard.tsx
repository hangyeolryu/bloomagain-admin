import Link from 'next/link';

interface StatsCardProps {
  label: string;
  value: number | string;
  icon: string;
  color?: string;
  delta?: string;
  href?: string;
}

export default function StatsCard({ label, value, icon, color = 'bg-gray-100', delta, href }: StatsCardProps) {
  const inner = (
    <div className={`bg-white rounded-2xl p-6 border shadow-sm transition-all ${
      href
        ? 'border-gray-100 hover:shadow-md hover:border-green-200 cursor-pointer group'
        : 'border-gray-100'
    }`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value.toLocaleString()}</p>
          {delta && <p className="text-xs text-gray-400 mt-1">{delta}</p>}
          {href && (
            <p className="text-xs text-green-600 mt-2 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
              목록 보기 →
            </p>
          )}
        </div>
        <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center text-2xl`}>
          {icon}
        </div>
      </div>
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}
